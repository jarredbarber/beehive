import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';

const rootDir = process.cwd();
const workflowsDir = join(rootDir, 'workflows');
const outputFile = join(rootDir, 'worker', 'src', 'workflows.json');

const workflows = {};

if (existsSync(workflowsDir)) {
  const dirs = readdirSync(workflowsDir, { withFileTypes: true });
  for (const dir of dirs) {
    if (dir.isDirectory()) {
      const workflowName = dir.name;
      workflows[workflowName] = {};
      
      const files = readdirSync(join(workflowsDir, workflowName));
      for (const file of files) {
        if (file.endsWith('.md')) {
          const content = readFileSync(join(workflowsDir, workflowName, file), 'utf-8');
          const parsed = matter(content);
          
          if (file === '_preamble.md') {
            workflows[workflowName]._preamble = parsed.content;
          } else {
            const role = file.replace('.md', '');
            workflows[workflowName][role] = {
              content: parsed.content,
              model: parsed.data.model || 'medium'
            };
          }
        }
      }
    }
  }
}

writeFileSync(outputFile, JSON.stringify(workflows, null, 2), 'utf-8');
console.log(`✅ Bundled workflows to ${outputFile}`);
