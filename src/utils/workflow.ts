import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load the role-specific prompt from the workflow files.
 * Searches in project .bh/workflows, project workflows/, and bundled workflows.
 */
export function loadRolePrompt(workflow: string, role: string): string | undefined {
  const searchPaths = [
    join(process.cwd(), '.bh', 'workflows', workflow, `${role}.md`),
    join(process.cwd(), 'workflows', workflow, `${role}.md`),
    join(__dirname, '..', '..', 'workflows', workflow, `${role}.md`),
  ];
  
  for (const workflowPath of searchPaths) {
    if (existsSync(workflowPath)) {
      try {
        return readFileSync(workflowPath, 'utf-8');
      } catch (err) {
        // Continue to next path
      }
    }
  }
  
  return undefined;
}
