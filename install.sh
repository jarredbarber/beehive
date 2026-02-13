#!/bin/bash
set -e

# Beehive Installation Script

echo "🐝 Installing Beehive tools..."

# 1. Install CLI
echo "📦 Linking CLI 'bh'..."
npm link

# 2. Install Skill
SKILL_DIR="$HOME/.pi/agent/skills"
TARGET="$SKILL_DIR/beehive"
SOURCE="$(pwd)/skill"

echo "🧠 Installing Skill to $TARGET..."
mkdir -p "$SKILL_DIR"

if [ -L "$TARGET" ]; then
    echo "  - Removing existing symlink..."
    rm "$TARGET"
elif [ -d "$TARGET" ]; then
    echo "  - Warning: Directory exists at $TARGET. backing up to $TARGET.bak"
    mv "$TARGET" "$TARGET.bak"
fi

ln -s "$SOURCE" "$TARGET"
echo "  - Symlink created: $TARGET -> $SOURCE"

echo ""
echo "✅ Installation complete!"
echo ""
echo "Usage:"
echo "  1. CLI:   bh help"
echo "  2. Agent: Load skill 'beehive' in pi"
echo ""
echo "Remember to set env vars:"
echo "  export HIVE_URL=https://beehive-v3.hector-ea.workers.dev"
echo "  export HIVE_API_KEY=your-key"
