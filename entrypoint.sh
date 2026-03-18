#!/bin/sh
set -e

echo "[Startup] Applying database schema..."
# 'yes' pipes 'y' to answer any drizzle-kit confirmation prompts.
# '|| true' ensures we proceed even if schema is already up to date.
yes 2>/dev/null | ./node_modules/.bin/drizzle-kit push 2>&1 || true

echo "[Startup] Starting application..."
exec node dist/index.cjs
