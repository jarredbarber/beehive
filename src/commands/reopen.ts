import { Command } from 'commander';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatTask } from '../utils/output.js';
import { resolveTaskId } from '../utils/resolve-id.js';

export function registerReopenCommand(program: Command) {
  program
    .command('reopen <task-id>')
    .description('Reopen a failed or closed task')
    .addHelpText('after', '\nExamples:\n  bh reopen openlemma-u4h8\n  bh reopen u4h8  (resolves to project prefix)')
    .action(async (taskId: string) => {
      try {
        const config = new ConfigManager();
        await config.loadConfig();
        
        const fullId = resolveTaskId(taskId);
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const client = new BeehiveApiClient();
        
        // Update state to open, clear claimed fields
        const task = await client.updateTask(project, fullId, {
          state: 'open',
          claimedBy: null
        });
        
        console.log(`✅ Task ${fullId} reopened`);
        console.log(formatTask(task));
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
