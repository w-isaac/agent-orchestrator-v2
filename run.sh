#!/bin/sh
cd /tmp/worktree-aov-2
npm install 2>&1
npx vitest run src/routes/projects.test.ts src/routes/context-nodes.test.ts src/routes/context-edges.test.ts src/routes/context-tasks.test.ts src/routes/seed-status.test.ts 2>&1
