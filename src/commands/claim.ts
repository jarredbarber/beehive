import { Command } from 'commander';
import { ConfigManager } from '../config.js';
import { formatJson, formatTask } from '../utils/output.js';
import { BeehiveApiClient, BeehiveApiError } from '../api-client.js';

export function registerClaimCommand(program: Command) {
  program
    .command('claim')
    .description('Claim a task (set to in_progress)')
    .argument('<id>', 'Task ID')
    .action(async (id, options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        const config = new ConfigManager();
        await config.loadConfig();
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const client = new BeehiveApiClient();
        let task;
        try {
          task = await client.claimTask(project, id, 'cli');
        } catch (error) {
          if (error instanceof BeehiveApiError) {
            if (error.status === 404) {
              throw new Error(`Task not found: ${id}`);
            }
            if (error.status === 409) {
              throw new Error(`Task already claimed: ${id}`);
            }
          }
          throw error;
        }

        if (isJson) {
          console.log(formatJson(task));
        } else {
          console.log(`Claimed task: ${task.id}`);
          console.log(formatTask(task));
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
