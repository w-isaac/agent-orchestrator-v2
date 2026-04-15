#!/bin/sh
cd /tmp/worktree-aov-12
npm install 2>&1
npx vitest run src/adapters/gemini-runner.test.ts src/adapters/gemini-adapter.test.ts src/services/tokenCounter.test.ts src/services/adapterRouter.test.ts src/routes/adapters.test.ts 2>&1
