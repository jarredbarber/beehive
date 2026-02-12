import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';

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

export interface WorkflowContext {
  preamble?: string;
  rolePrompt?: string;
  fullContext: string;
  model?: string;
}

/**
 * Load complete workflow context: preamble + role prompt
 */
export function loadWorkflowContext(workflow: string, role: string): WorkflowContext {
  const preamble = loadWorkflowFile(workflow, '_preamble.md');
  const rolePromptRaw = loadRolePrompt(workflow, role);
  
  let rolePrompt: string | undefined;
  let model: string | undefined;
  
  if (rolePromptRaw) {
    const parsed = matter(rolePromptRaw);
    rolePrompt = parsed.content;
    model = parsed.data.model as string | undefined;
  }
  
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
    fullContext: parts.join('\n\n---\n\n'),
    model
  };
}

/**
 * Load all models defined in a workflow.
 */
export function loadWorkflowModels(workflow: string): string[] {
  const searchPaths = [
    join(process.cwd(), '.bh', 'workflows', workflow),
    join(process.cwd(), 'workflows', workflow),
    join(__dirname, '..', '..', 'workflows', workflow),
  ];
  
  const models = new Set<string>();
  
  for (const dir of searchPaths) {
    if (existsSync(dir)) {
      try {
        const files = readdirSync(dir);
        for (const file of files) {
          if (file.endsWith('.md') && !file.startsWith('_')) {
            const content = readFileSync(join(dir, file), 'utf-8');
            const parsed = matter(content);
            if (parsed.data.model) {
              models.add(parsed.data.model);
            }
          }
        }
      } catch (e) {}
    }
  }
  
  return Array.from(models);
}
