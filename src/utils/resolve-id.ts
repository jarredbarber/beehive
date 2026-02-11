import { readFileSync, existsSync } from 'fs';
import { join, resolve, dirname, basename } from 'path';
import yaml from 'js-yaml';

/**
 * Get project prefix from .bh/config.yaml or folder name
 */
function getProjectPrefix(): string {
  // Respect BH_PROJECT environment variable
  if (process.env.BH_PROJECT) {
    return process.env.BH_PROJECT;
  }

  let currentDir = resolve(process.cwd());
  const root = resolve('/');

  while (currentDir !== root) {
    const yamlPath = join(currentDir, '.bh', 'config.yaml');
    const bhDir = join(currentDir, '.bh');
    
    if (existsSync(yamlPath)) {
      try {
        const content = readFileSync(yamlPath, 'utf-8');
        const config = yaml.load(content) as any;
        if (config?.prefix) return config.prefix;
      } catch (err) {
        // Fallback to folder name
      }
    }
    
    if (existsSync(bhDir)) {
      const folderName = basename(currentDir);
      return folderName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'bh';
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  throw new Error('Not in a beehive project. Either:\n  - Use full task ID: bh <command> erdos-728-ry86\n  - Or run from a directory with .bh/config.yaml');
}

export function resolveTaskId(idOrSuffix: string): string {
  // If it contains a dash, it's already a full ID
  if (idOrSuffix.includes('-')) {
    return idOrSuffix;
  }
  
  return `${getProjectPrefix()}-${idOrSuffix}`;
}
