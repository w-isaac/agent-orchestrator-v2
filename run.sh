#!/bin/sh
cd /tmp/worktree-aov-5
npm install 2>&1
npx vitest run src/services/graphTraversal.test.ts src/services/embeddingReranker.test.ts src/services/budgetPacker.test.ts src/services/contextRetrievalPipeline.test.ts 2>&1
git add src/services/graphTraversal.ts src/services/embeddingReranker.ts src/services/budgetPacker.ts src/services/contextRetrievalPipeline.ts src/routes/context-retrieval.ts src/services/graphTraversal.test.ts src/services/embeddingReranker.test.ts src/services/budgetPacker.test.ts src/services/contextRetrievalPipeline.test.ts src/app.ts src/routes/index.ts 2>&1
git commit -m "feat(AOV-5): Implement three-phase context retrieval: graph traversal, embedding re-ranking, and budget packing

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>" 2>&1
git log --oneline -3 2>&1
git status 2>&1
