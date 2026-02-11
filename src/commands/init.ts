import { Command } from 'commander';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function registerInitCommand(program: Command) {
  program
    .command('init [name]')
    .description('Initialize bh in current project')
    .option('--with-agents', 'Install agent configurations for bh worker (coding workflow)')
    .option('--server <url>', 'Beehive server URL (e.g., https://hive.example.com)')
    .option('--repo <repo>', 'GitHub repository (format: owner/repo-name)')
    .action(async (name, options) => {
      try {
        // If --server is provided, bootstrap on remote hive
        if (options.server) {
          await bootstrapRemoteProject(options.server, name, options.repo);
          return;
        }

        console.log('🚀 Initializing bh in current project (local mode)...\n');

        // Install agents if requested
        if (options.withAgents) {
          await installDefaultWorkflow();
        }

        // Always create default config if missing
        await installConfig();

        console.log('\n✅ bh initialized successfully!\n');
        console.log('Quick start:');
        console.log('  bh list');

        if (options.withAgents) {
          console.log('\nAI worker (remote mode recommended):');
          console.log('  export BH_SERVER=...');
          console.log('  bh next');
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}

async function bootstrapRemoteProject(server: string, name?: string, repo?: string) {
  const cwd = process.cwd();
  const projectName = name || basename(cwd);
  
  console.log(`🚀 Bootstrapping project "${projectName}" on ${server}...\n`);
  
  if (!repo) {
    console.error('Error: --repo is required when using --server');
    console.error('Example: --repo owner/repo-name');
    process.exit(1);
  }
  
  // Call POST /projects (unauthenticated bootstrap endpoint)
  const response = await fetch(`${server}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: projectName,
      repo: repo,
      config: ''  // Empty for now, or read from existing config.yaml
    })
  });
  
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`Failed to create project: ${(errorBody as any).error || response.statusText}`);
  }
  
  const result = await response.json() as any;
  
  console.log('✅ Project created successfully!\n');
  console.log(`Project: ${result.project.name}`);
  console.log(`Repo: ${result.project.repo}`);
  console.log(`\n🔑 Admin key (save this - cannot be retrieved later):\n`);
  console.log(`   ${result.adminKey}\n`);
  console.log('Export this key to use bh commands:\n');
  console.log(`   export BH_SERVER=${server}`);
  console.log(`   export BH_KEY=${result.adminKey}\n`);
  console.log('Next steps:');
  console.log('  bh list');
  console.log('  bh dump > backup.json');
}

async function installDefaultWorkflow() {
  try {
    const workflowName = 'coding';
    const workflowDir = join(process.cwd(), '.bh', 'workflows', workflowName);

    // Create workflow directory
    if (!existsSync(workflowDir)) {
      await mkdir(workflowDir, { recursive: true });
      console.log(`✓ Created .bh/workflows/${workflowName}/ directory`);
    } else {
      console.log(`✓ .bh/workflows/${workflowName}/ directory exists`);
    }

    // Get workflow files from bh installation
    const bhRoot = join(__dirname, '..', '..');
    const bhWorkflowDir = join(bhRoot, 'workflows', workflowName);

    const agentFiles = [
      'code.md',
      'review.md',
      'test.md',
      'docs.md',
      'design.md'
    ];

    const agentModels: Record<string, string> = {
      'code.md': 'medium',
      'review.md': 'heavy',
      'test.md': 'medium',
      'docs.md': 'light',
      'design.md': 'heavy'
    };

    for (const file of agentFiles) {
      try {
        const source = join(bhWorkflowDir, file);
        const dest = join(workflowDir, file);

        // Skip if already exists
        if (existsSync(dest)) {
          console.log(`  ⊙ .bh/workflows/${workflowName}/${file} already exists (skipped)`);
          continue;
        }

        let content = await readFile(source, 'utf-8');
        
        // Inject alias into content (replacing existing model line if it exists)
        const alias = agentModels[file];
        if (alias) {
          content = content.replace(/^model:.*$/m, `model: ${alias}`);
        }

        await writeFile(dest, content, 'utf-8');
        console.log(`  ✓ Installed .bh/workflows/${workflowName}/${file}`);
      } catch (error) {
        console.log(`  ⚠ Could not install .bh/workflows/${workflowName}/${file}`);
      }
    }
  } catch (error) {
    console.log('⚠ Could not install default workflow:', (error as Error).message);
  }
}

async function installConfig() {
  const yamlPath = join(process.cwd(), '.bh', 'config.yaml');
  const jsonPath = join(process.cwd(), '.bh', 'config.json');
  
  if (existsSync(yamlPath) || existsSync(jsonPath)) {
    return;
  }

  const defaultConfig = {
    workflow: 'coding',
    defaults: {
      priority: 2,
      size: 'medium',
      type: 'task'
    }
  };

  try {
    const dir = dirname(yamlPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const yaml = await import('js-yaml');
    const content = yaml.dump(defaultConfig, { indent: 2 });
    await writeFile(yamlPath, content, 'utf-8');
    console.log('✓ Created .bh/config.yaml');
  } catch (error) {
    console.log('⚠ Could not create .bh/config.yaml:', (error as Error).message);
  }
}
