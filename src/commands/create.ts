import { Command } from 'commander';
import { BeehiveApiClient, BeehiveApiError } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatJson, formatTask } from '../utils/output.js';

export function registerCreateCommand(program: Command) {
  program
    .command('create')
    .description('Create a new task')
    .option('-p, --project <name>', 'Project name (defaults to config prefix)')
    .requiredOption('-d, --description <text>', 'Task description')
    .option('-r, --role <role>', 'Agent role')
    .option('--priority <number>', 'Task priority (0-4)', '2')
    .option('--test <command>', 'Test command')
    .option('--deps <ids>', 'Comma-separated dependency IDs')
    .option('--parent <id>', 'Parent task ID')
    .action(async (options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        const config = new ConfigManager();
        await config.loadConfig();
        const project = options.project || config.prefix || 'default';

        const client = new BeehiveApiClient();
        const task = await client.createTask(project, {
          description: options.description,
          role: options.role,
          priority: parseInt(options.priority, 10),
          testCommand: options.test,
          dependencies: options.deps ? options.deps.split(',') : [],
          parentTask: options.parent
        });

        if (isJson) {
          console.log(formatJson(task));
        } else {
          console.log(`✅ Created task: ${task.id}`);
          console.log(formatTask(task));
        }
      } catch (error) {
        if (error instanceof BeehiveApiError && error.status === 403) {
          console.error('Error: Forbidden - Admin key required');
        } else {
          console.error(`Error: ${(error as Error).message}`);
        }
        process.exit(1);
      }
    });
}
