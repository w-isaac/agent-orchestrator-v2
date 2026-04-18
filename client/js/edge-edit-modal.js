/**
 * EdgeEditModal: Modal dialog for creating/editing graph edges.
 * Fields: label (required), type. Source and target are pre-filled
 * (from drag-to-edge or explicit selection) and read-only.
 */

/* exported EdgeEditModal */

var EdgeEditModal = (function () {
  'use strict';

  var LABEL_MAX = 120;
  var TYPE_OPTIONS = ['relates_to', 'depends_on', 'produces', 'references', 'blocks', 'other'];

  function validateLabel(s) {
    if (s === null || s === undefined) return 'Label is required';
    var trimmed = String(s).trim();
    if (trimmed.length === 0) return 'Label is required';
    if (trimmed.length > LABEL_MAX) return 'Label must be ' + LABEL_MAX + ' characters or fewer';
    return null;
  }

  function buildPayload(form) {
    return {
      label: String(form.label || '').trim(),
      type: form.type || 'relates_to',
    };
  }

  /**
   * Create or update an edge.
   * opts: { projectId, edgeId?, sourceId, targetId, form, fetch }
   */
  function save(opts) {
    var fetchFn = opts.fetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) return Promise.reject(new Error('fetch is not available'));

    var err = validateLabel(opts.form && opts.form.label);
    if (err) return Promise.reject(new Error(err));

    var payload = buildPayload(opts.form);
    var url, method, body;

    if (opts.edgeId) {
      url = '/api/context-graph/edges/' + encodeURIComponent(opts.edgeId);
      method = 'PATCH';
      body = payload;
    } else {
      if (!opts.projectId) return Promise.reject(new Error('projectId is required for create'));
      if (!opts.sourceId || !opts.targetId) return Promise.reject(new Error('sourceId and targetId are required'));
      if (opts.sourceId === opts.targetId) return Promise.reject(new Error('Source and target must differ'));
      url = '/api/context-graph/' + encodeURIComponent(opts.projectId) + '/edges';
      method = 'POST';
      body = Object.assign({
        source_node_id: opts.sourceId,
        target_node_id: opts.targetId,
      }, payload);
    }

    return fetchFn(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /**
   * Open the modal. opts:
   *  - container (default document.body)
   *  - projectId
   *  - edge (existing, for edit) OR sourceNode & targetNode (for create-from-drag)
   *  - onSaved(edge), onClose()
   *  - fetch (for tests)
   */
  function open(opts) {
    opts = opts || {};
    var container = opts.container || document.body;
    var existing = opts.edge || null;
    var isEdit = !!(existing && existing.id);

    var sourceLabel = isEdit
      ? (existing.source_label || existing.source_node_id)
      : (opts.sourceNode && (opts.sourceNode.label || opts.sourceNode.id));
    var targetLabel = isEdit
      ? (existing.target_label || existing.target_node_id)
      : (opts.targetNode && (opts.targetNode.label || opts.targetNode.id));
    var sourceId = isEdit ? existing.source_node_id : (opts.sourceNode && opts.sourceNode.id);
    var targetId = isEdit ? existing.target_node_id : (opts.targetNode && opts.targetNode.id);

    var backdrop = el('div', { className: 'modal-backdrop', role: 'presentation' });
    var dialog = el('div', { className: 'modal edge-edit-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'eem-title' });
    backdrop.appendChild(dialog);

    var header = el('div', { className: 'modal-header' }, [
      el('h2', { id: 'eem-title' }, [isEdit ? 'Edit Edge' : 'Create Edge']),
    ]);
    var closeBtn = el('button', { type: 'button', className: 'modal-close', 'aria-label': 'Close' }, ['\u00D7']);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    var body = el('div', { className: 'modal-body' });
    dialog.appendChild(body);

    // Source/target display (read-only summary)
    var connection = el('div', { className: 'edge-connection' }, [
      el('span', { className: 'edge-endpoint edge-endpoint-source' }, [String(sourceLabel || '')]),
      el('span', { className: 'edge-arrow', 'aria-hidden': 'true' }, ['\u2192']),
      el('span', { className: 'edge-endpoint edge-endpoint-target' }, [String(targetLabel || '')]),
    ]);
    body.appendChild(connection);

    // Label
    var labelInput = el('input', { type: 'text', id: 'eem-label', className: 'form-input', required: 'required', maxlength: String(LABEL_MAX) });
    labelInput.value = existing ? (existing.label || '') : '';
    body.appendChild(el('label', { htmlFor: 'eem-label', className: 'form-label' }, ['Label *']));
    body.appendChild(labelInput);

    // Type
    var typeSelect = el('select', { id: 'eem-type', className: 'form-input' });
    TYPE_OPTIONS.forEach(function (t) {
      var opt = el('option', { value: t }, [t]);
      typeSelect.appendChild(opt);
    });
    typeSelect.value = (existing && existing.type) || 'relates_to';
    body.appendChild(el('label', { htmlFor: 'eem-type', className: 'form-label' }, ['Type']));
    body.appendChild(typeSelect);

    var errorEl = el('div', { className: 'modal-error', role: 'alert' });
    body.appendChild(errorEl);

    var saveBtn = el('button', { type: 'button', className: 'btn btn-primary modal-save' }, ['Save']);
    var cancelBtn = el('button', { type: 'button', className: 'btn btn-ghost modal-cancel' }, ['Cancel']);
    var footer = el('div', { className: 'modal-footer' }, [cancelBtn, saveBtn]);
    dialog.appendChild(footer);

    function readForm() {
      return { label: labelInput.value, type: typeSelect.value };
    }

    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    }

    function onKey(e) { if (e.key === 'Escape') close(); }

    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey);

    saveBtn.addEventListener('click', function () {
      errorEl.textContent = '';
      saveBtn.disabled = true;
      var form = readForm();

      if (typeof opts.onOptimisticApply === 'function') {
        var labelErr = validateLabel(form.label);
        if (labelErr) {
          errorEl.textContent = labelErr;
          saveBtn.disabled = false;
          return;
        }
        var payload = buildPayload(form);
        var edgeId = isEdit ? existing.id : null;
        close();
        opts.onOptimisticApply({
          payload: payload,
          edgeId: edgeId,
          sourceId: sourceId,
          targetId: targetId,
        });
        return;
      }

      save({
        projectId: opts.projectId,
        edgeId: isEdit ? existing.id : null,
        sourceId: sourceId,
        targetId: targetId,
        form: form,
        fetch: opts.fetch,
      }).then(function (edge) {
        if (opts.onSaved) opts.onSaved(edge);
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
    buildPayload: buildPayload,
    save: save,
    TYPE_OPTIONS: TYPE_OPTIONS,
    LABEL_MAX: LABEL_MAX,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EdgeEditModal: EdgeEditModal };
}
