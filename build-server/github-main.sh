#!/bin/bash
set -e

# In GitHub Actions ubuntu-latest, NVM is usually installed at /home/runner/.nvm or $NVM_DIR is set
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    source "$NVM_DIR/nvm.sh"
else
    echo "Warning: nvm.sh not found at $NVM_DIR/nvm.sh"
fi

if [ -z "$GIT_REPO_URL" ]; then
    echo "FATAL: GIT_REPO_URL is not set"
    exit 1
fi

WORK_DIR="$GITHUB_WORKSPACE/build-server"
if [ -z "$GITHUB_WORKSPACE" ]; then
    WORK_DIR="$(pwd)"
fi

echo "Cloning $GIT_REPO_URL..."
git clone "$GIT_REPO_URL" "$WORK_DIR/output"

PROJECT_ROOT="$WORK_DIR/output"
if [ -n "$ROOT_DIR" ]; then
    PROJECT_ROOT="$PROJECT_ROOT/$ROOT_DIR"
    if [ ! -d "$PROJECT_ROOT" ]; then
        echo "FATAL: ROOT_DIR '$ROOT_DIR' does not exist in the cloned repo"
        exit 1
    fi
fi
export PROJECT_ROOT
echo "Project root: $PROJECT_ROOT"

NODE_VERSION=""

if [ -f "$PROJECT_ROOT/.nvmrc" ]; then
    NODE_VERSION=$(cat "$PROJECT_ROOT/.nvmrc" | tr -d '[:space:]')
    echo "Found .nvmrc: $NODE_VERSION"
elif [ -f "$PROJECT_ROOT/.node-version" ]; then
    NODE_VERSION=$(cat "$PROJECT_ROOT/.node-version" | tr -d '[:space:]')
    echo "Found .node-version: $NODE_VERSION"
elif [ -f "$PROJECT_ROOT/package.json" ]; then
    NODE_VERSION=$(node -e "
        try {
            const p = require('$PROJECT_ROOT/package.json');
            const v = (p.engines && p.engines.node) || '';
            const match = v.match(/(\d+(\.\d+)*)/);
            if (match) console.log(match[1]);
        } catch(e) {}
    " 2>/dev/null)
    if [ -n "$NODE_VERSION" ]; then
        echo "Found engines.node in package.json: $NODE_VERSION"
    fi
fi

if [ -n "$NODE_VERSION" ]; then
    echo "Switching to Node $NODE_VERSION..."
    nvm install "$NODE_VERSION" --silent
    nvm use "$NODE_VERSION"
else
    echo "No Node version specified — using default: $(node -v)"
fi

echo "Active Node: $(node -v) | npm: $(npm -v)"
echo ""

# Go to build-server directory and run script
cd "$WORK_DIR"
exec node script.js
