/**
 * ErrorToast: stackable, auto-dismissing error notifications.
 * Fixed bottom-right overlay. Each toast auto-dismisses after
 * AUTO_DISMISS_MS (default 6000ms). Exposes createStack() for
 * managing multiple concurrent toasts.
 */

/* exported ErrorToast */

var ErrorToast = (function () {
  'use strict';

  var AUTO_DISMISS_MS = 6000;

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

  function buildToastElement(id, message, onDismiss) {
    var dismissBtn = el('button', {
      type: 'button',
      className: 'error-toast-dismiss',
      'aria-label': 'Dismiss notification',
    }, ['\u00D7']);
    dismissBtn.addEventListener('click', onDismiss);

    var icon = el('span', { className: 'error-toast-icon', 'aria-hidden': 'true' }, ['!']);
    var msg = el('span', { className: 'error-toast-message' }, [String(message || '')]);
    var progress = el('div', { className: 'error-toast-progress' });

    var toast = el('div', {
      className: 'error-toast',
      role: 'alert',
      'aria-live': 'assertive',
      'data-toast-id': id,
    }, [icon, msg, dismissBtn, progress]);
    return toast;
  }

  function buildStackElement() {
    return el('div', { className: 'error-toast-stack', role: 'region', 'aria-label': 'Notifications' });
  }

  /**
   * Create a toast stack. The stack element is appended to `container`.
   * opts:
   *  - duration: ms before auto-dismiss (default 6000)
   *  - setTimeout / clearTimeout: overridable (for tests)
   *
   * Returns { addToast(msg), dismiss(id), getToasts(), destroy(), element }.
   */
  function createStack(container, opts) {
    if (!container) throw new Error('createStack: container is required');
    opts = opts || {};
    var duration = opts.duration != null ? opts.duration : AUTO_DISMISS_MS;
    var timeoutFn = opts.setTimeout || (typeof setTimeout === 'function' ? setTimeout : null);
    var clearFn = opts.clearTimeout || (typeof clearTimeout === 'function' ? clearTimeout : null);

    var stackEl = buildStackElement();
    container.appendChild(stackEl);

    var toasts = [];
    var counter = 0;

    function dismiss(id) {
      var idx = -1;
      for (var i = 0; i < toasts.length; i++) {
        if (toasts[i].id === id) { idx = i; break; }
      }
      if (idx < 0) return false;
      var t = toasts[idx];
      if (t.timer != null && clearFn) clearFn(t.timer);
      if (t.el && t.el.parentNode) t.el.parentNode.removeChild(t.el);
      toasts.splice(idx, 1);
      return true;
    }

    function addToast(message) {
      counter += 1;
      var id = 'toast-' + counter;
      var toastEl = buildToastElement(id, message, function () { dismiss(id); });
      var timer = null;
      if (timeoutFn && duration > 0) {
        timer = timeoutFn(function () { dismiss(id); }, duration);
      }
      toasts.push({ id: id, el: toastEl, timer: timer, message: String(message || '') });
      stackEl.appendChild(toastEl);
      return id;
    }

    function getToasts() {
      return toasts.map(function (t) { return { id: t.id, message: t.message }; });
    }

    function destroy() {
      while (toasts.length > 0) dismiss(toasts[0].id);
      if (stackEl.parentNode) stackEl.parentNode.removeChild(stackEl);
    }

    return {
      addToast: addToast,
      dismiss: dismiss,
      getToasts: getToasts,
      destroy: destroy,
      element: stackEl,
    };
  }

  return {
    createStack: createStack,
    AUTO_DISMISS_MS: AUTO_DISMISS_MS,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ErrorToast: ErrorToast };
}
