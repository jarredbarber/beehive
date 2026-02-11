import { Command } from 'commander';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { loadRolePrompt } from '../utils/workflow.js';
import { Task, TaskState } from '../types.js';

export function registerWorkerCommand(program: Command) {
  program
    .command('worker')
    .description('Start an autonomous worker loop')
    .option('--once', 'Run once and exit')
    .option('--agent <command>', 'Agent command to execute', 'pi')
    .option('--interval <seconds>', 'Interval between task checks', '10')
    .option('--max-attempts <n>', 'Maximum retries per task', '3')
    .action(async (options) => {
      const config = new ConfigManager();
      await config.loadConfig();
      const project = process.env.BH_PROJECT || config.prefix || 'default';
      const client = new BeehiveApiClient();
      
      const interval = parseInt(options.interval, 10) * 1000;
      const maxAttempts = parseInt(options.maxAttempts, 10);

      console.log(`🐝 Worker started for project: ${project}`);
      console.log(`🤖 Agent: ${options.agent}`);
      console.log(`⏱️  Interval: ${options.interval}s`);

      while (true) {
        try {
          // 1. Claim next task
          const result = await client.claimNextTask(project, {
            bee: `worker-${process.pid}`,
            roles: undefined
          });

          if (!result) {
            if (options.once) {
              console.log('No tasks available. Exiting.');
              break;
            }
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, interval));
            continue;
          }

          const task = result.task;
          console.log(`\n📌 Claimed task: ${task.id} (${task.role})`);
          console.log(`   ${task.description.split('\n')[0]}`);

          // 2. Load role prompt
          let rolePrompt = task.rolePrompt;
          if (!rolePrompt && task.role) {
            rolePrompt = loadRolePrompt(config.workflow, task.role);
          }

          // 3. Prepare execution
          const logDir = join(process.cwd(), '.bh', 'logs');
          if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
          const logFile = join(logDir, `worker-${task.id}.log`);
          
          const promptFile = join(tmpdir(), `bh-prompt-${task.id}.md`);
          const fullPrompt = `${rolePrompt || ''}\n\nTask: ${task.description}`;
          writeFileSync(promptFile, fullPrompt, 'utf-8');

          // 4. Execute agent
          console.log(`🚀 Executing agent... (Logging to ${logFile})`);
          const agentOutput = await executeAgent(options.agent, promptFile, logFile);
          
          // 5. Submit or Fail
          if (agentOutput.success) {
            // Attempt to find PR URL in output
            const prUrl = findPrUrl(agentOutput.stdout);
            
            if (prUrl) {
              console.log(`✅ Agent completed. PR found: ${prUrl}`);
              await client.submitTask(project, task.id, {
                pr_url: prUrl,
                summary: 'Agent completed task',
                log: agentOutput.stdout + '\n' + agentOutput.stderr
              });
            } else {
              console.warn('⚠️  Agent completed but no PR URL found in output.');
              // In a real scenario, we might want to check git branch or fail
              // For now, let's look for an existing PR for the task branch
              const branchPrUrl = await findPrUrlFromGit(task.id);
              if (branchPrUrl) {
                console.log(`✅ Found PR from git: ${branchPrUrl}`);
                await client.submitTask(project, task.id, {
                  pr_url: branchPrUrl,
                  summary: 'Agent completed task',
                  log: agentOutput.stdout + '\n' + agentOutput.stderr
                });
              } else {
                console.error('❌ Failed to find PR URL. Marking task as failed.');
                await client.failTask(project, task.id, 'No PR URL found after completion');
              }
            }
          } else {
            console.error(`❌ Agent failed with code ${agentOutput.code}`);
            await client.failTask(project, task.id, `Agent failed with code ${agentOutput.code}`, agentOutput.stderr);
          }

          // Upload full log
          await client.uploadLog(project, task.id, agentOutput.stdout + '\n' + agentOutput.stderr);

        } catch (err) {
          console.error(`Error in worker loop: ${(err as Error).message}`);
        }

        if (options.once) break;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    });
}

async function executeAgent(command: string, promptFile: string, logFile: string): Promise<{ success: boolean; code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    
    // Default pi command arguments
    const args = command === 'pi' ? [promptFile] : [promptFile];
    
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

function findPrUrl(output: string): string | null {
  const prRegex = /https:\/\/github\.com\/[^\/\s]+\/[^\/\s]+\/pull\/\d+/;
  const match = output.match(prRegex);
  return match ? match[0] : null;
}

async function findPrUrlFromGit(taskId: string): Promise<string | null> {
  return new Promise((resolve) => {
    // Try gh cli if available
    const child = spawn('gh', ['pr', 'list', '--head', `task/${taskId}`, '--json', 'url', '--limit', '1'], {
      shell: true
    });
    
    let output = '';
    child.stdout.on('data', (data) => output += data.toString());
    
    child.on('close', (code) => {
      if (code !== 0) return resolve(null);
      try {
        const prs = JSON.parse(output);
        if (prs.length > 0) return resolve(prs[0].url);
      } catch (e) {}
      resolve(null);
    });
  });
}
