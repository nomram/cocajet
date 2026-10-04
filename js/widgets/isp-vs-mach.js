// Which engine for which speed? Ideal-cycle specific impulse of turbojet and ramjet vs Mach, against textbook bands for scramjets and rockets, and propulsive efficiency vs speed.
import { h, shell, slider, select, toggle, readout, legend } from '../ui.js';
import { Plot } from '../plot.js';

const CP = 1004, G = 1.4, FUELS = { hc: { n: 'hydrocarbon (propane, kerosene): 43 MJ/kg', hv: 43e6 }, h2: { n: 'hydrogen: 120 MJ/kg', hv: 120e6 } };
const T_ISA = (hkm) => hkm <= 11 ? 288.15 - 6.5 * hkm : 216.65;
export default function init(el) {
  const { body } = shell(el, { title: 'Which engine at which speed? Specific impulse and efficiency vs flight speed', note: 'Each engine family has a speed band where it is the best choice. The <span style="color:var(--fire);font-weight:700">turbojet</span> needs air to be slowed and squeezed by a compressor (and is limited by how hot that air becomes); the <span style="color:var(--fuel);font-weight:700">ramjet</span> uses the vehicle’s own speed as the compressor but cannot start from rest; the <span style="color:var(--violet);font-weight:700">scramjet</span> keeps the air supersonic through the burner and works at hypersonic speed; the <span style="color:var(--air);font-weight:700">rocket</span> carries its oxidiser and works anywhere, at 10–20× the propellant consumption. Jet and ramjet curves are the ideal (loss-free) cycle times a realism factor; the scramjet and rocket bands are typical textbook ranges.' });
  const cvA = h('canvas', { class: 'plot' }), cvB = h('canvas', { class: 'plot' });
  const sAl = slider({ label: 'Altitude', min: 0, max: 25, step: 0.5, value: 11, unit: 'km', fmt: v => v.toFixed(1), onInput: upd });
  const sT = slider({ label: 'Turbine inlet / burner exit temperature', min: 1000, max: 2300, step: 10, value: 1700, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const sPi = slider({ label: 'Compressor pressure ratio (turbojet)', min: 2, max: 40, step: 0.5, value: 12, fmt: v => v.toFixed(1), onInput: upd });
  const sTc = slider({ label: 'Compressor outlet temperature limit', min: 700, max: 1100, step: 10, value: 900, unit: 'K', fmt: v => v.toFixed(0), onInput: upd });
  const sF = select({ label: 'Fuel', options: Object.entries(FUELS).map(([k, v]) => [k, v.n]), value: 'hc', onChange: upd });
  const sR = slider({ label: 'Realism factor (real engine ÷ ideal cycle)', min: 0.4, max: 1, step: 0.01, value: 0.62, fmt: v => v.toFixed(2), onInput: upd });
  const ro = { a: readout('Speed of sound at this altitude', 'm/s', 'cool'), tj: readout('Turbojet works up to', 'Mach', 'fuel'), rj: readout('Ramjet ideal peak Isp near', 'Mach', 'cool') };
  body.append(h('div', { class: 'wgrid even' }, cvA, cvB), legend([['var(--ok)', 'turbofan, Ve ≈ 350 m/s'], ['var(--fire)', 'turbojet (CJ-1), Ve ≈ 570 m/s'], ['var(--air)', 'chemical rocket, Ve ≈ 3 000 m/s'], ['var(--violet)', 'ion thruster, Ve ≈ 30 000 m/s']]), h('div', { class: 'wgrid', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sAl.el, sT.el, sPi.el, sTc.el, sF.el, sR.el), h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el))));
  const pA = new Plot(cvA, { xmin: 0, xmax: 12, ymin: 100, ymax: 20000, ylog: true, aspect: 1.45, xlabel: 'flight Mach number', ylabel: 'specific impulse Isp (s)', title: 'Isp vs Mach number', margin: { l: 54, r: 12, t: 28, b: 40 }, xticks: [0, 2, 4, 6, 8, 10, 12] });
  const pB = new Plot(cvB, { xmin: 20, xmax: 20000, xlog: true, ymin: 0, ymax: 1.05, aspect: 1.45, xlabel: 'flight speed (m/s, log scale)', ylabel: 'propulsive efficiency', title: 'Propulsive efficiency vs speed', margin: { l: 52, r: 12, t: 28, b: 40 }, ytickFmt: v => Math.round(v * 100) + '%', xtickFmt: v => v >= 1000 ? (v / 1000) + 'k' : String(v) });
  function jetIsp(M, T0, o) {
    const hPR = FUELS[o.fuel].hv, tr = 1 + (G - 1) / 2 * M * M, tl = o.Tt4 / T0, a0 = Math.sqrt(G * 287 * T0);
    const out = {};
    const tc = Math.pow(o.pi, (G - 1) / G);
    if (T0 * tr * tc <= o.Tc && tr * tc < tl) {                          // turbojet: compressor exit temperature limit
      const tt = 1 - tr / tl * (tc - 1), V9 = a0 * Math.sqrt(2 / (G - 1) * tl / (tr * tc) * (tr * tc * tt - 1)), f = CP * T0 * (tl - tr * tc) / hPR;
      if (V9 > a0 * M) out.tj = (V9 - a0 * M) / (f * 9.80665) * o.k;
    }
    if (tr < tl && M >= 1.2) { const F = a0 * M * (Math.sqrt(tl / tr) - 1), f = CP * T0 * (tl - tr) / hPR; if (F > 0) out.rj = F / (f * 9.80665) * o.k; }
    return out;
  }
  function upd() {
    const hk = sAl.get(), T0 = T_ISA(hk), a0 = Math.sqrt(G * 287 * T0), o = { Tt4: sT.get(), pi: sPi.get(), Tc: sTc.get(), fuel: sF.get(), k: sR.get() };
    const xs = [], tj = [], rj = []; let tjMax = 0, rjBest = [0, 0];
    for (let M = 0; M <= 12.001; M += 0.1) { const r = jetIsp(M, T0, o); if (r.tj) { tj.push([M, r.tj]); tjMax = M; } if (r.rj) { rj.push([M, r.rj]); if (r.rj > rjBest[1]) rjBest = [M, r.rj]; } }
    ro.a.set(a0.toFixed(0)); ro.tj.set(tjMax.toFixed(1)); ro.rj.set(rjBest[1] ? rjBest[0].toFixed(1) : '–');
    let c = pA.begin().col; pA.axes();
    // textbook bands
    const band = (m0, m1, y0, y1, col, label) => { const ctx = pA.ctx; ctx.save(); ctx.globalAlpha = .17; ctx.fillStyle = col; ctx.fillRect(pA.X(m0), pA.Y(y1), pA.X(m1) - pA.X(m0), pA.Y(y0) - pA.Y(y1)); ctx.restore(); pA.text(m0 + 0.2, y1 * 0.82, label, { color: col, align: 'left', size: 11, weight: 700 }); };
    band(0, 12, 250, 460, c.air, 'chemical rocket'); band(5, 12, 1000, 4000, c.violet, 'H₂ scramjet (typical)');
    if (tj.length) pA.line(tj.map(p => p[0]), tj.map(p => p[1]), { color: c.fire, width: 3.2 }); if (rj.length) pA.line(rj.map(p => p[0]), rj.map(p => p[1]), { color: c.fuel, width: 3.2 });
    if (tj.length) pA.text(tj[0][0] + 0.15, tj[0][1] * 1.28, 'turbojet', { color: c.fire, weight: 800 }); if (rj.length) pA.text(rj[0][0] + 0.1, rj[0][1] * 0.78, 'ramjet', { color: c.fuel, weight: 800 });
    pA.dot(0, 2070, { color: c.fire, r: 7 }); pA.text(0.25, 2070 * 0.74, 'CJ-1: 2070 s', { color: c.fire, size: 11, weight: 700 });
    if (tjMax > 0 && tjMax < 11.5) pA.vline(tjMax, { color: c.muted, label: 'compressor limit', alpha: .7 });
    // propulsive efficiency
    c = pB.begin().col; pB.axes();
    const lines = [['turbofan (Ve ≈ 350 m/s)', 350, 'air', c.ok], ['turbojet (CJ-1: Ve ≈ 570 m/s)', 570, 'air', c.fire], ['chemical rocket (Ve ≈ 3 000 m/s)', 3000, 'rocket', c.air], ['ion thruster (Ve ≈ 30 000 m/s)', 30000, 'rocket', c.violet]];
    for (const [nm, Ve, kind, col] of lines) {
      const xs = [], ys = [];
      for (let V = 20; V <= 20000; V *= 1.05) { const r = V / Ve; if (kind === 'air' && r > 1) break; xs.push(V); ys.push(kind === 'air' ? 2 * r / (1 + r) : 2 * r / (1 + r * r)); }
      pB.line(xs, ys, { color: col, width: 3 });
      if (kind === 'air') pB.dot(xs[xs.length - 1], ys[ys.length - 1], { color: col, r: 4 });
    }
    for (const [nm, V] of [['airliner', 250], ['SR-71', 1000], ['orbit', 7800]]) { pB.vline(V, { color: c.muted, alpha: .55, dash: [2, 4] }); pB.text(V * 1.07, 0.05, nm, { color: c.muted, size: 10 }); }
  }
  pA.onDraw(upd); pB.onDraw(upd); upd();
}
