#!/bin/bash
set -e

export NVM_DIR="/root/.nvm"
source "$NVM_DIR/nvm.sh"

# ── Clone the repo ────────────────────────────────────────────────────────────
if [ -z "$GIT_REPO_URL" ]; then
    echo "FATAL: GIT_REPO_URL is not set"
    exit 1
fi

echo "Cloning $GIT_REPO_URL..."
git clone "$GIT_REPO_URL" /home/app/output

# ── Resolve project root (supports ROOT_DIR for monorepos) ───────────────────
# Examples: ROOT_DIR=frontend  or  ROOT_DIR=packages/web
PROJECT_ROOT="/home/app/output"
if [ -n "$ROOT_DIR" ]; then
    PROJECT_ROOT="$PROJECT_ROOT/$ROOT_DIR"
    if [ ! -d "$PROJECT_ROOT" ]; then
        echo "FATAL: ROOT_DIR '$ROOT_DIR' does not exist in the cloned repo"
        exit 1
    fi
fi
export PROJECT_ROOT
echo "Project root: $PROJECT_ROOT"

# ── Detect required Node version ──────────────────────────────────────────────
# Priority: .nvmrc > .node-version > package.json engines.node
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
            // Strip semver ranges (^, ~, >=, <=) to get a clean major or full version
            const match = v.match(/(\d+(\.\d+)*)/);
            if (match) console.log(match[1]);
        } catch(e) {}
    " 2>/dev/null)
    if [ -n "$NODE_VERSION" ]; then
        echo "Found engines.node in package.json: $NODE_VERSION"
    fi
fi

# ── Switch Node version if needed ─────────────────────────────────────────────
if [ -n "$NODE_VERSION" ]; then
    echo "Switching to Node $NODE_VERSION..."
    nvm install "$NODE_VERSION" --silent
    nvm use "$NODE_VERSION"
else
    echo "No Node version specified — using default: $(node -v)"
fi

echo "Active Node: $(node -v) | npm: $(npm -v)"
echo ""

# ── Run the build script ──────────────────────────────────────────────────────
exec node /home/app/script.js
