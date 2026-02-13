import { Command } from 'commander';
import { readFileSync } from 'fs';
import { BeehiveApiClient, BeehiveApiError } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatJson, formatTask } from '../utils/output.js';
import { Submission, CreateTaskInput } from '../types.js';

export function registerSubmitCommand(program: Command) {
  program
    .command('submit')
    .description('Submit a task with PR and results')
    .argument('<id>', 'Task ID')
    .requiredOption('--pr <url>', 'Pull request URL')
    .requiredOption('--summary <text>', 'Summary of work completed')
    .option('--details <text>', 'Detailed results or notes')
    .option('--follow-up <tasks>', 'Comma-separated follow-up tasks in format "title:role:priority"')
    .option('--log <path>', 'Path to log file to attach')
    .action(async (id, options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        const config = new ConfigManager();
        await config.loadConfig();
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        // Parse follow-up tasks
        const followUpTasks: CreateTaskInput[] | undefined = options.followUp ? options.followUp.split(',').map((task: string) => {
          const [title, role, priority] = task.split(':');
          return {
            description: title,
            role: role || undefined,
            priority: priority ? parseInt(priority, 10) : 2
          };
        }) : undefined;

        // Read log file
        let log: string | undefined;
        if (options.log) {
          try {
            log = readFileSync(options.log, 'utf-8');
          } catch (err) {
            throw new Error(`Failed to read log file: ${(err as Error).message}`);
          }
        }

        const client = new BeehiveApiClient();
        
        const submission: Submission = {
          pr_url: options.pr,
          summary: options.summary,
          details: options.details,
          follow_up_tasks: followUpTasks,
          log
        };

        let task;
        try {
          task = await client.submitTask(project, id, submission);
        } catch (error) {
          if (error instanceof BeehiveApiError) {
            if (error.status === 404) {
              throw new Error(`Task not found: ${id}`);
            }
          }
          throw error;
        }

        if (isJson) {
          console.log(formatJson(task));
        } else {
          console.log(`Task ${id} submitted and is now pending review.`);
          console.log(formatTask(task));
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
