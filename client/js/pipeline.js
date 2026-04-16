/* Pipeline View — stage columns with story cards and detail panel */
if (typeof document !== 'undefined') {
(function () {
  'use strict';

  var boardEl = document.getElementById('pipeline-board');
  var titleEl = document.getElementById('pipeline-title');
  var detailPanel = document.getElementById('detail-panel');
  var detailInner = document.getElementById('detail-panel-inner');
  var scrimEl = null;

  // Extract project ID from URL: /pipeline.html?project=<id>
  function getProjectId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('project');
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function statusBadgeClass(status) {
    var known = ['draft', 'ready', 'in_progress', 'in_review', 'done', 'blocked'];
    return 'status-badge status-badge-' + (known.indexOf(status) >= 0 ? status : 'default');
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // --- Loading skeleton ---
  function showLoading() {
    var html = '';
    for (var i = 0; i < 4; i++) {
      html +=
        '<div class="skeleton-column">' +
        '<div class="skeleton-header"></div>' +
        '<div class="skeleton-card"></div>' +
        '<div class="skeleton-card"></div>' +
        '</div>';
    }
    boardEl.innerHTML = html;
  }

  // --- Error state ---
  function showError(msg) {
    boardEl.innerHTML =
      '<div class="pipeline-error">' +
      '<span>' + escapeHtml(msg) + '</span>' +
      '<button id="pipeline-retry-btn">Retry</button>' +
      '</div>';
    document.getElementById('pipeline-retry-btn').addEventListener('click', loadPipeline);
  }

  // --- Render stages ---
  function renderBoard(pipeline, agents) {
    if (!pipeline || pipeline.length === 0) {
      boardEl.innerHTML = '<div class="pipeline-error"><span>No pipeline stages found.</span></div>';
      return;
    }

    // Build agent role lookup from agents array within each stage
    var agentLookup = {};
    if (agents && agents.length) {
      agents.forEach(function (a) {
        agentLookup[a.role] = a;
      });
    }

    var html = '';
    pipeline.forEach(function (stage) {
      var stories = stage.stories || [];
      var stageIcon = stage.icon ? escapeHtml(stage.icon) + ' ' : '';

      html +=
        '<div class="stage-column">' +
        '<div class="stage-header">' +
        '<span class="stage-name">' + stageIcon + escapeHtml(stage.name) + '</span>' +
        '<span class="stage-count">' + stories.length + '</span>' +
        '</div>' +
        '<div class="stage-body">';

      if (stories.length === 0) {
        html += '<div class="stage-empty">No stories in this stage</div>';
      } else {
        stories.forEach(function (story) {
          // Determine assignee from stage agents data
          var assignee = '';
          if (stage.agents && stage.agents.length > 0) {
            var agentInfo = stage.agents[0];
            if (agentInfo && agentInfo.role) {
              var agent = agentLookup[agentInfo.role];
              assignee = agent ? (agent.icon || '') + ' ' + (agent.name || agentInfo.role) : agentInfo.role;
            }
          }

          html +=
            '<div class="story-card" data-story-id="' + escapeHtml(story.id) + '">' +
            '<div class="story-card-title">' + escapeHtml(story.title) + '</div>' +
            '<div class="story-card-meta">' +
            '<span class="' + statusBadgeClass(story.status) + '">' + escapeHtml(story.status ? story.status.replace(/_/g, ' ') : '') + '</span>' +
            (assignee ? '<span class="story-card-assignee">' + escapeHtml(assignee) + '</span>' : '') +
            '</div>' +
            '</div>';
        });
      }

      html += '</div></div>';
    });

    boardEl.innerHTML = html;

    // Bind card click handlers
    var cards = boardEl.querySelectorAll('.story-card');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        openDetail(card.getAttribute('data-story-id'));
      });
    });
  }

  // --- Load pipeline data ---
  function loadPipeline() {
    var projectId = getProjectId();
    if (!projectId) {
      showError('No project ID specified. Add ?project=<id> to the URL.');
      return;
    }

    showLoading();

    fetch('/api/projects/' + encodeURIComponent(projectId) + '/pipeline')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load pipeline data.');
        return res.json();
      })
      .then(function (data) {
        if (data.project && data.project.name) {
          titleEl.textContent = 'Pipeline: ' + data.project.name;
        }
        renderBoard(data.pipeline || [], []);
      })
      .catch(function (err) {
        showError(err.message);
      });
  }

  // --- Detail panel ---
  function openDetail(storyId) {
    detailPanel.style.display = '';
    detailInner.innerHTML = '<div class="detail-skeleton"></div><div class="detail-skeleton"></div>';

    // Add scrim
    if (!scrimEl) {
      scrimEl = document.createElement('div');
      scrimEl.className = 'pipeline-scrim';
      scrimEl.addEventListener('click', closeDetail);
      document.body.appendChild(scrimEl);
    }
    scrimEl.style.display = '';

    fetch('/api/stories/' + encodeURIComponent(storyId))
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load story details.');
        return res.json();
      })
      .then(function (story) {
        renderDetail(story);
      })
      .catch(function (err) {
        detailInner.innerHTML =
          '<div class="detail-header"><span></span><button class="detail-close" id="detail-close-btn">&times;</button></div>' +
          '<div class="detail-error">' + escapeHtml(err.message) + '</div>';
        document.getElementById('detail-close-btn').addEventListener('click', closeDetail);
      });
  }

  function renderDetail(story) {
    var html =
      '<div class="detail-header">' +
      '<span class="detail-title">' + escapeHtml(story.title) + '</span>' +
      '<button class="detail-close" id="detail-close-btn">&times;</button>' +
      '</div>';

    html += '<div class="detail-section"><dl class="detail-meta">';

    if (story.display_id != null) {
      html += '<dt>ID</dt><dd>#' + escapeHtml(String(story.display_id)) + '</dd>';
    }
    html += '<dt>Status</dt><dd><span class="' + statusBadgeClass(story.status) + '">' + escapeHtml(story.status ? story.status.replace(/_/g, ' ') : '') + '</span></dd>';

    if (story.stage_name) {
      html += '<dt>Stage</dt><dd>' + escapeHtml(story.stage_name) + '</dd>';
    }
    if (story.priority) {
      html += '<dt>Priority</dt><dd>' + escapeHtml(story.priority) + '</dd>';
    }
    if (story.epic) {
      html += '<dt>Epic</dt><dd>' + escapeHtml(story.epic) + '</dd>';
    }
    if (story.created_at) {
      html += '<dt>Created</dt><dd>' + formatDate(story.created_at) + '</dd>';
    }
    if (story.updated_at) {
      html += '<dt>Updated</dt><dd>' + formatDate(story.updated_at) + '</dd>';
    }

    html += '</dl></div>';

    if (story.description) {
      html += '<div class="detail-section"><h3>Description</h3><p>' + escapeHtml(story.description) + '</p></div>';
    }

    if (story.acceptance_criteria) {
      html += '<div class="detail-section"><h3>Acceptance Criteria</h3><pre>' + escapeHtml(story.acceptance_criteria) + '</pre></div>';
    }

    detailInner.innerHTML = html;
    document.getElementById('detail-close-btn').addEventListener('click', closeDetail);
  }

  function closeDetail() {
    detailPanel.style.display = 'none';
    detailInner.innerHTML = '';
    if (scrimEl) {
      scrimEl.style.display = 'none';
    }
  }

  // --- Back link: update href with project context ---
  var backLink = document.getElementById('back-link');
  if (backLink) {
    backLink.addEventListener('click', function (e) {
      e.preventDefault();
      window.location.href = '/dashboard.html';
    });
  }

  // --- Init ---
  loadPipeline();
})();
} // end typeof document !== 'undefined'

// Export for testing (Node/CommonJS environment detection)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // Re-export pure functions for unit testing
    statusBadgeClass: function (status) {
      var known = ['draft', 'ready', 'in_progress', 'in_review', 'done', 'blocked'];
      return 'status-badge status-badge-' + (known.indexOf(status) >= 0 ? status : 'default');
    },
    formatDate: function (dateStr) {
      if (!dateStr) return '';
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    },
    escapeHtml: function (str) {
      if (!str) return '';
      // Node-compatible version (no DOM)
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
  };
}
