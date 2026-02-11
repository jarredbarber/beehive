import { Command } from 'commander';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatJson, formatTask } from '../utils/output.js';
import { loadRolePrompt } from '../utils/workflow.js';

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

        // Load role prompt if available
        if (task.role) {
          const rolePrompt = loadRolePrompt(config.workflow, task.role);
          if (rolePrompt) {
            task.rolePrompt = rolePrompt;
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
