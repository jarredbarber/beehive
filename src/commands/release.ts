import { Command } from 'commander';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { resolveTaskId } from '../utils/resolve-id.js';

export function registerReleaseCommand(program: Command) {
  program
    .command('release <task-id>')
    .description('Release a claimed task back to the open pool')
    .addHelpText('after', '\nExamples:\n  bh release erdos-728-ry86\n  bh release ry86  (resolves to project prefix)')
    .action(async (taskId: string) => {
      try {
        const config = new ConfigManager();
        await config.loadConfig();
        
        const fullId = resolveTaskId(taskId);
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const client = new BeehiveApiClient();
        await client.releaseTask(project, fullId);
        
        console.log(`✅ Task ${fullId} released back to open pool`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
