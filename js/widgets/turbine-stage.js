// One axial turbine stage: nozzle guide vanes + rotor, with velocity triangles and the Euler work they deliver.
import { h, shell, slider, readout, button } from '../ui.js';
import { CJ1, isa, steadyAt } from '../engine-model.js';

export default function init(el) {
  const { body } = shell(el, { title: 'The turbine stage: velocity triangles', note: 'The nozzle guide vanes (NGV) accelerate the gas and swirl it by α₂ in the direction of rotation. The rotor blades then turn it back (relative angle β₃) so that little swirl is left: the change in swirl momentum × blade speed is the work taken out (Euler again). Compare the delivered work with what the compressor needs.' });
  const cv = h('canvas', { class: 'plot', style: { aspectRatio: '2.7', height: 'auto' } });
  const sN = slider({ label: 'Rotor speed', min: 60000, max: 125000, step: 1000, value: 115000, unit: 'rpm', fmt: v => v.toFixed(0), onInput: upd });
  const sCa = slider({ label: 'Axial gas speed  Cₐ', min: 90, max: 260, step: 1, value: 165, unit: 'm/s', fmt: v => v.toFixed(0), onInput: upd });
  const sA = slider({ label: 'NGV exit angle  α₂ (from axial)', min: 40, max: 72, step: 0.5, value: 58, unit: '°', fmt: v => v.toFixed(1), onInput: upd });
  const sB = slider({ label: 'Rotor exit relative angle  β₃', min: 40, max: 75, step: 0.5, value: 60, unit: '°', fmt: v => v.toFixed(1), onInput: upd });
  const ro = { U: readout('Blade speed U (mean)', 'm/s', 'cool'), C2: readout('NGV exit speed C₂', 'm/s', 'hot'), M: readout('NGV exit Mach', ''), dh: readout('Work delivered', 'kJ/kg', 'good'), need: readout('Work needed by compressor', 'kJ/kg', 'fuel'), sw: readout('Swirl left at exit', 'm/s'), psi: readout('Loading ψ = Δh/U²', ''), ok: readout('Verdict', '') };
  body.append(h('div', {}, cv), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sN.el, sCa.el, sA.el, sB.el, h('div', { class: 'btn-row' }, button('CJ-1 values', () => { sN.set(115000); sCa.set(165); sA.set(58); sB.set(60); upd(); }, 'small fire'))), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const st = steadyAt({ ...CJ1 }, CJ1.Ndesign, isa(0)), need = st.Pc / st.mg / CJ1.etaM / 1000;
  const ctx = cv.getContext('2d');
  function upd() {
    const N = sN.get(), Ca = sCa.get(), a2 = sA.get() * Math.PI / 180, b3 = sB.get() * Math.PI / 180;
    const Dm = 0.051, U = Math.PI * Dm * N / 60, Ct2 = Ca * Math.tan(a2), C2 = Ca / Math.cos(a2), Wt2 = Ct2 - U, W2 = Math.hypot(Ca, Wt2), Wt3 = -Ca * Math.tan(b3), Ct3 = U + Wt3, W3 = Ca / Math.cos(b3);
    const dh = U * (Ct2 - Ct3), M2 = C2 / Math.sqrt(1.333 * 287 * 1000 * 0.9);
    ro.U.set(U.toFixed(0)); ro.C2.set(C2.toFixed(0)); ro.M.set(M2.toFixed(2), M2 > 1 ? 'bad' : 'cool'); ro.dh.set((dh / 1000).toFixed(0)); ro.need.set(need.toFixed(0)); ro.sw.set(Ct3.toFixed(0)); ro.psi.set((dh / U / U).toFixed(2));
    const okv = Math.abs(dh / 1000 - need) / need < 0.1; ro.ok.set(dh / 1000 < need * 0.9 ? 'too weak: engine slows' : dh / 1000 > need * 1.1 ? 'surplus: it accelerates' : 'balanced ✔', okv ? 'good' : dh / 1000 < need ? 'bad' : 'fuel');
    const w = cv.clientWidth, hh = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    const cs = getComputedStyle(document.documentElement), col = (n) => cs.getPropertyValue(n).trim();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = col('--bg-2'); ctx.fillRect(0, 0, w, hh);
    const sc = Math.min(w / 2 * 0.8, hh * 0.78) / Math.max(U * 1.15, 320);
    const arrow = (x0, y0, x1, y1, c, lbl, dx = 5, dy = -5) => { const a = Math.atan2(y1 - y0, x1 - x0); ctx.strokeStyle = ctx.fillStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 9 * Math.cos(a - .4), y1 - 9 * Math.sin(a - .4)); ctx.lineTo(x1 - 9 * Math.cos(a + .4), y1 - 9 * Math.sin(a + .4)); ctx.closePath(); ctx.fill(); ctx.font = '700 12px sans-serif'; ctx.fillText(lbl, (x0 + x1) / 2 + dx, (y0 + y1) / 2 + dy); };
    // axes: x = tangential (direction of rotation to the right), y = axial (flow downward on screen)
    const tri = (ox, oy, title, C, Ct, W, Wt) => {
      ctx.fillStyle = col('--text'); ctx.font = '700 13px sans-serif'; ctx.fillText(title, ox - 10, 18);
      arrow(ox, oy, ox + Ct * sc, oy + Ca * sc, col('--fire'), `C ${C.toFixed(0)}`, 8, 0);
      arrow(ox, oy, ox + U * sc, oy, col('--fuel'), `U ${U.toFixed(0)}`, 0, -8);
      arrow(ox + U * sc, oy, ox + Ct * sc, oy + Ca * sc, col('--air'), `W ${W.toFixed(0)}`, 6, 4);
      ctx.strokeStyle = col('--muted'); ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + Ca * sc); ctx.stroke(); ctx.setLineDash([]);
    };
    tri(w * 0.08, 36, 'Rotor inlet (after the NGV)', C2, Ct2, W2, Wt2);
    tri(w * 0.58, 36, 'Rotor exit', Math.hypot(Ca, Ct3), Ct3, W3, Wt3);
    ctx.fillStyle = col('--muted'); ctx.font = '11px sans-serif'; ctx.fillText('→ direction of rotation (blade speed U)', w * 0.08, hh - 8); ctx.fillText('↓ gas flow along the axis', w * 0.58, hh - 8);
  }
  upd();
}
