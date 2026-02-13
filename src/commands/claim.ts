import { Command } from 'commander';
import { ConfigManager } from '../config.js';
import { formatJson, formatTask } from '../utils/output.js';
import { BeehiveApiClient, BeehiveApiError } from '../api-client.js';
import { resolveTaskId } from '../utils/resolve-id.js';

export function registerClaimCommand(program: Command) {
  program
    .command('claim <task-id>')
    .description('Claim a task (set to in_progress)')
    .addHelpText('after', '\nExamples:\n  bh claim erdos-728-ry86\n  bh claim ry86  (resolves to project prefix)')
    .action(async (taskId, options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        const config = new ConfigManager();
        await config.loadConfig();
        
        const fullId = resolveTaskId(taskId);
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const client = new BeehiveApiClient();
        let task;
        try {
          task = await client.claimTask(project, fullId, 'cli');
        } catch (error) {
          if (error instanceof BeehiveApiError) {
            if (error.status === 404) {
              throw new Error(`Task not found: ${fullId}`);
            }
            if (error.status === 409) {
              throw new Error(`Task already claimed: ${fullId}`);
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
