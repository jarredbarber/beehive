import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import JSON5 from 'json5';
import yaml from 'js-yaml';
import { getDefaultPrefix } from './id-generator.js';

export type Ecosystem = 'mixed' | 'claude' | 'gemini';
export type GitStrategy = 'direct' | 'branch' | 'pr';
export type ModelStrategy = 'sequential' | 'random';

export interface GitConfig {
  strategy?: GitStrategy;
  baseBranch?: string;
}

export interface GitHubConfig {
  enabled?: boolean;
  repo?: string;
  baseBranch?: string;
}

export interface ProjectConfig {
  prefix?: string;
  workflow?: string;
  ecosystem?: Ecosystem;
  modelStrategy?: ModelStrategy;
  defaults?: {
    role?: string;
    priority?: number;
  };
  models?: Record<string, string | string[]>;
  context_files?: string[];
  git?: GitConfig;
  github?: GitHubConfig;
  testRetries?: number;
  notify_cmd?: string;      // Shell command with {{message}} placeholder
  overseer?: {
    enabled?: boolean;
    interval?: number;
    model?: string;
  };
}

export class ConfigManager {
  private config: ProjectConfig = {};
  private projectCwd: string = process.cwd();

  private getDefaultAliases(): Record<string, string[]> {
    const ecosystem = this.config.ecosystem || 'mixed';
    
    switch (ecosystem) {
      case 'claude':
        return {
          heavy: ['anthropic/claude-opus-4-6:high', 'anthropic/claude-opus-4-5:high'],
          medium: ['anthropic/claude-sonnet-4-5:medium'],
          light: ['anthropic/claude-haiku-4-5:low'],
        };
      
      case 'gemini':
        return {
          heavy: ['google-antigravity/gemini-3-pro-high:high'],
          medium: ['google-antigravity/gemini-3-flash:medium'],
          light: ['google-antigravity/gemini-2.5-flash:low'],
        };
      
      case 'mixed':
      default:
        return {
          heavy: ['anthropic/claude-opus-4-6:high', 'google-antigravity/gemini-3-pro-high:high'],
          medium: ['anthropic/claude-sonnet-4-5:medium', 'google-antigravity/gemini-3-flash:medium'],
          light: ['anthropic/claude-haiku-4-5:low', 'google-antigravity/gemini-2.5-flash:low'],
        };
    }
  }

  async loadConfig(cwd: string = process.cwd()): Promise<ProjectConfig> {
    this.projectCwd = cwd;
    const yamlPath = join(cwd, '.bh', 'config.yaml');
    const ymlPath = join(cwd, '.bh', 'config.yml');
    const jsonPath = join(cwd, '.bh', 'config.json');

    // Prefer YAML over JSON
    if (existsSync(yamlPath) || existsSync(ymlPath)) {
      const path = existsSync(yamlPath) ? yamlPath : ymlPath;
      try {
        const content = await readFile(path, 'utf-8');
        this.config = (yaml.load(content) as ProjectConfig) || {};
        return this.config;
      } catch (error) {
        console.warn(`⚠️  Failed to parse ${basename(path)}: ${(error as Error).message}`);
        return this.config;
      }
    }
    
    if (existsSync(jsonPath)) {
      try {
        const content = await readFile(jsonPath, 'utf-8');
        this.config = JSON5.parse(content);

        // Scaffold: auto-migrate JSON to YAML
        await this.migrateJsonToYaml(jsonPath, yamlPath);

        return this.config;
      } catch (error) {
        console.warn(`⚠️  Failed to parse config.json: ${(error as Error).message}`);
        return this.config;
      }
    }

    return this.config;
  }

  /**
   * Scaffold: automatically convert config.json to config.yaml.
   * Writes the YAML file and renames the JSON file to config.json.bak.
   * TODO: Remove this migration once all projects have been converted.
   */
  private async migrateJsonToYaml(jsonPath: string, yamlPath: string): Promise<void> {
    try {
      const yamlContent = yaml.dump(this.config, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
      });
      await writeFile(yamlPath, yamlContent, 'utf-8');
      const { rename } = await import('fs/promises');
      await rename(jsonPath, jsonPath + '.bak');
      console.log(`📝 Migrated .bh/config.json → .bh/config.yaml (backup: config.json.bak)`);
    } catch (error) {
      // Migration is best-effort, don't fail if it doesn't work
    }
  }

  resolveModel(modelSpec: string): string[] {
    const [alias, suffix] = modelSpec.split(':');
    const projectAgents = this.config.models?.[alias];
    
    let baseModels: string[];
    if (projectAgents) {
      baseModels = Array.isArray(projectAgents) ? projectAgents : [projectAgents];
    } else {
      const defaultAliases = this.getDefaultAliases();
      baseModels = defaultAliases[alias] || [alias];
    }

    // Apply model selection strategy
    if (this.modelStrategy === 'random' && baseModels.length > 1) {
      baseModels = this.shuffleArray([...baseModels]);
    }

    if (suffix) {
      return baseModels.map(m => {
        const [modelName] = m.split(':');
        return `${modelName}:${suffix}`;
      });
    }

    return baseModels;
  }

  /**
   * Fisher-Yates shuffle algorithm for randomizing array order
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  get ecosystem(): Ecosystem {
    return this.config.ecosystem || 'mixed';
  }

  get modelStrategy(): ModelStrategy {
    return this.config.modelStrategy || 'sequential';
  }

  get workflow(): string {
    return this.config.workflow || 'coding';
  }

  get defaultRole(): string | undefined {
    return this.config.defaults?.role;
  }

  get defaultPriority(): number {
    return this.config.defaults?.priority ?? 2;
  }

  get contextFiles(): string[] {
    return this.config.context_files || [];
  }

  get gitStrategy(): GitStrategy {
    return this.config.git?.strategy || 'direct';
  }

  get gitBaseBranch(): string {
    // Fallback to github.baseBranch for backwards compatibility
    return this.config.git?.baseBranch || this.config.github?.baseBranch || 'main';
  }

  get githubEnabled(): boolean {
    return this.config.github?.enabled ?? false;
  }

  get githubRepo(): string | undefined {
    return this.config.github?.repo;
  }

  get githubBaseBranch(): string {
    return this.config.github?.baseBranch || 'main';
  }

  get testRetries(): number {
    return this.config.testRetries ?? 3;
  }

  get notifyCmd(): string | undefined {
    return this.config.notify_cmd;
  }

  get overseerConfig() {
    return this.config.overseer || {};
  }

  /**
   * Get the task ID prefix for this project.
   * Defaults to the sanitized folder name if not explicitly configured.
   */
  get prefix(): string {
    if (this.config.prefix) {
      return this.config.prefix;
    }
    return getDefaultPrefix(this.projectCwd);
  }
}
