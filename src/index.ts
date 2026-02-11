#!/usr/bin/env node

import { Command } from 'commander';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { registerClaimCommand } from './commands/claim.js';
import { registerListCommand } from './commands/list.js';
import { registerShowCommand } from './commands/show.js';
import { registerNextCommand } from './commands/next.js';
import { registerInitCommand } from './commands/init.js';
import { registerSubmitCommand } from './commands/submit.js';
import { registerApproveCommand } from './commands/approve.js';
import { registerRejectCommand } from './commands/reject.js';
import { registerDumpCommand } from './commands/dump.js';
import { registerLoadCommand } from './commands/load.js';
import { registerServeCommand } from './commands/serve.js';
import { registerKeysCommand } from './commands/keys.js';
import { findProjectRoot } from './utils/project.js';

const program = new Command();

program
  .name('bh')
  .version('1.0.0')
  .description('CLI task management tool')
  .option('--json', 'Output in JSON format')
  .option('-C, --project-root <path>', 'Specify project root directory (containing .bh/)')
  .option('--root <path>', 'Specify project root directory (containing .bh/)');

// Automatically find project root and chdir to it, except for 'init' command
const args = process.argv.slice(2);
const isInit = args.includes('init');

function getProjectRootArg(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project-root' || arg === '--root' || arg === '-C') {
      return args[i + 1];
    }
    if (arg.startsWith('--project-root=')) {
      return arg.split('=')[1];
    }
    if (arg.startsWith('--root=')) {
      return arg.split('=')[1];
    }
    if (arg.startsWith('-C') && arg.length > 2) {
      return arg.substring(2);
    }
  }
  return process.env.BH_PROJECT_ROOT;
}

const specifiedRootArg = getProjectRootArg(args);
let root: string;

if (specifiedRootArg) {
  // Use the specified project root
  const specifiedRoot = resolve(specifiedRootArg);
  const bhDir = join(specifiedRoot, '.bh');

  if (!existsSync(specifiedRoot)) {
    console.error(`Error: Specified project root does not exist: ${specifiedRoot}`);
    process.exit(1);
  }

  // Only check for .bh directory if not running the init command
  if (!isInit && !existsSync(bhDir)) {
    console.error(`Error: Specified directory does not contain a .bh folder: ${specifiedRoot}`);
    process.exit(1);
  }

  root = specifiedRoot;
} else if (!isInit) {
  // Auto-detect project root
  root = findProjectRoot();
} else {
  // For init without specified root, use current directory
  root = process.cwd();
}

if (root !== process.cwd()) {
  process.chdir(root);
}

// Register all commands
registerInitCommand(program);
registerClaimCommand(program);
registerListCommand(program);
registerShowCommand(program);
registerNextCommand(program);
registerSubmitCommand(program);
registerApproveCommand(program);
registerRejectCommand(program);
registerDumpCommand(program);
registerLoadCommand(program);
registerServeCommand(program);
registerKeysCommand(program);

program.parse();
