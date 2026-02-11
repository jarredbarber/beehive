import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';

export function registerLogCommand(program: Command) {
  program
    .command('log <task-id> <logfile>')
    .description('Upload a log file for a task')
    .action(async (taskId: string, logfile: string) => {
      try {
        if (!existsSync(logfile)) {
          console.error(`Error: Log file not found: ${logfile}`);
          process.exit(1);
        }

        const config = new ConfigManager();
        await config.loadConfig();
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const content = readFileSync(logfile, 'utf-8');
        const client = new BeehiveApiClient();
        
        const result = await client.uploadLog(project, taskId, content);
        console.log(`✅ Log uploaded successfully (Attempt ${result.attempt})`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
