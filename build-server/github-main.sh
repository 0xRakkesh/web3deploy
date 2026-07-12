#!/bin/bash
set -e

[ -z "$GIT_REPO_URL" ] && { echo "FATAL: GIT_REPO_URL is not set"; exit 1; }

WORK_DIR="${GITHUB_WORKSPACE:-$(pwd)}/build-server"
export PROJECT_ROOT="$WORK_DIR/output${ROOT_DIR:+/$ROOT_DIR}"

echo "Cloning $GIT_REPO_URL..."
git clone "$GIT_REPO_URL" "$WORK_DIR/output"

[ ! -d "$PROJECT_ROOT" ] && { echo "FATAL: ROOT_DIR '$ROOT_DIR' not found"; exit 1; }

# (Environment variables will be written by script.js)

# Load NVM
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Switch to project root to auto-detect node version
cd "$PROJECT_ROOT"

# Use nvm's built-in detection for .nvmrc/.node-version, or fallback to package.json
if [ -f .nvmrc ] || [ -f .node-version ]; then
    nvm install --silent || true
elif [ -f package.json ]; then
    NODE_VER=$(node -e "console.log(require('./package.json').engines?.node?.match(/(\d+(\.\d+)*)/)?.[1] || '')" 2>/dev/null)
    [ -n "$NODE_VER" ] && nvm install "$NODE_VER" --silent || true
fi

echo "Active Node: $(node -v) | npm: $(npm -v)"
echo ""

# Start build server
cd "$WORK_DIR"
exec node script.js
