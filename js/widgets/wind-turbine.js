// Wind turbine: blade-element-momentum (BEM) model for 1-12 blades and any design tip-speed ratio, plus a drawn, animated rotor.
import { h, shell, slider, readout, button, whenVisible, cssVar, clamp } from '../ui.js';
import { Plot } from '../plot.js';

const D2R = Math.PI / 180, ALD = 8 * D2R, RHO = 1.225, BETZ = 16 / 27;
const smooth = t => t * t * (3 - 2 * t);

/** Lift and drag of a blade section. q = 0: precision airfoil ... 1: curved sheet metal. Linear lift, stall, then flat-plate (Viterna) post-stall. */
export function polar(alpha, q = 0) {
  const a0 = (2 + 3 * q) * D2R, sl = 6.2 - 0.7 * q, bs = (14 - 3 * q) * D2R, cd0 = 0.008 + 0.034 * q, k = 0.006 + 0.014 * q;
  let b = alpha + a0; const s = b < 0 ? -1 : 1; b = Math.min(Math.abs(b), Math.PI / 2);
  if (b <= bs) { const cl = sl * b; return [s * cl, cd0 + k * cl * cl]; }
  const cls = sl * bs, cds = cd0 + k * cls * cls, CDM = 2, sb = Math.sin(bs), cb = Math.cos(bs), sn = Math.max(Math.sin(b), 1e-3);
  const A2 = (cls - CDM * sb * cb) * sb / (cb * cb), B2 = (cds - CDM * sb * sb) / cb;
  return [s * (CDM / 2 * Math.sin(2 * b) + A2 * Math.cos(b) ** 2 / sn), CDM * sn * sn + B2 * Math.cos(b)];
}

const gcache = new Map();
/** Betz-Schmitz blade for B blades and design tip-speed ratio lamD: chord/R and twist (rad) at 28 stations. Chord is capped at what a real blade can be (local solidity <= 0.75, root chord <= ~0.1 R for fast rotors). */
export function blade(B, lamD) {
  const key = B + ':' + lamD; let g = gcache.get(key); if (g) return g;
  const q = 1 / (1 + (lamD / 2.5) ** 3), muH = 0.10 + 0.20 * Math.exp(-lamD / 2), n = 28, cld = polar(ALD, q)[0], mu = [], chord = [], twist = [];
  for (let i = 0; i < n; i++) {
    const m = muH + (1 - muH) * (i + 0.5) / n, lr = lamD * m, phi = (2 / 3) * Math.atan(1 / lr);
    mu.push(m); chord.push(Math.min(8 * Math.PI * m * Math.sin(phi) / (3 * B * cld * lr), 0.75 * 2 * Math.PI * m / B, 0.09 + 0.31 * Math.exp(-lamD / 2))); twist.push(phi - ALD);
  }
  g = { B, lamD, q, muH, n, dmu: (1 - muH) / n, mu, chord, twist, sol: B / Math.PI * chord.reduce((s, c) => s + c, 0) * (1 - muH) / n };
  if (gcache.size > 300) gcache.clear();
  gcache.set(key, g); return g;
}

