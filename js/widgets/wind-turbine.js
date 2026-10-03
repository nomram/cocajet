// Wind-turbine power coefficient from a real blade-element-momentum (BEM) solver. How many blades?
import { h, shell, slider, readout } from '../ui.js';
import { Plot } from '../plot.js';

const LAMD = 7, ALD = 8 * Math.PI / 180, CLD = 2 * Math.PI * ALD;
function polar(alpha) {
  const as = 13 * Math.PI / 180;
  let Cl;
  if (Math.abs(alpha) <= as) Cl = 2 * Math.PI * alpha;
  else Cl = Math.sign(alpha) * (2 * Math.PI * as * Math.cos((Math.abs(alpha) - as) * 1.2) * 0.85 + 0 * 1) * Math.max(0.35, 1 - (Math.abs(alpha) - as) * 1.6) + 0.0;
  const Cd = 0.011 + 0.012 * Cl * Cl + (Math.abs(alpha) > as ? 1.1 * Math.sin(Math.abs(alpha)) ** 2 : 0);
  return [Cl, Cd];
}
/** Cp of a B-bladed rotor (Schmitz chord & twist designed for lambda = 7) at tip-speed ratio lam and pitch (deg) */
export function bemCp(B, lam, pitchDeg) {
  const nSec = 28, muH = 0.12, pitch = pitchDeg * Math.PI / 180;
  let cp = 0;
  for (let i = 0; i < nSec; i++) {
    const mu = muH + (1 - muH) * (i + 0.5) / nSec, dmu = (1 - muH) / nSec;
    const lrD = LAMD * mu, phiOpt = (2 / 3) * Math.atan(1 / lrD), chord = 8 * Math.PI * mu * Math.sin(phiOpt) / (3 * B * CLD * lrD), twist = phiOpt - ALD;
    const lr = lam * mu; let a = 0.25, ap = 0.02, F = 1, phi = 0.3, Cl = 0, Cd = 0.01;
    for (let it = 0; it < 120; it++) {
      phi = Math.atan2(1 - a, (1 + ap) * lr);
      const alpha = phi - twist - pitch; [Cl, Cd] = polar(alpha);
      const f = B / 2 * (1 - mu) / (mu * Math.max(0.02, Math.sin(phi))), fh = B / 2 * (mu - muH) / (mu * Math.max(0.02, Math.sin(phi)));
      F = Math.max(0.02, (2 / Math.PI) * Math.acos(Math.min(1, Math.exp(-f))) * (2 / Math.PI) * Math.acos(Math.min(1, Math.exp(-fh))));
      const sg = B * chord / (2 * Math.PI * mu), sp = Math.sin(phi), cph = Math.cos(phi);
      const Cn = Cl * cph + Cd * sp, Ct = Cl * sp - Cd * cph;
      let an = 1 / (4 * F * sp * sp / (sg * Cn) + 1);
      if (an > 0.4) { const CT = sg * (1 - a) * (1 - a) * Cn / (sp * sp); an = (18 * F - 20 - 3 * Math.sqrt(Math.max(0, CT * (50 - 36 * F) + 12 * F * (3 * F - 4)))) / (36 * F - 50); }
      let apn = 1 / (4 * F * sp * cph / (sg * Ct) - 1);
      if (!isFinite(an) || !isFinite(apn)) { an = a; apn = ap; }
      a += 0.35 * (Math.min(0.95, Math.max(-0.1, an)) - a); ap += 0.35 * (Math.max(-0.5, Math.min(2, apn)) - ap);
    }
    const sp = Math.sin(phi), cph = Math.cos(phi);
    const term = F * sp * sp * (cph - lr * sp) * (sp + lr * cph) * (1 - (Cd / Math.max(1e-3, Math.abs(Cl))) / Math.tan(phi)) * lr * lr;
    if (isFinite(term)) cp += 8 / (lam * lam) * term * lam * dmu;
  }
  return Math.max(0, Math.min(0.62, cp));
}

