import { Command } from 'commander';
import { readFileSync } from 'fs';
import { BeehiveApiClient, BeehiveApiError } from '../api-client.js';
import { ConfigManager } from '../config.js';

export function registerLoadCommand(program: Command) {
  program
    .command('load')
    .description('Import project tasks and dependencies from JSON')
    .argument('[project]', 'Project name (defaults to config prefix)')
    .option('--replace', 'Replace all existing tasks (destructive)')
    .option('-f, --file <path>', 'Read from file instead of stdin')
    .action(async (projectArg, options, command) => {
      try {
        const config = new ConfigManager();
        await config.loadConfig();
        const project = projectArg || process.env.BH_PROJECT || config.prefix || 'default';

        // Read JSON from file or stdin
        let jsonData: string;
        if (options.file) {
          jsonData = readFileSync(options.file, 'utf-8');
        } else {
          // Read from stdin
          if (process.stdin.isTTY && !options.file) {
            console.error('Error: stdin is empty. Provide a file with -f or pipe JSON data.');
            process.exit(1);
          }
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            chunks.push(chunk as Buffer);
          }
          jsonData = Buffer.concat(chunks).toString('utf-8');
        }

        if (!jsonData || jsonData.trim() === '') {
          throw new Error('No data provided to load');
        }

        const data = JSON.parse(jsonData);

        const client = new BeehiveApiClient();
        await client.loadProject(project, data, options.replace);

        console.log(`✅ Successfully imported tasks into project: ${project}`);
        if (options.replace) {
          console.log('   ⚠️  All existing tasks were replaced');
        } else {
          console.log('   Tasks were merged with existing data');
        }
      } catch (error) {
        if (error instanceof BeehiveApiError) {
          if (error.status === 404) {
            console.error('Error: Project not found');
          } else if (error.status === 403) {
            console.error('Error: Forbidden - Admin key required');
          } else if (error.status === 400) {
            console.error('Error: Invalid data format');
          } else {
            console.error(`Error: ${error.message}`);
          }
        } else if (error instanceof SyntaxError) {
          console.error('Error: Invalid JSON input');
        } else {
          console.error(`Error: ${(error as Error).message}`);
        }
        process.exit(1);
      }
    });
}
