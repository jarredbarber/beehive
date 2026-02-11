# Docker Worker Isolation - Design Exploration

## Problem Statement

The beehive worker currently executes AI agents with full access to the host filesystem, including sensitive dotfiles containing API keys and credentials. Agents have been observed:

- Grepping `~/.bashrc`, `~/.profile`, and other dotfiles for API keys
- Using discovered credentials in bash commands
- Causing these credentials to be captured in worker logs
- Committing sensitive data to git repositories

This poses significant security risks and requires isolation at the execution layer.

## Proposed Solution: Docker Container Isolation

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Host System                                             │
│                                                         │
│  ┌───────────────────────────────────────┐             │
│  │ bh worker                              │             │
│  │ (orchestrator - runs on host)          │             │
│  └──────────────┬────────────────────────┘             │
│                 │                                        │
│                 ↓ spawns container per task             │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Docker Container (isolated)                     │   │
│  │                                                 │   │
│  │  ┌───────────────────────────────────────┐     │   │
│  │  │ pi-coding-agent                       │     │   │
│  │  │ - Executes task                       │     │   │
│  │  │ - Restricted bash tool                │     │   │
│  │  │ - No access to ~/.* dotfiles          │     │   │
│  │  └───────────────────────────────────────┘     │   │
│  │                                                 │   │
│  │  Mounted volumes:                              │   │
│  │  - /workspace (rw) → project directory         │   │
│  │  - /tm (rw) → .bh/ directory                   │   │
│  │  - /sessions (rw) → session storage            │   │
│  │                                                 │   │
│  │  Environment:                                  │   │
│  │  - GEMINI_API_KEY (passed explicitly)          │   │
│  │  - ANTHROPIC_API_KEY                           │   │
│  │  - BRAVE_API_KEY                               │   │
│  │  - No other host env vars                      │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Container Design

#### 1. Base Image

```dockerfile
FROM node:20-slim

# Install minimal dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 agent

# Set up workspace
WORKDIR /workspace

USER agent
```

#### 2. Volume Mounts

**Mount Strategy:**
- `/workspace` (read-write): Project directory being worked on
- `/tm` (read-write): `.bh/` directory for backlog and logs
- `/sessions` (read-write): Pi-coding-agent session storage

**Explicitly NOT mounted:**
- `~/.bashrc`, `~/.profile`, `~/.zshrc`
- `~/.ssh/`
- `~/.aws/`, `~/.gcloud/`
- Any other home directory dotfiles

**Example mount configuration:**
```yaml
volumes:
  - ./:/workspace:rw
  - ./.bh:/tm:rw
  - ./.bh/sessions:/sessions:rw
```

#### 3. Environment Variable Passing

**Allowed Environment Variables (explicit whitelist):**
- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`
- `BRAVE_API_KEY`
- `GITHUB_TOKEN` (for git operations)
- `TZ` (timezone)
- `LANG` / `LC_ALL` (locale)

**Implementation:**
```typescript
// In worker.ts
private getAllowedEnvVars(): Record<string, string> {
  const allowed = [
    'GEMINI_API_KEY',
    'ANTHROPIC_API_KEY',
    'BRAVE_API_KEY',
    'GITHUB_TOKEN',
    'TZ',
    'LANG',
    'LC_ALL'
  ];
  
  const envVars: Record<string, string> = {};
  for (const key of allowed) {
    if (process.env[key]) {
      envVars[key] = process.env[key]!;
    }
  }
  
  return envVars;
}
```

#### 4. Shared Resources

**Problem:** Certain projects may require shared resources like:
- `.lake/packages` (Lean theorem prover)
- `node_modules` (if not using volume mounts)
- Compiled caches

**Solution:** Optional volume mounts defined in `.bh/config.json`:

```json5
{
  "docker": {
    "enabled": true,
    "image": "beehive-worker:latest",
    "volumes": [
      {
        "host": ".lake/packages",
        "container": "/workspace/.lake/packages",
        "mode": "rw"
      }
    ],
    "env": [
      "CUSTOM_ENV_VAR"
    ]
  }
}
```

## Implementation Approaches

### Approach 1: Docker-in-Docker (Heavyweight)

**How it works:**
- Worker runs inside a container
- Spawns sibling containers for each task using Docker socket

**Pros:**
- Full isolation between tasks
- Clean separation of concerns

**Cons:**
- Requires Docker socket mount (security risk)
- Complex setup
- Higher overhead

### Approach 2: Host Worker + Container Execution (Recommended)

**How it works:**
- Worker runs on host (current behavior)
- Spawns Docker container for each task execution
- Container uses pi-coding-agent to execute the task

**Pros:**
- Simpler setup
- Lower overhead
- No Docker socket needed
- Easy to fallback to non-containerized mode

**Cons:**
- Worker itself still has host access (acceptable - it's trusted code)

**Implementation sketch:**

```typescript
// src/utils/docker-executor.ts

