import { Command } from 'commander';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatJson, formatTask } from '../utils/output.js';
import { loadWorkflowContext } from '../utils/workflow.js';

export function registerNextCommand(program: Command) {
  program
    .command('next')
    .description('Get the highest priority unblocked task')
    .action(async (options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        const config = new ConfigManager();
        await config.loadConfig();
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const client = new BeehiveApiClient();
        const result = await client.claimNextTask(project, {
          bee: 'cli',
          roles: undefined
        });
        
        const task = result ? result.task : null;

        if (!task) {
          if (isJson) {
            console.log(formatJson(null));
          } else {
            console.log('No unblocked tasks available');
          }
          return;
        }

        // Use role prompt from server if available
        if (task.rolePrompt) {
          // Task already has rolePrompt from server
        } else if (task.role) {
          // Fallback to local loading for non-distributed workflows
          const context = loadWorkflowContext(config.workflow, task.role);
          if (context.fullContext) {
            task.rolePrompt = context.fullContext;
          }
        }

        if (isJson) {
          console.log(formatJson(task));
        } else {
          console.log('Next task:');
          console.log(formatTask(task));
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
