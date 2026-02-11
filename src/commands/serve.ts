import { Command } from 'commander';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function registerServeCommand(program: Command) {
  program
    .command('serve')
    .description('Start the Beehive REST API server')
    .option('-p, --port <number>', 'Port to listen on', '3847')
    .action((options) => {
      const port = options.port;
      const serverPath = resolve(__dirname, '../server.js');
      
      console.log(`Starting Beehive server on port ${port}...`);
      
      const child = spawn('node', [serverPath], {
        stdio: 'inherit',
        env: {
          ...process.env,
          PORT: port
        }
      });

      child.on('close', (code) => {
        process.exit(code || 0);
      });
    });
}
