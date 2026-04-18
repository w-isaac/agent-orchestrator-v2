/**
 * NodeEditModal: Modal dialog for creating/editing graph nodes.
 * Supports label, type, and arbitrary key-value properties.
 * Persists via POST /api/context-graph/:projectId/nodes (create)
 * or PATCH /api/context-graph/nodes/:id (edit).
 */

/* exported NodeEditModal */

var NodeEditModal = (function () {
  'use strict';

  var LABEL_MAX = 120;
  var TYPE_OPTIONS = ['concept', 'artifact', 'task', 'context', 'person', 'other'];

  function validateLabel(s) {
    if (s === null || s === undefined) return 'Label is required';
    var trimmed = String(s).trim();
    if (trimmed.length === 0) return 'Label is required';
    if (trimmed.length > LABEL_MAX) return 'Label must be ' + LABEL_MAX + ' characters or fewer';
    return null;
  }

  /**
   * Convert property rows [{key, value}, ...] to a plain object.
   * Skips rows with empty keys. Later duplicate keys win.
   */
  function serializeProperties(rows) {
    var out = {};
    if (!Array.isArray(rows)) return out;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      var key = row.key == null ? '' : String(row.key).trim();
      if (key.length === 0) continue;
      out[key] = row.value == null ? '' : String(row.value);
    }
    return out;
  }

  /** Convert properties object to ordered rows for editing. */
  function deserializeProperties(obj) {
    if (!obj || typeof obj !== 'object') return [];
    var keys = Object.keys(obj);
    return keys.map(function (k) { return { key: k, value: obj[k] == null ? '' : String(obj[k]) }; });
  }

  function buildPayload(form) {
    return {
      label: String(form.label || '').trim(),
      type: form.type || 'concept',
      properties: serializeProperties(form.properties || []),
    };
  }

  /**
   * Persist the node. If `nodeId` is falsy, create; otherwise, patch.
   * Uses global `fetch`. Resolves with the server node JSON.
   */
  function save(opts) {
    var projectId = opts.projectId;
    var nodeId = opts.nodeId;
    var form = opts.form || {};
    var fetchFn = opts.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) return Promise.reject(new Error('fetch is not available'));

    var err = validateLabel(form.label);
    if (err) return Promise.reject(new Error(err));

    var payload = buildPayload(form);
    var url, method;
    if (nodeId) {
      url = '/api/context-graph/nodes/' + encodeURIComponent(nodeId);
      method = 'PATCH';
    } else {
      if (!projectId) return Promise.reject(new Error('projectId is required for create'));
      url = '/api/context-graph/' + encodeURIComponent(projectId) + '/nodes';
      method = 'POST';
    }

    return fetchFn(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (j) {
          throw new Error((j && j.error) || ('HTTP ' + res.status));
        }, function () {
          throw new Error('HTTP ' + res.status);
        });
      }
      return res.json();
    });
  }

  // ─── DOM rendering ──────────────────────────────────────────────────────────

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'onclick') node.addEventListener('click', attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function renderPropertyRow(row, onRemove) {
    var keyInput = el('input', { type: 'text', className: 'prop-key', placeholder: 'key' });
    keyInput.value = row.key || '';
    var valInput = el('input', { type: 'text', className: 'prop-value', placeholder: 'value' });
    valInput.value = row.value || '';
    var removeBtn = el('button', { type: 'button', className: 'prop-remove', 'aria-label': 'Remove property' }, ['\u2212']);
    removeBtn.addEventListener('click', onRemove);
    return el('div', { className: 'property-row' }, [keyInput, valInput, removeBtn]);
  }

  /**
   * Render modal into container. Returns a controller with close(), getForm().
   * @param {Object} opts { container, projectId, node, onSaved, onClose, fetch }
   */
  function open(opts) {
    opts = opts || {};
    var container = opts.container || document.body;
    var existing = opts.node || null;
    var isEdit = !!(existing && existing.id);

    // Backdrop + dialog
    var backdrop = el('div', { className: 'modal-backdrop', role: 'presentation' });
    var dialog = el('div', { className: 'modal node-edit-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'nem-title' });
    backdrop.appendChild(dialog);

    var header = el('div', { className: 'modal-header' }, [
      el('h2', { id: 'nem-title' }, [isEdit ? 'Edit Node' : 'Create Node']),
    ]);
    var closeBtn = el('button', { type: 'button', className: 'modal-close', 'aria-label': 'Close' }, ['\u00D7']);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    var body = el('div', { className: 'modal-body' });
    dialog.appendChild(body);

    // Label field
    var labelInput = el('input', { type: 'text', id: 'nem-label', className: 'form-input', required: 'required', maxlength: String(LABEL_MAX) });
    labelInput.value = existing ? (existing.label || '') : '';
    body.appendChild(el('label', { htmlFor: 'nem-label', className: 'form-label' }, ['Label *']));
    body.appendChild(labelInput);

    // Type field
    var typeSelect = el('select', { id: 'nem-type', className: 'form-input' });
    TYPE_OPTIONS.forEach(function (t) {
      var opt = el('option', { value: t }, [t]);
      typeSelect.appendChild(opt);
    });
    typeSelect.value = (existing && existing.type) || 'concept';
    body.appendChild(el('label', { htmlFor: 'nem-type', className: 'form-label' }, ['Type']));
    body.appendChild(typeSelect);

    // Properties
    body.appendChild(el('label', { className: 'form-label' }, ['Properties']));
    var propsList = el('div', { className: 'property-list' });
    body.appendChild(propsList);

    var rows = deserializeProperties(existing && existing.properties);

    function renderRows() {
      propsList.innerHTML = '';
      rows.forEach(function (row, idx) {
        propsList.appendChild(renderPropertyRow(row, function () {
          rows.splice(idx, 1);
          renderRows();
        }));
      });
    }
    renderRows();

    var addBtn = el('button', { type: 'button', className: 'btn btn-ghost prop-add' }, ['+ Add property']);
    addBtn.addEventListener('click', function () {
      rows.push({ key: '', value: '' });
      renderRows();
    });
    body.appendChild(addBtn);

    // Error area
    var errorEl = el('div', { className: 'modal-error', role: 'alert' });
    body.appendChild(errorEl);

    // Footer
    var saveBtn = el('button', { type: 'button', className: 'btn btn-primary modal-save' }, ['Save']);
    var cancelBtn = el('button', { type: 'button', className: 'btn btn-ghost modal-cancel' }, ['Cancel']);
    var footer = el('div', { className: 'modal-footer' }, [cancelBtn, saveBtn]);
    dialog.appendChild(footer);

    function readForm() {
      var collectedRows = [];
      var rowEls = propsList.querySelectorAll('.property-row');
      for (var i = 0; i < rowEls.length; i++) {
        var k = rowEls[i].querySelector('.prop-key').value;
        var v = rowEls[i].querySelector('.prop-value').value;
        collectedRows.push({ key: k, value: v });
      }
      return { label: labelInput.value, type: typeSelect.value, properties: collectedRows };
    }

    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    }

    function onKey(e) {
      if (e.key === 'Escape') close();
    }

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', onKey);

    saveBtn.addEventListener('click', function () {
      errorEl.textContent = '';
      var form = readForm();
      saveBtn.disabled = true;

      if (typeof opts.onOptimisticApply === 'function') {
        var labelErr = validateLabel(form.label);
        if (labelErr) {
          errorEl.textContent = labelErr;
          saveBtn.disabled = false;
          return;
        }
        var payload = buildPayload(form);
        var nodeId = isEdit ? existing.id : null;
        close();
        opts.onOptimisticApply({ payload: payload, nodeId: nodeId });
        return;
      }

      save({
        projectId: opts.projectId,
        nodeId: isEdit ? existing.id : null,
        form: form,
        fetch: opts.fetch,
      }).then(function (node) {
        if (opts.onSaved) opts.onSaved(node);
        close();
      }).catch(function (err) {
        errorEl.textContent = err.message || 'Failed to save';
        saveBtn.disabled = false;
      });
    });

    container.appendChild(backdrop);
    labelInput.focus();

    return {
      close: close,
      getForm: readForm,
      dialog: dialog,
      backdrop: backdrop,
    };
  }

  return {
    open: open,
    validateLabel: validateLabel,
    serializeProperties: serializeProperties,
    deserializeProperties: deserializeProperties,
    buildPayload: buildPayload,
    save: save,
    TYPE_OPTIONS: TYPE_OPTIONS,
    LABEL_MAX: LABEL_MAX,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NodeEditModal: NodeEditModal };
}
