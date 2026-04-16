/* Project Dashboard — v2 API integration */
(function () {
  'use strict';

  var dashboardRoot = document.getElementById('dashboard-root');
  var detailRoot = document.getElementById('detail-root');

  // --- Helpers ---
  function badgeClass(status) {
    var map = { active: 'badge-active', archived: 'badge-archived', paused: 'badge-paused' };
    return 'badge ' + (map[status] || 'badge-default');
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // --- Dashboard (list) view ---
  function showLoading() {
    var html = '<h1>Projects</h1><div class="card-grid">';
    for (var i = 0; i < 4; i++) {
      html += '<div class="card skeleton skeleton-card"></div>';
    }
    html += '</div>';
    dashboardRoot.innerHTML = html;
  }

  function showError(msg) {
    dashboardRoot.innerHTML =
      '<h1>Projects</h1>' +
      '<div class="error-banner"><span>' + escapeHtml(msg) + '</span>' +
      '<button id="retry-btn">Retry</button></div>';
    document.getElementById('retry-btn').addEventListener('click', loadProjects);
  }

  function showEmpty() {
    dashboardRoot.innerHTML =
      '<h1>Projects</h1>' +
      '<div class="empty-state"><p>No projects found.</p></div>';
  }

  function renderProjects(projects) {
    if (projects.length === 0) { showEmpty(); return; }
    var html = '<h1>Projects</h1><div class="card-grid">';
    projects.forEach(function (p) {
      html +=
        '<div class="card project-card" data-id="' + escapeHtml(p.id) + '">' +
        '<h2>' + escapeHtml(p.name) + '</h2>' +
        '<span class="' + badgeClass(p.status) + '">' + escapeHtml(p.status) + '</span>' +
        '<div class="task-counts">' +
        '<span>' + p.task_counts.open + ' open</span>' +
        '<span>' + p.task_counts.in_progress + ' in progress</span>' +
        '<span>' + p.task_counts.complete + ' complete</span>' +
        '</div></div>';
    });
    html += '</div>';
    dashboardRoot.innerHTML = html;

    // Attach click handlers
    var cards = dashboardRoot.querySelectorAll('.project-card');
    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        loadProjectDetail(card.getAttribute('data-id'));
      });
    });
  }

  function loadProjects() {
    showLoading();
    fetch('/api/v2/projects')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load projects.');
        return res.json();
      })
      .then(renderProjects)
      .catch(function (err) { showError(err.message); });
  }

  // --- Detail view ---
  function showDetailLoading() {
    dashboardRoot.style.display = 'none';
    detailRoot.style.display = '';
    detailRoot.innerHTML =
      '<div class="detail-container">' +
      '<a href="#" class="back-link" id="back-link">&larr; Back to Projects</a>' +
      '<div class="skeleton skeleton-detail"></div>' +
      '<div class="skeleton skeleton-detail"></div></div>';
    document.getElementById('back-link').addEventListener('click', function (e) {
      e.preventDefault();
      showDashboard();
    });
  }

  function showDetailError(msg) {
    dashboardRoot.style.display = 'none';
    detailRoot.style.display = '';
    detailRoot.innerHTML =
      '<div class="detail-container">' +
      '<a href="#" class="back-link" id="back-link">&larr; Back to Projects</a>' +
      '<div class="error-banner"><span>' + escapeHtml(msg) + '</span>' +
      '<button id="retry-detail-btn">Retry</button></div></div>';
    document.getElementById('back-link').addEventListener('click', function (e) {
      e.preventDefault();
      showDashboard();
    });
  }

  function renderDetail(project, taskData) {
    var html =
      '<div class="detail-container">' +
      '<a href="#" class="back-link" id="back-link">&larr; Back to Projects</a>' +
      '<h1>' + escapeHtml(project.name) + '</h1>' +
      '<div class="metadata-panel"><dl>' +
      '<dt>Status</dt><dd><span class="' + badgeClass(project.status) + '">' + escapeHtml(project.status) + '</span></dd>' +
      '<dt>Created</dt><dd>' + new Date(project.created_at).toLocaleDateString() + '</dd>' +
      (project.description ? '<dt>Description</dt><dd>' + escapeHtml(project.description) + '</dd>' : '') +
      '</dl></div>' +
      '<div class="task-summary-panel"><h2>Task Summary</h2><div class="stat-cards">';

    var stats = taskData.summary;
    var labels = ['pending', 'running', 'complete', 'failed'];
    labels.forEach(function (l) {
      html +=
        '<div class="stat-card"><div class="stat-value">' + (stats[l] || 0) + '</div>' +
        '<div class="stat-label">' + l + '</div></div>';
    });

    html += '</div></div></div>';
    detailRoot.innerHTML = html;

    document.getElementById('back-link').addEventListener('click', function (e) {
      e.preventDefault();
      showDashboard();
    });
  }

  function loadProjectDetail(id) {
    showDetailLoading();
    Promise.all([
      fetch('/api/v2/projects/' + encodeURIComponent(id)).then(function (r) {
        if (!r.ok) throw new Error('Failed to load project details.');
        return r.json();
      }),
      fetch('/api/v2/projects/' + encodeURIComponent(id) + '/tasks').then(function (r) {
        if (!r.ok) throw new Error('Failed to load project details.');
        return r.json();
      })
    ])
      .then(function (results) { renderDetail(results[0], results[1]); })
      .catch(function (err) { showDetailError(err.message); });
  }

  function showDashboard() {
    detailRoot.style.display = 'none';
    detailRoot.innerHTML = '';
    dashboardRoot.style.display = '';
    loadProjects();
  }

  // --- Init ---
  loadProjects();
})();
