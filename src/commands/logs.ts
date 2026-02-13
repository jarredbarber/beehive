import { Command } from 'commander';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatJson } from '../utils/output.js';

export function registerLogsCommand(program: Command) {
  program
    .command('logs')
    .description('View task execution logs')
    .argument('<id>', 'Task ID')
    .action(async (id, options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        const config = new ConfigManager();
        await config.loadConfig();
        const project = config.prefix || 'default';

        const client = new BeehiveApiClient();
        const logs = await client.getTaskLog(project, id);

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
