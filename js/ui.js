/* ui.js — tiny DOM helpers used by every widget */

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/** Wrap a placeholder <div data-widget> in the standard card. Returns {root, body, head}. */
export function shell(host, { title, badge = 'Interactive', note = '', tools = null } = {}) {
  host.innerHTML = '';
  host.classList.add('widget');
  const head = h('div', { class: 'widget-head' },
    badge ? h('span', { class: 'badge' }, badge) : null,
    h('h5', {}, title), h('span', { class: 'sp' }), tools);
  const body = h('div', { class: 'widget-body' });
  host.append(head, body);
  if (note) host.append(h('div', { class: 'widget-note', html: note }));
  return { root: host, body, head };
}

const fillRange = (input) => {
  const p = ((input.value - input.min) / (input.max - input.min)) * 100;
  input.style.setProperty('--p', p + '%');
};

/** slider({label,min,max,step,value,unit,fmt,onInput}) */
export function slider({ label, min, max, step = 1, value, unit = '', fmt = null, onInput = () => {}, log = false }) {
  const out = h('output');
  const lo = log ? Math.log(min) : min, hiV = log ? Math.log(max) : max;
  const input = h('input', { type: 'range', min: log ? 0 : min, max: log ? 1000 : max, step: log ? 1 : step });
  const toVal = (raw) => (log ? Math.exp(lo + (raw / 1000) * (hiV - lo)) : +raw);
  const fromVal = (v) => (log ? ((Math.log(v) - lo) / (hiV - lo)) * 1000 : v);
  const format = (v) => (fmt ? fmt(v) : (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2))) + (unit ? ' ' + unit : '');
  const el = h('div', { class: 'ctl' }, h('label', {}, label), out, input);
  const api = {
    el, input, get: () => toVal(input.value),
    set(v, silent = true) { input.value = fromVal(v); out.textContent = format(toVal(input.value)); fillRange(input); if (!silent) onInput(api.get()); },
  };
  input.addEventListener('input', () => { out.textContent = format(api.get()); fillRange(input); onInput(api.get()); });
  api.set(value);
  return api;
}

export function select({ label, options, value, onChange = () => {} }) {
  const sel = h('select', {}, options.map(([v, t]) => h('option', { value: v }, t)));
  sel.value = value ?? options[0][0];
  sel.addEventListener('change', () => onChange(sel.value));
  const el = h('div', { class: 'ctl' }, h('label', {}, label), h('span'), sel);
  return { el, sel, get: () => sel.value, set: (v) => { sel.value = v; } };
}

export function toggle({ label, checked = false, onChange = () => {} }) {
  const input = h('input', { type: 'checkbox' });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const el = h('label', { class: 'tgl' }, input, label);
  return { el, input, get: () => input.checked, set: (v) => { input.checked = v; } };
}

export function button(label, onClick, cls = '') {
  return h('button', { class: 'btn ' + cls, type: 'button', onclick: onClick }, label);
}

/** big-number readout tile */
export function readout(label, unit = '', cls = '') {
  const v = h('span', { class: 'v' }, '–');
  const u = h('span', { class: 'u' }, unit);
  const el = h('div', { class: 'ro ' + cls }, h('div', { class: 'k' }, label), h('div', {}, v, u));
  return { el, set(text, c) { v.textContent = text; if (c !== undefined) el.className = 'ro ' + c; } };
}

export function legend(items) {
  return h('div', { class: 'legend' }, items.map(([c, t]) => h('span', {}, h('i', { style: { background: c } }), t)));
}

export const rafThrottle = (fn) => {
  let q = false;
  return (...a) => { if (q) return; q = true; requestAnimationFrame(() => { q = false; fn(...a); }); };
};

/** number formatting helpers */
export const fx = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
export const sci = (v, d = 2) => (Number.isFinite(v) ? v.toExponential(d).replace('e+', '×10^').replace('e-', '×10^-') : '–');
export const C = (K) => K - 273.15;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;

/** read a CSS colour variable */
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Run cb when the element is on screen (pause animations off-screen) */
export function whenVisible(el, cb) {
  let vis = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { vis = e.isIntersecting; cb(vis); }).observe(el);
  return () => vis;
}