export class DockerExecutor {
  private image: string;
  private projectPath: string;
  private tmPath: string;
  
  constructor(config: ConfigManager) {
    this.image = config.dockerImage || 'beehive-worker:latest';
    this.projectPath = process.cwd();
    this.tmPath = join(process.cwd(), '.bh');
  }
  
  async executeTask(task: Task, agent: AgentConfig, systemPrompt: string, userPrompt: string): Promise<AgentResult> {
    const envVars = this.getAllowedEnvVars();
    
    const dockerArgs = [
      'run',
      '--rm',
      '--network', 'host', // Allow network access for API calls
      '-v', `${this.projectPath}:/workspace:rw`,
      '-v', `${this.tmPath}:/tm:rw`,
      '-w', '/workspace',
      ...Object.entries(envVars).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
      this.image,
      'node',
      '/app/agent-runner.js', // Script inside container
      '--task-id', task.id,
      '--agent', agent.name,
      '--system-prompt-file', '/tmp/system.txt',
      '--user-prompt-file', '/tmp/user.txt'
    ];
    
    // Write prompts to temp files (mounted into container)
    await writeFile('/tmp/system.txt', systemPrompt);
    await writeFile('/tmp/user.txt', userPrompt);
    
    // Execute container
    const { spawn } = await import('child_process');
    const child = spawn('docker', dockerArgs);
    
    // Stream output...
    // Parse result...
    
    return result;
  }
  
  private getAllowedEnvVars(): Record<string, string> {
    const allowed = [
      'GEMINI_API_KEY',
      'ANTHROPIC_API_KEY',
      'BRAVE_API_KEY',
      'GITHUB_TOKEN',
      'TZ',
      'LANG',
      'LC_ALL'
    ];
    
    const envVars: Record<string, string> = {};
    for (const key of allowed) {
      if (process.env[key]) {
        envVars[key] = process.env[key]!;
      }
    }
    
    return envVars;
  }
}
```

### Approach 3: Podman (Rootless Alternative)

**Why Podman:**
- Rootless containers (no daemon)
- Docker-compatible CLI
- Better security model
- SELinux integration

**Implementation:**
- Same API as Docker approach
- Use `podman` command instead of `docker`
- Auto-detect available runtime:
  ```typescript
  const runtime = await this.detectRuntime(); // 'podman' or 'docker'
  ```

## Performance Evaluation

### Container Startup Overhead

**Test methodology:**
1. Measure time from container spawn to first bash command execution
2. Compare against direct execution time
3. Evaluate caching strategies

**Expected overhead:**
- Cold start (no cached layers): 2-5 seconds
- Warm start (cached layers): 0.5-1 second
- With volume mounts: +0.1-0.2 seconds

**Mitigation strategies:**
1. **Pre-built images:** Use pre-built image instead of building on-demand
2. **Layer caching:** Ensure Docker layers are cached between runs
3. **Persistent containers:** Reuse containers instead of recreating (trade isolation for speed)
4. **Warm pool:** Keep N containers warm and ready

### Benchmark Plan

```bash
# Test 1: Container creation time
time docker run --rm beehive-worker:latest echo "ready"

# Test 2: With volume mounts
time docker run --rm \
  -v $(pwd):/workspace:rw \
  beehive-worker:latest \
  echo "ready"

# Test 3: Full agent execution
time docker run --rm \
  -v $(pwd):/workspace:rw \
  -e GEMINI_API_KEY=$GEMINI_API_KEY \
  beehive-worker:latest \
  node /app/agent-runner.js --task-id test
