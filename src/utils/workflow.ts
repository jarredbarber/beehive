import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load a specific file from the workflow directory.
 * Searches in project .bh/workflows, project workflows/, and bundled workflows.
 */
export function loadWorkflowFile(workflow: string, filename: string): string | undefined {
  const searchPaths = [
    join(process.cwd(), '.bh', 'workflows', workflow, filename),
    join(process.cwd(), 'workflows', workflow, filename),
    join(__dirname, '..', '..', 'workflows', workflow, filename),
  ];
  
  for (const filePath of searchPaths) {
    if (existsSync(filePath)) {
      try {
        return readFileSync(filePath, 'utf-8');
      } catch (err) {
        // Continue to next path
      }
    }
  }
  
  return undefined;
}

/**
 * Load the role-specific prompt from the workflow files.
 */
export function loadRolePrompt(workflow: string, role: string): string | undefined {
  return loadWorkflowFile(workflow, `${role}.md`);
}

/**
 * Load complete workflow context: preamble + role prompt
 */
export function loadWorkflowContext(workflow: string, role: string): {
  preamble?: string;
  rolePrompt?: string;
  fullContext: string;
} {
  const preamble = loadWorkflowFile(workflow, '_preamble.md');
  const rolePrompt = loadRolePrompt(workflow, role);
  
  const parts: string[] = [];
  
  if (preamble) {
    parts.push(preamble);
  }
  
  if (rolePrompt) {
    parts.push(rolePrompt);
  }
  
  return {
    preamble,
    rolePrompt,
    fullContext: parts.join('\n\n---\n\n')
  };
}