/** Cp of a B-bladed rotor (chord and twist designed for lamD) at tip-speed ratio lam and pitch offset (deg). Prandtl tip + hub loss, Buhl high-load correction. */
export function bemCp(B, lam, pitchDeg, lamD = 7) {
  const g = blade(B, lamD), pitch = pitchDeg * D2R; let cp = 0;
  for (let i = 0; i < g.n; i++) {
    const mu = g.mu[i], c = g.chord[i], twist = g.twist[i], lr = lam * mu, sg = B * c / (2 * Math.PI * mu);
    let a = 0.25, ap = 0.02, F = 1, phi = 0.3, Cl = 0, Cd = 0.01;
    for (let it = 0; it < 80; it++) {
      phi = Math.atan2(1 - a, (1 + ap) * lr); const sp = Math.max(0.02, Math.sin(phi)), cph = Math.cos(phi);
      [Cl, Cd] = polar(phi - twist - pitch, g.q);
      F = Math.max(0.02, (2 / Math.PI) * Math.acos(Math.exp(-Math.min(30, B / 2 * (1 - mu) / (mu * sp)))) * (2 / Math.PI) * Math.acos(Math.exp(-Math.min(30, B / 2 * (mu - g.muH) / (mu * sp)))));
      const Cn = Cl * cph + Cd * sp, Ct = Cl * sp - Cd * cph;
      let an = 1 / (4 * F * sp * sp / (sg * Cn) + 1);
      if (an > 0.4) { const CT = sg * (1 - a) * (1 - a) * Cn / (sp * sp); an = (18 * F - 20 - 3 * Math.sqrt(Math.max(0, CT * (50 - 36 * F) + 12 * F * (3 * F - 4)))) / (36 * F - 50); }
      let apn = 1 / (4 * F * sp * cph / (sg * Ct) - 1);
      if (!isFinite(an) || !isFinite(apn)) { an = a; apn = ap; }
      an = clamp(an, -0.1, 0.95); apn = clamp(apn, -0.5, 2);
      const da = an - a, dp = apn - ap; a += 0.35 * da; ap += 0.35 * dp;
      if (Math.abs(da) < 2e-5 && Math.abs(dp) < 2e-5) break;
    }
    const sp = Math.max(0.02, Math.sin(phi)), cph = Math.cos(phi), d = lam / Math.PI * B * ((1 - a) / sp) ** 2 * c * (Cl * sp - Cd * cph) * mu * g.dmu;
    if (isFinite(d)) cp += d;
  }
  return clamp(cp, 0, 0.62);
}

/** Torque coefficient Q / (½ρv²πR³) of the standing rotor (flow straight through, wake blockage from the rotor's own drag) */
export function startCq(B, pitchDeg, lamD) {
  const g = blade(B, lamD), pitch = pitchDeg * D2R, f = []; let a = 0, cq = 0;
  for (let i = 0; i < g.n; i++) { const [cl, cd] = polar(Math.PI / 2 - g.twist[i] - pitch, g.q); f.push([g.mu[i], g.chord[i], cl, cd]); }
  for (let k = 0; k < 4; k++) { let ct = 0; for (const [, c, , cd] of f) ct += B / Math.PI * c * cd * (1 - a) ** 2 * g.dmu; a = (1 - Math.sqrt(1 - Math.min(0.95, ct))) / 2; }
  for (const [m, c, cl] of f) cq += B / Math.PI * c * cl * m * (1 - a) ** 2 * g.dmu;
  return cq;
}

export const xmaxOf = lamD => Math.max(3, Math.ceil(1.9 * lamD));
/** smoothed Cp(lambda) curve on an even grid 0..xmax (the BEM is slightly ragged in deep stall) */
export function cpCurve(B, pitch, lamD, N = 50) {
  const xmax = xmaxOf(lamD), xs = [], raw = [];
  for (let i = 0; i <= N; i++) { const l = xmax * i / N; xs.push(l); raw.push(i ? bemCp(B, l, pitch, lamD) : 0); }
  let ys = raw;
  for (let pass = 0; pass < (lamD < 3.5 ? 2 : 1); pass++) ys = ys.map((y, i) => i === 0 ? 0 : (ys[i - 1] + 2 * y + ys[Math.min(N, i + 1)]) / 4);
  const k = ys.indexOf(Math.max(...ys)), y0 = ys[Math.max(0, k - 1)], y1 = ys[k], y2 = ys[Math.min(N, k + 1)], den = y0 - 2 * y1 + y2;
  const dk = k > 0 && k < N && den < 0 ? clamp(0.5 * (y0 - y2) / den, -0.5, 0.5) : 0;
  return { xs, ys, xmax, N, peak: Math.max(y1 - 0.25 * (y0 - y2) * dk, y1), lamOpt: xs[k] + dk * xmax / N, at(l) { const t = clamp(l / xmax * N, 0, N), i = Math.min(N - 1, Math.floor(t)); return ys[i] + (ys[i + 1] - ys[i]) * (t - i); } };
}

const theme = () => ({ bg: cssVar('--bg-2'), air: cssVar('--air'), air2: cssVar('--air-2'), text: cssVar('--text'), t2: cssVar('--text-2'), muted: cssVar('--muted'), line: cssVar('--line-2'), p3: cssVar('--panel-3') });
export function rrect(ctx, x, y, w, hh, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, hh, r); else ctx.rect(x, y, w, hh); }
/** animation speed: true speed up to ~24 rpm, then softly saturating at ~57 rpm so that fast rotors do not alias (wagon-wheel effect) */
export const slowRot = om => { const w0 = 2.5, wm = 6; return om <= w0 ? om : w0 + (wm - w0) * (1 - Math.exp(-(om - w0) / (wm - w0))); };

