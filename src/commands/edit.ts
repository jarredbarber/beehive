import { Command } from 'commander';
import { BeehiveApiClient } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatTask } from '../utils/output.js';
import { resolveTaskId } from '../utils/resolve-id.js';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import yaml from 'js-yaml';

export function registerEditCommand(program: Command) {
  program
    .command('edit <task-id>')
    .description('Edit task in $EDITOR')
    .addHelpText('after', '\nExamples:\n  bh edit erdos-728-ry86\n  bh edit ry86  (resolves to project prefix)')
    .action(async (taskId: string) => {
      try {
        const config = new ConfigManager();
        await config.loadConfig();
        
        const fullId = resolveTaskId(taskId);
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const client = new BeehiveApiClient();
        
        // Fetch task
        const task = await client.getTask(project, fullId);
        if (!task) {
          console.error(`Error: Task not found: ${fullId}`);
          process.exit(1);
        }
        
        // Create temp file
        const tmpFile = join(tmpdir(), `bh-edit-${fullId}.md`);
        
        // Format as YAML frontmatter + Markdown
        const frontmatter = {
          role: task.role,
          priority: task.priority,
          dependencies: task.dependencies || []
        };
        
        const header = `# Read-only: ${task.id} | State: ${task.state} | Created: ${task.createdAt}`;
        const content = `---\n${header}\n${yaml.dump(frontmatter).trim()}\n---\n\n${task.description}`;
        
        writeFileSync(tmpFile, content, 'utf-8');
        
        // Open in editor
        const editor = process.env.EDITOR || 'vim';
        console.log(`Opening ${editor}...`);
        const result = spawnSync(editor, [tmpFile], { stdio: 'inherit' });
        
        if (result.status !== 0) {
          console.error('Error: Editor exited with error');
          if (existsSync(tmpFile)) unlinkSync(tmpFile);
          process.exit(1);
        }
        
        // Parse edited content
        const edited = readFileSync(tmpFile, 'utf-8');
        if (existsSync(tmpFile)) unlinkSync(tmpFile);
        
        const match = edited.match(/^---\n[\s\S]*?\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
        if (!match) {
          console.error('Error: Invalid format - YAML frontmatter not found');
          process.exit(1);
        }
        
        const editedFrontmatter = yaml.load(match[1]) as any;
        const editedDescription = match[2].trim();
        
        // Build updates
        const updates: any = {};
        
        if (editedDescription !== task.description) {
          updates.description = editedDescription;
        }
        
        if (editedFrontmatter.role !== task.role) {
          updates.role = editedFrontmatter.role;
        }
        
        if (editedFrontmatter.priority !== task.priority) {
          updates.priority = editedFrontmatter.priority;
        }
        
        const newDeps = (editedFrontmatter.dependencies || []).sort();
        const oldDeps = (task.dependencies || []).sort();
        if (JSON.stringify(newDeps) !== JSON.stringify(oldDeps)) {
          updates.dependencies = newDeps;
        }
        
        // Apply updates if any
        if (Object.keys(updates).length === 0) {
          console.log('No changes detected.');
          return;
        }
        
        const updatedTask = await client.updateTask(project, fullId, updates);
        console.log(`✅ Task ${fullId} updated successfully.`);
        console.log(formatTask(updatedTask));
        
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
