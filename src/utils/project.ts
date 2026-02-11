import { existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * Finds the project root by searching upwards for a .bh directory.
 * Falls back to process.cwd() if not found.
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let currentDir = startDir;

  while (true) {
    const tmDir = join(currentDir, '.bh');
    if (existsSync(tmDir)) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached the root of the filesystem
      break;
    }
    currentDir = parentDir;
  }

  return process.cwd();
}

/**
 * Gets the .bh directory path for the current project.
 */
export function getTmDir(startDir: string = process.cwd()): string {
  return join(findProjectRoot(startDir), '.bh');
}
