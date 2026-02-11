import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Checks if a role corresponds to a system agent.
 */
export async function isSystemAgent(role: string, workflow: string): Promise<boolean> {
  const searchPaths = [
    join(process.cwd(), '.bh', 'workflows', workflow),    // Project metadata
    join(process.cwd(), 'workflows', workflow),           // Project root
    join(homedir(), '.bh', 'workflows', workflow),        // User home
    join(__dirname, '..', '..', 'workflows', workflow),   // Global installation
  ];

  for (const path of searchPaths) {
    const agentPath = join(path, `${role}.md`);
    if (existsSync(agentPath)) {
      try {
        const content = await readFile(agentPath, 'utf-8');
        const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
        const match = content.match(frontmatterRegex);
        if (match) {
          return match[1].includes('isSystem: true') || match[1].includes('system: true');
        }
      } catch (e) {
        // ignore error
      }
    }
  }
  return false;
}
