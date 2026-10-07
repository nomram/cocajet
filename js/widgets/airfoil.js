// Wing lab: exact potential flow (Joukowski + Kutta) in an air frame or a wing frame, with bound / starting / tip / stall vortices and toggleable forces.
import { h, shell, slider, select, toggle, button, readout, legend, whenVisible, clamp, cssVar } from '../ui.js';
import { Plot } from '../plot.js';

const DEG = Math.PI / 180, TAU = 2 * Math.PI, RHO = 1.225, G0 = 9.81, EOSW = 0.85, NV = 400, KG = 160, NB = 14, HL = 14, SPEED = 1.3, DM = 10;
const nf = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const fN = (v) => { if (!Number.isFinite(v)) return '–'; const a = Math.abs(v); return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2); };
const nice = (x) => { const m = 10 ** Math.floor(Math.log10(x)), f = x / m; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * m; };
const mix = (st, t) => { const f = clamp(t, 0, 1) * (st.length - 1), i = Math.min(st.length - 2, Math.floor(f)), u = f - i; return st[i].map((v, k) => v + (st[i + 1][k] - v) * u); };

export default function init(el) {
  const { body } = shell(el, { title: 'Wing lab: angle of attack, circulation, vortices and forces', note: 'Streaks follow the exact inviscid flow (Joukowski aerofoil, Kutta condition): <span style="color:var(--air)">slow</span> to <span style="color:var(--fire)">fast</span> air, and fast air means low pressure. Friction, form drag, the stall (lift shrinks, drag soars, flow separates) and the finite-wing induced drag are simple models (lifting-line theory, elliptic loading, e = 0.85). The vortex strengths obey Kelvin’s theorem (starting vortex = minus the change of bound circulation); their exact paths are illustrative.' });
  const flowCv = h('canvas', { class: 'plot', style: { height: '340px' } }), tipCv = h('canvas', { class: 'plot', style: { height: '260px' } });
  const cpCv = h('canvas', { class: 'plot' }), polCv = h('canvas', { class: 'plot' });
  const sA = slider({ label: 'Angle of attack  α  (wind ↔ chord)', min: -6, max: 22, step: 0.5, value: 5, unit: '°', fmt: v => v.toFixed(1), onInput: setup });
  const sV = slider({ label: 'Airspeed  V', min: 5, max: 80, step: 1, value: 30, unit: 'm/s', fmt: v => v.toFixed(0), onInput: setup });
  const sCh = slider({ label: 'Chord  c  (wing depth)', min: 0.2, max: 3, step: 0.1, value: 1, unit: 'm', fmt: v => v.toFixed(1), onInput: setup });
  const sC = slider({ label: 'Camber (curvature)', min: 0, max: 8, step: 0.5, value: 3, unit: '%', fmt: v => v.toFixed(1), onInput: setup });
  const sT = slider({ label: 'Thickness', min: 4, max: 24, step: 1, value: 12, unit: '%', fmt: v => v.toFixed(0), onInput: setup });
  const sAR = slider({ label: 'Aspect ratio  AR = span ÷ chord', min: 1, max: 20, step: 0.5, value: 8, fmt: v => v.toFixed(1), onInput: setup });
  const real = toggle({ label: 'Real-world air: friction, stall, flow separation', checked: true, onChange: setup });
  const fin = toggle({ label: 'Finite wing: add induced drag to the total', checked: true, onChange: setup });
  const selV = select({ label: 'View', options: [['air', 'Air frame (wind fixed, wing tilts)'], ['wing', 'Wing frame (wing fixed, wind tilts)']], value: 'air', onChange: v => { view = v; } });
  const selC = select({ label: 'Streak colour', options: [['speed', 'by speed'], ['pressure', 'by pressure']], value: 'speed', onChange: v => { colMode = v; buildPal(); } });
  [selV.el, selC.el].forEach(e => { e.style.flex = '1 1 200px'; });
  const bPause = button('Pause', () => { paused = !paused; bPause.textContent = paused ? 'Resume' : 'Pause'; bPause.classList.toggle('on', paused); }, 'small');
  const bKick = button('↻ Replay: pitch up', () => { aa = aT - 7; GbPrev = model(aa).CL / 2; }, 'small');
  const ro = { CL: readout('Lift coefficient CL', '', 'cool'), CD: readout('Drag coefficient CD', '', 'hot'), LD: readout('Lift ÷ drag', '', 'good'), L: readout('Lift L′', 'N/m', 'good'), D: readout('Drag D′', 'N/m', 'bad'), state: readout('Flow', '', 'fuel'), aS: readout('Stall angle', '', ''), m: readout('Level flight carries', 'kg/m', 'cool') };
  const rt = { ai: readout('Induced angle αi', '°', 'cool'), cdi: readout('Induced drag CDi', '', 'hot'), sh: readout('Induced share of drag', '%', 'fuel'), ld: readout('L/D, whole wing', '', 'good') };
  const info = h('div', { style: { margin: '10px 0 0', padding: '8px 12px', borderLeft: '3px solid var(--air)', background: 'var(--panel-2)', borderRadius: '0 8px 8px 0', fontSize: '.82rem', color: 'var(--text-2)', lineHeight: '1.5' } });

  // ---- layer chips ----
  const on = {}, chips = [];
  const chip = (key, label, color, checked, tip) => {
    const t = toggle({ label, checked, onChange: v => { on[key] = v; paintChips(); if (key === 'wt' || key === 'cp') setup(); } }); on[key] = checked;
    Object.assign(t.el.style, { border: '1px solid var(--line-2)', borderRadius: '999px', padding: '4px 11px 4px 8px', background: 'var(--panel-2)', fontSize: '.76rem', gap: '6px' }); t.el.title = tip;
    t.el.insertBefore(h('i', { style: { width: '9px', height: '9px', borderRadius: '50%', background: color, display: 'inline-block', flex: 'none' } }), t.input.nextSibling);
    chips.push([t, key, color]); return t;
  };
  const paintChips = () => chips.forEach(([t, k, c]) => { t.el.style.borderColor = on[k] ? c : 'var(--line-2)'; t.el.style.background = on[k] ? `color-mix(in srgb, ${c} 16%, var(--panel-2))` : 'var(--panel-2)'; });
  const fch = [chip('lift', 'Lift', 'var(--ok)', true, 'Lift: force at right angles to the wind'), chip('drag', 'Drag', 'var(--bad)', true, 'Drag: force along the wind (drawn ×10)'), chip('res', 'Resultant', 'var(--text)', true, 'Resultant aerodynamic force = lift + drag'),
    chip('comp', 'Normal & axial', 'var(--fuel)', false, 'The resultant split along / across the chord line'), chip('wt', 'Weight (level flight)', 'var(--metal)', false, 'Level flight: lift balances weight'),
    chip('press', 'Pressure on the skin', 'var(--fire)', false, 'Pressure (push) and suction (pull) arrows on the surface'), chip('cp', 'Centre of pressure & moment', 'var(--warn)', false, 'Where the resultant acts, the quarter-chord aerodynamic centre and the pitching moment'),
    chip('fric', 'Skin friction', 'var(--text-2)', false, 'Shear force of the air rubbing along the skin'), chip('circ', 'Circulation Γ', 'var(--violet)', false, 'The closed loop around the wing whose circulation Γ gives the lift')];
  const vch = [chip('bound', 'Bound vortex', 'var(--violet)', true, 'The circulation around the wing as a spinning vortex'), chip('start', 'Starting vortex', 'var(--fuel)', true, 'Shed when the angle changes: equal and opposite to the bound vortex'),
    chip('tip', 'Wingtip vortices', 'var(--air)', true, 'Tip vortices in the finite-wing panel'), chip('street', 'Stall vortex street', 'var(--fire)', true, 'Alternating vortices shed from the separated flow')];
  paintChips();
  const crow = (cap, items) => h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '8px' } }, h('span', { style: { fontSize: '.7rem', fontWeight: '700', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', minWidth: '58px' } }, cap), ...items.map(t => t.el));
  const tabs = [['cl', 'CL – α'], ['drag', 'Drag polar'], ['cp', 'Centre of pressure']].map(([k, t]) => { const b = button(t, () => { tab = k; tabs.forEach(x => x.classList.toggle('on', x.dataset.k === k)); drawPol(); }, 'small' + (k === 'cl' ? ' on' : '')); b.dataset.k = k; return b; });
  body.append(
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px 12px', alignItems: 'flex-end', marginBottom: '10px' } }, selV.el, selC.el, bPause, bKick),
    flowCv, h('div', { style: { marginTop: '10px' } }, sA.el),
    h('div', { class: 'readouts' }, ...Object.values(ro).map(r => r.el)), info,
    crow('Forces', fch), crow('Vortices', vch),
    legend([['var(--warn)', 'chord line, angle α'], ['var(--violet)', 'clockwise vortex'], ['var(--fuel)', 'counter-clockwise vortex'], ['var(--air)', 'suction (pull)'], ['var(--fire)', 'pressure (push)']]),
    h('div', { class: 'wgrid even', style: { marginTop: '14px' } }, h('div', { class: 'ctls' }, sV.el, sCh.el, real.el), h('div', { class: 'ctls' }, sC.el, sT.el)),
    h('div', { class: 'wgrid even', style: { marginTop: '14px' } }, cpCv, h('div', { class: 'ctls', style: { gap: '8px' } }, h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } }, ...tabs), polCv)),
    h('div', { style: { marginTop: '14px' } }, tipCv),
    h('div', { class: 'wgrid even', style: { marginTop: '12px' } }, h('div', { class: 'ctls' }, sAR.el, fin.el, h('div', { style: { fontSize: '.8rem', color: 'var(--muted)' } }, 'Short, stubby wings leak more air round the tips: stronger tip vortices, more downwash, more induced drag. Long, slender wings (gliders) have little.')), h('div', { class: 'readouts', style: { marginTop: 0 } }, ...Object.values(rt).map(r => r.el))));

  // ---- state ----
  let P = { V: 30, ch: 1, cam: 3, thk: 12, real: true, fin: true, AR: 8 }, aT = 5, aa = 5, vb = 1, view = 'air', colMode = 'speed', paused = matchMedia('(prefers-reduced-motion: reduce)').matches, T = 0, tab = 'cl', Mt, aS = 14, curves = null, GbPrev = 0, acc = 0, shedT = 0, strT = 0, strN = 0, tPrev = performance.now();
  if (paused) { bPause.textContent = 'Resume'; bPause.classList.add('on'); }
  let C = {}, light = false, pal = [];
  function readCols() { const g = cssVar; C = { text: g('--text'), text2: g('--text-2'), muted: g('--muted'), line: g('--line-2'), bg: g('--bg-2'), air: g('--air'), fire: g('--fire'), fuel: g('--fuel'), ok: g('--ok'), bad: g('--bad'), warn: g('--warn'), violet: g('--violet'), metal: g('--metal') }; light = document.documentElement.getAttribute('data-theme') === 'light'; buildPal(); }
  function buildPal() {
    const st = colMode === 'speed' ? [[60, 180, 240], [150, 150, 150], [255, 120, 50]] : [[170, 120, 255], [160, 140, 215], [165, 165, 170], [255, 150, 40]], k = light ? 0.78 : 1;
    pal = Array.from({ length: NB }, (_, b) => { const c = mix(st, b / (NB - 1)).map(v => Math.round(v * k)); return `rgb(${c[0]},${c[1]},${c[2]})`; });
  }

  // ---- Joukowski geometry (parameter c = 1; chord ~ 4) ----
  let z0x, z0y, aR, a2, beta, chordLen, gc, Qx, Qy, iLE, XC, YC, CT, ST, DZ, ZX, ZY, PNX, PNY, RMX, RMY, VNX, VNY, TXc, TYc, yUp, yLo, shapeKey = '';
  function build(cam, thk) {
    z0x = -thk / 100 / 1.3; z0y = 2 * cam / 100; aR = Math.hypot(1 - z0x, z0y); a2 = aR * aR; beta = Math.asin(z0y / aR);
    const thTE = Math.atan2(-z0y, 1 - z0x), mk = () => new Float64Array(NV);
    const zOf = (th) => { const qx = z0x + aR * Math.cos(th), qy = z0y + aR * Math.sin(th), q2 = qx * qx + qy * qy; return [qx + qx / q2, qy - qy / q2, qx, qy, q2]; };
    CT = mk(); ST = mk(); DZ = mk(); ZX = mk(); ZY = mk();
    for (let i = 0; i < NV; i++) {
      const th = thTE + (i + 0.5) * TAU / NV, [x, y, qx, qy, q2] = zOf(th);
      CT[i] = Math.cos(th); ST[i] = Math.sin(th); ZX[i] = x; ZY[i] = y; DZ[i] = Math.hypot(1 - (qx * qx - qy * qy) / (q2 * q2), 2 * qx * qy / (q2 * q2));
    }
    let bd = -1; iLE = 0;
    for (let i = 0; i < NV; i++) { const d = Math.hypot(ZX[i] - 2, ZY[i]); if (d > bd) { bd = d; iLE = i; } }
    let lex = ZX[iLE], ley = ZY[iLE];
    for (let k = -20; k <= 20; k++) { const p = zOf(thTE + (iLE + 0.5 + k / 20) * TAU / NV), d = Math.hypot(p[0] - 2, p[1]); if (d > bd) { bd = d; lex = p[0]; ley = p[1]; } }
    chordLen = bd; gc = Math.atan2(-ley, 2 - lex); Qx = lex + 0.25 * (2 - lex); Qy = ley - 0.25 * ley;
    const cg = Math.cos(gc), sg = Math.sin(gc);
    XC = mk(); YC = mk(); PNX = mk(); PNY = mk(); RMX = mk(); RMY = mk(); VNX = mk(); VNY = mk(); TXc = mk(); TYc = mk();
    let area = 0;
    for (let i = 0; i < NV; i++) {
      const j = (i + 1) % NV; XC[i] = (cg * (ZX[i] - Qx) + sg * (ZY[i] - Qy)) / chordLen; YC[i] = (-sg * (ZX[i] - Qx) + cg * (ZY[i] - Qy)) / chordLen;
      area += ZX[i] * ZY[j] - ZX[j] * ZY[i];
    }
    const fl = area < 0 ? -1 : 1;
    for (let i = 0; i < NV; i++) {
      const j = (i + 1) % NV, dx = ZX[j] - ZX[i], dy = ZY[j] - ZY[i];
      PNX[i] = fl * dy; PNY[i] = -fl * dx; RMX[i] = (ZX[i] + ZX[j]) / 2 - Qx; RMY[i] = (ZY[i] + ZY[j]) / 2 - Qy;
    }
    for (let i = 0; i < NV; i++) {
      const p = (i + NV - 1) % NV, j = (i + 1) % NV;
      let nx = PNX[p] / Math.hypot(PNX[p], PNY[p]) + PNX[i] / Math.hypot(PNX[i], PNY[i]), ny = PNY[p] / Math.hypot(PNX[p], PNY[p]) + PNY[i] / Math.hypot(PNX[i], PNY[i]), n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      VNX[i] = cg * nx + sg * ny; VNY[i] = -sg * nx + cg * ny;
      const tx = XC[j] - XC[p], ty = YC[j] - YC[p], tn = Math.hypot(tx, ty) || 1; TXc[i] = tx / tn; TYc[i] = ty / tn;
    }
    const tab = (i0, i1, upper) => {
      const t = new Float64Array(KG + 1).fill(NaN);
      for (let i = i0; i < i1; i++) {
        const j = (i + 1) % NV, x1 = XC[i], x2 = XC[j], y1 = YC[i], y2 = YC[j]; if (x1 === x2) continue;
        for (let k = Math.max(0, Math.ceil((Math.min(x1, x2) + 0.25) * KG)); k <= Math.min(KG, Math.floor((Math.max(x1, x2) + 0.25) * KG)); k++) {
          const y = y1 + ((k / KG - 0.25) - x1) / (x2 - x1) * (y2 - y1); t[k] = Number.isNaN(t[k]) ? y : upper ? Math.max(t[k], y) : Math.min(t[k], y);
        }
      }
      for (let k = 0; k <= KG; k++) if (Number.isNaN(t[k])) t[k] = k ? t[k - 1] : 0;
      return t;
    };
    yUp = tab(0, iLE, true); yLo = tab(iLE, NV, false);
  }
  const yAt = (t, x) => { const k = clamp((x + 0.25) * KG, 0, KG), i = Math.min(KG - 1, Math.floor(k)), f = k - i; return t[i] * (1 - f) + t[i + 1] * f; };

  // ---- potential flow: surface pressure + integrated force and moment (U = 1, q = 1/2) ----
  function pot(aDeg) {
    const al = aDeg * DEG + gc, ca = Math.cos(al), sa = Math.sin(al), gam = 4 * Math.PI * aR * Math.sin(al + beta), gg = gam / (2 * Math.PI * aR);
    const Vs = new Float64Array(NV), Cp = new Float64Array(NV);
    for (let i = 0; i < NV; i++) {
      const c1 = CT[i], s1 = ST[i], c2 = c1 * c1 - s1 * s1, s2 = 2 * c1 * s1;
      const nx = ca - (ca * c2 + sa * s2) + gg * s1, ny = -sa - (sa * c2 - ca * s2) + gg * c1, V = Math.hypot(nx, ny) / DZ[i];
      Vs[i] = V; Cp[i] = 1 - V * V;
    }
    let fx = 0, fy = 0, mz = 0;
    for (let i = 0; i < NV; i++) { const cp = 0.5 * (Cp[i] + Cp[(i + 1) % NV]), Fx = -cp * PNX[i], Fy = -cp * PNY[i]; fx += Fx; fy += Fy; mz += RMX[i] * Fy - RMY[i] * Fx; }
    const cg = Math.cos(gc), sg = Math.sin(gc);
    return { gam, CL: 2 * gam / chordLen, CLi: (-sa * fx + ca * fy) / chordLen, CDi: (ca * fx + sa * fy) / chordLen, CN: (-sg * fx + cg * fy) / chordLen, Cm: -mz / (chordLen * chordLen), Cp, Vs };
  }
  const polarCL = (aDeg) => 2 * 4 * Math.PI * aR * Math.sin(aDeg * DEG + gc + beta) / chordLen;
  // simple real-world model on top: stall (lift shrinks, drag soars), friction + form drag, induced drag of a finite wing
  function model(aDeg) {
    const p = pot(aDeg), st = P.real && aDeg > aS, d = aDeg - aS;
    let CL = p.CL, Cm = p.Cm;
    if (st) { CL = polarCL(aS) * (1 - 0.09 * d); Cm = pot(aS).Cm - 0.02 * d; }
    const CDf = P.real ? 0.0055 : 0, CDp = P.real ? 0.0025 + 0.0045 * CL * CL + (st ? 0.05 * clamp(d / 2, 0, 1) + 0.045 * d : 0) : 0, CDi = P.fin ? CL * CL / (Math.PI * P.AR * EOSW) : 0, CD = CDf + CDp + CDi;
    const q = 0.5 * RHO * P.V * P.V, k = q * P.ch, cA = Math.cos(aDeg * DEG), sA_ = Math.sin(aDeg * DEG), CN = CL * cA + CD * sA_, CA = CD * cA - CL * sA_;
    return { aDeg, p, CL, CD, CDf, CDp, CDi, Cm, CN, CA, xcp: Math.abs(CN) > 0.04 ? 0.25 - Cm / CN : NaN, q, k, L: k * CL, D: k * CD, M: k * P.ch * Cm, st, sep: st ? 0.25 + 0.75 * clamp(d / 6, 0, 1) : 0, xs: 0.92 - 0.62 * clamp(d / 8, 0, 1), Gam: CL * P.V * P.ch / 2 };
  }
  function cpEff(M) { // separated flow: the pressure on the upper surface stays flat behind the separation point
    const cp = M.p.Cp; if (!M.st) return cp;
    const o = Float64Array.from(cp); let bj = 0, bx = 9;
    for (let i = 0; i <= iLE; i++) { const d = Math.abs(XC[i] + 0.25 - M.xs); if (d < bx) { bx = d; bj = i; } }
    for (let i = 0; i <= iLE; i++) if (XC[i] + 0.25 > M.xs) o[i] = cp[bj];
    return o;
  }

  // ---- readouts, plots ----
  function setup() {
    P = { V: sV.get(), ch: sCh.get(), cam: sC.get(), thk: sT.get(), real: real.get(), fin: fin.get(), AR: sAR.get() }; aT = sA.get();
    const key = P.cam + ',' + P.thk; if (key !== shapeKey) { shapeKey = key; build(P.cam, P.thk); }
    aS = 13 + 0.54 * P.cam + (P.thk - 12) * 0.12;
    Mt = model(aT);
    const M = Mt, ld = M.CD > 1e-4 ? M.CL / M.CD : NaN;
    ro.CL.set(nf(M.CL)); ro.CD.set(nf(M.CD, 3)); ro.LD.set(M.CD > 1e-4 ? nf(ld, 0) : '∞'); ro.L.set(fN(M.L)); ro.D.set(fN(M.D));
    ro.state.set(!P.real ? 'ideal flow' : M.st ? 'STALLED' : 'attached', M.st ? 'bad' : 'good'); ro.aS.set(P.real ? aS.toFixed(1) + '°' : '–', M.st ? 'bad' : '');
    ro.m.set(M.L > 0 ? fN(M.L / G0) : '–'); ro.m.el.style.display = on.wt ? '' : 'none';
    const ai = M.CL / (Math.PI * P.AR), cdi = M.CL * M.CL / (Math.PI * P.AR * EOSW), cd3 = M.CDf + M.CDp + cdi;
    rt.ai.set(nf(ai / DEG, 1)); rt.cdi.set(nf(cdi, 3)); rt.sh.set(cd3 > 1e-4 ? nf(100 * cdi / cd3, 0) : '–'); rt.ld.set(cd3 > 1e-4 ? nf(M.CL / cd3, 0) : '∞');
    curves = { al: [], CLp: [], CL: [], CD2: [], CD: [], xcp: [] };
    for (let d = -6; d <= 22.001; d += 0.5) { const m = model(d); curves.al.push(d); curves.CLp.push(polarCL(d)); curves.CL.push(m.CL); curves.CD2.push(m.CDf + m.CDp); curves.CD.push(m.CD); curves.xcp.push(m.xcp > -0.4 && m.xcp < 1.5 ? m.xcp : NaN); }
    drawCp(); drawPol(); infoText();
  }
  function infoText() {
    const M = Mt, s = [`<b>Lift from circulation</b> (Kutta–Joukowski): L′ = ρ · V · Γ = ${RHO} × ${P.V.toFixed(0)} × ${fN(M.Gam)} m²/s = <b>${fN(M.L)} N/m</b> of span`];
    if (on.wt) s.push(M.L > 0 ? `<b>Level flight:</b> weight = lift, so each metre of this wing carries <b>${fN(M.L / G0)} kg</b> (wing loading ${fN(M.L / G0 / P.ch)} kg/m²)` : '<b>Level flight:</b> the lift is negative here, so the weight cannot be balanced (try a bigger angle).');
    const sv = vort.find(v => v.k === 's' && v.age < 3 && Math.abs(v.G) > 0.03 && v.live);
    if (sv) s.push(`<b>Kelvin:</b> ${sv.G < 0 ? 'starting' : 'stopping'} vortex ${fN(-sv.G * P.V * P.ch)} + bound change ${fN(sv.G * P.V * P.ch)} m²/s = 0: the total circulation stays zero`);
    info.innerHTML = s.join('<br>');
  }
  const pCp = new Plot(cpCv, { xmin: 0, xmax: 1, ymin: 1.5, ymax: -3, xlabel: 'position along the chord  x / c', ylabel: 'pressure coefficient Cp (suction up)', aspect: 1.2, title: 'Pressure distribution' });
  function drawCp() {
    if (!Mt) return;
    const M = Mt, cp = cpEff(M), up = [], lo = [];
    for (let i = 0; i < NV; i++) (i <= iLE ? up : lo).push([Math.max(0, XC[i] + 0.25), cp[i]]);
    up.sort((a, b) => a[0] - b[0]); lo.sort((a, b) => a[0] - b[0]);
    const grid = Array.from({ length: 90 }, (_, k) => (1 - Math.cos(k / 89 * Math.PI)) / 2);
    const itp = (arr, x) => { let j = 0; while (j < arr.length - 2 && arr[j + 1][0] < x) j++; const a = arr[j], b = arr[j + 1], f = b[0] > a[0] ? clamp((x - a[0]) / (b[0] - a[0]), 0, 1) : 0; return a[1] + (b[1] - a[1]) * f; };
    const gu = grid.map(x => itp(up, x)), gl = grid.map(x => itp(lo, x)), peak = Math.min(...gu);
    pCp.set({ ymin: 1.5, ymax: -Math.max(3, Math.min(9, -peak * 1.12)) });
    const col = pCp.begin().col; pCp.axes();
    if (M.st) pCp.band(M.xs, 1, { color: col.bad, alpha: 0.1, label: 'separated' });
    pCp.area(grid, gu, gl, { color: col.ok, alpha: 0.2 });
    pCp.hline(0, { color: col.muted });
    pCp.line(grid, gu, { color: col.air, width: 2.4 }); pCp.line(grid, gl, { color: col.fire, width: 2.4 });
    const st = lo.reduce((b, q) => (q[1] > b[1] ? q : b), lo[0]); pCp.dot(st[0], st[1], { color: col.warn, r: 4, ring: false });
    pCp.text(Math.min(0.9, st[0] + 0.04), st[1], 'stagnation', { color: col.warn, size: 10.5, bg: true });
    if (on.cp && Number.isFinite(M.xcp)) pCp.vline(clamp(M.xcp, 0, 1), { color: col.warn, label: 'CP' });
    pCp.legend([[col.air, 'top surface'], [col.fire, 'bottom surface'], [col.ok, 'lift = area between']], { pos: 'tr' });
  }
  const pPol = new Plot(polCv, { xmin: -6, xmax: 22, ymin: -0.8, ymax: 2.2, xlabel: 'angle of attack α (degrees)', ylabel: 'lift coefficient CL', aspect: 1.45 });
  function drawPol() {
    if (!Mt || !curves) return;
    const M = Mt, cu = curves, a = pPol, ymax = Math.max(1.8, Math.ceil(Math.max(...(P.real ? cu.CL : cu.CLp)) * 5) / 5 + 0.2);
    if (tab === 'cl') {
      a.set({ xmin: -6, xmax: 22, ymin: -0.8, ymax, xlabel: 'angle of attack α (degrees)', ylabel: 'lift coefficient CL', title: 'CL vs α: linear, then stall', yticks: null });
      const c = a.begin().col; a.axes();
      if (P.real) a.band(aS, 22, { color: c.bad, alpha: 0.08 });
      a.hline(0, { color: c.muted }); a.clip(true);
      a.line(cu.al, cu.CLp, { color: c.air, width: 2, dash: [5, 4] }); if (P.real) a.line(cu.al, cu.CL, { color: c.fire, width: 3 });
      a.clip(false);
      if (P.real) a.vline(aS, { color: c.bad, label: '≈ ' + aS.toFixed(0) + '°' });
      const a0 = -(beta + gc) / DEG; a.dot(a0, 0, { color: c.muted, r: 3.5, ring: false }); a.text(a0 + 0.6, 0.14, 'α₀ = ' + a0.toFixed(1) + '°', { color: c.muted, size: 10.5 });
      a.dot(aT, M.CL, { color: c.fuel, r: 6 });
      a.legend([[c.air, 'ideal flow (never stalls)', [5, 4]], [c.fire, 'real wing']], { pos: 'tl' });
    } else if (tab === 'drag') {
      const lim = Math.min(22, aS + 3), idx = cu.al.map((_, i) => i).filter(i => cu.al[i] <= lim), xm = nice(Math.max(...idx.map(i => cu.CD[i])) * 1.15);
      a.set({ xmin: 0, xmax: Math.min(0.4, Math.max(0.06, xm)), ymin: -0.8, ymax, xlabel: 'drag coefficient CD', ylabel: 'lift coefficient CL', title: 'Drag polar: CL vs CD' });
      const c = a.begin().col; a.axes(); a.hline(0, { color: c.muted }); a.clip(true);
      a.line(cu.CD2, cu.CL, { color: c.air, width: 2, dash: [5, 4] }); a.line(cu.CD, cu.CL, { color: c.fire, width: 3 });
      let bi = 0, bv = -1; idx.forEach(i => { const r = cu.CL[i] / cu.CD[i]; if (cu.CD[i] > 1e-4 && r > bv) { bv = r; bi = i; } });
      if (bv > 0) a.line([0, cu.CD[bi] * 1.9], [0, cu.CL[bi] * 1.9], { color: c.ok, width: 1.4, dash: [4, 4] });
      a.clip(false);
      if (bv > 0) { a.text(cu.CD[bi] * 1.9, cu.CL[bi] * 1.9, 'best L/D ≈ ' + bv.toFixed(0), { color: c.ok, size: 10.5, align: 'right', bg: true }); a.dot(cu.CD[bi], cu.CL[bi], { color: c.ok, r: 3.5, ring: false }); }
      a.dot(Math.min(M.CD, a.o.xmax), M.CL, { color: c.fuel, r: 6 });
      a.legend([[c.air, 'section alone (2-D)', [5, 4]], [c.fire, P.fin ? 'whole wing, AR ' + P.AR.toFixed(1) : 'real wing']], { pos: 'tl' });
    } else {
      a.set({ xmin: -6, xmax: 22, ymin: -0.2, ymax: 1.2, xlabel: 'angle of attack α (degrees)', ylabel: 'centre of pressure  x / c', title: 'Where the lift acts', yticks: [0, 0.25, 0.5, 0.75, 1] });
      const c = a.begin().col; a.axes(); a.hline(0.25, { color: c.warn, label: 'aerodynamic centre ¼ c' }); a.hline(0, { color: c.muted }); a.hline(1, { color: c.muted });
      a.text(-5.5, 0.06, 'leading edge', { color: c.muted, size: 10.5 }); a.text(-5.5, 0.94, 'trailing edge', { color: c.muted, size: 10.5 });
      if (P.real) a.vline(aS, { color: c.bad, label: 'stall' });
      a.clip(true); a.line(cu.al, cu.xcp, { color: c.fire, width: 3 }); a.clip(false);
      if (Number.isFinite(M.xcp) && M.xcp > -0.2 && M.xcp < 1.2) a.dot(aT, M.xcp, { color: c.fuel, r: 6 });
      else a.text(aT, 0.6, 'CP off the wing', { color: c.fuel, size: 10.5, align: 'center', bg: true });
      a.text(-5.5, 0.5, 'low α: CP far aft', { color: c.muted, size: 10.5 });
    }
  }
  pCp.onDraw(() => { drawCp(); }); pPol.onDraw(() => { drawPol(); });

  // ---- flow field: world = chord frame rotated by thv (origin = quarter chord, unit = chord) ----
  let W = 0, H = 0, S = 100, px0 = 0, py0 = 0, dpr = 1, rho = 0, cr = 1, sr = 0, fcA = 1, fsA = 0, fg = 0, vx0, vx1, vy0, vy1;
  const NP = matchMedia('(max-width: 600px)').matches ? 700 : 1000, hx = new Float32Array(NP * HL), hy = new Float32Array(NP * HL), pAge = new Float32Array(NP), bins = Array.from({ length: NB }, () => []);
  const px = new Float32Array(NP), py = new Float32Array(NP);
  let hd = 0; const vort = []; const tmp = { x: 0, y: 0 };
  function flowAt(wx, wy, o) { // velocity (world frame) of the potential flow at a world point; false if inside the body
    const zx = Qx + chordLen * (cr * wx - sr * wy), zy = Qy + chordLen * (sr * wx + cr * wy);
    const pr = zx * zx - zy * zy - 4, pi = 2 * zx * zy, m = Math.hypot(pr, pi), sx = Math.sqrt((m + pr) / 2), sy = (pi < 0 ? -1 : 1) * Math.sqrt(Math.max(0, (m - pr) / 2));
    let qx = (zx + sx) / 2, qy = (zy + sy) / 2; if (qx * qx + qy * qy < 1) { qx = (zx - sx) / 2; qy = (zy - sy) / 2; }
    const dx = qx - z0x, dy = qy - z0y, r2 = dx * dx + dy * dy; if (r2 < a2 * 1.002) return false;
    const ix = dx / r2, iy = -dy / r2, i2x = ix * ix - iy * iy, i2y = 2 * ix * iy, tx = fcA * i2x - fsA * i2y, ty = fcA * i2y + fsA * i2x;
    const nx = fcA - a2 * tx - fg * iy, ny = -fsA - a2 * ty + fg * ix, q2 = qx * qx + qy * qy, q4 = q2 * q2;
    const ex = 1 - (qx * qx - qy * qy) / q4, ey = 2 * qx * qy / q4, dd = Math.max(1e-10, ex * ex + ey * ey);
    const vx = (nx * ex + ny * ey) / dd, vy = -(ny * ex - nx * ey) / dd;
    o.x = cr * vx + sr * vy; o.y = -sr * vx + cr * vy; return true;
  }
  function induced(x, y, o, skip) { // Lamb–Oseen-ish point vortices (clockwise positive)
    let u = 0, v = 0;
    for (const w of vort) { if (w === skip) continue; const dx = x - w.x, dy = y - w.y, r2 = dx * dx + dy * dy + w.rc * w.rc, f = w.G / (TAU * r2); u += f * dy; v -= f * dx; }
    o.x += u; o.y += v;
  }
  function spawn(i, scatter) {
    let x, y;
    if (scatter) { x = vx0 + Math.random() * (vx1 - vx0); y = vy0 + Math.random() * (vy1 - vy0); }
    else {
      const dxw = Math.cos(phw0), dyw = Math.sin(phw0), fl = dxw > 0 ? (vy1 - vy0) * dxw : 0, fb = dyw > 0 ? (vx1 - vx0) * dyw : 0, ft = dyw < 0 ? -(vx1 - vx0) * dyw : 0, r = Math.random() * (fl + fb + ft);
      if (r < fl) { x = vx0 - 0.05; y = vy0 + Math.random() * (vy1 - vy0); } else if (r < fl + fb) { y = vy0 - 0.05; x = vx0 + Math.random() * (vx1 - vx0); } else { y = vy1 + 0.05; x = vx0 + Math.random() * (vx1 - vx0); }
    }
    px[i] = x; py[i] = y; pAge[i] = Math.random() * 6; for (let k = 0; k < HL; k++) { hx[i * HL + k] = x; hy[i * HL + k] = y; }
  }
  let phw0 = 0;
  function seed() { for (let i = 0; i < NP; i++) spawn(i, true); }
  function sizeFlow() {
    const w = Math.round(flowCv.clientWidth), d = Math.min(2, devicePixelRatio || 1); if (!w) return false; if (w === W && d === dpr) return true;
    W = w; dpr = d; H = Math.round(w / (w < 520 ? 1.1 : 1.8)); flowCv.style.height = H + 'px'; flowCv.width = Math.round(W * dpr); flowCv.height = Math.round(H * dpr);
    S = W < 520 ? W / 3.7 : W / 4.7; px0 = W * (W < 520 ? 0.33 : 0.34); py0 = H * 0.5; vx0 = -px0 / S; vx1 = (W - px0) / S; vy0 = -(H - py0) / S; vy1 = py0 / S; seed(); return true;
  }
  const ctx = flowCv.getContext('2d'), tctx = tipCv.getContext('2d');
  const sx = (x) => px0 + S * x, sy = (y) => py0 - S * y;
  function arrowPx(g, x0, y0, x1, y1, c, w = 2.5, hd_ = 8, dash = null) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 1.5) return; const a = Math.atan2(dy, dx), hh = Math.min(hd_, L * 0.8);
    g.save(); g.strokeStyle = g.fillStyle = c; g.lineWidth = w; g.lineCap = 'round'; if (dash) g.setLineDash(dash);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - Math.cos(a) * hh * 0.6, y1 - Math.sin(a) * hh * 0.6); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - hh * Math.cos(a - 0.4), y1 - hh * Math.sin(a - 0.4)); g.lineTo(x1 - hh * Math.cos(a + 0.4), y1 - hh * Math.sin(a + 0.4)); g.closePath(); g.fill(); g.restore();
  }
  function swirl(g, x, y, r, ph, cw, c, al) { // spinning vortex glyph
    g.save(); g.globalAlpha = al * 0.16; g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = al; g.strokeStyle = g.fillStyle = c; g.lineWidth = 2.4; g.lineCap = 'round';
    const a1 = ph + (cw ? 1 : -1) * 4.6; g.beginPath(); g.arc(x, y, r, ph, a1, !cw); g.stroke();
    const ex = x + r * Math.cos(a1), ey = y + r * Math.sin(a1), dx = cw ? -Math.sin(a1) : Math.sin(a1), dy = cw ? Math.cos(a1) : -Math.cos(a1), hh = clamp(r * 0.55, 4, 8);
    g.beginPath(); g.moveTo(ex + dx * hh, ey + dy * hh); g.lineTo(ex - dx * hh * 0.4 - dy * hh * 0.75, ey - dy * hh * 0.4 + dx * hh * 0.75); g.lineTo(ex - dx * hh * 0.4 + dy * hh * 0.75, ey - dy * hh * 0.4 - dx * hh * 0.75); g.closePath(); g.fill(); g.restore();
  }
  // label placement that avoids earlier labels, the wing and fixed overlays
  let occ = [], LQ = [];
  const hit = (r) => occ.some(o => r[0] < o[0] + o[2] && r[0] + r[2] > o[0] && r[1] < o[1] + o[3] && r[1] + r[3] > o[1]);
  const lab = (t, ax, ay, dx, dy, c, opt, pr = 3) => LQ.push({ t, ax, ay, dx, dy, c, opt, pr });
  const occSeg = (x0, y0, x1, y1) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10)); for (let i = 0; i <= n; i++) occ.push([x0 + (x1 - x0) * i / n - 5, y0 + (y1 - y0) * i / n - 5, 10, 10]); };
  function flushLabels() {
    const fs = W < 520 ? 10.5 : 12; ctx.font = `700 ${fs}px ui-sans-serif, system-ui, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    LQ.sort((a, b) => a.pr - b.pr);
    for (const lb of LQ) {
      const ls = lb.t.split('\n'), tw = Math.max(...ls.map(s => ctx.measureText(s).width)) + 8, th = ls.length * (fs + 3) + 3, b = Math.atan2(lb.dy, lb.dx); let pos = null;
      outer: for (const dd of [5, 14, 26, 42, 62]) for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
        const ux = Math.cos(b + da), uy = Math.sin(b + da), r = [lb.ax + ux * dd + (ux * 0.5 - 0.5) * tw, lb.ay + uy * dd + (uy * 0.5 - 0.5) * th, tw, th];
        if (r[0] < 2 || r[1] < 2 || r[0] + tw > W - 2 || r[1] + th > H - 2 || hit(r)) continue; pos = { r, dd }; break outer;
      }
      if (!pos) { if (lb.opt) continue; pos = { r: [clamp(lb.ax + 5, 2, W - tw - 2), clamp(lb.ay - th / 2, 2, H - th - 2), tw, th], dd: 0 }; }
      const [l, t] = pos.r; ctx.globalAlpha = 0.8; ctx.fillStyle = C.bg; ctx.fillRect(l, t, tw, th); ctx.globalAlpha = 1;
      if (pos.dd > 12) { ctx.strokeStyle = lb.c; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lb.ax, lb.ay); ctx.lineTo(clamp(lb.ax, l, l + tw), clamp(lb.ay, t, t + th)); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.fillStyle = lb.c; ls.forEach((s, k) => ctx.fillText(s, l + 4, t + 3 + (fs + 3) * (k + 0.5))); occ.push(pos.r);
    }
    LQ = [];
  }

  function drawPlane(x, y, w, hgt, pitch) {
    ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = C.bg; ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.rect(x, y, w, hgt); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
    const cx_ = x + w / 2, cy = y + hgt * 0.52, k = Math.min(w / 140, hgt / 76);
    ctx.strokeStyle = C.muted; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x + 8, cy); ctx.lineTo(x + w - 8, cy); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = '600 9.5px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.muted; ctx.textAlign = 'left'; ctx.fillText('horizon', x + 8, cy + 11);
    ctx.textAlign = 'left'; ctx.fillStyle = C.text2; ctx.fillText('← flies', x + 8, y + 13);
    ctx.save(); ctx.translate(cx_, cy); ctx.scale(k, k); ctx.rotate(pitch * DEG);
    ctx.fillStyle = C.metal; ctx.strokeStyle = C.text; ctx.lineWidth = 1.2 / k; ctx.beginPath(); ctx.moveTo(-40, 0); ctx.quadraticCurveTo(-38, -8, -24, -8); ctx.lineTo(18, -6); ctx.lineTo(42, -3); ctx.lineTo(42, 2); ctx.lineTo(16, 6); ctx.lineTo(-24, 7); ctx.quadraticCurveTo(-38, 7, -40, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26, -6); ctx.lineTo(36, -22); ctx.lineTo(43, -22); ctx.lineTo(43, -3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.air; ctx.fillRect(-30, -6, 10, 5);
    ctx.fillStyle = C.warn; ctx.beginPath(); ctx.ellipse(0, 3, 12, 2.4, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.warn; ctx.lineWidth = 1.4 / k; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.moveTo(-52, 3); ctx.lineTo(54, 3); ctx.stroke(); ctx.restore();
    ctx.fillStyle = C.warn; ctx.textAlign = 'center'; ctx.font = '700 10.5px ui-sans-serif, system-ui, sans-serif'; ctx.fillText(`nose up ${nf(pitch, 1)}° = α`, cx_, y + hgt - 6); ctx.restore();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - tPrev) / 1000); tPrev = now; if (!vis() || !Mt) return;
    if (!sizeFlow()) return;
    T += paused ? 0 : dt;
    aa += (aT - aa) * (1 - Math.exp(-dt / 0.08)); if (Math.abs(aT - aa) < 2e-3) aa = aT;
    const vt = view === 'air' ? 1 : 0; vb += (vt - vb) * (1 - Math.exp(-dt / 0.12)); if (Math.abs(vt - vb) < 1e-3) vb = vt;
    const Mf = aa === aT ? Mt : model(aa), thv = -aa * DEG * vb, phw = thv + aa * DEG; phw0 = phw;
    rho = gc - thv; cr = Math.cos(rho); sr = Math.sin(rho); const al = aa * DEG + gc; fcA = Math.cos(al); fsA = Math.sin(al); fg = 2 * aR * Math.sin(al + beta);
    const ec = [Math.cos(thv), Math.sin(thv)], en = [-ec[1], ec[0]], ew = [Math.cos(phw), Math.sin(phw)], el_ = [-ew[1], ew[0]];
    const sdt = paused ? 0 : dt * SPEED;
    // --- vortices: shed when the bound circulation changes (Kelvin), stall street ---
    const Gb = Mf.CL / 2; acc += Gb - GbPrev; GbPrev = Gb; shedT += dt;
    const teW = [0.8 * ec[0], 0.8 * ec[1]];
    if (shedT > 0.06) {
      shedT = 0;
      if (Math.abs(acc) > 0.002) {
        const G = -acc, m = vort.find(v => v.k === 's' && v.live && v.age < 0.5 && v.G * G > 0);
        if (m) { const t = Math.abs(G) / (Math.abs(G) + Math.abs(m.G)); m.x += (teW[0] - m.x) * t; m.y += (teW[1] - m.y) * t; m.G += G; m.age = Math.min(m.age, 0.3); } else vort.push({ x: teW[0], y: teW[1], G, age: 0, k: 's', rc: 0.09, ph: 0, live: true });
        acc = 0;
      }
    }
    if (Mf.st && !paused) {
      strT += dt; const per = 0.5 - 0.15 * Mf.sep;
      if (strT > per && vort.length < 40) {
        strT = 0; strN++; const G0_ = 0.1 + 0.22 * clamp((aa - aS) / 8, 0, 1), up = strN % 2 === 0, xc = up ? Mf.xs - 0.25 : 0.82, yc = up ? yAt(yUp, xc) + 0.05 : -0.03;
        vort.push({ x: xc * ec[0] - yc * ec[1], y: xc * ec[1] + yc * ec[0], G: up ? G0_ : -G0_, age: 0, k: 'w', rc: 0.07, ph: Math.random() * 6, live: true });
      }
    }
    if (!paused) {
      for (const v of vort) {
        if (!flowAt(v.x, v.y, tmp)) { v.live = false; continue; }
        if (v.k === 'w') { tmp.x *= 0.6; tmp.y *= 0.6; }
        induced(v.x, v.y, tmp, v); v.x += clamp(tmp.x, -3, 3) * sdt; v.y += clamp(tmp.y, -3, 3) * sdt; v.age += dt; v.rc = (v.k === 's' ? 0.09 : 0.07) + 0.02 * v.age; v.G *= Math.exp(-dt / 5);
        if (v.age > 6 || v.x > vx1 + 0.4 || v.x < vx0 - 0.4 || v.y > vy1 + 0.4 || v.y < vy0 - 0.4 || Math.abs(v.G) < 0.004) v.live = false;
      }
    }
    for (let i = vort.length - 1; i >= 0; i--) if (!vort[i].live) vort.splice(i, 1);
    { // --- particles (frozen but still coloured while paused) ---
      if (!paused) hd = (hd + 1) % HL; for (const b of bins) b.length = 0;
      const dead = Mf.st && P.real, sp0 = Mf.sep;
      for (let i = 0; i < NP; i++) {
        let x = px[i], y = py[i]; if (!paused) pAge[i] += dt;
        if (!flowAt(x, y, tmp) || pAge[i] > 14) { spawn(i, false); i--; continue; }
        let u = tmp.x, v = tmp.y; if (vort.length) { tmp.x = u; tmp.y = v; induced(x, y, tmp, null); u = tmp.x; v = tmp.y; }
        if (dead) { // separated region above the aft part of the wing: slow, chaotic air
          const cx_ = Math.cos(thv) * x + Math.sin(thv) * y, cy_ = -Math.sin(thv) * x + Math.cos(thv) * y, xs_ = Mf.xs - 0.25, yu = cx_ < 0.75 ? yAt(yUp, cx_) : 0;
          if (cx_ > xs_ && cx_ < 3.2 && cy_ > yu - 0.02 && cy_ < yu + 0.1 + 0.45 * (cx_ - xs_)) { const f = 1 - 0.7 * sp0; u = u * f + (Math.random() - 0.5) * 0.6 * sp0; v = v * f + (Math.random() - 0.5) * 0.6 * sp0; }
        }
        const sp = Math.hypot(u, v); x += u * sdt; y += v * sdt;
        if (!(x > vx0 - 0.3 && x < vx1 + 0.3 && y > vy0 - 0.3 && y < vy1 + 0.3)) { spawn(i, false); i--; continue; }
        px[i] = x; py[i] = y; hx[i * HL + hd] = x; hy[i * HL + hd] = y;
        const t = colMode === 'speed' ? (sp - 0.5) / 1.6 : 1 - sp * sp / 3;
        bins[clamp(Math.round(t * (NB - 1)), 0, NB - 1)].push(i);
      }
    }

    // --- draw ---
    occ = []; LQ = [];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 1.7;
    for (let b = 0; b < NB; b++) {
      const lst = bins[b]; if (!lst.length) continue; ctx.strokeStyle = pal[b];
      for (let pass = 0; pass < 3; pass++) {
        ctx.globalAlpha = [0.9, 0.5, 0.2][pass]; ctx.beginPath();
        for (const i of lst) {
          const k0 = [0, 4, 9][pass], k1 = [4, 9, HL - 1][pass];
          for (let k = k0; k <= k1; k++) { const id = i * HL + ((hd - k + HL * 2) % HL), X = sx(hx[id]), Y = sy(hy[id]); k === k0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y); }
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    const kF = 0.7 * S, rot = (ang, x, y) => [px0 + S * (Math.cos(ang) * x - Math.sin(ang) * y), py0 - S * (Math.sin(ang) * x + Math.cos(ang) * y)];
    const wingPath = (ang) => { ctx.beginPath(); for (let i = 0; i < NV; i += 2) { const [X, Y] = rot(ang, XC[i], YC[i]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.closePath(); };
    // horizon (wind direction) and ghost of the 0° wing
    ctx.strokeStyle = C.muted; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.setLineDash([7, 6]); ctx.beginPath(); ctx.moveTo(px0 - 12 * S * ew[0], py0 + 12 * S * ew[1]); ctx.lineTo(px0 + 12 * S * ew[0], py0 - 12 * S * ew[1]); ctx.stroke();
    ctx.globalAlpha = 0.45; ctx.strokeStyle = C.text2; wingPath(phw); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    // pressure / friction arrows (under the wing outline)
    const cp = cpEff(Mf);
    const surf = (spacing, fn) => { let lx = -1e9, ly = -1e9; for (let i = 0; i < NV; i++) { const x = XC[i] + 0.25; if (x > 0.985) continue; const [X, Y] = rot(thv, XC[i], YC[i]); if (Math.hypot(X - lx, Y - ly) < spacing) continue; lx = X; ly = Y; fn(i, X, Y); } };
    if (on.press) {
      const kp = 0.06 * S, cap = 0.45 * S; ctx.lineWidth = 1.3;
      surf(W < 520 ? 8 : 9, (i, X, Y) => {
        const nxw = Math.cos(thv) * VNX[i] - Math.sin(thv) * VNY[i], nyw = Math.sin(thv) * VNX[i] + Math.cos(thv) * VNY[i], len = Math.min(cap, Math.abs(cp[i]) * kp); if (len < 3) return;
        const ox = nxw * len, oy = -nyw * len; if (cp[i] < 0) arrowPx(ctx, X + nxw * 1.5, Y - nyw * 1.5, X + ox, Y + oy, C.air, 1.3, 5); else arrowPx(ctx, X + ox, Y + oy, X + nxw * 1.5, Y - nyw * 1.5, C.fire, 1.3, 5);
      });
    }
    if (on.fric && P.real) {
      surf(W < 520 ? 17 : 20, (i, X, Y) => {
        const up_ = i <= iLE, xl = XC[i] + 0.25, back = Mf.st && up_ && xl > Mf.xs, f = (up_ ? -1 : 1) * (back ? -0.35 : 1), tw_ = Math.cos(thv) * TXc[i] - Math.sin(thv) * TYc[i], tyw = Math.sin(thv) * TXc[i] + Math.cos(thv) * TYc[i], len = clamp(0.1 * S * Mf.p.Vs[i] ** 2 * (xl + 0.1) ** -0.2 * (back ? 0.6 : 1), 4, 0.28 * S);
        const nxw = Math.cos(thv) * VNX[i] - Math.sin(thv) * VNY[i], nyw = Math.sin(thv) * VNX[i] + Math.cos(thv) * VNY[i], X0 = X + nxw * 3, Y0 = Y - nyw * 3;
        arrowPx(ctx, X0, Y0, X0 + f * tw_ * len, Y0 - f * tyw * len, C.text2, 1.8, 5);
      });
    }
    // wing
    wingPath(thv); ctx.fillStyle = C.metal; ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = C.text; ctx.lineWidth = 1.8; ctx.stroke();
    const [leX, leY] = rot(thv, -0.25, 0), [teX, teY] = rot(thv, 0.75, 0); const wbx = [Math.min(leX, teX) - 4, Math.min(leY, teY) - 0.1 * S, Math.abs(teX - leX) + 8, Math.abs(teY - leY) + 0.2 * S]; occ.push(wbx);
    // chord line + angle arc
    const ra = S * 0.62, aLE = Math.PI + thv, aW = Math.PI + phw;
    ctx.strokeStyle = C.warn; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.beginPath(); ctx.moveTo(px0 + (ra + 10) * -ec[0], py0 + (ra + 10) * ec[1]); ctx.lineTo(teX, teY); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = 2; ctx.beginPath(); for (let j = 0; j <= 20; j++) { const a_ = aW + (aLE - aW) * j / 20, X = px0 + ra * Math.cos(a_), Y = py0 - ra * Math.sin(a_); j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke();
    { const am = (aW + aLE) / 2; lab(`α = ${nf(aa, 1)}°`, px0 + (ra + 3) * Math.cos(am), py0 - (ra + 3) * Math.sin(am), -1, 0, C.warn, false, 1); }
    // circulation loop
    const Gc = Mf.CL / 2;
    if (on.circ) {
      ctx.save(); ctx.strokeStyle = C.violet; ctx.lineWidth = 1.8; ctx.setLineDash([7, 6]); ctx.lineDashOffset = -T * 40 * Math.sign(Gc || 1); ctx.beginPath();
      for (let j = 0; j <= 60; j++) { const t = j / 60 * TAU, [X, Y] = rot(thv, 0.25 + 0.7 * Math.cos(t), 0.36 * Math.sin(t)); j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.stroke(); ctx.restore();
      for (const t of [0.5 * Math.PI, 1.5 * Math.PI]) { const s_ = Math.sign(Gc || 1), [X, Y] = rot(thv, 0.25 + 0.7 * Math.cos(t), 0.36 * Math.sin(t)), [X2, Y2] = rot(thv, 0.25 + 0.7 * Math.cos(t - s_ * 0.12), 0.36 * Math.sin(t - s_ * 0.12)); arrowPx(ctx, X2, Y2, X, Y, C.violet, 1.8, 7); }
      const [Xt, Yt] = rot(thv, 0.25, 0.36); lab(`Γ = ${fN(Mf.Gam)} m²/s`, Xt, Yt, 0, -1, C.violet, false, 4);
    }
    // vortices
    if (on.bound && Math.abs(Gc) > 0.01) {
      const rb = S * (0.07 + 0.3 * Math.abs(Gc)), cw = Gc > 0; swirl(ctx, px0, py0, rb, T * (cw ? 1 : -1) * (3 + 6 * Math.abs(Gc)), cw, C.violet, 0.95);
      lab('bound vortex', px0 - rb * 0.7, py0 - rb * 0.7, -1, -1, C.violet, false, 4);
    }
    let bigS = null;
    for (const v of vort) {
      const show = v.k === 's' ? on.start : on.street; if (!show) continue;
      const cw = v.G > 0, r = S * (0.03 + 0.22 * Math.sqrt(Math.abs(v.G))), fade = clamp((6 - v.age) / 2, 0, 1) * clamp(Math.abs(v.G) * 25, 0.3, 1);
      swirl(ctx, sx(v.x), sy(v.y), r, T * (cw ? 1 : -1) * (4 + 10 * Math.sqrt(Math.abs(v.G))) + v.ph, cw, cw ? C.violet : C.fuel, fade);
      if (v.k === 's' && Math.abs(v.G) > 0.04 && (!bigS || Math.abs(v.G) > Math.abs(bigS.G)) && v.age < 3.2) bigS = v;
    }
    if (bigS) lab(`${bigS.G < 0 ? 'starting' : 'stopping'} vortex\n${fN(-bigS.G * P.V * P.ch)} m²/s`, sx(bigS.x), sy(bigS.y), 0.3, bigS.G < 0 ? -1 : 1, bigS.G < 0 ? C.fuel : C.violet, false, 2);
    if (Mf.st) {
      const xs_ = Mf.xs - 0.25, ys_ = yAt(yUp, xs_), [X, Y] = rot(thv, xs_, ys_); ctx.strokeStyle = C.bad; ctx.lineWidth = 2.2; ctx.fillStyle = C.bg; ctx.beginPath(); ctx.arc(X, Y, 5, 0, TAU); ctx.fill(); ctx.stroke(); lab('separation point\nSTALL', X, Y - 6, 0, -1, C.bad, false, 1);
      if (on.street) lab('shed vortex street', sx(1.6 * ec[0]), sy(1.6 * ec[1] + 0.25), 1, -0.2, C.fuel, true, 5);
    }
    // forces
    const xa = Number.isFinite(Mf.xcp) ? clamp(Mf.xcp, 0.03, 0.97) : 0.25, cpX = px0 + S * ec[0] * (xa - 0.25), cpY = py0 - S * ec[1] * (xa - 0.25);
    const Lv = [el_[0] * Mf.CL * kF, -el_[1] * Mf.CL * kF], Dv = [ew[0] * Mf.CD * kF, -ew[1] * Mf.CD * kF], Rv = [Lv[0] + Dv[0], Lv[1] + Dv[1]];
    const farrow = (v, c, w, text, dir, dsh, pr) => { arrowPx(ctx, cpX, cpY, cpX + v[0], cpY + v[1], c, w, 9, dsh); occSeg(cpX, cpY, cpX + v[0], cpY + v[1]); if (text && Math.hypot(v[0], v[1]) > 2) lab(text, cpX + v[0], cpY + v[1], dir[0], dir[1], c, false, pr); };
    if (on.wt && Mf.CL > 0) { const gx = Math.sin(phw), gy = Math.cos(phw), m = Mf.CL * kF; arrowPx(ctx, px0, py0, px0 + gx * m, py0 + gy * m, C.metal, 3.2, 9); occSeg(px0, py0, px0 + gx * m, py0 + gy * m); lab(`Weight ${fN(Mf.L)} N/m\n= lift = ${fN(Mf.L / G0)} kg per m`, px0 + gx * m, py0 + gy * m, 0, 1, C.metal, false, 2); }
    if (on.comp) {
      const Nn = Mf.CN * kF, Aa = Mf.CA * kF, nv = [en[0] * Nn, -en[1] * Nn], av = [ec[0] * Aa, -ec[1] * Aa], tp = [cpX + nv[0] + av[0], cpY + nv[1] + av[1]];
      ctx.save(); ctx.strokeStyle = C.fuel; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(cpX + nv[0], cpY + nv[1]); ctx.lineTo(tp[0], tp[1]); ctx.lineTo(cpX + av[0], cpY + av[1]); ctx.stroke(); ctx.restore();
      farrow(nv, C.fuel, 2.2, `Normal ${fN(Mf.k * Mf.CN)} N/m`, [-1, 0], null, 3); farrow(av, C.fuel, 2.2, `Axial ${fN(Mf.k * Mf.CA)} N/m${Mf.CA < 0 ? '\n(points forward)' : ''}`, [ec[0] * Math.sign(Mf.CA || 1), 0.6], null, 3);
    }
    if (on.res) farrow(Rv, C.text, 2.2, `Resultant ${fN(Math.hypot(Mf.L, Mf.D))} N/m`, [-0.7, Rv[1] < 0 ? -0.7 : 0.7], [6, 4], 2);
    if (on.lift) farrow(Lv, C.ok, 3.6, `Lift ${fN(Mf.L)} N/m`, [0.8, Lv[1] < 0 ? -0.6 : 0.6], null, 1);
    if (on.drag) { const dv = [Dv[0] * DM, Dv[1] * DM], dl = [Mf.CDf, Mf.CDp, Mf.CDi].map(x => fN(x * Mf.k)); farrow(dv, C.bad, 3.2, `Drag ${fN(Mf.D)} N/m (arrow ×${DM})\nfriction ${dl[0]} + form ${dl[1]}${P.fin ? ' + induced ' + dl[2] : ''}`, [1, 0.5], null, 1); }
    if (on.cp) {
      const [aX, aY] = [px0, py0]; ctx.strokeStyle = C.warn; ctx.fillStyle = C.bg; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(aX, aY, 5, 0, TAU); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(aX - 3, aY); ctx.lineTo(aX + 3, aY); ctx.moveTo(aX, aY - 3); ctx.lineTo(aX, aY + 3); ctx.stroke();
      lab('aerodynamic centre\n(¼ chord)', aX, aY + 5, -0.5, 1, C.warn, false, 4);
      if (Number.isFinite(Mf.xcp)) { ctx.fillStyle = C.warn; ctx.strokeStyle = C.text; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cpX, cpY - 7); ctx.lineTo(cpX + 6, cpY); ctx.lineTo(cpX, cpY + 7); ctx.lineTo(cpX - 6, cpY); ctx.closePath(); ctx.fill(); ctx.stroke(); lab(`centre of pressure\nx/c = ${nf(Mf.xcp)}`, cpX, cpY + 7, 0.5, 1, C.warn, false, 3); } else lab('no lift: the centre of pressure\nruns off the wing', aX, aY - 8, 0, -1, C.warn, false, 3);
      const mr = S * 0.3, sg_ = Mf.Cm > 0 ? -1 : 1, ac = thv + Math.PI / 2, m1 = ac + sg_ * 0.9; ctx.strokeStyle = C.warn; ctx.lineWidth = 2; ctx.beginPath();
      for (let j = 0; j <= 14; j++) { const m = ac - sg_ * 0.9 + sg_ * 1.8 * j / 14; j ? ctx.lineTo(aX + mr * Math.cos(m), aY - mr * Math.sin(m)) : ctx.moveTo(aX + mr * Math.cos(m), aY - mr * Math.sin(m)); } ctx.stroke();
      { const Xe = aX + mr * Math.cos(m1), Ye = aY - mr * Math.sin(m1), tx = -Math.sin(m1) * sg_, ty = -Math.cos(m1) * sg_; arrowPx(ctx, Xe - tx * 10, Ye - ty * 10, Xe, Ye, C.warn, 2, 8); }
      lab(`moment ${fN(Mf.M)} N·m/m\n${Mf.Cm < 0 ? '(nose down)' : '(nose up)'}`, aX + mr * Math.cos(thv + Math.PI * 0.5), aY - mr * Math.sin(thv + Math.PI * 0.5), 0, -1, C.warn, false, 4);
    }
    // wind arrow, scale bar, colour key, plane
    const fs = W < 520 ? 10.5 : 12; ctx.font = `700 ${fs}px ui-sans-serif, system-ui, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    { const wy = 22 + (view === 'air' ? 0 : 12), x0 = 12, ln = 50; arrowPx(ctx, x0, wy, x0 + ln * ew[0], wy - ln * ew[1], C.air, 3.2, 10); ctx.fillStyle = C.air; ctx.fillText('wind (free stream)', x0 + ln + 8, 15); ctx.fillStyle = C.muted; ctx.font = `600 ${fs - 1}px ui-sans-serif, system-ui, sans-serif`; ctx.fillText(view === 'air' ? '= flight direction reversed' : `arrives ${nf(aa, 1)}° off the chord`, x0 + ln + 8, 30); occ.push([4, 2, ln + 14 + Math.max(ctx.measureText('= flight direction reversed').width, 110), 46]); }
    { const ppn = Mf.k / kF, nb = nice(0.6 * S * ppn), bl = nb / ppn, bx = W - 14 - bl; ctx.strokeStyle = C.text2; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(bx, 22); ctx.lineTo(bx + bl, 22); ctx.moveTo(bx, 17); ctx.lineTo(bx, 27); ctx.moveTo(bx + bl, 17); ctx.lineTo(bx + bl, 27); ctx.stroke(); ctx.fillStyle = C.text2; ctx.textAlign = 'right'; ctx.font = `700 ${fs - 1}px ui-sans-serif, system-ui, sans-serif`; ctx.fillText(`${nb} N/m`, W - 14, 38); ctx.fillText('arrow scale', W - 14, 52); ctx.textAlign = 'left'; occ.push([bx - 8, 8, bl + 22, 52]); }
    { const g = ctx.createLinearGradient(12, 0, 82, 0); pal.forEach((c_, i) => g.addColorStop(i / (NB - 1), c_)); ctx.fillStyle = g; ctx.fillRect(12, H - 22, 70, 6); ctx.fillStyle = C.muted; ctx.font = `600 ${fs - 2}px ui-sans-serif, system-ui, sans-serif`; ctx.fillText(colMode === 'speed' ? 'slow' : 'suction', 12, H - 8); ctx.textAlign = 'right'; ctx.fillText(colMode === 'speed' ? 'fast' : 'pressure', 82, H - 8); ctx.textAlign = 'left'; occ.push([6, H - 34, 84, 32]); }
    { const pw = Math.min(150, W * 0.4), ph = Math.round(pw * 0.56); drawPlane(W - pw - 8, H - ph - 8, pw, ph, aa); occ.push([W - pw - 12, H - ph - 12, pw + 8, ph + 8]); }
    flushLabels();
    flowCv.style.borderColor = Mf.st ? C.bad : '';
    if (Mf.st !== lastSt || (vort.length && Math.floor(T * 4) !== lastTick)) { lastSt = Mf.st; lastTick = Math.floor(T * 4); infoText(); }
    drawTip(dt);
  }
  let lastSt = false, lastTick = -1;

  // ---- finite wing panel: tip vortices, downwash, plan view ----
  const tipSz = { w: 0, h: 0 }, tvis = whenVisible(tipCv, () => {});
  function drawTip() {
    if (!tvis() || !Mt) return;
    const w = Math.round(tipCv.clientWidth), side = w >= 520; if (!w) return; const hg = side ? Math.round(w / 2.15) : Math.round(w * 1.2), d = Math.min(2, devicePixelRatio || 1);
    if (tipSz.w !== w || tipSz.h !== hg || tipSz.d !== d) { tipSz.w = w; tipSz.h = hg; tipSz.d = d; tipCv.style.height = hg + 'px'; tipCv.width = Math.round(w * d); tipCv.height = Math.round(hg * d); }
    const g = tctx, M = Mt, CL = M.CL, s = Math.sign(CL) || 1, ai = CL / (Math.PI * P.AR), aiD = ai / DEG, wv = ai * P.V, on_ = on.tip;
    g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = C.bg; g.fillRect(0, 0, w, hg); g.font = '600 11px ui-sans-serif, system-ui, sans-serif'; g.textBaseline = 'middle';
    const A = side ? { x: 0, y: 0, w: w * 0.42, h: hg } : { x: 0, y: 0, w, h: hg * 0.5 }, B = side ? { x: w * 0.42, y: 0, w: w * 0.58, h: hg } : { x: 0, y: hg * 0.5, w, h: hg * 0.5 };
    g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); if (side) { g.moveTo(B.x + 0.5, 8); g.lineTo(B.x + 0.5, hg - 8); } else { g.moveTo(8, B.y + 0.5); g.lineTo(w - 8, B.y + 0.5); } g.stroke();
    const txt = (t, x, y, c, al = 'left', sz = 11) => { g.font = `700 ${sz}px ui-sans-serif, system-ui, sans-serif`; g.fillStyle = c; g.textAlign = al; g.fillText(t, x, y); };
    // rear view
    txt('Rear view: looking along the flight path', A.x + 10, A.y + 14, C.text2);
    const cx = A.x + A.w / 2, cy = A.y + A.h * 0.3, bW = A.w * 0.56, vy = cy + A.h * 0.2, rv = clamp(7 + 9 * Math.sqrt(Math.abs(CL)), 7, 17), vxo = 0.39 * bW;
    g.strokeStyle = C.metal; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - bW / 2, cy); g.lineTo(cx + bW / 2, cy); g.stroke();
    const ln = clamp(6 + Math.abs(aiD) * 4.5, 6, A.h * 0.26);
    for (const f of [-0.6, -0.3, 0, 0.3, 0.6]) arrowPx(g, cx + vxo * f, cy + 10 * s, cx + vxo * f, cy + (10 + ln) * s, C.air, 2.2, 7);
    for (const sd of [-1, 1]) arrowPx(g, cx + sd * (bW / 2 + 34), cy + 18 * s, cx + sd * (bW / 2 + 34), cy + (18 - ln * 0.6) * s, C.air, 1.8, 6);
    if (on_) {
      swirl(g, cx - vxo, vy, rv, T * 5 * s, s > 0, s > 0 ? C.violet : C.fuel, 1); swirl(g, cx + vxo, vy, rv, -T * 5 * s, s < 0, s > 0 ? C.fuel : C.violet, 1);
      g.strokeStyle = C.air; g.lineWidth = 1.5; for (const sd of [-1, 1]) { g.beginPath(); g.arc(cx + sd * bW / 2, cy, 12, Math.PI / 2, sd > 0 ? -Math.PI / 2 : Math.PI * 1.5, sd > 0); g.stroke(); arrowPx(g, cx + sd * bW / 2 + sd * 6, cy - 12, cx + sd * bW / 2 - sd * 1, cy - 12, C.air, 1.5, 6); }
      txt('tip vortex', cx + vxo, vy + rv + 13, s > 0 ? C.fuel : C.violet, 'center'); txt('tip vortex', cx - vxo, vy + rv + 13, s > 0 ? C.violet : C.fuel, 'center');
    }
    { const yb = cy + (10 + ln) * s + 12 * s; txt('downwash', cx, yb, C.air, 'center', 10.5); txt(`w = ${fN(wv)} m/s`, cx, yb + 12, C.air, 'center', 10.5); }
    txt('upwash', cx + bW / 2 + 34, cy + (18 - ln * 0.6) * s - 10 * s, C.air, 'center', 10);
    txt(`air leaks round the tips: αi = ${nf(aiD, 1)}°`, A.x + 10, A.y + A.h - 10, C.muted, 'left', 10.5);
    // plan view
    txt(`Plan view from above: AR = b ÷ c = ${nf(P.AR, 1)}`, B.x + 10, B.y + 14, C.text2);
    const bP = Math.min(B.h * 0.6, B.w * 0.4), cP = Math.max(4, bP / P.AR), x0 = B.x + B.w * 0.14, yc = B.y + B.h * 0.56, xE = B.x + B.w - 16, xt = x0 + cP, inw = 0.11 * bP;
    g.fillStyle = C.metal; g.globalAlpha = 0.85; g.fillRect(x0, yc - bP / 2, cP, bP); g.globalAlpha = 1; g.strokeStyle = C.text; g.lineWidth = 1.4; g.strokeRect(x0, yc - bP / 2, cP, bP);
    arrowPx(g, x0 - 12, yc + bP / 2, x0 - 12, yc - bP / 2, C.muted, 1.2, 5); arrowPx(g, x0 - 12, yc - bP / 2, x0 - 12, yc + bP / 2, C.muted, 1.2, 5); txt(`b = ${nf(P.AR * P.ch, 1)} m`, x0 - 18, yc, C.muted, 'right', 10);
    txt(`c = ${nf(P.ch, 1)} m`, x0 + cP / 2, yc + bP / 2 + 12, C.muted, 'center', 10);
    if (on_) {
      g.lineWidth = 3; g.strokeStyle = C.violet; g.beginPath(); g.moveTo(x0 + cP * 0.25, yc + bP / 2); g.lineTo(x0 + cP * 0.25, yc - bP / 2); g.stroke(); arrowPx(g, x0 + cP * 0.25, yc + bP * 0.1, x0 + cP * 0.25, yc - bP * 0.12, C.violet, 3, 8); txt('bound vortex', x0 + cP * 0.25 - 6, yc - bP / 2 - 10, C.violet, 'center', 10.5);
      const leg = (y0, sd, c) => { g.strokeStyle = c; g.lineWidth = 2.2; g.beginPath(); for (let x = xt; x <= xE; x += 3) { const u = x - xt, y = y0 + sd * inw * (1 - Math.exp(-u / (0.6 * bP))) + Math.sin(u / (0.07 * bP + 5) - T * 5) * (0.025 * bP + 1) * (1 - Math.exp(-u / 30)); x === xt ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); };
      leg(yc - bP / 2, 1, C.fuel); leg(yc + bP / 2, -1, C.violet);
      g.strokeStyle = C.fuel; g.lineWidth = 1.6; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(xE, yc - bP / 2 + inw); g.lineTo(xE, yc + bP / 2 - inw); g.stroke(); g.setLineDash([]);
      txt('tip vortex', xt + (xE - xt) * 0.45, yc - bP / 2 - 12, C.fuel, 'center', 10.5); txt('tip vortex', xt + (xE - xt) * 0.45, yc + bP / 2 + 14, C.violet, 'center', 10.5); txt('starting vortex', xE - 4, yc, C.fuel, 'right', 10);
    }
    g.lineWidth = 1.5; for (const f of [0.28, 0.5, 0.72]) for (const r of [-0.2, 0.2]) { const X = xt + (xE - xt) * f, Y = yc + r * bP; g.strokeStyle = C.air; g.beginPath(); g.arc(X, Y, 5, 0, TAU); g.stroke(); g.beginPath(); if (s > 0) { g.moveTo(X - 3, Y - 3); g.lineTo(X + 3, Y + 3); g.moveTo(X + 3, Y - 3); g.lineTo(X - 3, Y + 3); } else g.arc(X, Y, 1.2, 0, TAU); g.stroke(); }
    txt(s > 0 ? '⊗ air pushed down between the tip vortices' : '⊙ air pushed up', B.x + 10, B.y + B.h - 10, C.air, 'left', 10.5);
  }

  // ---- go ----
  const vis = whenVisible(el, () => {});
  new MutationObserver(() => { readCols(); drawCp(); drawPol(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  readCols(); setup(); GbPrev = Mt.CL / 2; aa = aT;
  requestAnimationFrame(frame);
}
