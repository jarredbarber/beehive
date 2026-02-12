import { readFile } from 'fs/promises';
import { join } from 'path';
import { ConfigManager } from '../config.js';

/**
 * Load project documentation for bh agents.
 * Loads README.md, CLAUDE.md, and any additional context files from config.
 */
export async function loadTmDocs(
  config: ConfigManager,
  warnFn?: (message: string) => void
): Promise<string> {
  try {
    const readmePath = join(process.cwd(), 'README.md');
    const claudePath = join(process.cwd(), 'CLAUDE.md');

    const [readme, claude] = await Promise.all([
      readFile(readmePath, 'utf-8').catch(() => ''),
      readFile(claudePath, 'utf-8').catch(() => ''),
    ]);

    let docs = `# beehive Task Manager Documentation\n\n${readme}\n\n${claude}`;

    // Load additional context files from config
    const contextFiles = config.contextFiles;
    if (contextFiles.length > 0) {
      docs += '\n\n# Additional Project Context\n\n';
      for (const file of contextFiles) {
        try {
          const content = await readFile(join(process.cwd(), file), 'utf-8');
          docs += `## File: ${file}\n\n${content}\n\n`;
        } catch (err) {
          const message = `⚠️  Failed to load context file '${file}': ${(err as Error).message}`;
          if (warnFn) {
            warnFn(message);
          } else {
            console.warn(message);
          }
        }
      }
    }

    return docs;
  } catch (error) {
    return '# beehive Task Manager\n\nA CLI task management tool.';
  }
}
