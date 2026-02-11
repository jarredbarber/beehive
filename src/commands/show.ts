import { Command } from 'commander';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatJson, formatTask } from '../utils/output.js';
import { resolveTaskId } from '../utils/resolve-id.js';

export function registerShowCommand(program: Command) {
  program
    .command('show <task-id>')
    .description('Show task details (use full ID or just suffix)')
    .addHelpText('after', '\nExamples:\n  bh show erdos-728-ry86\n  bh show ry86  (resolves to project prefix)')
    .action(async (taskId, options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        const config = new ConfigManager();
        await config.loadConfig();
        
        const fullId = resolveTaskId(taskId);
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const client = new BeehiveApiClient();
        const task = await client.getTask(project, fullId);

        if (!task) {
          console.error(`Error: Task not found: ${fullId}`);
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
