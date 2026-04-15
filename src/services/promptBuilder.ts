/**
 * Prompt Construction Module
 * Tiered context injection with token budget enforcement.
 *
 * Budget waterfall (per architecture spec):
 *   Task:        10% of total
 *   Constraints:  7% of total
 *   Reserved:     6% of total
 *   Context:     remaining ~77%
 *   Each section gets a 5% safety margin applied.
 *
 * Tier assignment by relevance score:
 *   High   (>= 0.7): full content
 *   Medium (>= 0.4): summary
 *   Low    (< 0.4):  one-liner
 *
 * When high-relevance content exceeds the context budget,
 * artifacts are downgraded (full → summary → one-liner → skip) gracefully.
 */

import { countTokens } from './ingestion/tokenCounter';

// --- Types ---

export interface ContextArtifact {
  id: string;
  title: string;
  fullContent: string;
  summary: string;
  oneLiner: string;
  relevanceScore: number;
  tokenCountFull: number;
  tokenCountSummary: number;
  tokenCountOneliner: number;
}

export type Tier = 'full' | 'summary' | 'one-liner';

export interface TieredArtifact {
  id: string;
  title: string;
  tier: Tier;
  content: string;
  tokenCount: number;
  relevanceScore: number;
  originalTier: Tier;
  downgraded: boolean;
}

export interface BudgetAllocation {
  total: number;
  task: number;
  constraints: number;
  context: number;
  reserved: number;
  taskEffective: number;
  constraintsEffective: number;
  contextEffective: number;
}

export interface PromptSections {
  task: string;
  context: string;
  constraints: string;
}

export interface BuildResult {
  prompt: string;
  sections: PromptSections;
  artifacts: TieredArtifact[];
  budget: BudgetAllocation;
  tokensUsed: {
    task: number;
    context: number;
    constraints: number;
    total: number;
  };
  overBudget: boolean;
}

// --- Constants ---

const BUDGET_RATIOS = {
  task: 0.10,
  constraints: 0.07,
  reserved: 0.06,
} as const;

const SAFETY_MARGIN = 0.05;

const TIER_THRESHOLDS = {
  high: 0.7,
  medium: 0.4,
} as const;

// --- Budget calculation ---

export function computeBudget(totalTokens: number): BudgetAllocation {
  const task = Math.floor(totalTokens * BUDGET_RATIOS.task);
  const constraints = Math.floor(totalTokens * BUDGET_RATIOS.constraints);
  const reserved = Math.floor(totalTokens * BUDGET_RATIOS.reserved);
  const context = totalTokens - task - constraints - reserved;

  return {
    total: totalTokens,
    task,
    constraints,
    context,
    reserved,
    taskEffective: Math.floor(task * (1 - SAFETY_MARGIN)),
    constraintsEffective: Math.floor(constraints * (1 - SAFETY_MARGIN)),
    contextEffective: Math.floor(context * (1 - SAFETY_MARGIN)),
  };
}

// --- Tier assignment ---

export function assignTier(relevanceScore: number): Tier {
  if (relevanceScore >= TIER_THRESHOLDS.high) return 'full';
  if (relevanceScore >= TIER_THRESHOLDS.medium) return 'summary';
  return 'one-liner';
}

function getContentForTier(artifact: ContextArtifact, tier: Tier): { content: string; tokenCount: number } {
  switch (tier) {
    case 'full':
      return { content: artifact.fullContent, tokenCount: artifact.tokenCountFull };
    case 'summary':
      return { content: artifact.summary, tokenCount: artifact.tokenCountSummary };
    case 'one-liner':
      return { content: artifact.oneLiner, tokenCount: artifact.tokenCountOneliner };
  }
}

function downgradeTier(tier: Tier): Tier | null {
  if (tier === 'full') return 'summary';
  if (tier === 'summary') return 'one-liner';
  return null;
}

