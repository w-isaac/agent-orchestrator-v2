/* Context Preview Panel — budget controls, artifact toggling, greedy knapsack auto-packing */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNumber(n) {
  return n.toLocaleString();
}

function formatRelevance(score) {
  if (score == null) return '\u2014';
  return score.toFixed(2);
}

/**
 * Greedy knapsack: sort artifacts by relevance_score/token_count ratio descending,
 * greedily include until budget exhausted. Artifacts with token_count=0 are skipped.
 * Returns Set of artifact IDs that fit within the budget.
 */
function greedyKnapsack(artifacts, budget) {
  if (budget <= 0) return new Set();
  // Compute ratio = relevance_score / token_count; skip zero-token artifacts
  var sorted = artifacts
    .map(function (a, i) {
      var tokens = a.token_count || 0;
      var score = a.relevance_score || 0;
      var ratio = tokens > 0 ? score / tokens : 0;
      return { artifact: a, index: i, ratio: ratio, tokens: tokens };
    })
    .filter(function (x) { return x.tokens > 0; })
    .sort(function (x, y) {
      var diff = y.ratio - x.ratio;
      return diff !== 0 ? diff : x.index - y.index;
    });
  var selected = new Set();
  var remaining = budget;
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].tokens <= remaining) {
      selected.add(sorted[i].artifact.id);
      remaining -= sorted[i].tokens;
    }
  }
  return selected;
}

function buildArtifactHtml(artifacts, toggleState) {
  if (artifacts.length === 0) {
    return '<div class="empty-state">No context artifacts found for this story.</div>';
  }
  var html = '';
  artifacts.forEach(function (a) {
    var isOn = toggleState ? toggleState[a.id] !== false : true;
    var disabledClass = isOn ? '' : ' disabled';
    var checkedAttr = isOn ? ' checked' : '';
    html +=
      '<div class="artifact-item' + disabledClass + '" data-artifact-id="' + escapeHtml(a.id) + '">' +
      '  <div class="artifact-info">' +
      '    <div class="artifact-title">' + escapeHtml(a.title) + '</div>' +
      '    <span class="artifact-type">' + escapeHtml(a.type) + '</span>' +
      '  </div>' +
      '  <div class="artifact-metrics">' +
      '    <div class="artifact-tokens">' + formatNumber(a.token_count) + '</div>' +
      '    <div class="artifact-relevance">' + formatRelevance(a.relevance_score) + '</div>' +
      '  </div>' +
      '  <div class="artifact-toggle">' +
      '    <input type="checkbox" data-id="' + escapeHtml(a.id) + '"' + checkedAttr +
      '     aria-label="Include ' + escapeHtml(a.title) + '">' +
      '  </div>' +
      '</div>';
  });
  return html;
}

