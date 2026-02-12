import { Command } from 'commander';
import { spawn } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { parseAgentResponse, detectWorkCompleted } from '../utils/parse-agent-response.js';
import { loadWorkflowContext, loadWorkflowModels } from '../utils/workflow.js';
import { completeGitWorkflow, hasChanges } from '../utils/git-ops.js';

export function registerWorkerCommand(program: Command) {
  program
    .command('worker')
    .description('Start an autonomous worker loop')
    .option('--once', 'Run once and exit')
    .option('--agent <command>', 'Agent command to execute', 'pi')
    .option('--interval <seconds>', 'Interval between task checks', '10')
    .option('--max-attempts <n>', 'Maximum retries per task', '3')
    .option('--model <name>', 'Model to use (overrides workflow default)')
    .action(async (options) => {
      const config = new ConfigManager();
      await config.loadConfig();
      const project = process.env.BH_PROJECT || config.prefix || 'default';
      const client = new BeehiveApiClient();
      
      const interval = parseInt(options.interval, 10) * 1000;

      console.log(`🐝 Worker started for project: ${project}`);
      console.log(`🤖 Agent: ${options.agent}`);
      console.log(`⏱️  Interval: ${options.interval}s`);

      // Initial model list to announce when claiming tasks
      const modelsToAnnounce = options.model 
        ? [options.model] 
        : loadWorkflowModels(config.workflow);

      if (modelsToAnnounce.length > 0) {
        console.log(`🧠 Announced models: ${modelsToAnnounce.join(', ')}`);
      }

      while (true) {
        try {
          // 1. Claim next task with model capability preference
          const resultClaim = await client.claimNextTask(project, {
            bee: `worker-${process.pid}`,
            roles: undefined,
            models: modelsToAnnounce.length > 0 ? modelsToAnnounce : undefined
          });

          if (!resultClaim) {
            if (options.once) {
              console.log('No tasks available. Exiting.');
              break;
            }
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, interval));
            continue;
          }

          const task = resultClaim.task;
          console.log(`\n📌 Claimed task: ${task.id} (${task.role})`);
          console.log(`   ${task.description.split('\n')[0]}`);

          // 2. Load full workflow context (preamble + role prompt)
          console.log(`📚 Loading workflow context...`);
          const context = loadWorkflowContext(config.workflow, task.role || 'code');

          if (!context.fullContext) {
            console.error(`❌ No workflow context found for ${config.workflow}/${task.role}`);
            await client.failTask(project, task.id, `Missing workflow files`);
            continue;
          }

          // Determine specific model for this task execution
          // Priority: CLI flag > Agent-specific frontmatter > default from claim announce
          const model = options.model || context.model || (modelsToAnnounce.length === 1 ? modelsToAnnounce[0] : undefined);

          // 3. Prepare execution
          const logDir = join(process.cwd(), '.bh', 'logs');
          if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
          const logFile = join(logDir, `worker-${task.id}.md`);

          const promptFile = join(tmpdir(), `bh-prompt-${task.id}.md`);
          const fullPrompt = `${context.fullContext}\n\n## Task\n\n${task.description}`;
          writeFileSync(promptFile, fullPrompt, 'utf-8');

          // 4. Execute agent
          console.log(`🚀 Executing agent...${model ? ` (Model: ${model})` : ''}`);
          const agentOutput = await executeAgent(options.agent, promptFile, logFile, model);

          // 5. Parse agent response
          let result;
          try {
            result = parseAgentResponse(agentOutput.stdout + '\n' + agentOutput.stderr);
          } catch (parseErr) {
            // Parse failed - check if work was done anyway
            const workDone = detectWorkCompleted(agentOutput.stdout + '\n' + agentOutput.stderr);
            const gitChanges = await hasChanges();
            
            if (workDone || gitChanges) {
              console.warn(`⚠️  Agent completed work but output wasn't valid JSON`);
              result = {
                status: 'completed' as const,
                summary: 'Completed (parse failed, see logs)',
                details: 'Agent output was not valid JSON. Check logs for details.'
              };
            } else {
              console.error(`❌ Parse failed and no work detected: ${(parseErr as Error).message}`);
              await client.failTask(project, task.id, (parseErr as Error).message);
              await client.uploadLog(project, task.id, agentOutput.stdout + '\n' + agentOutput.stderr);
              continue;
            }
          }

          // 6. Handle result based on status
          if (result.status === 'failed') {
            console.error(`❌ Agent reported failure: ${result.error}`);
            await client.failTask(project, task.id, result.error || 'Unknown error');
            await client.uploadLog(project, task.id, agentOutput.stdout + '\n' + agentOutput.stderr);
            continue;
          }

          if (result.status === 'blocked') {
            console.warn(`⚠️  Agent blocked: ${result.details || 'No details'}`);
            // For now, just log and continue. TODO: Add blocked state support
            continue;
          }

          // 7. Git workflow: commit + push + create PR
          console.log(`📦 Completing git workflow...`);
          let prUrl;
          try {
            prUrl = await completeGitWorkflow(task.id, result.summary, result.details);
            console.log(`✅ PR created: ${prUrl}`);
          } catch (gitErr) {
            console.error(`❌ Git workflow failed: ${(gitErr as Error).message}`);
            await client.failTask(project, task.id, `Git workflow failed: ${(gitErr as Error).message}`);
            await client.uploadLog(project, task.id, agentOutput.stdout + '\n' + agentOutput.stderr);
            continue;
          }

          // 8. Submit to hive
          console.log(`📤 Submitting to hive...`);
          try {
            await client.submitTask(project, task.id, {
              pr_url: prUrl,
              summary: result.summary,
              details: result.details,
              follow_up_tasks: result.followUps?.map(fu => ({
                description: fu.title,
                role: fu.role,
                priority: fu.priority
              })),
              log: agentOutput.stdout + '\n' + agentOutput.stderr
            });
            
            console.log(`✅ Task ${task.id} submitted successfully!`);
            if (result.followUps && result.followUps.length > 0) {
              console.log(`📋 Created ${result.followUps.length} follow-up task(s)`);
            }
          } catch (submitErr) {
            console.error(`❌ Submission failed: ${(submitErr as Error).message}`);
          }

        } catch (err) {
          console.error(`Error in worker loop: ${(err as Error).message}`);
        }

        if (options.once) break;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    });
}

async function executeAgent(
  command: string, 
  promptFile: string, 
  logFile: string,
  model?: string
): Promise<{ success: boolean; code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    
    // Default pi command arguments
    const args = command === 'pi' 
      ? [promptFile, ...(model ? ['--model', model] : [])] 
      : [promptFile];
    
    const child = spawn(command, args, {
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe']
    });

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      process.stdout.write(chunk);
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });

    child.on('close', (code) => {
      writeFileSync(logFile, stdout + '\n' + stderr, 'utf-8');
      resolve({
        success: code === 0,
        code,
        stdout,
        stderr
      });
    });
  });
}
