import { Command } from 'commander';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatJson } from '../utils/output.js';
import { TaskState } from '../types.js';

export function registerListCommand(program: Command) {
  program
    .command('list')
    .description('List tasks')
    .option('--state <state>', 'Filter by state (open, in_progress, pending_review, closed, failed, blocked)')
    .option('--role <role>', 'Filter by role')
    .action(async (options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        const config = new ConfigManager();
        await config.loadConfig();
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const client = new BeehiveApiClient();
        const tasks = await client.listTasks(project, {
          state: options.state as TaskState | undefined,
          role: options.role
        });

        if (isJson) {
          console.log(formatJson(tasks));
        } else {
          if (tasks.length === 0) {
            console.log('No tasks found');
            return;
          }
          console.log(`Found ${tasks.length} task(s):\n`);
          tasks.forEach(task => {
            console.log(`${task.id} - ${task.description.split('\n')[0]} [${task.state}]`);
          });
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
