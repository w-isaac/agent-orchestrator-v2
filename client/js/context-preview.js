/* Context Preview Panel — lazy-fetch artifact list for dispatch preview */

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

function buildArtifactHtml(artifacts) {
  if (artifacts.length === 0) {
    return '<div class="empty-state">No context artifacts found for this story.</div>';
  }
  var html = '';
  artifacts.forEach(function (a) {
    html +=
      '<div class="artifact-item">' +
      '  <div class="artifact-info">' +
      '    <div class="artifact-title">' + escapeHtml(a.title) + '</div>' +
      '    <span class="artifact-type">' + escapeHtml(a.type) + '</span>' +
      '  </div>' +
      '  <div class="artifact-metrics">' +
      '    <div class="artifact-tokens">' + formatNumber(a.token_count) + '</div>' +
      '    <div class="artifact-relevance">' + formatRelevance(a.relevance_score) + '</div>' +
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
  module.exports = { escapeHtml, formatNumber, formatRelevance, buildArtifactHtml, buildSummaryText };
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

    function renderArtifacts(data) {
      panelBody.innerHTML = buildArtifactHtml(data.artifacts);
      summaryText.textContent = buildSummaryText(data.summary);
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
  })();
}
