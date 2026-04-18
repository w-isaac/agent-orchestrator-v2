import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

// Minimal DOM stub — mirrors the shape used by other client module tests.
class FakeClassList {
  constructor(el) { this._el = el; }
  add(cls) {
    const s = new Set(String(this._el.className || '').split(/\s+/).filter(Boolean));
    s.add(cls);
    this._el.className = [...s].join(' ');
  }
  remove(cls) {
    const s = new Set(String(this._el.className || '').split(/\s+/).filter(Boolean));
    s.delete(cls);
    this._el.className = [...s].join(' ');
  }
  toggle(cls, on) {
    if (on) this.add(cls); else this.remove(cls);
  }
  contains(cls) {
    return String(this._el.className || '').split(/\s+/).includes(cls);
  }
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.parentNode = null;
    this.className = '';
    this._text = '';
    this.disabled = false;
    this.classList = new FakeClassList(this);
  }
  appendChild(child) {
    if (child.parentNode && child.parentNode !== this) child.parentNode.removeChild(child);
    this.children.push(child);
    child.parentNode = this;
    return child;
  }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) { this.children.splice(i, 1); child.parentNode = null; }
    return child;
  }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); }
  dispatch(evt) { (this.listeners[evt] || []).forEach((fn) => fn({ target: this })); }
  click() { this.dispatch('click'); }
  focus() {}
  get textContent() {
    let out = this._text;
    this.children.forEach((c) => { out += c.textContent; });
    return out;
  }
  set textContent(v) { this._text = String(v); this.children = []; }
}
class FakeTextNode {
  constructor(text) { this._text = String(text); this.parentNode = null; this.children = []; }
  get textContent() { return this._text; }
}

const docListeners = {};
const fakeDocument = {
  createElement(tag) { return new FakeElement(tag); },
  createTextNode(t) { return new FakeTextNode(t); },
  addEventListener(evt, fn) { (docListeners[evt] = docListeners[evt] || []).push(fn); },
  removeEventListener(evt, fn) {
    const arr = docListeners[evt] || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  },
  body: null,
};
global.document = fakeDocument;

const require = createRequire(import.meta.url);
const { AutoApproveToggle } = require('../js/auto-approve-toggle');
const { ConfirmAutoApproveModal } = require('../js/confirm-auto-approve-modal');

function okResponse(body) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}
function errResponse(status, body) {
  return { ok: false, status, json: () => Promise.resolve(body || { error: 'fail' }) };
}

describe('AutoApproveToggle', () => {
  let container;
  beforeEach(() => { container = new FakeElement('div'); });

  describe('patchAutoApprove', () => {
    it('sends PATCH with x-user-role: admin and boolean body', async () => {
      const fetchMock = vi.fn().mockResolvedValue(okResponse({ data: { auto_approve: true } }));
      await AutoApproveToggle.patchAutoApprove({
        projectId: 'p1',
        value: true,
        fetch: fetchMock,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/projects/p1');
      expect(init.method).toBe('PATCH');
      expect(init.headers['x-user-role']).toBe('admin');
      expect(init.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(init.body)).toEqual({ auto_approve: true });
    });

    it('throws with server error message on non-ok response', async () => {
      const fetchMock = vi.fn().mockResolvedValue(errResponse(403, { error: 'Admin role required' }));
      await expect(
        AutoApproveToggle.patchAutoApprove({ projectId: 'p1', value: true, fetch: fetchMock }),
      ).rejects.toThrow(/Admin role required/);
    });
  });

  describe('render', () => {
    it('renders in off state when initialValue=false', () => {
      const ctrl = AutoApproveToggle.render({ container, projectId: 'p1', initialValue: false });
      expect(ctrl.getValue()).toBe(false);
      expect(ctrl.toggle.getAttribute('aria-checked')).toBe('false');
      expect(ctrl.badge.textContent).toBe('Disabled');
    });

    it('renders in on state when initialValue=true', () => {
      const ctrl = AutoApproveToggle.render({ container, projectId: 'p1', initialValue: true });
      expect(ctrl.getValue()).toBe(true);
      expect(ctrl.toggle.getAttribute('aria-checked')).toBe('true');
      expect(ctrl.badge.textContent).toBe('Enabled');
    });

    it('OFF -> ON click opens confirm modal and does not call fetch until confirm', () => {
      const fetchMock = vi.fn();
      let capturedOnConfirm = null;
      const ModalStub = {
        open(opts) {
          capturedOnConfirm = opts.onConfirm;
          return { close() {} };
        },
      };
      const ctrl = AutoApproveToggle.render({
        container, projectId: 'p1', initialValue: false,
        fetch: fetchMock, ConfirmModal: ModalStub,
      });

      ctrl.toggle.click();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(capturedOnConfirm).toBeTypeOf('function');
      expect(ctrl.getValue()).toBe(false);

      fetchMock.mockResolvedValueOnce(okResponse({ data: { auto_approve: true } }));
      capturedOnConfirm();

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ auto_approve: true });
    });

    it('ON -> OFF click skips modal and immediately saves false', async () => {
      const fetchMock = vi.fn().mockResolvedValue(okResponse({ data: { auto_approve: false } }));
      const ModalStub = { open: vi.fn() };
      const ctrl = AutoApproveToggle.render({
        container, projectId: 'p1', initialValue: true,
        fetch: fetchMock, ConfirmModal: ModalStub,
      });

      ctrl.toggle.click();
      await new Promise((r) => setImmediate(r));

      expect(ModalStub.open).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ auto_approve: false });
      expect(ctrl.getValue()).toBe(false);
    });

    it('reverts to previous value when save fails', async () => {
      const fetchMock = vi.fn().mockResolvedValue(errResponse(500, { error: 'boom' }));
      const onError = vi.fn();
      const ctrl = AutoApproveToggle.render({
        container, projectId: 'p1', initialValue: true,
        fetch: fetchMock, onError,
      });

      ctrl.toggle.click(); // ON -> OFF path, optimistic flip then revert on fail
      await new Promise((r) => setImmediate(r));

      expect(ctrl.getValue()).toBe(true);
      expect(onError).toHaveBeenCalledOnce();
      expect(ctrl.toggle.getAttribute('aria-checked')).toBe('true');
    });

    it('disables toggle for non-admin with tooltip and does not fetch on click', () => {
      const fetchMock = vi.fn();
      const ctrl = AutoApproveToggle.render({
        container, projectId: 'p1', initialValue: false,
        isAdmin: false, fetch: fetchMock,
      });

      expect(ctrl.toggle.disabled).toBe(true);
      expect(ctrl.toggle.getAttribute('title')).toMatch(/admin/i);

      ctrl.toggle.click();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

describe('ConfirmAutoApproveModal', () => {
  beforeEach(() => {
    fakeDocument.body = new FakeElement('body');
  });

  it('calls onConfirm when confirm button clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const ctrl = ConfirmAutoApproveModal.open({
      container: fakeDocument.body,
      onConfirm,
      onCancel,
    });
    ctrl.confirmBtn.click();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when cancel button clicked and removes backdrop', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const ctrl = ConfirmAutoApproveModal.open({
      container: fakeDocument.body,
      onConfirm,
      onCancel,
    });
    ctrl.cancelBtn.click();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(fakeDocument.body.children).not.toContain(ctrl.backdrop);
  });
});