function buildSummaryText(summary) {
  if (summary.artifact_count === 0) {
    return 'Total: 0 artifacts \u00b7 0 tokens';
  }
  return (
    'Total: ' + summary.artifact_count + ' artifacts \u00b7 ' +
    formatNumber(summary.total_tokens) + ' tokens'
  );
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHtml, formatNumber, formatRelevance, greedyKnapsack, buildArtifactHtml, buildSummaryText };
} else {
  (function () {
    'use strict';

    var storyInput = document.getElementById('story-select');
    var previewBtn = document.getElementById('preview-context-btn');
    var panelBackdrop = document.getElementById('panel-backdrop');
    var panelClose = document.getElementById('panel-close');
    var panelBody = document.getElementById('panel-body');
    var summaryText = document.getElementById('summary-text');
    var errorBanner = document.getElementById('error-banner');
    var errorMsg = document.getElementById('error-msg');
    var retryBtn = document.getElementById('retry-btn');

    // Budget controls
    var autoPackBtn = document.getElementById('auto-pack-btn');
    var budgetInput = document.getElementById('budget-input');
    var budgetInputError = document.getElementById('budget-input-error');
    var autoPackIndicator = document.getElementById('auto-pack-indicator');
    var budgetBarContainer = document.getElementById('budget-bar-container');
    var budgetBarFill = document.getElementById('budget-bar-fill');
    var budgetUsedLabel = document.getElementById('budget-used-label');
    var budgetLimitLabel = document.getElementById('budget-limit-label');
    var budgetWarning = document.getElementById('budget-warning');
    var budgetWarningText = document.getElementById('budget-warning-text');
    var dispatchBtn = document.getElementById('dispatch-context-btn');

    var currentArtifacts = [];
    var toggleState = {}; // { artifactId: true/false }
    var debounceTimer = null;

    function showError(msg) {
      errorMsg.textContent = msg;
      errorBanner.style.display = '';
    }

    function hideError() {
      errorBanner.style.display = 'none';
    }

    function showSkeleton() {
      var html = '';
      for (var i = 0; i < 4; i++) {
        html +=
          '<div class="skeleton-item">' +
          '  <div>' +
          '    <div class="skeleton-bar skeleton-title"></div>' +
          '    <div class="skeleton-bar skeleton-badge"></div>' +
          '  </div>' +
          '  <div>' +
          '    <div class="skeleton-bar skeleton-metric"></div>' +
          '  </div>' +
          '</div>';
      }
      panelBody.innerHTML = html;
      summaryText.textContent = 'Loading...';
    }

    function getSelectedTokens() {
      var total = 0;
      currentArtifacts.forEach(function (a) {
        if (toggleState[a.id] !== false) {
          total += (a.token_count || 0);
        }
      });
      return total;
    }

    function getSelectedCount() {
      var count = 0;
      currentArtifacts.forEach(function (a) {
        if (toggleState[a.id] !== false) count++;
      });
      return count;
    }

    function updateBudgetBar() {
      var budgetVal = parseBudget();
      if (budgetVal === null) {
        budgetBarContainer.style.display = 'none';
        return;
      }
      budgetBarContainer.style.display = '';
      var used = getSelectedTokens();
      var pct = budgetVal > 0 ? Math.min((used / budgetVal) * 100, 100) : 0;
      budgetBarFill.style.width = pct + '%';
      budgetBarFill.setAttribute('aria-valuenow', String(used));
      budgetBarFill.setAttribute('aria-valuemax', String(budgetVal));
      budgetBarFill.setAttribute('aria-label', 'Budget usage: ' + Math.round(pct) + '%');
      budgetUsedLabel.textContent = formatNumber(used) + ' / ' + formatNumber(budgetVal) + ' tokens';
      budgetLimitLabel.textContent = '';

      if (used > budgetVal) {
        budgetBarFill.classList.add('over-budget');
        budgetWarning.style.display = '';
        budgetWarningText.textContent = 'Over budget \u2014 deselect artifacts to reduce context size';
      } else {
        budgetBarFill.classList.remove('over-budget');
        budgetWarning.style.display = 'none';
      }
    }

    function updateSummary() {
      var selected = getSelectedCount();
      var tokens = getSelectedTokens();
      summaryText.textContent =
        'Selected: ' + selected + ' artifacts \u00b7 ' + formatNumber(tokens) + ' tokens';
    }

    function parseBudget() {
      var raw = budgetInput.value.trim();
      if (raw === '') return null;
      var val = parseInt(raw, 10);
      if (isNaN(val) || val <= 0) return -1; // invalid
      return val;
    }

    function runAutoPack() {
      var budget = parseBudget();
      if (budget === null) {
        // No budget set — show all as selected
        budgetInput.classList.remove('invalid');
        budgetInputError.style.display = 'none';
        autoPackIndicator.style.display = 'none';
        currentArtifacts.forEach(function (a) { toggleState[a.id] = true; });
        rerenderList();
        updateBudgetBar();
        updateSummary();
        return;
      }
      if (budget === -1) {
        // Invalid
        budgetInput.classList.add('invalid');
        budgetInputError.style.display = '';
        autoPackIndicator.style.display = 'none';
        return;
      }
      budgetInput.classList.remove('invalid');
      budgetInputError.style.display = 'none';

      var selected = greedyKnapsack(currentArtifacts, budget);
      currentArtifacts.forEach(function (a) {
        toggleState[a.id] = selected.has(a.id);
      });
      autoPackIndicator.style.display = '';
      rerenderList();
      updateBudgetBar();
      updateSummary();
    }

    function rerenderList() {
      panelBody.innerHTML = buildArtifactHtml(currentArtifacts, toggleState);
      attachToggleListeners();
    }

    function attachToggleListeners() {
      var checkboxes = panelBody.querySelectorAll('input[type="checkbox"][data-id]');
      checkboxes.forEach(function (cb) {
        cb.addEventListener('change', function () {
          var id = cb.getAttribute('data-id');
          toggleState[id] = cb.checked;
          // Update visual state
          var row = cb.closest('.artifact-item');
          if (row) {
            if (cb.checked) {
              row.classList.remove('disabled');
            } else {
              row.classList.add('disabled');
            }
          }
          // Hide auto-pack indicator since user manually toggled
          autoPackIndicator.style.display = 'none';
          updateBudgetBar();
          updateSummary();
        });
      });
    }

    function updateAutoPackBtn() {
      var budget = parseBudget();
      var hasArtifacts = currentArtifacts.length > 0;
      autoPackBtn.disabled = !hasArtifacts || budget === null || budget === -1;
    }

    function handleAutoPackClick() {
      var budget = parseBudget();
      if (budget === null || budget === -1 || currentArtifacts.length === 0) return;

      var storyId = storyInput.value.trim();
      if (!storyId) return;

      // Set packing state
      autoPackBtn.disabled = true;
      autoPackBtn.textContent = 'Packing\u2026';
      autoPackBtn.classList.add('packing');

      fetch('/api/stories/' + encodeURIComponent(storyId) + '/artifacts/auto-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget: budget }),
      })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Auto-pack failed'); });
          return res.json();
        })
        .then(function (data) {
          var selectedSet = new Set(data.selected_artifact_ids);
          currentArtifacts.forEach(function (a) {
            toggleState[a.id] = selectedSet.has(a.id);
          });
          autoPackIndicator.style.display = '';
          rerenderList();
          updateBudgetBar();
          updateSummary();
        })
        .catch(function (err) {
          showError(err.message);
          // Fallback to client-side knapsack
          runAutoPack();
        })
        .finally(function () {
          autoPackBtn.textContent = 'Auto-Pack';
          autoPackBtn.classList.remove('packing');
          updateAutoPackBtn();
        });
    }

    function renderArtifacts(data) {
      currentArtifacts = data.artifacts;
      // Initialize all as selected
      toggleState = {};
      currentArtifacts.forEach(function (a) { toggleState[a.id] = true; });

      updateAutoPackBtn();

      // If budget is set, run auto-pack
      var budget = parseBudget();
      if (budget !== null && budget > 0) {
        runAutoPack();
      } else {
        rerenderList();
        updateBudgetBar();
        updateSummary();
      }
    }

    function openPanel() {
      var storyId = storyInput.value.trim();
      if (!storyId) return;

      panelBackdrop.style.display = '';
      showSkeleton();
      hideError();

      fetch('/api/stories/' + encodeURIComponent(storyId) + '/context-preview')
        .then(function (res) {
          if (!res.ok) throw new Error('Failed to load context preview.');
          return res.json();
        })
        .then(function (data) {
          renderArtifacts(data);
        })
        .catch(function (err) {
          panelBody.innerHTML = '<div class="empty-state">Error loading artifacts.</div>';
          summaryText.textContent = 'Error';
          showError(err.message);
        });
    }

    function closePanel() {
      panelBackdrop.style.display = 'none';
    }

    function dispatchSelected() {
      var storyId = storyInput.value.trim();
      if (!storyId) return;

      var selectedIds = [];
      currentArtifacts.forEach(function (a) {
        if (toggleState[a.id] !== false) {
          selectedIds.push(a.id);
        }
      });

      if (selectedIds.length === 0) {
        showError('No artifacts selected for dispatch.');
        return;
      }

      var body = { artifact_ids: selectedIds };
      var budget = parseBudget();
      if (budget !== null && budget > 0) {
        body.token_budget = budget;
      }

      dispatchBtn.disabled = true;
      dispatchBtn.textContent = 'Dispatching...';

      fetch('/api/stories/' + encodeURIComponent(storyId) + '/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then(function (res) {
          if (!res.ok) return res.json().then(function (d) { throw new Error(d.error || 'Dispatch failed'); });
          return res.json();
        })
        .then(function (data) {
          summaryText.textContent =
            'Dispatched ' + data.artifact_count + ' artifacts \u00b7 ' +
            formatNumber(data.total_tokens) + ' tokens';
          dispatchBtn.textContent = 'Dispatched!';
          setTimeout(function () {
            dispatchBtn.disabled = false;
            dispatchBtn.textContent = 'Dispatch';
          }, 2000);
        })
        .catch(function (err) {
          showError(err.message);
          dispatchBtn.disabled = false;
          dispatchBtn.textContent = 'Dispatch';
        });
    }

    storyInput.addEventListener('input', function () {
      var hasValue = storyInput.value.trim().length > 0;
      previewBtn.disabled = !hasValue;
      previewBtn.title = hasValue ? 'Preview context artifacts' : 'No context artifacts retrieved';
    });

    previewBtn.addEventListener('click', openPanel);
    panelClose.addEventListener('click', closePanel);
    panelBackdrop.addEventListener('click', function (e) {
      if (e.target === panelBackdrop) closePanel();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panelBackdrop.style.display !== 'none') {
        closePanel();
      }
    });

    retryBtn.addEventListener('click', function () {
      hideError();
      openPanel();
    });

    // Budget input with 300ms debounce
    budgetInput.addEventListener('input', function () {
      updateAutoPackBtn();
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        runAutoPack();
      }, 300);
    });

    autoPackBtn.addEventListener('click', handleAutoPackClick);
    dispatchBtn.addEventListener('click', dispatchSelected);
  })();
}
