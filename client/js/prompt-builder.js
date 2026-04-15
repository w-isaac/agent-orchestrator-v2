/**
 * Prompt Builder UI
 * Two-column layout: artifact panel (left) + prompt preview (right)
 * Token budget meter with color-coded progress bar
 */

/* global $, $$, truncate, debounce */

(function () {
  'use strict';

  const DEFAULT_BUDGET = 8192;
  let currentStoryId = null;
  let artifacts = [];
  let budgetData = null;
  let previewData = null;

  // --- API helpers ---

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  async function loadArtifacts(storyId) {
    const { data } = await fetchJSON(`/api/prompt-builder/${storyId}/artifacts`);
    return data;
  }

  async function loadBudget(storyId, tokenBudget) {
    const { data } = await fetchJSON(`/api/prompt-builder/${storyId}/budget?token_budget=${tokenBudget}`);
    return data;
  }

  async function previewPrompt(storyId, taskText, constraintsText, tokenBudget) {
    const { data } = await fetchJSON(`/api/prompt-builder/${storyId}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_text: taskText, constraints_text: constraintsText, token_budget: tokenBudget }),
    });
    return data;
  }

  async function buildAndPersist(storyId, taskText, constraintsText, tokenBudget) {
    const { data } = await fetchJSON(`/api/prompt-builder/${storyId}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_text: taskText, constraints_text: constraintsText, token_budget: tokenBudget }),
    });
    return data;
  }

  async function overrideTier(artifactId, tier) {
    const { data } = await fetchJSON(`/api/prompt-builder/artifacts/${artifactId}/override`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });
    return data;
  }

  // --- Rendering ---

  function tierBadgeClass(tier) {
    if (tier === 'full') return 'badge-full';
    if (tier === 'summary') return 'badge-summary';
    return 'badge-oneliner';
  }

  function budgetColor(ratio) {
    if (ratio < 0.7) return 'var(--color-success, #22c55e)';
    if (ratio < 0.9) return 'var(--color-warning, #eab308)';
    return 'var(--color-error, #ef4444)';
  }

  function renderBudgetMeter(container, used, total) {
    const ratio = total > 0 ? used / total : 0;
    const pct = Math.min(ratio * 100, 100).toFixed(1);
    const color = budgetColor(ratio);
    const overBudget = used > total;

    container.innerHTML = `
      <div class="budget-header">
        <span class="budget-label">Token Budget</span>
        <span class="budget-count">${used.toLocaleString()} / ${total.toLocaleString()} tokens</span>
        ${overBudget ? '<span class="budget-over">+' + (used - total).toLocaleString() + ' over budget</span>' : ''}
      </div>
      <div class="budget-bar-track">
        <div class="budget-bar-fill" style="width: ${pct}%; background: ${color}"></div>
      </div>
    `;
  }

  function renderBudgetBreakdown(container, budget) {
    if (!budget) return;
    container.innerHTML = `
      <div class="budget-breakdown">
        <span class="budget-segment">[Task: ${budget.task}]</span>
        <span class="budget-segment">[Context: ${budget.context}]</span>
        <span class="budget-segment">[Constraints: ${budget.constraints}]</span>
        <span class="budget-segment">[Reserved: ${budget.reserved}]</span>
      </div>
    `;
  }

  function renderArtifactList(container, arts) {
    if (!arts || arts.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No context artifacts loaded.</p></div>';
      return;
    }

    container.innerHTML = arts.map(function (a) {
      return `
        <div class="artifact-card" data-id="${a.id}">
          <div class="artifact-header">
            <span class="artifact-title">${a.title}</span>
            <span class="badge ${tierBadgeClass(a.assignedTier)}">${a.assignedTier.toUpperCase()}</span>
          </div>
          <div class="artifact-meta">
            Score: ${a.relevanceScore.toFixed(2)} | Tokens: ${a.tokenCountFull}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderPromptPreview(container, data) {
    if (!data) {
      container.innerHTML = `
        <div class="prompt-section"><h3>## Task</h3><p class="placeholder">Task content will appear here...</p></div>
        <div class="prompt-section"><h3>## Context</h3><p class="placeholder">Context artifacts will appear here...</p></div>
        <div class="prompt-section"><h3>## Constraints</h3><p class="placeholder">Constraints will appear here...</p></div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="prompt-section"><h3>## Task</h3><pre>${escapeHtml(data.sections.task)}</pre></div>
      <div class="prompt-section"><h3>## Context</h3><pre>${escapeHtml(data.sections.context)}</pre></div>
      <div class="prompt-section"><h3>## Constraints</h3><pre>${escapeHtml(data.sections.constraints)}</pre></div>
    `;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }

  // --- Init ---

  function initPromptBuilder(storyId) {
    currentStoryId = storyId;
    var root = document.getElementById('prompt-builder');
    if (!root) return;

    root.innerHTML = `
      <h1>Prompt Builder</h1>
      <div id="pb-budget-meter"></div>
      <div id="pb-budget-breakdown"></div>
      <div class="pb-columns">
        <div class="pb-left" id="pb-artifacts"><div class="empty-state"><p>Loading artifacts...</p></div></div>
        <div class="pb-right">
          <div class="pb-inputs">
            <label>Task:<textarea id="pb-task" rows="3" placeholder="Enter task description..."></textarea></label>
            <label>Constraints:<textarea id="pb-constraints" rows="2" placeholder="Enter constraints..."></textarea></label>
            <label>Token Budget:<input id="pb-budget-input" type="number" value="${DEFAULT_BUDGET}" min="100" max="128000"></label>
          </div>
          <div id="pb-preview"></div>
          <button id="pb-build-btn" class="btn btn-primary">Build Prompt</button>
        </div>
      </div>
      <div id="pb-error" class="error-banner" style="display:none"></div>
    `;

    var taskEl = document.getElementById('pb-task');
    var constraintsEl = document.getElementById('pb-constraints');
    var budgetInputEl = document.getElementById('pb-budget-input');
    var buildBtn = document.getElementById('pb-build-btn');

    var refreshPreview = debounce(async function () {
      try {
        var tokenBudget = parseInt(budgetInputEl.value, 10) || DEFAULT_BUDGET;
        previewData = await previewPrompt(storyId, taskEl.value, constraintsEl.value, tokenBudget);
        budgetData = previewData.budget;

        renderBudgetMeter(document.getElementById('pb-budget-meter'), previewData.tokensUsed.total, tokenBudget);
        renderBudgetBreakdown(document.getElementById('pb-budget-breakdown'), budgetData);
        renderPromptPreview(document.getElementById('pb-preview'), previewData);

        buildBtn.disabled = previewData.overBudget;
        buildBtn.title = previewData.overBudget ? 'Token budget exceeded.' : '';
      } catch (err) {
        showError(err.message);
      }
    }, 300);

    taskEl.addEventListener('input', refreshPreview);
    constraintsEl.addEventListener('input', refreshPreview);
    budgetInputEl.addEventListener('input', refreshPreview);

    buildBtn.addEventListener('click', async function () {
      try {
        var tokenBudget = parseInt(budgetInputEl.value, 10) || DEFAULT_BUDGET;
        var result = await buildAndPersist(storyId, taskEl.value, constraintsEl.value, tokenBudget);
        buildBtn.textContent = 'Built!';
        setTimeout(function () { buildBtn.textContent = 'Build Prompt'; }, 2000);
      } catch (err) {
        showError(err.message);
      }
    });

    // Initial load
    loadArtifacts(storyId).then(function (arts) {
      artifacts = arts;
      renderArtifactList(document.getElementById('pb-artifacts'), arts);
      refreshPreview();
    }).catch(function (err) {
      showError('Failed to load artifacts. ' + err.message);
    });
  }

  function showError(msg) {
    var el = document.getElementById('pb-error');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(function () { el.style.display = 'none'; }, 5000);
    }
  }

  // Expose for use
  if (typeof window !== 'undefined') {
    window.initPromptBuilder = initPromptBuilder;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initPromptBuilder: initPromptBuilder };
  }
})();
