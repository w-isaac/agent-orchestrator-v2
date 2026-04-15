#!/bin/sh
cd /tmp/worktree-aov-8
npm install 2>&1
npx vitest run src/services/promptBuilder.test.ts src/routes/prompt-builder.test.ts 2>&1
