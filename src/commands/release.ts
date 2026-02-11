import { Command } from 'commander';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';

export function registerReleaseCommand(program: Command) {
  program
    .command('release <task-id>')
    .description('Release a claimed task back to the open pool')
    .action(async (taskId: string) => {
      try {
        const config = new ConfigManager();
        await config.loadConfig();
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const client = new BeehiveApiClient();
        await client.releaseTask(project, taskId);
        
        console.log(`✅ Task ${taskId} released back to open pool`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
