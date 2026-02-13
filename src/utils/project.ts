import { existsSync } from 'fs';
import { join, dirname, resolve } from 'path';

/**
 * Find the project root by searching upwards for a .bh directory.
 * If not found, returns the current directory.
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let currentDir = resolve(startDir);
  const root = resolve('/');

  while (currentDir !== root) {
    const bhDir = join(currentDir, '.bh');
    if (existsSync(bhDir)) {
      return currentDir;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return process.cwd();
}

/**
 * Get the path to the .bh directory in the current project.
 */
export function getBhDir(): string {
  const root = findProjectRoot();
  return join(root, '.bh');
}
