import { Command } from 'commander';
import { BeehiveApiClient, BeehiveApiError } from '../api-client.js';
import { ConfigManager } from '../config.js';
import { formatJson } from '../utils/output.js';

export function registerKeysCommand(program: Command) {
  const keys = program
    .command('keys')
    .description('Manage API keys (admin only)');

  // bh keys create
  keys
    .command('create')
    .description('Create a new API key')
    .requiredOption('--role <role>', 'Key role: admin or bee')
    .option('--label <text>', 'Label for the key (e.g., "ci-runner", "laptop")')
    .action(async (options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        
        if (options.role !== 'admin' && options.role !== 'bee') {
          console.error('Error: --role must be "admin" or "bee"');
          process.exit(1);
        }

        const config = new ConfigManager();
        await config.loadConfig();
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const baseUrl = process.env.BH_SERVER;
        const authKey = process.env.BH_KEY;
        
        if (!baseUrl || !authKey) {
          throw new Error('BH_SERVER and BH_KEY environment variables must be set');
        }

        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        
        const response = await fetch(`${cleanBaseUrl}/keys`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project,
            role: options.role,
            label: options.label
          })
        });

        if (!response.ok) {
          const error = await response.json() as any;
          throw new Error(`Failed to create key: ${error.error || response.statusText}`);
        }

        const result = await response.json() as any;

        if (isJson) {
          console.log(formatJson(result));
        } else {
          console.log(`✅ Created ${options.role} key${options.label ? ` "${options.label}"` : ''}\n`);
          console.log(`Key: ${result.key}\n`);
          console.log('⚠️  Save this key - it cannot be retrieved later.\n');
          if (result.apiKey) {
            console.log(`Key hash: ${result.apiKey.keyHash}`);
            console.log(`Created: ${result.apiKey.createdAt}`);
          }
        }
      } catch (error) {
        if (error instanceof BeehiveApiError && error.status === 403) {
          console.error('Error: Forbidden - Admin key required');
        } else {
          console.error(`Error: ${(error as Error).message}`);
        }
        process.exit(1);
      }
    });

  // bh keys list
  keys
    .command('list')
    .description('List all API keys')
    .action(async (options, command) => {
      try {
        const isJson = command.optsWithGlobals().json;
        const config = new ConfigManager();
        await config.loadConfig();
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const baseUrl = process.env.BH_SERVER;
        const authKey = process.env.BH_KEY;
        
        if (!baseUrl || !authKey) {
          throw new Error('BH_SERVER and BH_KEY environment variables must be set');
        }

        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        const response = await fetch(`${cleanBaseUrl}/keys?project=${project}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authKey}`
          }
        });

        if (!response.ok) {
          const error = await response.json() as any;
          throw new Error(`Failed to list keys: ${error.error || response.statusText}`);
        }

        const keys = await response.json() as any[];

        if (isJson) {
          console.log(formatJson(keys));
        } else {
          if (keys.length === 0) {
            console.log('No API keys found');
            return;
          }
          console.log(`Found ${keys.length} API key(s):\n`);
          keys.forEach((key: any) => {
            const label = key.label ? ` (${key.label})` : '';
            console.log(`${key.key_hash ? key.key_hash.substring(0, 12) : key.keyHash?.substring(0, 12)}... - ${key.role}${label}`);
            console.log(`  Created: ${key.created_at || key.createdAt}`);
            if (key.last_used_at || key.lastUsedAt) {
              console.log(`  Last used: ${key.last_used_at || key.lastUsedAt}`);
            }
            console.log('');
          });
        }
      } catch (error) {
        if (error instanceof BeehiveApiError && error.status === 403) {
          console.error('Error: Forbidden - Admin key required');
        } else {
          console.error(`Error: ${(error as Error).message}`);
        }
        process.exit(1);
      }
    });

  // bh keys revoke
  keys
    .command('revoke')
    .description('Revoke an API key')
    .argument('<key-hash>', 'Key hash to revoke')
    .action(async (keyHash, options, command) => {
      try {
        const config = new ConfigManager();
        await config.loadConfig();
        const project = process.env.BH_PROJECT || config.prefix || 'default';

        const baseUrl = process.env.BH_SERVER;
        const authKey = process.env.BH_KEY;
        
        if (!baseUrl || !authKey) {
          throw new Error('BH_SERVER and BH_KEY environment variables must be set');
        }

        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

        const response = await fetch(`${cleanBaseUrl}/keys/${keyHash}?project=${project}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${authKey}`
          }
        });

        if (!response.ok) {
          const error = await response.json() as any;
          throw new Error(`Failed to revoke key: ${error.error || response.statusText}`);
        }

        console.log(`✅ Key revoked: ${keyHash}`);
      } catch (error) {
        if (error instanceof BeehiveApiError && error.status === 403) {
          console.error('Error: Forbidden - Admin key required');
        } else {
          console.error(`Error: ${(error as Error).message}`);
        }
        process.exit(1);
      }
    });
}
