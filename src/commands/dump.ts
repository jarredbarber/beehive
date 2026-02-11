import { Command } from 'commander';
import { BeehiveApiClient, BeehiveApiError } from '../api-client.js';
import { ConfigManager } from '../config.js';

export function registerDumpCommand(program: Command) {
  program
    .command('dump')
    .description('Export project tasks and dependencies as JSON')
    .argument('[project]', 'Project name (defaults to config prefix)')
    .action(async (projectArg, options, command) => {
      try {
        const config = new ConfigManager();
        await config.loadConfig();
        const project = projectArg || process.env.BH_PROJECT || config.prefix || 'default';

        const client = new BeehiveApiClient();
        const data = await client.dumpProject(project);

        // Always output JSON (this is a data export command)
        console.log(JSON.stringify(data, null, 2));
      } catch (error) {
        if (error instanceof BeehiveApiError) {
          if (error.status === 404) {
            console.error('Error: Project not found');
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
