import { Command } from 'commander';
import { BeehiveApiClient, BeehiveApiError } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatJson, formatTask } from '../utils/output.js';

export function registerApproveCommand(program: Command) {
  program
    .command('approve')
    .description('Approve a pending task submission (admin only)')
    .argument('<id>', 'Task ID')
    .action(async (id, options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        const client = new BeehiveApiClient();
        const config = new ConfigManager();
        await config.loadConfig();
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const task = await client.approveTask(project, id);

        if (isJson) {
          console.log(formatJson(task));
        } else {
          console.log(`✅ Approved and closed task: ${task.id}`);
          console.log(`   State: ${task.state}`);
          if (task.summary) {
            console.log(`   Summary: ${task.summary}`);
          }
          console.log('\nFollow-up tasks created (if any) and dependent tasks unblocked.');
        }
      } catch (error) {
        if (error instanceof BeehiveApiError) {
          if (error.status === 404) {
            console.error('Error: Task not found');
          } else if (error.status === 403) {
            console.error('Error: Forbidden - Admin key required');
          } else {
            console.error(`Error: ${error.message}`);
          }
        } else {
          console.error(`Error: ${(error as Error).message}`);
        }
        process.exit(1);
      }
    });
}
