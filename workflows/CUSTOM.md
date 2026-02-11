# Custom Agents Guide

TM supports per-project custom agents with a tiered loading system.

## Agent Search Paths

Agents are loaded from multiple locations in priority order (per workflow):

1. **`./.bh/workflows/<workflow>/`** - Project-specific metadata (highest priority)
2. **`./workflows/<workflow>/`** - Project-specific (at root)
3. **`~/.bh/workflows/<workflow>/`** - User-specific
4. **`[beehive-install]/workflows/<workflow>/`** - Global defaults (lowest priority)

The first matching agent file wins. This allows projects to:
- Add custom agents for specialized domains
- Override default agents with project-specific versions
- Share common agents across your projects (via `~/.bh/workflows/`)

## Creating Custom Agents

### Project-Specific Agent

For a specialized project (e.g., math, ML, hardware):

```bash
# In your project directory
mkdir -p .bh/workflows/math
cat > .bh/workflows/math/logic.md <<'EOF'
---
name: logic
model: heavy
---

# Logic Agent
...
```

Now tasks with `-r logic` will use your custom agent:
```bash
bh create -t "Prove theorem X" -r logic -p 4
```

### Override Default Agent

Customize a default agent for your project:

```bash
# Override the code agent with Go-specific version
cat > .bh/workflows/coding/code.md <<'EOF'
---
name: code
model: medium
---

# Go Code Agent
...
```

### User-Wide Custom Agents

Share agents across your projects:

```bash
mkdir -p ~/.bh/workflows/writing

# Create a personal agent
cat > ~/.bh/workflows/writing/editor.md <<'EOF'
---
name: editor
model: medium
---

# Writing Editor Agent
...
EOF
```

All your projects can now use `-r editor --workflow writing` without per-project setup.

## Agent Discovery

The worker automatically discovers all `.md` files (except `README.md`) in the search paths.

View loaded agents:
```bash
bh worker --show-agents
```

Output:
```
📋 Loaded Agents (Workflow: coding):

📁 code       medium  [project-metadata]
🌍 design     heavy   [global]
👤 editor     medium  [user]
📁 logic      heavy   [project-metadata]

Workflow search paths (priority order):
  1. ./.bh/workflows/coding/      (project-specific)
  2. ./workflows/coding/          (project-specific)
  3. ~/.bh/workflows/coding/      (user-specific)
  4. [beehive-install]/workflows/coding/ (global defaults)
```

Icons:
- 📁 = project agent (local override in .bh/ or root)
- 👤 = user agent (~/.bh/workflows/)
- 🌍 = global agent (tm install)

## Example Use Cases

### Math Project (Lean/Coq)

```bash
# Fork the default math workflow
bh workflow fork math

# Use it
bh create -t "Formalize distributivity proof" -r execute -p 4
bh worker --workflow math
```

### Web Project

```bash
# Project uses React + TypeScript
# Fork coding workflow
bh workflow fork coding

# Customize code agent in .bh/workflows/coding/code.md
cat > .bh/workflows/coding/code.md <<'EOF'
---
name: code
model: medium
---

# React/TypeScript Code Agent
...
EOF
```

### Hardware/Embedded Project

```bash
mkdir -p .bh/workflows/embedded
cat > .bh/workflows/embedded/driver.md <<'EOF'
---
name: driver
model: heavy
---

# Embedded Systems Agent
...
EOF

bh create -t "Implement SPI driver" -r driver -p 4 --workflow embedded
```

## Best Practices

### When to Create Custom Agents

- **Domain-specific expertise**: Math, ML, hardware, etc.
- **Language-specific patterns**: Go, Rust, Haskell conventions
- **Project-specific context**: Codebase patterns, architecture rules
- **Different model requirements**: Some tasks need opus, others can use flash

### Agent Design Tips

1. **Be specific**: Tailor the agent to your exact needs
2. **Include examples**: Show the agent your code style
3. **Set clear expectations**: What done looks like
4. **Choose appropriate models**:
   - `heavy` for complex reasoning (math, design, architecture)
   - `medium` or `light` for routine tasks (tests, formatting)

### Model Selection & Aliases

Use model aliases for better resilience and cleaner configs:

```markdown
---
name: agent-name
model: heavy
---
```

**Built-in Aliases:**
- `heavy`: `claude-opus-4-5` -> `gemini-3-pro-high`
- `medium`: `claude-sonnet-4-5` -> `gemini-3-flash`
- `light`: `claude-haiku-4-5` -> `gemini-2.5-flash`

You can customize these aliases in your `.bh/config.json`:

```json5
{
  "models": {
    "custom-alias": ["provider/model-1", "provider/model-2"],
    "heavy": "anthropic/claude-opus-4-5" // override built-in
  },
  "context_files": ["API.md", "CONTRIBUTING.md"] // Always include these in worker context
}
```

## Workflow Documentation

Each workflow can include a `README.md` file that documents the workflow's purpose, available agents, and usage patterns:

```bash
# View the README for your current workflow
bh workflow readme

# View a specific agent's prompt
bh workflow readme -a code
```

## Example Workflows

The global installation includes example workflows:
- `coding/` - Software development with code, test, review, docs, design, pm agents
- Check `[beehive-install]/workflows/` for available examples

## Troubleshooting

**Agent not loading?**
```bash
bh worker --show-agents  # Check if it's found
```

**Wrong agent loaded?**
Check priority - project agents in `.bh/workflows/` override user agents in `~/.bh/workflows/` override global agents.

**Need to debug?**
```bash
ls -la .bh/workflows/<workflow>/        # Project agents (metadata)
ls -la workflows/<workflow>/            # Project agents (root)
ls -la ~/.bh/workflows/<workflow>/      # User agents
npm list -g bh                          # Find bh install location
```

## Integration with Init

When running `bh init --with-agents`, default agents are copied to `./.bh/workflows/coding/`.
You can then customize them for your project.

To start fresh without agents:
```bash
bh init  # Basic setup, no agents
```

Then selectively fork workflows you need:
```bash
bh workflow fork coding  # Fork the coding workflow to .bh/workflows/coding/
```
