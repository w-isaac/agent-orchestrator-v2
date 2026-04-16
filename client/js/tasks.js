/* Task Board — v2 API integration with drag-and-drop */
(function () {
  'use strict';

  var STATUSES = ['queued', 'in_progress', 'complete'];
  var POLL_INTERVAL = 10000;
  var currentProjectId = null;
  var pollTimer = null;

  // DOM refs
  var projectSelect = document.getElementById('project-select');
  var newTaskBtn = document.getElementById('new-task-btn');
  var errorBanner = document.getElementById('error-banner');
  var errorMsg = document.getElementById('error-msg');
  var retryBtn = document.getElementById('retry-btn');
  var modalOverlay = document.getElementById('modal-overlay');
  var modalCancel = document.getElementById('modal-cancel');
  var createForm = document.getElementById('create-task-form');
  var modalSubmit = document.getElementById('modal-submit');

  // --- Helpers ---
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorBanner.style.display = '';
  }

  function hideError() {
    errorBanner.style.display = 'none';
  }

  function getList(status) {
    return document.getElementById('list-' + status);
  }

  function getCount(status) {
    return document.getElementById('count-' + status);
  }

  // --- Skeleton loading ---
  function showSkeletons() {
    STATUSES.forEach(function (s) {
      var list = getList(s);
      var html = '';
      for (var i = 0; i < 3; i++) {
        html += '<div class="skeleton-card"></div>';
      }
      list.innerHTML = html;
      getCount(s).textContent = '...';
    });
  }

  // --- Rendering ---
  function renderTasks(tasks) {
    var grouped = { queued: [], in_progress: [], complete: [] };
    tasks.forEach(function (t) {
      if (grouped[t.status]) {
        grouped[t.status].push(t);
      }
    });

    STATUSES.forEach(function (s) {
      var list = getList(s);
      getCount(s).textContent = grouped[s].length;

      if (grouped[s].length === 0) {
        list.innerHTML = '<div class="card-list-empty">No tasks</div>';
        return;
      }

      var html = '';
      grouped[s].forEach(function (t) {
        html +=
          '<div class="task-card" draggable="true" data-id="' + escapeHtml(t.id) + '" data-status="' + escapeHtml(t.status) + '">' +
          '<div class="task-card-title">' + escapeHtml(t.title) + '</div>' +
          '<div class="task-card-id">' + escapeHtml(t.id.substring(0, 8)) + '</div>' +
          '<div class="task-card-status"><span class="badge badge-' + escapeHtml(t.status) + '">' + escapeHtml(t.status.replace('_', ' ')) + '</span></div>' +
          '</div>';
      });
      list.innerHTML = html;
    });

    bindDragEvents();
  }

  // --- Data fetching ---
  function loadTasks() {
    if (!currentProjectId) return;
    hideError();

    fetch('/api/v2/tasks?project_id=' + encodeURIComponent(currentProjectId))
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load tasks.');
        return res.json();
      })
      .then(function (data) {
        renderTasks(data.tasks);
      })
      .catch(function (err) {
        showError(err.message);
      });
  }

  function loadProjects() {
    fetch('/api/v2/projects')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load projects.');
        return res.json();
      })
      .then(function (projects) {
        projects.forEach(function (p) {
          var opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name;
          projectSelect.appendChild(opt);
        });
      })
      .catch(function () {
        showError('Failed to load projects.');
      });
  }

  // --- Drag and drop ---
  function bindDragEvents() {
    var cards = document.querySelectorAll('.task-card');
    cards.forEach(function (card) {
      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('dragend', onDragEnd);
    });
  }

  function onDragStart(e) {
    e.dataTransfer.setData('text/plain', e.currentTarget.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  }

  function onDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    // Clear all drag-over states
    document.querySelectorAll('.status-column').forEach(function (col) {
      col.classList.remove('drag-over');
    });
  }

  // Column drop targets
  var columns = document.querySelectorAll('.status-column');
  columns.forEach(function (col) {
    col.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', function () {
      col.classList.remove('drag-over');
    });

    col.addEventListener('drop', function (e) {
      e.preventDefault();
      col.classList.remove('drag-over');
      var taskId = e.dataTransfer.getData('text/plain');
      var newStatus = col.dataset.status;

      // Find the card
      var card = document.querySelector('.task-card[data-id="' + taskId + '"]');
      if (!card || card.dataset.status === newStatus) return;

      var oldStatus = card.dataset.status;
      updateTaskStatus(taskId, newStatus, card, oldStatus);
    });
  });

  function updateTaskStatus(taskId, newStatus, card, oldStatus) {
    card.classList.add('updating');

    fetch('/api/v2/tasks/' + encodeURIComponent(taskId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to update task status.');
        return res.json();
      })
      .then(function () {
        loadTasks();
      })
      .catch(function (err) {
        card.classList.remove('updating');
        card.classList.add('reverting');
        showError(err.message);
        setTimeout(function () {
          card.classList.remove('reverting');
        }, 500);
      });
  }

  // --- Create task modal ---
  newTaskBtn.addEventListener('click', function () {
    modalOverlay.style.display = '';
    document.getElementById('task-title').focus();
  });

  modalCancel.addEventListener('click', closeModal);

  modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) closeModal();
  });

  function closeModal() {
    modalOverlay.style.display = 'none';
    createForm.reset();
    modalSubmit.disabled = false;
    modalSubmit.textContent = 'Create Task';
  }

  createForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var title = document.getElementById('task-title').value.trim();
    if (!title || !currentProjectId) return;

    modalSubmit.disabled = true;
    modalSubmit.textContent = 'Creating...';

    fetch('/api/v2/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: currentProjectId,
        title: title,
        description: document.getElementById('task-description').value.trim() || undefined,
      }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to create task.');
        return res.json();
      })
      .then(function () {
        closeModal();
        loadTasks();
      })
      .catch(function (err) {
        showError(err.message);
        modalSubmit.disabled = false;
        modalSubmit.textContent = 'Create Task';
      });
  });

  // --- Polling for background updates ---
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(loadTasks, POLL_INTERVAL);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // --- Project selection ---
  projectSelect.addEventListener('change', function () {
    currentProjectId = projectSelect.value || null;
    newTaskBtn.disabled = !currentProjectId;
    if (currentProjectId) {
      showSkeletons();
      loadTasks();
      startPolling();
    } else {
      stopPolling();
      STATUSES.forEach(function (s) {
        getList(s).innerHTML = '<div class="card-list-empty">No tasks</div>';
        getCount(s).textContent = '0';
      });
    }
  });

  retryBtn.addEventListener('click', function () {
    hideError();
    loadTasks();
  });

  // --- Init ---
  loadProjects();
  STATUSES.forEach(function (s) {
    getList(s).innerHTML = '<div class="card-list-empty">No tasks</div>';
  });
})();
