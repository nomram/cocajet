// The master chain: from the air in front of the engine to 58 N, with every step's number live.  Change the speed and the weather and watch the whole chain move.
import { h, shell, slider, select, button, readout } from '../ui.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';
import { ROWS, LHV } from '../thread.js';

export default function init(el) {
  const { body } = shell(el, { title: 'From air to 58 N: the whole chain, live', note: 'Every number on the page, from the first chapter to the last, is one link in this chain. Change the speed, the weather or the altitude and watch how the links move together. The little arrows show the change from the design point (115 000 rpm, sea level, 15 °C). This is the same model the simulator uses.' });
  const sN = slider({ label: 'Rotor speed', min: 40000, max: 125000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sT = slider({ label: 'Air temperature', min: -30, max: 45, step: 1, value: 15, unit: '°C', fmt: v => v.toFixed(0), onInput: upd });
  const sA = slider({ label: 'Altitude', min: 0, max: 4000, step: 50, value: 0, unit: 'm', fmt: v => v.toFixed(0), onInput: upd });
  const reset = button('Back to the design point', () => { sN.set(115000); sT.set(15); sA.set(0); upd(); }, 'small');
  const stations = h('div', { class: 'chain' });
  const tbl = h('div', { class: 'table-wrap' });
  body.append(h('div', { class: 'wgrid' }, h('div', { class: 'ctls' }, sN.el, sT.el, sA.el, h('div', { class: 'btn-row' }, reset)), stations), tbl);
  const base = steadyAt({ ...CJ1 }, CJ1.Ndesign, isa(0));
  const css = document.createElement('style');
  css.textContent = `.chain{display:grid;gap:8px;align-content:start}.chain .st{display:grid;grid-template-columns:7.5em 1fr;gap:10px;align-items:center;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.chain .st b{font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.chain .st span{font-family:var(--mono);font-size:.9rem}.chain .ar{text-align:center;color:var(--fire);line-height:.6;font-size:1.1rem}.dlt{font-size:.8rem;margin-left:.5em}.dlt.up{color:var(--ok)}.dlt.dn{color:var(--fire)}`;
  el.append(css);
  const dl = (a, b, d = 0, unit = '') => { const x = a - b; if (Math.abs(x) < Math.pow(10, -d) * 0.5) return ''; return `<span class="dlt ${x > 0 ? 'up' : 'dn'}">${x > 0 ? '▲' : '▼'} ${Math.abs(x).toFixed(d)}${unit}</span>`; };
  function upd() {
    const amb = isa(sA.get(), sT.get() - (288.15 - 0.0065 * sA.get() - 273.15)), g = steadyAt({ ...CJ1 }, sN.get(), amb);
    const C = K => (K - 273.15).toFixed(0);
    const cards = [
      ['Air in', `${(g.T01 - 273.15).toFixed(0)} °C, ${(g.P01 / 1000).toFixed(0)} kPa, ${g.m.toFixed(3)} kg/s ${dl(g.m, base.m, 3)}`],
      ['Compressor out', `${C(g.T02)} °C, ${(g.P02 / 1000).toFixed(0)} kPa (${g.PRc.toFixed(2)} : 1) ${dl(g.PRc, base.PRc, 2)}`],
      ['Combustor', `${(g.mf * 1000).toFixed(2)} g/s fuel → ${C(g.T03)} °C ${dl(g.T03, base.T03, 0, ' K')}`],
      ['Turbine out', `${C(g.T04)} °C, ${(g.P04 / 1000).toFixed(0)} kPa`],
      ['Nozzle', `${g.Ve.toFixed(0)} m/s, Mach ${g.Mexit.toFixed(2)} ${dl(g.Ve, base.Ve, 0, ' m/s')}`],
      ['Thrust', `${g.thrust.toFixed(1)} N ${dl(g.thrust, base.thrust, 1, ' N')}`],
    ];
    stations.innerHTML = cards.map((c, i) => (i ? '<div class="ar">▼</div>' : '') + `<div class="st"><b>${c[0]}</b><span>${c[1]}</span></div>`).join('');
    tbl.innerHTML = `<table class="data ledger-table"><tr><th>Step</th><th>Value now</th><th>Chapters</th></tr>${ROWS.map(r => `<tr><td>${r.label}</td><td>${r.val(g)}</td><td class="chs">${r.ch.join(' · ')}</td></tr>`).join('')}</table>`;
  }
  upd();
}
