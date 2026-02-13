import { Command } from 'commander';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatTask } from '../utils/output.js';

export function registerUpdateCommand(program: Command) {
  program
    .command('update <task-id>')
    .description('Update task metadata')
    .option('-d, --description <text>', 'Update task description')
    .option('-p, --priority <n>', 'Update priority (0-4)', (val) => parseInt(val, 10))
    .option('-r, --role <role>', 'Update role')
    .option('--deps <ids>', 'Update dependencies (comma-separated task IDs)')
    .option('--test <command>', 'Update test command')
    .action(async (taskId: string, options) => {
      try {
        const config = new ConfigManager();
        await config.loadConfig();
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const updates: any = {};
        
        if (options.description) updates.description = options.description;
        if (options.priority !== undefined) updates.priority = options.priority;
        if (options.role) updates.role = options.role;
        if (options.deps) updates.dependencies = options.deps.split(',').map((s: string) => s.trim());
        if (options.test) updates.testCommand = options.test;

        if (Object.keys(updates).length === 0) {
          console.error('Error: No updates specified');
          process.exit(1);
        }

        const client = new BeehiveApiClient();
        const task = await client.updateTask(project, taskId, updates);
        
        console.log(`✅ Task ${taskId} updated`);
        console.log(formatTask(task));
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
