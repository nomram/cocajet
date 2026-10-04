// A plan-view of the hazard zones around a running engine (to scale), driven by the engine model.
import { h, shell, slider, readout, toggle } from '../ui.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'Where not to stand: hazard zones (plan view, to scale)', note: 'Drawn for the engine on a stand pointing right. Jet: centre-line speed falls as V ≈ 6.3·D·Vₑ / x. Burst plane: fragments of a failed wheel leave within ±15° of the wheel’s plane. Noise contour: where the level has fallen to 100 dB (about 15 min safe) for 120 dB at 1 m.' });
  const cv = h('canvas', { class: 'plot', style: { aspectRatio: '2.1', height: 'auto' } });
  const sN = slider({ label: 'Engine speed', min: 48000, max: 125000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sW = slider({ label: 'Hazard threshold for the jet', min: 5, max: 60, step: 1, value: 15, unit: 'm/s', fmt: v => v.toFixed(0), onInput: upd });
  const ro = { jet: readout('Jet stays above the threshold for', 'm', 'hot'), hot: readout('Hot (> +100 K) for', 'm', 'bad'), inl: readout('Intake faster than 5 m/s within', 'cm', 'cool'), noi: readout('100 dB contour at', 'm', 'fuel'), burst: readout('Keep out of the wheel planes ±15° beyond', 'm', 'bad') };
  body.append(h('div', {}, cv), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sN.el, sW.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const ctx = cv.getContext('2d');
  function upd() {
    const g = steadyAt({ ...CJ1 }, sN.get(), isa(0)), D = 2 * Math.sqrt(CJ1.A5 / Math.PI), Ve = g.Ve, thr = sW.get();
    const jet = 6.3 * D * Ve / thr, dT0 = g.T04 - 288, hot = 5 * D * dT0 / 100, inl = Math.sqrt(g.m / 1.2 / (2 * Math.PI * 5)) * 100, noi = Math.pow(10, (120 - 100) / 20), burst = 10;
    ro.jet.set(jet.toFixed(1)); ro.hot.set(hot.toFixed(1)); ro.inl.set(inl.toFixed(0)); ro.noi.set(noi.toFixed(0)); ro.burst.set('≥ ' + burst);
    const w = cv.clientWidth, hh = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    const cs = getComputedStyle(document.documentElement), col = (n) => cs.getPropertyValue(n).trim();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = col('--bg-2'); ctx.fillRect(0, 0, w, hh);
    const span = Math.max(14, jet + 3, 12), px = (w * 0.86) / span, ox = w * 0.06 + 0.8 * px * 0, oy = hh / 2;      // metres → px, engine at x = 1 m from left margin
    const X = (m) => ox + (m + 2.5) * px * 0.88, Y = (m) => oy - m * px * 0.88;
    // grid
    ctx.strokeStyle = col('--line'); ctx.lineWidth = 1; ctx.fillStyle = col('--muted'); ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    for (let m = -2; m <= span; m += 2) { ctx.beginPath(); ctx.moveTo(X(m), 0); ctx.lineTo(X(m), hh); ctx.stroke(); ctx.fillText(m + ' m', X(m), hh - 6); }
    // noise
    ctx.fillStyle = 'rgba(255,183,3,.10)'; ctx.strokeStyle = col('--fuel'); ctx.beginPath(); ctx.arc(X(0.15), Y(0), noi * px * 0.88, 0, 7); ctx.fill(); ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col('--fuel'); ctx.textAlign = 'left'; ctx.fillText('100 dB contour (hearing protection needed far beyond this)', X(0.15) - noi * px * 0.88 + 8, Y(noi) + 14);
    // burst planes (turbine at 0.19 m, compressor at 0.04 m from the datum)
    ctx.fillStyle = 'rgba(255,93,93,.20)';
    for (const x0 of [0.185, 0.045]) { const L = 12 * px * 0.88, a = 15 * Math.PI / 180; ctx.beginPath(); ctx.moveTo(X(x0), Y(0)); ctx.lineTo(X(x0) + Math.sin(a) * L, Y(0) - Math.cos(a) * L); ctx.lineTo(X(x0) - Math.sin(a) * L, Y(0) - Math.cos(a) * L); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(X(x0), Y(0)); ctx.lineTo(X(x0) + Math.sin(a) * L, Y(0) + Math.cos(a) * L); ctx.lineTo(X(x0) - Math.sin(a) * L, Y(0) + Math.cos(a) * L); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = col('--bad'); ctx.fillText('burst fragment zone (turbine & compressor planes ±15°)', X(0.3), Y(5.2));
    // jet cone
    const grad = ctx.createLinearGradient(X(0.26), 0, X(0.26 + jet), 0); grad.addColorStop(0, 'rgba(255,107,53,.65)'); grad.addColorStop(1, 'rgba(255,107,53,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(X(0.26), Y(-0.03)); ctx.lineTo(X(0.26 + jet), Y(-jet * 0.17)); ctx.lineTo(X(0.26 + jet), Y(jet * 0.17)); ctx.lineTo(X(0.26), Y(0.03)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col('--fire'); ctx.fillText(`jet > ${thr} m/s for ${jet.toFixed(1)} m`, X(0.26 + jet * 0.45), Y(0) - 8);
    // hot core
    ctx.fillStyle = 'rgba(255,40,40,.7)'; ctx.fillRect(X(0.26), Y(0.06), hot * px * 0.88, 0.12 * px * 0.88);
    // intake
    ctx.strokeStyle = col('--air'); ctx.fillStyle = 'rgba(76,201,240,.25)'; ctx.beginPath(); ctx.arc(X(-0.0), Y(0), Math.max(5, inl / 100 * px * 0.88), Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    // engine body
    ctx.fillStyle = col('--text'); ctx.fillRect(X(0), Y(0.05), 0.255 * px * 0.88, 0.1 * px * 0.88);
    ctx.fillStyle = col('--air'); ctx.textAlign = 'right'; ctx.fillText('intake ←', X(0) - 6, Y(0) + 4);
    // safe operator spot
    ctx.fillStyle = col('--ok'); ctx.beginPath(); ctx.arc(X(-1.8), Y(-3.6), 7, 0, 7); ctx.fill(); ctx.textAlign = 'left'; ctx.fillText('operator: behind a shield, outside the wheel planes, ear defence on', X(-1.8) + 12, Y(-3.6) + 4);
    ctx.fillStyle = col('--fuel'); ctx.fillRect(X(-2.3), Y(2.8), 10, 18); ctx.fillText('gas bottle ≥ 3 m away, off-axis', X(-2.3) + 16, Y(2.8) + 14);
  }
  upd(); new ResizeObserver(upd).observe(cv);
}