```

## Security Considerations

### Threat Model

**What we're protecting against:**
1. **Accidental credential exposure:** Agent reads dotfiles and logs credentials
2. **Malicious prompt injection:** User-controlled input causes agent to exfiltrate data
3. **Resource exhaustion:** Agent consumes excessive CPU/memory/disk

**What we're NOT protecting against (out of scope):**
1. Network-based exfiltration (agent can still make HTTP requests)
2. Side-channel attacks
3. Container escape vulnerabilities

### Security Features

1. **Read-only root filesystem:** Prevent agent from modifying system files
   ```dockerfile
   docker run --read-only ...
   ```

2. **Resource limits:**
   ```dockerfile
   docker run \
     --memory=2g \
     --cpus=2 \
     --pids-limit=100 \
     ...
   ```

3. **No privileged mode:** Never run with `--privileged`

4. **Drop capabilities:**
   ```dockerfile
   docker run \
     --cap-drop=ALL \
     --cap-add=CHOWN \
     --cap-add=DAC_OVERRIDE \
     ...
   ```

5. **Network isolation (optional):**
   ```dockerfile
   docker run --network=none ...
   ```
   (But this breaks API calls - not viable for current use case)

### Audit Trail

All bash commands executed in the container are already logged to `.bh/logs/worker-<id>.md`. With Docker, we can enhance this:

```typescript
// Log container metadata
await appendLog(`\n## Container Execution\n`);
await appendLog(`- Container ID: ${containerId}\n`);
await appendLog(`- Image: ${this.image}\n`);
await appendLog(`- Start time: ${new Date().toISOString()}\n`);
```

## Migration Path

### Phase 1: Optional Docker mode (0.1.0)

- Add `docker.enabled` config flag
- Implement DockerExecutor
- Fallback to current behavior if Docker not available
- Document usage

### Phase 2: Refinement (0.2.0)

- Add Podman support
- Performance optimizations (container pooling)
- Enhanced security (resource limits, read-only FS)

### Phase 3: Default mode (1.0.0)

- Make Docker the default execution mode
- Non-containerized mode becomes opt-in (for development)

## Configuration Design

`.bh/config.json`:
```json5
{
  "docker": {
    "enabled": true,
    "runtime": "auto", // "auto" | "docker" | "podman"
    "image": "beehive-worker:latest",
    "buildOnStart": false, // Build image if not present
    "volumes": [
      {
        "host": ".lake/packages",
        "container": "/workspace/.lake/packages",
        "mode": "rw"
      }
    ],
    "additionalEnvVars": [
      "CUSTOM_VAR"
    ],
    "resources": {
      "memory": "2g",
      "cpus": 2,
      "pidsLimit": 100
    },
    "security": {
      "readOnlyRoot": true,
      "dropCapabilities": ["ALL"],
      "addCapabilities": ["CHOWN", "DAC_OVERRIDE"]
    }
  }
}
```

## Open Questions

1. **Session persistence:** How to handle pi-coding-agent sessions across container restarts?
   - Solution: Mount session directory as volume

2. **Git operations:** Container needs to commit changes - requires git config
   - Solution: Mount `.gitconfig` (read-only) or configure git inside container

3. **Performance acceptability:** Is 0.5-1s overhead acceptable for typical tasks?
   - Need benchmarks on real workloads

4. **Network policies:** Should we restrict outbound connections?
   - Current answer: No, agents need API access

5. **Multi-platform support:** Docker not available on all systems
   - Solution: Make it optional, provide clear documentation

## Comparison with Tool/Skill Restrictions

This Docker isolation complements the "tool/skill restrictions" task:

| Aspect | Docker Isolation | Tool Restrictions |
|--------|------------------|-------------------|
| **Scope** | Filesystem & env vars | Available tools/skills |
| **Enforcement** | OS-level (container) | Application-level |
| **Overhead** | 0.5-1s per task | Negligible |
| **Complexity** | Medium (Docker setup) | Low (config + validation) |
| **Protection** | Accidental + malicious | Accidental only |

**Recommended approach:** Implement both
- Docker for infrastructure-level isolation
- Tool restrictions for fine-grained control

## Next Steps

1. **Prototype implementation:**
   - Create `src/utils/docker-executor.ts`
   - Modify `worker.ts` to use DockerExecutor when enabled
   - Create Dockerfile and build scripts

2. **Performance benchmarks:**
   - Measure container startup time
   - Test with real workloads
   - Document overhead

3. **Security review:**
   - Test isolation effectiveness
   - Verify credentials are not exposed
   - Check for container escape vulnerabilities

4. **Documentation:**
   - User guide for Docker setup
   - Troubleshooting guide
   - Migration guide for existing users

5. **Podman support:**
   - Test Podman compatibility
   - Document rootless setup
   - Auto-detection logic

## References

- Docker security best practices: https://docs.docker.com/engine/security/
- Podman vs Docker: https://podman.io/
- Container isolation: https://docs.docker.com/engine/security/userns-remap/
- Resource limits: https://docs.docker.com/config/containers/resource_constraints/
