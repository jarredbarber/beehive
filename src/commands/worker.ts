import { Command } from 'commander';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { appendFile, writeFile } from 'fs/promises';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { parseAgentResponse, detectWorkCompleted } from '../utils/parse-agent-response.js';
import { completeGitWorkflow, hasChanges } from '../utils/git-ops.js';
import { getTitle } from '../utils/output.js';
import { loadTmDocs } from '../utils/project-docs.js';

let _piSdk: typeof import('@mariozechner/pi-coding-agent') | null = null;
async function getPiSdk() {
  if (!_piSdk) {
    _piSdk = await import('@mariozechner/pi-coding-agent');
  }
  return _piSdk;
}

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

      const { AuthStorage, ModelRegistry } = await getPiSdk();
      const authStorage = new AuthStorage();
      const modelRegistry = new ModelRegistry(authStorage);

      console.log(`🐝 Worker started for project: ${project}`);
      console.log(`🤖 Agent: direct (Pi SDK)`);
      console.log(`⏱️  Interval: ${options.interval}s`);

      while (true) {
        try {
          // 1. Claim next task with model capability preference if provided
          const resultClaim = await client.claimNextTask(project, {
            bee: `worker-${process.pid}`,
            roles: undefined,
            models: options.model ? [options.model] : undefined
          });

          if (!resultClaim) {
            if (options.once) {
              console.log('No tasks available. Exiting.');
              break;
            }
            await new Promise(resolve => setTimeout(resolve, interval));
            continue;
          }

          const task = resultClaim.task;
          console.log(`\n📌 Claimed task: ${task.id} (${task.role})`);
          console.log(`   ${task.description.split('\n')[0]}`);

          // 2. Use workflow context from server
          const context = {
            preamble: task.preamble,
            rolePrompt: task.rolePrompt,
            fullContext: [task.preamble, task.rolePrompt].filter(Boolean).join('\n\n---\n\n'),
            model: task.model
          };

          if (!context.fullContext) {
            console.error(`❌ No workflow context received from server for ${task.role}`);
            await client.failTask(project, task.id, `Missing workflow context from server`);
            continue;
          }

          // Load project documentation
          const tmDocs = await loadTmDocs(config);
          const systemPrompt = `${context.fullContext}\n\n---\n\n${tmDocs}`;
          const userPrompt = `Task: ${task.description}`;

          // Determine model
          const modelString = options.model || context.model || 'medium';
          const [provider, modelId] = modelString.includes('/') 
            ? modelString.split('/') 
            : ['google-antigravity', modelString];
          
          let model = modelRegistry.find(provider, modelId);
          if (!model && !modelString.includes('/')) {
              model = modelRegistry.find('google-antigravity', modelId);
          }

          // 3. Prepare execution environment
          const logDir = join(process.cwd(), '.bh', 'logs');
          if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
          const logFile = join(logDir, `worker-${task.id}.md`);
          
          await writeFile(logFile, `# Task: ${getTitle(task.description)} (${task.id})\n\nStart Time: ${new Date().toISOString()}\n\n`);

          // 4. Execute with Pi SDK
          console.log(`🚀 Executing agent with model: ${modelString}...`);
          
          const { DefaultResourceLoader, SessionManager, createAgentSession, createCodingTools } = await getPiSdk();
          const loader = new DefaultResourceLoader({
            systemPromptOverride: () => systemPrompt,
          });
          await loader.reload();

          const sessionManager = SessionManager.create(process.cwd());
          const { session } = await createAgentSession({
            model,
            resourceLoader: loader,
            tools: createCodingTools(process.cwd()),
            sessionManager,
            authStorage,
            modelRegistry,
          });

          let fullOutput = '';
          session.subscribe((event) => {
            if (event.type === 'message_update') {
              if (event.assistantMessageEvent.type === 'text_delta') {
                const delta = event.assistantMessageEvent.delta;
                fullOutput += delta;
                process.stdout.write(delta);
                appendFile(logFile, delta).catch(() => {});
              } else if (event.assistantMessageEvent.type === 'thinking_delta') {
                const delta = event.assistantMessageEvent.delta;
                process.stdout.write(`\x1b[90m${delta}\x1b[0m`);
                appendFile(logFile, `> ${delta.replace(/\n/g, '\n> ')}`).catch(() => {});
              }
            }
          });

          await session.prompt(userPrompt);
          console.log('\n\n📝 Agent execution complete.');

          // 5. Parse result
          let result;
          try {
            result = parseAgentResponse(fullOutput);
          } catch (parseErr) {
            const workDone = detectWorkCompleted(fullOutput);
            const gitChanges = await hasChanges();
            
            if (workDone || gitChanges) {
              result = {
                status: 'completed' as const,
                summary: 'Completed (parse failed, see logs)',
                details: 'Agent output was not valid JSON.'
              };
            } else {
              throw parseErr;
            }
          }

          if (result.status === 'failed') {
            await client.failTask(project, task.id, result.error || 'Unknown error');
            continue;
          }

          // 6. Git workflow
          console.log(`📦 Completing git workflow...`);
          const prUrl = await completeGitWorkflow(task.id, result.summary, result.details);

          // 7. Submit
          console.log(`📤 Submitting to hive...`);
          await client.submitTask(project, task.id, {
            pr_url: prUrl,
            summary: result.summary,
            details: result.details,
            follow_up_tasks: result.followUps?.map(fu => ({
              description: fu.title,
              role: fu.role,
              priority: fu.priority
            })),
            log: fullOutput
          });
          
          console.log(`✅ Task ${task.id} submitted successfully!`);

        } catch (err) {
          console.error(`Error: ${(err as Error).message}`);
        }

        if (options.once) break;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    });
}
