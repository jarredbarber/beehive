import { Command } from 'commander';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatJson } from '../utils/output.js';
import { resolveTaskId } from '../utils/resolve-id.js';

export function registerLogsCommand(program: Command) {
  program
    .command('logs <task-id>')
    .description('View task execution logs')
    .addHelpText('after', '\nExamples:\n  bh logs erdos-728-ry86\n  bh logs ry86  (resolves to project prefix)')
    .action(async (taskId, options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        const config = new ConfigManager();
        await config.loadConfig();
        
        const fullId = resolveTaskId(taskId);
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const client = new BeehiveApiClient();
        const logs = await client.getTaskLog(project, fullId);

        if (logs.length === 0) {
          console.log('No logs found for this task');
          return;
        }

        if (isJson) {
          console.log(formatJson(logs));
        } else {
          logs.forEach(line => console.log(line));
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