// --- Truncation ---

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  if (maxTokens <= 0) return '';
  const currentTokens = countTokens(text);
  if (currentTokens <= maxTokens) return text;

  // Truncate at sentence boundaries when possible
  const sentences = text.split(/(?<=[.!?])\s+/);
  let result = '';
  let tokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = countTokens(sentence);
    if (tokens + sentenceTokens > maxTokens) break;
    result += (result ? ' ' : '') + sentence;
    tokens += sentenceTokens;
  }

  // If no full sentence fits, do a word-level truncation
  if (!result) {
    const words = text.split(/\s+/);
    const parts: string[] = [];
    let wordTokens = 0;
    for (const word of words) {
      const wt = countTokens(word);
      if (wordTokens + wt > maxTokens) break;
      parts.push(word);
      wordTokens += wt;
    }
    result = parts.join(' ');
    if (result && result.length < text.length) {
      result += '...';
    }
  }

  return result || '';
}

// --- Core: tiered injection ---

export function injectArtifacts(
  artifacts: ContextArtifact[],
  contextBudget: number,
  tierOverrides?: Map<string, Tier>,
): TieredArtifact[] {
  // Sort by relevance descending
  const sorted = [...artifacts].sort((a, b) => b.relevanceScore - a.relevanceScore);

  const result: TieredArtifact[] = [];
  let remaining = contextBudget;

  for (const artifact of sorted) {
    const overrideTier = tierOverrides?.get(artifact.id);
    const assignedTier = overrideTier || assignTier(artifact.relevanceScore);
    let currentTier: Tier | null = assignedTier;

    while (currentTier) {
      const { content, tokenCount } = getContentForTier(artifact, currentTier);

      if (tokenCount <= remaining && tokenCount > 0) {
        result.push({
          id: artifact.id,
          title: artifact.title,
          tier: currentTier,
          content,
          tokenCount,
          relevanceScore: artifact.relevanceScore,
          originalTier: assignedTier,
          downgraded: currentTier !== assignedTier,
        });
        remaining -= tokenCount;
        break;
      }

      // Try to truncate at current tier if it's the last option
      const nextTier = downgradeTier(currentTier);
      if (!nextTier && tokenCount > 0 && remaining > 0) {
        const truncated = truncateToTokenBudget(content, remaining);
        const truncatedTokens = countTokens(truncated);
        if (truncatedTokens > 0 && truncatedTokens <= remaining) {
          result.push({
            id: artifact.id,
            title: artifact.title,
            tier: currentTier,
            content: truncated,
            tokenCount: truncatedTokens,
            relevanceScore: artifact.relevanceScore,
            originalTier: assignedTier,
            downgraded: currentTier !== assignedTier,
          });
          remaining -= truncatedTokens;
        }
        break;
      }

      currentTier = nextTier;
    }
  }

  return result;
}

// --- Prompt assembly ---

export function buildPrompt(
  taskText: string,
  constraintsText: string,
  artifacts: ContextArtifact[],
  totalTokenBudget: number,
  tierOverrides?: Map<string, Tier>,
): BuildResult {
  const budget = computeBudget(totalTokenBudget);

  // Truncate task and constraints to their effective budgets
  const taskContent = truncateToTokenBudget(taskText, budget.taskEffective);
  const constraintsContent = truncateToTokenBudget(constraintsText, budget.constraintsEffective);

  const taskTokens = countTokens(taskContent);
  const constraintsTokens = countTokens(constraintsContent);

  // Inject artifacts within context budget
  const tieredArtifacts = injectArtifacts(artifacts, budget.contextEffective, tierOverrides);
  const contextTokens = tieredArtifacts.reduce((sum, a) => sum + a.tokenCount, 0);

  // Build context section
  const contextLines = tieredArtifacts.map((a) => {
    const tierLabel = `[${a.tier.toUpperCase()}]`;
    return `${tierLabel} ${a.title}\n${a.content}`;
  });
  const contextSection = contextLines.join('\n\n');

  const sections: PromptSections = {
    task: taskContent,
    context: contextSection,
    constraints: constraintsContent,
  };

  const prompt = [
    '## Task',
    taskContent,
    '',
    '## Context',
    contextSection,
    '',
    '## Constraints',
    constraintsContent,
  ].join('\n');

  const totalUsed = taskTokens + contextTokens + constraintsTokens;

  return {
    prompt,
    sections,
    artifacts: tieredArtifacts,
    budget,
    tokensUsed: {
      task: taskTokens,
      context: contextTokens,
      constraints: constraintsTokens,
      total: totalUsed,
    },
    overBudget: totalUsed > totalTokenBudget,
  };
}
