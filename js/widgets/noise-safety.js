// Jet noise and hearing damage: level vs distance, and the safe exposure time.
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Jet noise: how loud, how long is safe', note: 'Sound level falls 6 dB for every doubling of distance (spherical spreading). The safe time halves for every 3 dB above 85 dB (NIOSH criterion). Small jets are typically 115–125 dB at 1 m. Real hearing protection gives 15–25 dB, not the number on the label, once fit and gaps are included.' });
  const cv = h('canvas', { class: 'plot' });
  const sL = slider({ label: 'Noise level at 1 m, full power', min: 100, max: 135, step: 1, value: 120, unit: 'dB(A)', fmt: v => v.toFixed(0), onInput: upd });
  const sD = slider({ label: 'Your distance', min: 1, max: 100, step: 0.5, value: 10, unit: 'm', fmt: v => v.toFixed(1), onInput: upd, log: true });
  const sP = slider({ label: 'Real protection (plugs + muffs)', min: 0, max: 35, step: 1, value: 25, unit: 'dB', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { L: readout('Level where you stand', 'dB(A)', 'hot'), Le: readout('At your ear, with protection', 'dB(A)', 'good'), T: readout('Safe exposure without protection', '', 'bad'), Tp: readout('Safe exposure with protection', '', 'good') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, sL.el, sD.el, sP.el, h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)))));
  const p = new Plot(cv, { xmin: 1, xmax: 100, ymin: 60, ymax: 135, xlog: true, xlabel: 'distance from the engine (m)', ylabel: 'sound level (dB A)', aspect: 1.4 });
  const tstr = (L) => { const t = 8 * 3600 / Math.pow(2, (L - 85) / 3); return t >= 3600 ? (t / 3600).toFixed(1) + ' h' : t >= 60 ? (t / 60).toFixed(0) + ' min' : t.toFixed(0) + ' s'; };
  function upd() {
    const L1 = sL.get(), d = sD.get(), prot = sP.get(), L = L1 - 20 * Math.log10(d), Le = L - prot;
    ro.L.set(L.toFixed(0), L > 100 ? 'bad' : 'hot'); ro.Le.set(Le.toFixed(0)); ro.T.set(L > 85 ? tstr(L) : 'unlimited', L > 100 ? 'bad' : 'fuel'); ro.Tp.set(Le > 85 ? tstr(Le) : 'unlimited');
    const c = p.begin().col; p.hband(140, 120, { color: c.bad, alpha: .12, label: 'immediate damage risk' }); p.hband(100, 85, { color: c.warn, alpha: .08 }); p.axes();
    [[85, '85 dB: 8 h limit'], [100, '100 dB: 15 min'], [110, '110 dB: ~1.5 min'], [120, '120 dB: ~7 s'], [130, '130 dB: pain']].forEach(([l, t]) => p.hline(l, { color: c.muted, label: t, align: 'right', alpha: .8 }));
    p.fn(x => L1 - 20 * Math.log10(x), 1, 100, { color: c.fire, width: 3 }); p.fn(x => L1 - 20 * Math.log10(x) - prot, 1, 100, { color: c.ok, width: 2.6, dash: [6, 4] });
    p.dot(d, L, { color: c.fire }); p.dot(d, Le, { color: c.ok });
    p.legend([[c.fire, 'bare ears'], [c.ok, 'with protection', [6, 4]]], { pos: 'tr' });
  }
  p.onDraw(upd); upd();
}
