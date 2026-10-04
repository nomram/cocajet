// A steam power plant (Rankine cycle) on a T–s diagram, plus a "who wins?" bar chart: steam, gas turbine, combined cycle, CJ-1.
import { h, shell, slider, toggle, button, readout, legend } from '../ui.js';
import { Plot } from '../plot.js';
import { loadSteam, dome, isobar, statePS, statePH, statePT, hps, minSteamT, rankine, combinedCycle } from '../steam.js';
import { CJ1, isa, steadyAt, FUELS } from '../engine-model.js';

const f0 = (v) => Math.round(v).toLocaleString('en-US');
const pf = (p) => (p >= 1 ? +p.toPrecision(3) : p >= 0.01 ? +p.toPrecision(2) : +p.toPrecision(1)).toString();

export default async function init(el) {
  const { body } = shell(el, {
    title: 'A steam power plant: boil, expand, condense, pump',
    note: 'Water is boiled at high pressure, expanded through a turbine, condensed and pumped back: the <b>Rankine cycle</b>. The shaded area on the T–s diagram is the net work per kilogram. A <b>gas-turbine power plant is literally a jet engine whose exhaust drives a power turbine and generator instead of a nozzle</b>; put a steam cycle on top of its hot exhaust (a heat-recovery boiler) and the Brayton cycle of chapter 3 and this Rankine cycle become one <b>combined-cycle</b> plant. Steam properties come from the IAPWS-IF97 tables (<code>data/steam-tables.json</code>). The model has no feed-water heaters, which add 4–6 points to a real plant, and ignores generator and boiler losses.',
  });
  body.append(h('p', { style: { color: 'var(--muted)', fontSize: '.86rem', margin: 0 } }, 'Loading steam tables…'));
  try { await loadSteam('data/steam-tables.json'); } catch (e) { body.innerHTML = ''; body.append(h('p', {}, 'Could not load data/steam-tables.json (' + e.message + '). Serve the site over http, not file://.')); return; }
  body.innerHTML = '';

  /* ---------- the CJ-1 reference, straight from the engine model ---------- */
  const cj = steadyAt({ ...CJ1 }, CJ1.Ndesign, isa(0)), cjEta = 0.5 * cj.mg * cj.Ve ** 2 / (cj.mf * FUELS.propane.LHV);
  const DOME = dome(120);

  /* ---------- controls ---------- */
  const cv = h('canvas', { class: 'plot' }), cvB = h('canvas', { class: 'plot' });
  const sP = slider({ label: 'Boiler pressure', min: 1, max: 25, step: 0.5, value: 10, unit: 'MPa', fmt: (v) => v.toFixed(1), onInput: upd });
  const sT = slider({ label: 'Steam temperature', min: 300, max: 620, step: 5, value: 500, unit: '°C', fmt: (v) => v.toFixed(0), onInput: upd });
  const snapC = (v) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
  const sC = slider({ label: 'Condenser pressure', min: 5, max: 100, step: 1, value: 10, unit: 'kPa', log: true, fmt: (v) => snapC(v).toFixed(v < 10 ? 1 : 0), onInput: upd });
  const sEt = slider({ label: 'Turbine isentropic efficiency', min: 0.7, max: 1, step: 0.01, value: 0.85, fmt: (v) => (v * 100).toFixed(0) + ' %', onInput: upd });
  const sEp = slider({ label: 'Pump efficiency', min: 0.6, max: 0.95, step: 0.01, value: 0.85, fmt: (v) => (v * 100).toFixed(0) + ' %', onInput: upd });
  const tR = toggle({ label: 'Reheat: send the steam back to the boiler halfway', checked: false, onChange: upd });
  const sR = slider({ label: 'Reheat pressure (fraction of boiler pressure)', min: 0.1, max: 0.5, step: 0.01, value: 0.2, fmt: (v) => (v * 100).toFixed(0) + ' %', onInput: upd });
  const sMW = slider({ label: 'Electrical output wanted', min: 50, max: 1000, step: 10, value: 500, unit: 'MW', fmt: (v) => f0(v), onInput: upd });
  const PRE = [
    ['Small old plant', 4, 400, 10, 0.8, false], ['Subcritical', 10, 500, 10, 0.85, false],
    ['Reheat 16.5 MPa', 16.5, 540, 8, 0.88, true], ['Supercritical', 25, 600, 5, 0.9, true],
  ];
  const presets = h('div', { class: 'btn-row' }, PRE.map(([n, p, T, c, e, r]) => button(n, () => { sP.set(p); sT.set(T); sC.set(c); sEt.set(e); tR.set(r); upd(); }, 'small')));
  const ro = {
    eta: readout('Thermal efficiency', '%', 'good'), id: readout('Ideal cycle', '%', 'cool'), car: readout('Carnot ceiling', '%', 'cool'),
    wn: readout('Net work', 'kJ/kg', 'good'), qi: readout('Heat in', 'kJ/kg', 'fuel'), bwr: readout('Pump ÷ turbine work', '%', 'cool'),
    x: readout('Exit quality x', '', 'good'), mdot: readout('Steam flow', 'kg/s', 'hot'),
    qo: readout('Waste heat', 'MW', 'bad'), cw: readout('River water (ΔT 10 K)', 'm³/s', 'cool'),
  };
  const warn = h('div', { class: 'callout', style: { margin: '10px 0 0', padding: '10px 14px', fontSize: '.86rem' } });
  const tbody = h('tbody'), table = h('div', { class: 'table-wrap' }, h('table', { class: 'data', style: { fontSize: '.74rem' } }, h('thead', {}, h('tr', {}, ...['#', 'State', 'p MPa', 'T °C', 'h kJ/kg', 's kJ/kgK', 'x'].map((t, i) => h('th', { class: i > 1 ? 'num' : '', style: { padding: '5px 4px' } }, t)))), tbody));
  const lgd = legend([['var(--fire)', 'heat in (boiler, reheater)'], ['var(--air)', 'turbine (dashed: ideal)'], ['var(--violet)', 'condenser (heat out)'], ['var(--ok)', 'area = net work'], ['var(--muted)', 'dotted: constant pressure, MPa']]);

  /* ---------- compare view ---------- */
  const sGT = slider({ label: 'Gas turbine efficiency η_gt', min: 0.3, max: 0.42, step: 0.005, value: 0.38, fmt: (v) => (v * 100).toFixed(1) + ' %', onInput: updB });
  const sEps = slider({ label: 'Heat-recovery boiler effectiveness ε', min: 0.6, max: 0.9, step: 0.01, value: 0.75, fmt: (v) => v.toFixed(2), onInput: updB });
  const sST = slider({ label: 'Steam cycle efficiency η_st', min: 0.2, max: 0.5, step: 0.005, value: 0.35, fmt: (v) => (v * 100).toFixed(1) + ' %', onInput: updB });
  const link = toggle({ label: 'Use the steam cycle I designed', checked: true, onChange: updB });
  const rb = { cc: readout('Combined cycle', '%', 'good'), add: readout('Steam adds', 'points', 'cool'), waste: readout('Still wasted', '%', 'bad') };
  const formula = h('p', { style: { fontSize: '.85rem', color: 'var(--muted)', margin: '4px 0 0' } }, 'η_cc = η_gt + (1 − η_gt) · ε · η_st : the gas turbine converts η_gt of the fuel energy; the exhaust holds the remaining (1 − η_gt); the heat-recovery boiler hands a share ε of that to a steam cycle, which converts η_st of it.');
  const viewC = h('div', {}, h('div', { class: 'wgrid' }, h('div', { style: { minWidth: '0' } }, cv, lgd, h('div', { style: { marginTop: '10px' } }, presets)), h('div', { class: 'ctls', style: { minWidth: '0' } }, sP.el, sT.el, sC.el, sEt.el, sEp.el, tR.el, sR.el, sMW.el)),
    h('div', { class: 'readouts' }, ...Object.values(ro).map((r) => r.el)), warn, table);
  const viewB = h('div', {}, h('div', { class: 'wgrid' }, h('div', { style: { minWidth: '0' } }, cvB, legend([['var(--bad)', 'dashed: Carnot ceiling at your steam plant’s temperatures'], ['var(--ok)', 'steam adds to the gas turbine']])), h('div', { class: 'ctls', style: { minWidth: '0' } }, sGT.el, sEps.el, link.el, sST.el, h('div', { class: 'readouts' }, ...Object.values(rb).map((r) => r.el)), formula)));
  const vb = { cycle: button('Design the plant', () => show('cycle'), 'small'), cmp: button('Compare plants: steam, gas, combined', () => show('cmp'), 'small') };
  body.append(h('div', { class: 'btn-row', style: { marginBottom: '12px' } }, vb.cycle, vb.cmp), viewC, viewB);

  /* ---------- the cycle plot ---------- */
  const pl = new Plot(cv, { xmin: 0, xmax: 10.5, ymin: 0, ymax: 700, xlabel: 'entropy s (kJ/kg·K)', ylabel: 'temperature T (°C)', aspect: 1.0, minHeight: 320, margin: { l: 48, r: 10, t: 12, b: 42 }, xticks: [0, 2, 4, 6, 8, 10], yticks: [0, 100, 200, 300, 400, 500, 600, 700] });
  let R = null, view = 'cycle';
  const expPath = (a, p2, eta, n = 28) => {
    const ss = [], TT = [];
    for (let i = 0; i <= n; i++) { const p = a.p * Math.pow(p2 / a.p, i / n), st = statePH(p, a.h - eta * (a.h - hps(p, a.s))); ss.push(st.s); TT.push(st.T); }
    return { s: ss, T: TT };
  };
  function compute() {
    const pb = sP.get(), Tmin = minSteamT(pb);
    let T1 = sT.get(), bumped = null;
    if (T1 < Tmin) { T1 = Math.ceil(Tmin / 5) * 5; sT.set(T1); bumped = T1; }
    const args = { pb, T1, pc: snapC(sC.get()) / 1000, etaT: sEt.get(), etaP: sEp.get(), reheat: tR.get(), prhFrac: sR.get() };
    R = rankine(args); R.args = args; R.bumped = bumped;
    R.ideal = rankine({ ...args, etaT: 1, etaP: 1 });
    const MW = sMW.get() * 1000;
    R.mdot = MW / R.wNet; R.Qout = R.mdot * R.qOut / 1000; R.cw = R.mdot * R.qOut / (4.18 * 10) / 1000;
  }
  function upd() {
    compute();
    const { states: S, args } = R, rh = args.reheat, xOK = R.xMin >= 0.88;
    sR.el.style.display = rh ? '' : 'none';
    ro.eta.set((R.eta * 100).toFixed(1)); ro.id.set((R.ideal.eta * 100).toFixed(1)); ro.car.set((R.carnot * 100).toFixed(0));
    ro.wn.set(f0(R.wNet)); ro.qi.set(f0(R.qIn)); ro.bwr.set((R.bwr * 100).toFixed(1));
    ro.x.set(R.xMin >= 0.9995 ? 'dry' : R.xMin.toFixed(2), xOK ? 'good' : 'bad');
    ro.mdot.set(f0(R.mdot)); ro.qo.set(f0(R.Qout)); ro.cw.set(R.cw < 100 ? R.cw.toFixed(1) : f0(R.cw));
    const msg = [];
    if (!xOK) msg.push(`<span class="ct">Wet steam: blade erosion</span>The last turbine row sees ${(100 * (1 - R.xMin)).toFixed(0)} % water droplets (exit quality ${R.xMin.toFixed(2)}, limit 0.88). Droplets hit the blades at hundreds of m/s and eat them. Raise the steam temperature, lower the boiler pressure, or <b>switch reheat on</b>.`);
    else if (!rh && R.xMin < 0.95) msg.push(`<span class="ct">Exit quality ${R.xMin.toFixed(2)}</span>Close to the 0.88 erosion limit. Reheat would dry the steam and raise the efficiency by about 2 points.`);
    else msg.push(`<span class="ct">${R.xMin >= 0.9995 ? 'Dry steam all the way' : 'Exit quality ' + R.xMin.toFixed(2)}</span>Turbine blades are safe. Pump work is only ${(R.bwr * 100).toFixed(1)} % of turbine work (a gas turbine’s compressor swallows 40–60 %). The cycle converts ${(R.eta * 100).toFixed(1)} % of the heat; the Carnot ceiling for ${args.T1} °C and ${R.Tc.toFixed(0)} °C is ${(R.carnot * 100).toFixed(0)} %.`);
    if (R.bumped) msg.push(`<br><b>Steam temperature raised to ${R.bumped} °C:</b> at this pressure anything cooler would still be liquid or wet, not steam.`);
    warn.className = 'callout ' + (xOK ? 'tip' : 'danger'); warn.innerHTML = msg.join('');
    tbody.innerHTML = '';
    for (const s of S) {
      const xs = s.x == null ? '–' : s.x <= 0.0005 ? 'water' : s.x >= 0.9995 ? 'steam' : s.x.toFixed(3);
      tbody.append(h('tr', {}, h('td', { class: 'num', style: { padding: '5px 4px' } }, s.n), h('td', { style: { padding: '5px 4px' } }, s.note),
        ...[pf(s.p), s.T.toFixed(0), f0(s.h), s.s.toFixed(3), xs].map((t) => h('td', { class: 'num', style: { padding: '5px 4px' } }, t))));
    }
    drawTS(); updB();
  }

  function tag(px, py, txt, c) {
    const ctx = pl.ctx; ctx.save(); ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5; ctx.strokeStyle = pl.col.bg; ctx.lineJoin = 'round'; ctx.strokeText(txt, px, py); ctx.fillStyle = c; ctx.fillText(txt, px, py); ctx.restore();
  }
  function drawTS() {
    if (!R || view !== 'cycle') return;
    const c = pl.begin().col, ctx = pl.ctx, { states: S, args } = R, rh = args.reheat; pl.axes();
    const X = (s) => pl.X(s), Y = (T) => pl.Y(T);
    // saturation dome
    ctx.save(); ctx.beginPath();
    DOME.sf.forEach((s, i) => (i ? ctx.lineTo(X(s), Y(DOME.T[i])) : ctx.moveTo(X(s), Y(DOME.T[i]))));
    for (let i = DOME.sg.length - 1; i >= 0; i--) ctx.lineTo(X(DOME.sg[i]), Y(DOME.T[i]));
    ctx.closePath(); ctx.fillStyle = c.air; ctx.globalAlpha = .11; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = c.muted; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
    pl.text(5.6, 150, 'wet steam', { color: c.muted, align: 'center', weight: 600, size: 11.5 }); pl.text(0.6, 300, 'water', { color: c.muted, align: 'left', weight: 600, size: 11.5 });
    pl.text(9.5, 260, 'steam', { color: c.muted, align: 'center', weight: 600, size: 11.5 });
    // reference isobars
    const used = [args.pb, args.pc, R.prh].filter(Boolean);
    for (const p of [0.01, 0.1, 1, 10]) {
      if (used.some((u) => Math.abs(Math.log(u / p)) < 0.3)) continue;
      const send = statePT(p, 650).s, iso = isobar(p, 0.1, send, 50);
      pl.line(iso.s, iso.T, { color: c.muted, width: 1, dash: [3, 4], alpha: .75 });
      pl.ptext(X(send), Y(650) - 5, pf(p), { color: c.muted, align: 'center', base: 'bottom', size: 10.5, weight: 600 });
    }
    // Carnot window
    const Th = args.T1, Tc = R.Tc;
    pl.hline(Th, { color: c.muted, alpha: .8, dash: [2, 4], width: 1 }); pl.hline(Tc, { color: c.muted, alpha: .8, dash: [2, 4], width: 1 });
    pl.text(0.1, Th + 22, `T hot ${Th} °C`, { color: c.muted, size: 10.5, weight: 600 }); pl.text(10.4, Tc + 20, `T cold ${Tc.toFixed(0)} °C`, { color: c.muted, size: 10.5, weight: 600, align: 'right' });
    // the cycle
    const n = S.length, last = S[n - 1], cond = S[n - 2], first = S[0];
    const heat = isobar(args.pb, last.s, first.s, 50), pts = [], add = (a) => a.s.forEach((s, i) => pts.push([s, a.T[i]]));
    add(heat);
    const exps = [], dashed = [];
    if (!rh) { exps.push(expPath(first, args.pc, args.etaT)); dashed.push([first, args.pc]); }
    else { exps.push(expPath(first, R.prh, args.etaT)); dashed.push([first, R.prh]); }
    exps.forEach(add);
    let reh = null;
    if (rh) { reh = isobar(R.prh, S[1].s, S[2].s, 30); add(reh); const e2 = expPath(S[2], args.pc, args.etaT); exps.push(e2); dashed.push([S[2], args.pc]); add(e2); }
    const exitSt = rh ? S[3] : S[1], out = isobar(args.pc, exitSt.s, cond.s, 24); add(out); pts.push([last.s, last.T]);
    ctx.save(); ctx.beginPath(); pts.forEach(([s, T], i) => (i ? ctx.lineTo(X(s), Y(T)) : ctx.moveTo(X(s), Y(T)))); ctx.closePath(); ctx.fillStyle = c.ok; ctx.globalAlpha = .17; ctx.fill(); ctx.restore();
    for (const [a, p2] of dashed) { const b = statePS(p2, a.s); pl.line([a.s, a.s], [a.T, b.T], { color: c.air, width: 1.5, dash: [4, 4], alpha: .85 }); }
    pl.line(heat.s, heat.T, { color: c.fire, width: 3 });
    if (reh) pl.line(reh.s, reh.T, { color: c.fire, width: 3 });
    exps.forEach((e) => pl.line(e.s, e.T, { color: c.air, width: 3 }));
    pl.line(out.s, out.T, { color: c.violet, width: 3 });
    pl.line([cond.s, last.s], [cond.T, last.T], { color: c.ok, width: 3 });
    // state dots + labels
    const off = rh ? { 1: [-13, -8], 2: [13, 0], 3: [13, -9], 4: [13, 11], 5: [2, 16], 6: [-13, 2] } : { 1: [-13, -8], 2: [13, 10], 3: [2, 16], 4: [-13, 2] };
    S.forEach((s) => { pl.dot(s.s, s.T, { color: R.xMin < 0.88 && (s === exitSt || (rh && s === S[1])) && s.x < 0.88 ? c.bad : c.strong, r: 4, ring: false }); const o = off[s.n] || [10, -10]; tag(X(s.s) + o[0], Y(s.T) + o[1], String(s.n), c.strong); });
  }

  /* ---------- the comparison bars ---------- */
  const pb = new Plot(cvB, { xmin: 0, xmax: 80, ymin: 0, ymax: 1, xlabel: 'thermal efficiency (% of fuel energy → work)', aspect: 0.9, minHeight: 380, margin: { l: 12, r: 12, t: 14, b: 44 }, grid: true });
  function updB() {
    if (!R) return;
    const eta = R.eta;
    sST.input.disabled = link.get();
    if (link.get()) sST.set(Math.min(0.5, Math.max(0.2, eta)));
    const gt = sGT.get(), eps = sEps.get(), st = link.get() ? eta : sST.get(), cc = combinedCycle(gt, eps, st);
    rb.cc.set((cc * 100).toFixed(1)); rb.add.set(((cc - gt) * 100).toFixed(1)); rb.waste.set(((1 - cc) * 100).toFixed(0));
    drawB(gt, cc, st);
  }
  function drawB(gt, cc, st) {
    if (view !== 'cmp') return;
    const c = pb.begin().col, ctx = pb.ctx; pb.set({ yticks: [], ytickFmt: () => '' }); pb.axes();
    const rows = [
      { n: 'Simple steam plant (typical)', v: 37.5, lo: 35, hi: 40, col: c.air },
      { n: 'Superheat + reheat steam plant', v: 43.5, lo: 42, hi: 45, col: c.air },
      { n: 'Supercritical coal plant', v: 45, lo: 44, hi: 47, col: c.air },
      { n: 'Gas turbine alone', v: gt * 100, col: c.fuel },
      { n: 'Combined cycle: gas turbine + steam', v: cc * 100, split: gt * 100, col: c.fuel, col2: c.ok, big: true },
      { n: 'Your steam plant (model, no feed-heaters)', v: R.eta * 100, col: c.violet },
      { n: 'CJ-1 turbojet (jet power ÷ fuel power)', v: cjEta * 100, col: c.fire },
    ];
    const top = pb.m.t + 20, rowH = (pb.ih - 20) / rows.length, bh = Math.min(22, rowH * .4);
    // Carnot ceiling of the designed steam plant (drawn first, so labels sit on top)
    const cx = pb.X(R.carnot * 100);
    ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = c.bad; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx, pb.m.t + 14); ctx.lineTo(cx, pb.m.t + pb.ih); ctx.stroke(); ctx.restore();
    const say = (txt, x, y) => { ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeStyle = c.bg; ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y); };
    ctx.save(); ctx.textBaseline = 'middle';
    rows.forEach((r, i) => {
      const y0 = top + i * rowH + rowH - bh - 6, x0 = pb.X(0), x1 = pb.X(r.v);
      ctx.font = '600 11.5px ui-sans-serif, system-ui, sans-serif'; ctx.fillStyle = r.big ? c.strong : c.text; ctx.textAlign = 'left';
      say(r.n, x0 + 4, y0 - 9);
      if (r.split != null) {
        const xm = pb.X(r.split);
        ctx.fillStyle = r.col; ctx.globalAlpha = .9; ctx.fillRect(x0, y0, xm - x0, bh); ctx.fillStyle = r.col2; ctx.fillRect(xm, y0, x1 - xm, bh); ctx.globalAlpha = 1;
        ctx.font = '700 10.5px ui-sans-serif, system-ui, sans-serif'; ctx.fillStyle = '#10171f'; ctx.textAlign = 'center';
        if (xm - x0 > 60) ctx.fillText('gas turbine', (x0 + xm) / 2, y0 + bh / 2); if (x1 - xm > 52) ctx.fillText('+ steam', (xm + x1) / 2, y0 + bh / 2);
      } else { ctx.fillStyle = r.col; ctx.globalAlpha = .88; ctx.fillRect(x0, y0, x1 - x0, bh); ctx.globalAlpha = 1; }
      let xe = x1;
      if (r.lo != null) { ctx.strokeStyle = c.strong; ctx.lineWidth = 1.5; const a = pb.X(r.lo), b = pb.X(r.hi), ym = y0 + bh / 2; ctx.beginPath(); ctx.moveTo(a, ym); ctx.lineTo(b, ym); ctx.moveTo(a, ym - 5); ctx.lineTo(a, ym + 5); ctx.moveTo(b, ym - 5); ctx.lineTo(b, ym + 5); ctx.stroke(); xe = b; }
      ctx.font = '700 12px ui-sans-serif, system-ui, sans-serif'; ctx.fillStyle = r.big ? c.ok : c.strong; ctx.textAlign = 'left'; say(r.v.toFixed(r.lo != null ? 0 : 1) + ' %', xe + 6, y0 + bh / 2);
    });
    ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif'; ctx.fillStyle = c.bad; ctx.textBaseline = 'middle';
    const ct = `Carnot ${(R.carnot * 100).toFixed(0)} %`, room = pb.m.l + pb.iw - cx > ctx.measureText(ct).width + 10;
    ctx.textAlign = room ? 'left' : 'right'; say(ct, cx + (room ? 5 : -5), pb.m.t + 6);
    ctx.restore();
  }
  function show(v) {
    view = v; viewC.style.display = v === 'cycle' ? '' : 'none'; viewB.style.display = v === 'cmp' ? '' : 'none';
    vb.cycle.classList.toggle('on', v === 'cycle'); vb.cmp.classList.toggle('on', v === 'cmp');
    requestAnimationFrame(() => { pl._size(); pb._size(); drawTS(); updB(); });
  }
  pl.onDraw(drawTS); pb.onDraw(() => updB());
  show('cycle'); upd();
}