/** Draw a 3/4 view of a horizontal-axis turbine (tower, nacelle, hub, B tapered+twisted blades from the real design). ang = rotor angle, clockwise seen from upwind. */
export function drawTurbine(ctx, w, hh, { B, lamD, ang, t = theme(), cx = 0.45 * w, cy = 0.4 * hh, R = Math.min(0.37 * w, 0.33 * hh), yaw = 0.9 }) {
  const g = blade(B, lamD), gy = hh * 0.93;
  ctx.fillStyle = t.p3; ctx.globalAlpha = 0.55; ctx.fillRect(0, gy, w, hh - gy); ctx.globalAlpha = 1;
  ctx.strokeStyle = t.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
  const tx = cx + 0.13 * R, tw0 = 0.04 * R, tw1 = 0.085 * R, gt = ctx.createLinearGradient(tx - tw1, 0, tx + tw1, 0);
  gt.addColorStop(0, t.line); gt.addColorStop(0.45, t.muted); gt.addColorStop(1, t.line);
  ctx.fillStyle = gt; ctx.beginPath(); ctx.moveTo(tx - tw0, cy); ctx.lineTo(tx + tw0, cy); ctx.lineTo(tx + tw1, gy); ctx.lineTo(tx - tw1, gy); ctx.closePath(); ctx.fill();
  const gn = ctx.createLinearGradient(0, cy - 0.08 * R, 0, cy + 0.08 * R); gn.addColorStop(0, t.t2); gn.addColorStop(1, t.muted);
  ctx.fillStyle = gn; rrect(ctx, cx - 0.04 * R, cy - 0.08 * R, 0.4 * R, 0.16 * R, 0.07 * R); ctx.fill(); ctx.strokeStyle = t.line; ctx.lineWidth = 1; ctx.stroke();
  // planform in rotor-plane coordinates (units of R): projected chord = c cos(twist), round root blending into the aerofoil part
  const wi = g.chord.map((c, i) => c * Math.cos(g.twist[i])), rootW = clamp(0.5 * wi[0], 0.025, 0.07), pts = [[0.05, rootW], [g.muH, rootW]];
  for (let i = 0; i < g.n; i++) { const s = smooth(clamp((g.mu[i] - g.muH) / 0.14, 0, 1)); pts.push([g.mu[i], rootW * (1 - s) + wi[i] * s]); }
  pts.push([1, pts[pts.length - 1][1] * 0.3]);
  const wmax = Math.max(...pts.map(p => p[1])), gb = ctx.createLinearGradient(0.3 * wmax * R, 0, -0.7 * wmax * R, 0); gb.addColorStop(0, t.air); gb.addColorStop(1, t.air2);
  for (let k = 0; k < B; k++) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(yaw, 1); ctx.rotate(ang + k * 2 * Math.PI / B);
    if (B === 1) { ctx.fillStyle = t.muted; ctx.fillRect(-0.02 * R, 0, 0.04 * R, 0.2 * R); rrect(ctx, -0.07 * R, 0.2 * R, 0.14 * R, 0.1 * R, 0.02 * R); ctx.fill(); }
    ctx.beginPath(); pts.forEach(([m, wd], i) => { const x = 0.3 * wd * R, y = -m * R; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(-0.7 * pts[i][1] * R, -pts[i][0] * R);
    ctx.closePath(); ctx.fillStyle = gb; ctx.fill(); ctx.lineJoin = 'round'; ctx.strokeStyle = t.text; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 0.25; ctx.beginPath(); for (let i = 4; i < pts.length - 1; i += 4) { const [m, wd] = pts[i]; ctx.moveTo(0.3 * wd * R, -m * R); ctx.lineTo(-0.7 * wd * R, -m * R); }
    ctx.moveTo(0, -0.05 * R); ctx.lineTo(0, -0.97 * R); ctx.stroke(); ctx.globalAlpha = 1; ctx.restore();
  }
  const gs = ctx.createRadialGradient(cx - 0.03 * R, cy - 0.03 * R, 0, cx, cy, 0.1 * R); gs.addColorStop(0, t.text); gs.addColorStop(1, t.muted);
  ctx.fillStyle = gs; ctx.beginPath(); ctx.ellipse(cx, cy, 0.085 * R * yaw + 0.01 * R, 0.085 * R, 0, 0, 7); ctx.fill(); ctx.strokeStyle = t.line; ctx.lineWidth = 1; ctx.stroke();
}

const PRESETS = [['Modern 3-blade', 3, 7, 40, 10], ['2-blade, fast', 2, 9, 40, 10], ['Single blade', 1, 9, 40, 10], ['4-blade, slow (λd 2)', 4, 2, 24, 8], ['Farm windmill (12, λd 1)', 12, 1, 5, 6]];
const fmtW = P => P >= 1e6 ? (P / 1e6).toFixed(2) + ' MW' : P >= 1e4 ? (P / 1e3).toFixed(0) + ' kW' : P >= 1e3 ? (P / 1e3).toFixed(1) + ' kW' : P.toFixed(0) + ' W';
const fmtQ = Q => Math.abs(Q) >= 1e4 ? (Q / 1e3).toFixed(0) + ' kN·m' : Math.abs(Q) >= 1e3 ? (Q / 1e3).toFixed(1) + ' kN·m' : Q.toFixed(Q < 10 ? 1 : 0) + ' N·m';

export default function init(el) {
  const { body } = shell(el, { title: 'Wind turbine: blade count, design tip-speed ratio and the Betz limit', note: 'A real blade-element-momentum solver: Betz-Schmitz chord and twist re-designed for the design tip-speed ratio λd you choose, Prandtl tip loss (it depends on the blade count), Buhl high-load correction, lift curve with stall and drag. Fast rotors get precision airfoils; slow ones (λd below about 3) get curved sheet-metal blades with more drag, and chords are capped (local solidity at most 0.75, a fast rotor’s chord at about 10 % of the radius): blades cannot overlap and cannot be infinitely wide. Cp = share of the wind’s power captured; nothing can beat Betz’s 59.3 %. Animation: true rotor speed up to about 24 rpm, faster rotors are slowed (soft cap near 57 rpm) so the spokes do not alias (wagon-wheel effect).' });
  const cv = h('canvas', { class: 'plot' }), rotor = h('canvas', { class: 'plot', style: { aspectRatio: '1.05', height: 'auto' } }), cvB = h('canvas', { class: 'plot' }), cvG = h('canvas', { class: 'plot' });
  const sB = slider({ label: 'Number of blades', min: 1, max: 12, step: 1, value: 3, fmt: v => v.toFixed(0), onInput: dsg });
  const sD = slider({ label: 'Design tip-speed ratio λd (what the blade shape is made for)', min: 1, max: 12, step: 0.5, value: 7, fmt: v => v.toFixed(1), onInput: dsg });
  const sP = slider({ label: 'Blade pitch offset', min: -6, max: 10, step: 0.5, value: 0, unit: '°', fmt: v => v.toFixed(1), onInput: upd });
  const sL = slider({ label: 'Operating tip-speed ratio  λ = ωR / wind speed', min: 0.2, max: xmaxOf(7), step: 0.1, value: 7, fmt: v => v.toFixed(1), onInput: upd });
  const sR = slider({ label: 'Rotor diameter', min: 1, max: 120, step: 0.5, value: 40, unit: 'm', fmt: v => v.toFixed(v < 10 ? 1 : 0), log: true, onInput: upd });
  const sW = slider({ label: 'Wind speed', min: 3, max: 25, step: 0.5, value: 10, unit: 'm/s', fmt: v => v.toFixed(1), onInput: upd });
  const ro = { cp: readout('Power coefficient Cp', '', 'good'), pk: readout('Peak Cp @ best speed', '', 'cool'), pct: readout('Share of Betz limit', '%'), gain: readout('Gain of the last blade', '', 'fuel'), sol: readout('Solidity (blade area ÷ disc)', '%'), P: readout('Rotor power', '', 'fuel'), Q: readout('Shaft torque', '', 'cool'), rpm: readout('Rotor speed', 'rpm', 'cool'), tip: readout('Tip speed', 'm/s', 'hot'), q0: readout('Starting torque (standing)', '', 'hot'), qr: readout('Start ÷ running torque', '×') };
  const presets = h('div', { class: 'btn-row' }, PRESETS.map(([n, B, ld, D, W]) => button(n, () => { sB.set(B); sD.set(ld); sR.set(D); sW.set(W); sP.set(0); dsg(); }, 'small')));
  body.append(presets, h('div', { class: 'wgrid even', style: { marginTop: '12px' } }, rotor, cv), h('div', { class: 'wgrid even', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sB.el, sD.el, sP.el), h('div', { class: 'ctls' }, sL.el, sR.el, sW.el)),
    h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), h('div', { class: 'wgrid even', style: { marginTop: '12px' } }, cvB, cvG));
  const p = new Plot(cv, { xmin: 0, xmax: 14, ymin: 0, ymax: 0.65, xlabel: 'tip-speed ratio λ', ylabel: 'power coefficient Cp', aspect: 1.05, title: 'Cp(λ); numbers = blade count' });
  const pb = new Plot(cvB, { xmin: 0.5, xmax: 12.5, ymin: 0, ymax: 0.65, xticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], xlabel: 'number of blades', ylabel: 'peak Cp', aspect: 1.5, title: 'Peak Cp vs blade count' });
  const pg = new Plot(cvG, { xmin: 0, xmax: 1, ymin: 0, ymax: 60, xlabel: 'radius  r / R', ylabel: 'chord (% of R) and twist (°)', aspect: 1.5, title: 'Blade shape for this design' });
  const cache = new Map(), key = b => b + '|' + sP.get() + '|' + sD.get(), curve = b => { const k = key(b); let c = cache.get(k); if (!c) { if (cache.size > 400) cache.clear(); c = cpCurve(b, sP.get(), sD.get()); cache.set(k, c); } return c; }, cached = b => cache.get(key(b));
  let timer = 0;
  const lazy = () => { clearTimeout(timer); timer = setTimeout(function step() { const b = [...Array(12).keys()].map(i => i + 1).find(i => !cached(i)); if (!b) return; curve(b); drawPlots(); timer = setTimeout(step, 0); }, 120); };
  function dsg() { const ld = sD.get(); sL.input.max = xmaxOf(ld); sL.set(ld); upd(); }
  let S = { B: 3, lam: 7, R: 20, W: 10, lamD: 7 }, info = '';
  function upd() {
    const B = sB.get(), lamD = sD.get(), lam = sL.get(), R = sR.get() / 2, W = sW.get(), pitch = sP.get(), cur = curve(B);
    const cpv = cur.at(lam), P = 0.5 * RHO * Math.PI * R * R * W ** 3 * cpv, om = lam * W / R, cq0 = startCq(B, pitch, lamD), Q0 = cq0 * 0.5 * RHO * W * W * Math.PI * R ** 3, cqRun = cur.at(lamD) / lamD;
    S = { B, lam, R, W, lamD }; const prev = B > 1 ? curve(B - 1).peak : null;
    ro.cp.set(cpv.toFixed(3)); ro.pk.set(`${cur.peak.toFixed(3)} @ ${cur.lamOpt.toFixed(1)}`); ro.pct.set((cpv / BETZ * 100).toFixed(0)); ro.gain.set(prev == null ? '–' : (cur.peak - prev >= 0 ? '+' : '') + (cur.peak - prev).toFixed(3));
    ro.sol.set((blade(B, lamD).sol * 100).toFixed(blade(B, lamD).sol < 0.1 ? 1 : 0)); ro.P.set(fmtW(P)); ro.Q.set(om > 0 ? fmtQ(P / om) : '–'); ro.rpm.set((om * 60 / (2 * Math.PI)).toFixed(om * 9.55 < 10 ? 1 : 0));
    ro.tip.set((lam * W).toFixed(0), lam * W > 100 ? 'bad' : 'hot'); ro.q0.set(fmtQ(Q0)); ro.qr.set(cqRun > 1e-4 ? (cq0 / cqRun).toFixed(cq0 / cqRun < 0.1 ? 2 : 1) : '–', cq0 / cqRun < 0.15 ? 'bad' : cq0 / cqRun < 0.6 ? 'hot' : 'good');
    info = `λ = ${lam.toFixed(1)}   ${(om * 60 / (2 * Math.PI)).toFixed(om * 9.55 < 10 ? 1 : 0)} rpm` + (om > 1.1 * slowRot(om) ? `   (animation slowed ×${(om / slowRot(om)).toFixed(0)})` : '');
    drawPlots(); lazy();
  }
  function drawPlots() {
    const B = sB.get(), lamD = sD.get(), lam = sL.get(), cur = curve(B), cpv = cur.at(lam);
    let c = p.set({ xmax: cur.xmax }).begin().col; p.axes();
    p.hline(BETZ, { color: c.bad, label: 'Betz limit 0.593', align: 'left' }); p.vline(lamD, { color: c.muted, alpha: 0.7, label: 'design λd' });
    for (let b = 1; b <= 12; b++) { const cc = b === B ? cur : cached(b); if (!cc || b === B) continue; p.line(cc.xs, cc.ys, { color: c.muted, width: 1.4, alpha: 0.55 }); if ([1, 2, 3, 4, 6, 8, 12].includes(b)) p.text(cc.lamOpt, cc.peak + 0.012, String(b), { color: c.muted, align: 'center', size: 11, base: 'bottom' }); }
    p.line(cur.xs, cur.ys, { color: c.fire, width: 3.4 }); p.text(cur.lamOpt, cur.peak + 0.012, String(B), { color: c.fire, align: 'center', size: 12, base: 'bottom' });
    p.dot(lam, cpv, { color: c.fuel, r: 6 });
    c = pb.begin().col; pb.axes(); pb.hline(BETZ, { color: c.bad, label: 'Betz 0.593', align: 'right' });
    const xs = [], ys = []; for (let b = 1; b <= 12; b++) { const cc = cached(b); if (cc) { xs.push(b); ys.push(cc.peak); } }
    pb.line(xs, ys, { color: c.air, width: 2.4 }); pb.points(xs, ys, { color: c.air, r: 3.5 }); pb.dot(B, cur.peak, { color: c.fire, r: 6 });
    pb.text(Math.min(B + 0.4, 9.5), cur.peak - 0.045, cur.peak.toFixed(3), { color: c.fire, base: 'top' });
    c = pg.begin().col; const g = blade(B, lamD), ch = g.chord.map(x => x * 100), tw = g.twist.map(x => x / D2R), top = Math.max(10, Math.ceil(Math.max(...ch, ...tw) / 10) * 10 + 5); pg.set({ ymax: top, xmin: 0 }); pg.axes();
    pg.line(g.mu, ch, { color: c.air, width: 2.8 }); pg.line(g.mu, tw, { color: c.fire, width: 2.8 }); pg.band(0, g.muH, { color: c.muted, alpha: 0.12 }); pg.text(g.muH / 2, top * 0.5, 'hub', { color: c.muted, align: 'center', size: 11 });
    pg.legend([[c.air, 'chord, % of R'], [c.fire, 'twist, degrees']], { pos: 'tr' });
  }
  const rctx = rotor.getContext('2d'), vis = whenVisible(rotor, () => {}), still = matchMedia('(prefers-reduced-motion: reduce)').matches; let ang = 0.4, last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min(0.04, (now - last) / 1000); last = now; if (!vis()) return;
    const om = S.lam * S.W / S.R; if (!still) ang += slowRot(om) * dt;
    const w = rotor.clientWidth, hh = rotor.clientHeight, dpr = Math.min(2, devicePixelRatio || 1); if (!w || !hh) return;
    if (rotor.width !== Math.round(w * dpr) || rotor.height !== Math.round(hh * dpr)) { rotor.width = Math.round(w * dpr); rotor.height = Math.round(hh * dpr); }
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0); const t = theme(); rctx.fillStyle = t.bg; rctx.fillRect(0, 0, w, hh);
    drawTurbine(rctx, w, hh, { B: S.B, lamD: S.lamD, ang, t });
    rctx.font = '600 12px ui-sans-serif, system-ui, sans-serif'; rctx.fillStyle = t.t2; rctx.textBaseline = 'top'; rctx.textAlign = 'left'; rctx.fillText(info, 10, 8);
    rctx.fillStyle = t.muted; rctx.font = '11px ui-sans-serif, system-ui, sans-serif'; rctx.fillText(`${S.B} blade${S.B > 1 ? 's' : ''}, designed for λd = ${S.lamD}`, 10, 25);
  }
  [p, pb, pg].forEach(q => q.onDraw(drawPlots)); dsg(); requestAnimationFrame(frame);
}
