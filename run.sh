#!/bin/sh
cd /tmp/worktree-aov-23
npm install 2>&1
npx vitest run src/routes/static-serve.test.ts client/__tests__/utils.test.js 2>&1
git add client/index.html client/css/base.css client/css/components.css client/js/utils.js client/assets/.gitkeep client/__tests__/utils.test.js src/app.ts src/routes/static-serve.test.ts package.json vitest.config.ts 2>&1
git commit -m "feat(AOV-23): Frontend scaffold: extract v1 static assets and serve via Docker

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>" 2>&1
git log --oneline -3 2>&1
git status 2>&1