export default function init(el) {
  const { body } = shell(el, { title: 'Wind turbine: power coefficient, blade count and the Betz limit', note: 'A real blade-element-momentum solver (Prandtl tip-loss, Glauert correction, stall) with blades twisted and tapered for λ = 7. Cp = fraction of the wind’s power the rotor captures. No rotor can beat Betz’s 59.3 %: if it stopped all the air, nothing could flow through.' });
  const cv = h('canvas', { class: 'plot' }), rotor = h('canvas', { class: 'plot', style: { aspectRatio: '1', height: 'auto', maxWidth: '230px' } });
  const sB = slider({ label: 'Number of blades', min: 1, max: 6, step: 1, value: 3, fmt: v => v.toFixed(0), onInput: upd });
  const sL = slider({ label: 'Tip-speed ratio  λ = ωR / wind speed', min: 1, max: 12, step: 0.1, value: 7, fmt: v => v.toFixed(1), onInput: upd });
  const sP = slider({ label: 'Blade pitch offset', min: -6, max: 10, step: 0.5, value: 0, unit: '°', fmt: v => v.toFixed(1), onInput: upd });
  const sR = slider({ label: 'Rotor radius', min: 0.5, max: 60, step: 0.5, value: 20, unit: 'm', fmt: v => v.toFixed(1), log: true, onInput: upd });
  const sW = slider({ label: 'Wind speed', min: 3, max: 25, step: 0.5, value: 10, unit: 'm/s', fmt: v => v.toFixed(1), onInput: upd });
  const ro = { cp: readout('Power coefficient Cp', '', 'good'), P: readout('Electrical-ish power (Cp only)', 'kW', 'fuel'), rpm: readout('Rotor speed', 'rpm', 'cool'), tip: readout('Tip speed', 'm/s', 'hot'), pct: readout('Share of Betz limit', '%') };
  body.append(h('div', { class: 'wgrid' }, cv, h('div', { class: 'ctls' }, rotor, sB.el, sL.el, sP.el)), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sR.el, sW.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const p = new Plot(cv, { xmin: 0, xmax: 12, ymin: 0, ymax: 0.65, xlabel: 'tip-speed ratio λ', ylabel: 'power coefficient Cp', aspect: 1.3, title: 'Cp(λ) for 1–6 blades' });
  const rctx = rotor.getContext('2d'); let ang = 0, last = performance.now(), vis = true; new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(rotor);
  const cache = {}; const curve = (B, pitch) => { const k = B + ':' + pitch; if (!cache[k]) { const xs = [], ys = []; for (let l = 1; l <= 12.01; l += 0.4) { xs.push(l); ys.push(bemCp(B, l, pitch)); } cache[k] = { xs, ys }; } return cache[k]; };
  function upd() {
    const B = sB.get(), lam = sL.get(), pitch = sP.get(), R = sR.get(), W = sW.get();
    const cpv = bemCp(B, lam, pitch), rho = 1.225, P = 0.5 * rho * Math.PI * R * R * W ** 3 * cpv;
    ro.cp.set(cpv.toFixed(3)); ro.P.set((P / 1000).toFixed(P > 1e5 ? 0 : 1)); ro.rpm.set((lam * W / R * 60 / (2 * Math.PI)).toFixed(lam * W / R * 9.55 < 10 ? 1 : 0)); ro.tip.set((lam * W).toFixed(0), lam * W > 100 ? 'bad' : 'hot'); ro.pct.set((cpv / 0.593 * 100).toFixed(0));
    const c = p.begin().col; p.axes();
    p.hline(16 / 27, { color: c.bad, label: 'Betz limit 0.593', align: 'right' });
    const cols = [c.muted, c.violet, c.fire, c.fuel, c.ok, c.air];
    for (let b = 1; b <= 6; b++) { const { xs, ys } = curve(b, pitch); p.line(xs, ys, { color: b === B ? c.strong : cols[b - 1], width: b === B ? 3.4 : 1.6, alpha: b === B ? 1 : 0.65 }); const k = ys.indexOf(Math.max(...ys)); p.text(xs[k], ys[k] + 0.012, String(b), { color: b === B ? c.strong : cols[b - 1], align: 'center', size: 11, base: 'bottom' }); }
    p.dot(lam, cpv, { color: c.fire, r: 6 });
    p.text(0.3, 0.6, 'numbers = blades', { color: c.muted, size: 11 });
    p.set({ ymax: 0.65 });
  }
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!vis) return;
    const B = sB.get(), lam = sL.get(), R = sR.get(), W = sW.get(), rpm = lam * W / R * 9.55; ang += Math.min(5, rpm / 60 * 2 * Math.PI) * 0.35 * dt * 6 * 0.25;
    const w = rotor.clientWidth, hh = rotor.clientHeight, dpr = Math.min(2, devicePixelRatio || 1); if (rotor.width !== Math.round(w * dpr)) { rotor.width = Math.round(w * dpr); rotor.height = Math.round(hh * dpr); }
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0); const cs = getComputedStyle(document.documentElement); rctx.fillStyle = cs.getPropertyValue('--bg-2'); rctx.fillRect(0, 0, w, hh);
    rctx.translate(w / 2, hh / 2);
    rctx.strokeStyle = cs.getPropertyValue('--muted'); rctx.lineWidth = 3; rctx.beginPath(); rctx.moveTo(0, 0); rctx.lineTo(0, hh * 0.46); rctx.stroke();
    rctx.fillStyle = cs.getPropertyValue('--text');
    for (let i = 0; i < B; i++) { rctx.save(); rctx.rotate(ang + i * 2 * Math.PI / B); rctx.beginPath(); rctx.moveTo(-3, -6); rctx.quadraticCurveTo(-w * 0.06, -hh * 0.2, -1, -hh * 0.42); rctx.quadraticCurveTo(4, -hh * 0.2, 4, -6); rctx.closePath(); rctx.fillStyle = cs.getPropertyValue('--air'); rctx.fill(); rctx.restore(); }
    rctx.beginPath(); rctx.arc(0, 0, 7, 0, 7); rctx.fillStyle = cs.getPropertyValue('--text'); rctx.fill(); rctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  p.onDraw(upd); upd(); requestAnimationFrame(frame);
}
