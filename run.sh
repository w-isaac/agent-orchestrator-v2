#!/bin/sh
cd /tmp/worktree-aov-11
npm install 2>&1
npx vitest run src/adapters/codex-runner.test.ts src/adapters/codex-adapter.test.ts src/config/codex-config.test.ts 2>&1
