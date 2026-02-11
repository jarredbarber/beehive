import { Command } from 'commander';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatJson, formatTask } from '../utils/output.js';

export function registerShowCommand(program: Command) {
  program
    .command('show')
    .description('Show task details')
    .argument('<id>', 'Task ID')
    .action(async (id, options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        const config = new ConfigManager();
        await config.loadConfig();
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const client = new BeehiveApiClient();
        const task = await client.getTask(project, id);

        if (!task) {
          console.error(`Error: Task not found: ${id}`);
          process.exit(1);
        }

        if (isJson) {
          console.log(formatJson(task));
        } else {
          console.log(formatTask(task));
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
