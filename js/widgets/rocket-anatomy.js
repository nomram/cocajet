// Inside the giants: Space Shuttle, Saturn V, Soyuz, Falcon 9 and Starship drawn to one scale, stage by stage, with tank volumes computed from
// propellant mass, mixture ratio and density, and a rocket-equation Δv for every stage. Everything is computed from the small table below.
import { h, shell, slider, select, button, readout, toggle, legend } from '../ui.js';
import { Plot } from '../plot.js';
import { G0 } from '../rocket-model.js';

/* densities of the propellants as stored [kg/m³]; solid = typical cast composite propellant (a density, not a recipe) */
export const RHO = { lox: 1141, rp1: 810, lh2: 71, ch4: 423, n2o4: 1440, udmh: 790, solid: 1750 };
/* ofr = oxidiser : fuel by MASS (public engine fact sheets); isp = typical climb-averaged value for the scale-it-down panel */
export const PAIRS = {
  'lox-rp1': { n: 'LOX / RP-1', ox: 'LOX', fu: 'RP-1', ro: RHO.lox, rf: RHO.rp1, ofr: 2.3, isp: 330 },
  'lox-ch4': { n: 'LOX / CH₄', ox: 'LOX', fu: 'CH₄', ro: RHO.lox, rf: RHO.ch4, ofr: 3.6, isp: 345 },
  'lox-lh2': { n: 'LOX / LH₂', ox: 'LOX', fu: 'LH₂', ro: RHO.lox, rf: RHO.lh2, ofr: 5.5, isp: 420 },
  'n2o4-udmh': { n: 'N₂O₄ / UDMH', ox: 'N₂O₄', fu: 'UDMH', ro: RHO.n2o4, rf: RHO.udmh, ofr: 2.6, isp: 315 },
  solid: { n: 'solid propellant', solid: true },
};
const GF = 0.55;                                    // a stage lit on the ground averages Isp = Isp_sl + 0.55 (Isp_vac − Isp_sl) over its climb
export const ORBIT_DV = 9400;                       // m/s: 7.8 km/s orbital speed + ≈ 1.6 km/s gravity and drag losses (− a little Earth rotation)

/* masses in tonnes, thrust in MN, times in s, lengths in m.  par = burns alongside the next stage (strap-on); use = tonnes burned on the way to orbit if not all;
   reserve = tonnes kept for landing or left as residue; g = drawing geometry {w,h,y0,dx,nf (nose fraction),dh (drawn height)} */
export const VEH = [
  { id: 'shuttle', name: 'Space Shuttle', short: 'Shuttle', H: 56.1, pl: 105, plName: 'Orbiter + cargo', plPub: 27.5, plNote: 'cargo only; the ≈ 78 t orbiter reaches orbit too', era: '1981–2011',
    blurb: 'Parallel staging: two solid boosters and the orbiter’s three hydrogen engines all burn at lift-off, and the boosters drop away at two minutes. The hydrogen and oxygen come from the big orange external tank, which is thrown away just short of orbit.',
    plg: { w: 5.5, h: 37.2, y0: 9.2, nf: 0.22, kind: 'orbiter' },
    stages: [
      { id: 'srb', nm: 'Solid rocket boosters (×2)', sh: 'SRB', col: 'fire', n: 2, pair: 'solid', prop: 503, dry: 87, Fsl: 12.5, Fvac: 13.8, ispSl: 242, ispVac: 268, tb: 123, par: true, d: 3.7, hh: 45.5, g: { w: 3.7, h: 45.5, y0: 0, dx: 6.1, nf: 0.12 } },
      { id: 'et', nm: 'External tank + 3 engines', sh: 'ET', col: 'fuel', pair: 'lox-lh2', ofr: 5.93, prop: 735, dry: 26.5, reserve: 8, Fsl: 5.25, Fvac: 6.5, ispSl: 366, ispVac: 452, tb: 510, jettison: true, d: 8.4, hh: 46.9, g: { w: 8.4, h: 46.9, y0: 9.2, nf: 0.2 } }] },
  { id: 'saturn', name: 'Saturn V', short: 'Saturn V', H: 110.6, pl: 51, plName: 'Apollo spacecraft + adapter', plPub: 140, plNote: 'the published 140 t includes the S-IVB with its Moon-burn propellant', era: '1967–1973',
    blurb: 'Three stages stacked in series. The first (kerosene) lifts the whole stack; the two hydrogen stages above it do the high-speed work. Only the S-IVB’s first burn, to orbit, is counted here; roughly two thirds of its propellant stays in the tank for the burn toward the Moon.',
    drops: [{ nm: 'launch-escape tower', mass: 4.2, before: 1 }],
    plg: { w: 6.6, h: 24.9, y0: 85.7, kind: 'apollo' },
    stages: [
      { id: 'sic', nm: 'S-IC (first stage)', sh: 'S-IC', col: 'fire', pair: 'lox-rp1', ofr: 2.27, prop: 2159, dry: 131, Fsl: 33.9, Fvac: 38.8, ispSl: 263, ispVac: 304, tb: 168, d: 10.1, hh: 42.1, g: { w: 10.1, h: 42.1, y0: 0, nf: 0.03 } },
      { id: 'sii', nm: 'S-II (second stage)', sh: 'S-II', col: 'fuel', pair: 'lox-lh2', ofr: 5.5, prop: 456, dry: 36.2, Fvac: 5.1, ispVac: 421, tb: 365, d: 10.1, hh: 24.9, top: 'fu', g: { w: 10.1, h: 24.9, y0: 42.1, nf: 0.03 } },
      { id: 'sivb', nm: 'S-IVB (third stage)', sh: 'S-IVB', col: 'air', pair: 'lox-lh2', ofr: 5.0, prop: 109, use: 35, dry: 10.1, Fvac: 1.0, ispVac: 421, tb: 150, tbTxt: '150 (+ 350)', d: 6.6, hh: 17.8, top: 'fu', g: { w: 6.6, h: 18.7, y0: 67.0, nf: 0.04 } }] },
  { id: 'soyuz', name: 'Soyuz-2', short: 'Soyuz', H: 46.3, pl: 8.2, plName: 'Payload + adapter', plPub: 7.0, plNote: 'Soyuz-2.1a class', era: 'family flying since 1966',
    blurb: 'Parallel staging again, but with four small kerosene boosters clustered round a core stage. Boosters and core all light on the pad; the boosters drop after about two minutes and the core and third stage carry on. The design is a working classic: the same family has flown for sixty years.',
    drops: [{ nm: 'payload fairing', mass: 3.5, before: 2 }],
    plg: { w: 4.1, h: 12.5, y0: 33.8, nf: 0.55, kind: 'nose' },
    stages: [
      { id: 'bst', nm: 'Strap-on boosters (×4)', sh: 'Boosters', col: 'fire', n: 4, pair: 'lox-rp1', ofr: 2.39, prop: 39.6, dry: 3.8, Fsl: 0.8385, Fvac: 1.0213, ispSl: 263, ispVac: 320, tb: 118, par: true, d: 2.68, hh: 19.6, g: { w: 2.68, h: 19.6, y0: 0, dx: 2.9, nf: 0.3 } },
      { id: 'core', nm: 'Core stage', sh: 'Core', col: 'fuel', pair: 'lox-rp1', ofr: 2.39, prop: 93.0, dry: 6.5, Fsl: 0.792, Fvac: 0.99, ispSl: 255, ispVac: 319, tb: 286, d: 2.95, hh: 27.1, g: { w: 2.95, h: 27.1, y0: 0, nf: 0.02 } },
      { id: 'up', nm: 'Third stage', sh: 'Third', col: 'air', pair: 'lox-rp1', ofr: 2.4, prop: 22.8, dry: 2.4, Fvac: 0.298, ispVac: 326, tb: 240, d: 2.66, hh: 6.7, g: { w: 2.66, h: 6.7, y0: 27.1, nf: 0.02 } }] },
  { id: 'f9', name: 'Falcon 9', short: 'Falcon 9', H: 70, pl: 17.5, plName: 'Payload', plPub: 17.5, plNote: 'with the booster recovered; ≈ 22 t if it is thrown away', era: 'Block 5, 2018 on',
    blurb: 'A slim two-stage rocket in serial. The first stage keeps about 25 t of propellant back to fly itself home and land, which is why the payload is smaller when the booster is recovered.',
    drops: [{ nm: 'payload fairing', mass: 1.9, before: 1 }],
    plg: { w: 5.2, h: 13.2, y0: 56.8, nf: 0.5, kind: 'nose' },
    stages: [
      { id: 's1', nm: 'Stage 1 (9 engines)', sh: 'Stage 1', col: 'fire', pair: 'lox-rp1', ofr: 2.36, prop: 395.7, dry: 25.6, reserve: 25, Fsl: 7.6, Fvac: 8.2, ispSl: 282, ispVac: 311, tb: 162, d: 3.7, hh: 42.6, g: { w: 3.7, h: 42.6, y0: 0, nf: 0.02 } },
      { id: 's2', nm: 'Stage 2 (1 vacuum engine)', sh: 'Stage 2', col: 'fuel', pair: 'lox-rp1', ofr: 2.36, prop: 107.5, dry: 4.0, Fvac: 0.934, ispVac: 348, tb: 395, d: 3.7, hh: 14.2, g: { w: 3.7, h: 14.2, y0: 42.6, nf: 0.04 } }] },
  { id: 'ss', name: 'Starship', short: 'Starship', H: 123, pl: 100, plName: 'Payload bay', plPub: 100, plNote: 'design goal with the ship reused', era: 'in development', approx: true,
    blurb: 'A fully reusable two-stage design with methane/oxygen engines, still being flown and changed from version to version. These are rounded, V3-class design figures: treat every number as ± 10–20 %. The booster keeps about a tenth of its propellant for the flight back.',
    plg: { w: 9, h: 18, y0: 105, nf: 0.5, kind: 'nose' },
    stages: [
      { id: 'sh', nm: 'Super Heavy booster (33 engines)', sh: 'Booster', col: 'fire', pair: 'lox-ch4', prop: 3400, dry: 275, reserve: 350, Fsl: 80, Fvac: 86, ispSl: 327, ispVac: 350, tb: 165, d: 9, hh: 71, g: { w: 9, h: 71, y0: 0, nf: 0.01 } },
      { id: 'ship', nm: 'Starship (6 engines)', sh: 'Ship', col: 'fuel', pair: 'lox-ch4', prop: 1500, dry: 150, reserve: 60, Fvac: 15, ispVac: 365, tb: 370, d: 9, hh: 52, g: { w: 9, h: 34, y0: 71, nf: 0.01 } }] },
];

/* --- the numbers: tank volumes, phases (burns), Δv, thrust-to-weight ----------------------------------------------------------------------------- */
export function stageInfo(s) {
  const P = PAIRS[s.pair], n = s.n || 1, prop = s.prop * 1e3, dry = s.dry * 1e3, reserve = (s.reserve || 0) * 1e3, use = s.use != null ? s.use * 1e3 : prop - reserve;
  const ofr = s.ofr ?? P.ofr, mox = P.solid ? 0 : prop * ofr / (1 + ofr), mfu = P.solid ? prop : prop / (1 + ofr);
  const Vox = P.solid ? 0 : mox / P.ro, Vfu = P.solid ? mfu / RHO.solid : mfu / P.rf, A = Math.PI / 4 * s.d * s.d;
  return { ...s, n, P, prop, dry, reserve, use, ofr, mox, mfu, Vox, Vfu, Vtot: Vox + Vfu, rhoBulk: prop / (Vox + Vfu), eps: dry / (dry + prop), Lox: Vox / A, Lfu: Vfu / A,
    Fsl: s.Fsl != null ? s.Fsl * 1e6 : null, Fvac: s.Fvac * 1e6 };
}
export function analyse(v) {
  const st = v.stages.map(stageInfo), drops = (v.drops || []).map(d => ({ ...d, mass: d.mass * 1e3, done: false }));
  const total0 = st.reduce((a, s) => a + s.n * (s.prop + s.dry), 0) + v.pl * 1e3 + drops.reduce((a, d) => a + d.mass, 0);
  const phases = []; let m = total0;
  const eff = (s, ground) => (ground && s.ispSl != null ? s.ispSl + GF * (s.ispVac - s.ispSl) : s.ispVac);
  const mk = (members, tb) => {
    for (const d of drops) if (d.before === phases.length && !d.done) { m -= d.mass; d.done = true; }
    const burned = members.reduce((a, x) => a + x.kg, 0), isp = members.reduce((a, x) => a + x.kg * x.isp, 0) / burned, m0 = m, mf = m - burned;
    phases.push({ ids: members.map(x => x.s.id), m0, mf, isp, dv: isp * G0 * Math.log(m0 / mf), tb, R: m0 / mf }); m = mf;
  };
  st.forEach((s, i) => {
    if (s.par) return;
    const p = i > 0 && st[i - 1].par ? st[i - 1] : null, ground = i === 0 || !!p, last = i === st.length - 1;
    let f = 0;
    if (p) { f = Math.min(1, p.tb / s.tb); mk([{ s: p, kg: p.use * p.n, isp: eff(p, true) }, { s, kg: s.use * f, isp: eff(s, true) }], p.tb); m -= p.n * (p.dry + p.prop - p.use); }
    mk([{ s, kg: s.use * (1 - f), isp: eff(s, ground && !p) }], p ? s.tb - p.tb : s.tb);
    if (!last || s.jettison) m -= s.n * (s.dry + s.prop - s.use);
  });
  let cum = 0; phases.forEach(p => { cum += p.dv; p.cum = cum; });
  const lit = st.filter((s, i) => i === 0 || s.par || (i > 0 && st[i - 1].par)), F0 = lit.reduce((a, s) => a + s.n * s.Fsl, 0);
  return { st, phases, total0, dv: cum, mOrbit: m, F0, tw: F0 / (total0 * G0), pf: v.plPub * 1e3 / total0 };
}

/* --- formatting -------------------------------------------------------------------------------------------------------------------------------------- */
const NB = ' ';
const grp = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
const num = (v, d = 3) => { if (!Number.isFinite(v)) return '–'; if (v === 0) return '0'; const x = +v.toPrecision(d); return Math.abs(x) >= 1000 ? grp(x) : String(x); };
const tons = (kg) => num(kg / 1000) + NB + 't';
const kms = (v) => (v / 1000).toFixed(1);
const nz = (v) => (v == null ? '–' : num(v));

export default function init(el) {
  const { body } = shell(el, { title: 'Inside the giants: five rockets to one scale', badge: 'Interactive',
    note: 'All five rockets are drawn to the <b>same height scale</b> (the axis is in metres; the stick figure is 1.8 m; the CJ-1 engine, 0.19 m long, would be a dot well under one pixel). Pick a vehicle or tap a stage in the drawing or in the table. Masses, thrusts and Isp are rounded public figures (marked ≈; the Starship numbers are design figures that change with each version); everything else is <b>computed</b> from them: tank volumes from the propellant mass, the oxidiser-to-fuel mass ratio and the density of each propellant; Δv from the rocket equation using each burn’s own start and end mass, including everything above it. For a stage that burns at sea level the Isp is taken 55 % of the way from its sea-level to its vacuum value; upper stages use vacuum Isp. Thrust is the nominal lift-off value; engines throttle and solids taper, so the mean over the burn is lower.' });
  const cvL = h('canvas', { class: 'plot', style: { cursor: 'pointer' } }), cvT = h('canvas', { class: 'plot' }), cvD = h('canvas', { class: 'plot' }), cvS = h('canvas', { class: 'plot' });
  const A = VEH.map(analyse);
  let vi = 0, si = 1, hits = [];
  const chips = VEH.map((v, i) => button(v.short, () => { vi = i; si = -1; render(); }, 'small'));
  const byProp = toggle({ label: 'Colour by propellant tank (not by stage)', checked: false, onChange: () => render() });
  const leg = h('div', { class: 'legend', style: { margin: '8px 0 0' } });
  const title = h('div', { style: { fontWeight: '750', fontSize: '1.05rem', margin: '0 0 2px' } }), blurb = h('div', { style: { fontSize: '.86rem', color: 'var(--text-2)', margin: '0 0 6px' } });
  const R = { H: readout('Height', 'm', 'cool'), m0: readout('Lift-off mass', 't', 'cool'), F: readout('Lift-off thrust', 'MN', 'hot'), tw: readout('Thrust ÷ weight', '', 'cool'), pl: readout('Payload to low orbit', 't', 'good'), pf: readout('Payload fraction', '%', 'fuel'), dv: readout('Ideal Δv (computed)', 'km/s', 'hot'), ok: readout('Δv ÷ 9.4 km/s needed', '%', 'cool') };
  const plCap = h('div', { class: 'widget-note', style: { padding: '6px 0 0' } }), tabS = h('div', { class: 'table-wrap' }), tabP = h('div', { class: 'table-wrap' }), info = h('div', { class: 'widget-note', style: { padding: '8px 0 0', minHeight: '5.2em' } });
  const dvNote = h('div', { class: 'widget-note', style: { padding: '8px 0 0' } }), css = h('style', {}, '.ra-tab th,.ra-tab td{padding:6px 7px}.ra-tab td:first-child,.ra-tab th:first-child{min-width:120px;position:sticky;left:0;background:var(--panel);z-index:1}.ra-tab tr[data-on] td:first-child{box-shadow:inset 3px 0 var(--air)}');
  body.append(css, h('div', { class: 'btn-row', style: { alignItems: 'center', marginBottom: '10px' } }, ...chips),
    h('div', { class: 'wgrid' }, h('div', {}, cvL, leg, h('div', { style: { marginTop: '6px' } }, byProp.el)), h('div', {}, title, blurb, h('div', { class: 'readouts', style: { marginTop: '4px' } }, ...Object.values(R).map(r => r.el)), plCap)),
    tabS,
    h('div', { style: { marginTop: '14px' } }, cvT, info), h('div', { style: { marginTop: '14px' } }, cvD, dvNote, tabP));

  /* ---------- scale-it-down panel ---------- */
  const pairSel = select({ label: 'Propellant pair', options: ['lox-rp1', 'lox-ch4', 'lox-lh2', 'n2o4-udmh'].map(k => [k, PAIRS[k].n]), value: 'lox-lh2', onChange: (k) => { sI.set(PAIRS[k].isp); upd2(); } });
  const sI = slider({ label: 'Specific impulse (climb average)', min: 200, max: 460, step: 5, value: 420, unit: 's', fmt: v => v.toFixed(0), onInput: upd2 });
  const sV = slider({ label: 'Δv to reach low orbit (with losses)', min: 8000, max: 10500, step: 50, value: ORBIT_DV, unit: 'm/s', fmt: v => grp(v), onInput: upd2 });
  const sE = slider({ label: 'Structure fraction ε of the one stage (tank + engines ÷ stage)', min: 2, max: 14, step: 0.1, value: 6, unit: '%', fmt: v => v.toFixed(1), onInput: upd2 });
  const sP = slider({ label: 'Payload', min: 10, max: 1e5, step: 1, value: 1000, log: true, fmt: v => (v >= 1000 ? num(v / 1000, 2) + ' t' : v.toFixed(0) + ' kg'), onInput: upd2 });
  const Q = { R: readout('Mass ratio (start ÷ end)', '', 'cool'), emax: readout('Largest ε that works', '%', 'fuel'), lam: readout('Payload fraction', '%', 'good'), m0: readout('Lift-off mass', '', 'hot'), mp: readout('Propellant', '', 'cool'), vox: readout('Oxidiser tank', 'm³', 'cool'), vfu: readout('Fuel tank', 'm³', 'fuel'), st: readout('Verdict', '', 'good') };
  const verdict = h('div', { class: 'widget-note', style: { padding: '8px 0 0' } });
  body.append(h('div', { style: { marginTop: '22px', paddingTop: '14px', borderTop: '1px solid var(--line)' } },
    h('div', { style: { fontWeight: '750', fontSize: '1.02rem' } }, 'Scale it down: could one stage do the whole job?'),
    h('div', { class: 'widget-note', style: { padding: '2px 0 10px' }, html: 'Solve the rocket equation backwards: $m_f/m_0=e^{-\\Delta v/(I_{sp}g_0)}$. With structure fraction ε (empty stage ÷ stage) and payload fraction λ the mass ratio is $m_0/m_f=1/(\\varepsilon+\\lambda(1-\\varepsilon))$, so $\\lambda=(e^{-\\Delta v/(I_{sp}g_0)}-\\varepsilon)/(1-\\varepsilon)$: the payload fraction hits zero when ε reaches $e^{-\\Delta v/(I_{sp}g_0)}$. The shaded band is where real big liquid stages sit.' }),
    h('div', { class: 'wgrid' }, h('div', {}, cvS, legend([['var(--fire)', 'your stage (chosen Isp)'], ['var(--muted)', 'kerosene, methane, hydrogen at their typical Isp'], ['var(--violet)', 'ε of real big liquid stages']])), h('div', { class: 'ctls' }, pairSel.el, sI.el, sV.el, sE.el, sP.el)),
    h('div', { class: 'readouts', style: { marginTop: '10px' } }, ...Object.values(Q).map(r => r.el)), verdict));

  /* ---------- plots ---------- */
  const pL = new Plot(cvL, { xmin: 0, xmax: 1, ymin: 0, ymax: 134, yticks: [0, 20, 40, 60, 80, 100, 120], xticks: [], aspect: 1.05, minHeight: 450, xlabel: '', ylabel: 'height (m)', margin: { l: 46, r: 8, t: 12, b: 42 } });
  const pT = new Plot(cvT, { xmin: 0, xmax: 1, ymin: 0, ymax: 1, aspect: 1.4, minHeight: 200, grid: false, margin: { l: 8, r: 8, t: 6, b: 6 } });
  const pD = new Plot(cvD, { xmin: 0, xmax: 11, ymin: 0, ymax: 1, yticks: [], aspect: 2.1, minHeight: 192, xlabel: 'Δv (km/s)', xticks: [0, 2, 4, 6, 8, 10], margin: { l: 8, r: 10, t: 6, b: 40 } });
  const pS = new Plot(cvS, { xmin: 0, xmax: 14, ymin: 0, ymax: 12, aspect: 1.5, minHeight: 250, xlabel: 'structure fraction ε of the stage (%)', ylabel: 'payload fraction λ (%)', margin: { l: 50, r: 12, t: 12, b: 42 } });
  const fitTxt = (ctx, wt, size, list, maxW) => { ctx.save(); ctx.font = wt + ' ' + size + 'px ui-sans-serif, system-ui, sans-serif'; const t = list.find(x => ctx.measureText(x).width <= maxW) || list[list.length - 1]; ctx.restore(); return t; };
  const fit = (p, hh) => { if (p.o.height !== hh) { p.set({ height: hh }); p._size(); } };

  /* ---------- the to-scale line-up ---------- */
  function path(ctx, cx, w, yb, yt, nf, kind) {
    const x0 = cx - w / 2, x1 = cx + w / 2, nh = Math.max(0, Math.min((yb - yt) * 0.95, (yb - yt) * (nf || 0)));
    ctx.beginPath();
    if (kind === 'apollo') { // service-module adapter, service module, command module, escape tower (24.9 m in total)
      const k = (yb - yt) / 24.9, c = (m) => yb - m * k;
      ctx.moveTo(x0, yb); ctx.lineTo(cx - 1.95 * k, c(8.5)); ctx.lineTo(cx - 1.95 * k, c(15.9)); ctx.lineTo(cx - 0.25 * k, c(19.1)); ctx.lineTo(cx - 0.25 * k, yt); ctx.lineTo(cx + 0.25 * k, yt); ctx.lineTo(cx + 0.25 * k, c(19.1)); ctx.lineTo(cx + 1.95 * k, c(15.9)); ctx.lineTo(cx + 1.95 * k, c(8.5)); ctx.lineTo(x1, yb); ctx.closePath(); return;
    }
    if (nh < 1) { const r = Math.min(2.5, w * 0.18); ctx.moveTo(x0, yb); ctx.lineTo(x0, yt + r); ctx.quadraticCurveTo(x0, yt, x0 + r, yt); ctx.lineTo(x1 - r, yt); ctx.quadraticCurveTo(x1, yt, x1, yt + r); ctx.lineTo(x1, yb); ctx.closePath(); return; }
    ctx.moveTo(x0, yb); ctx.lineTo(x0, yt + nh); ctx.quadraticCurveTo(x0, yt + nh * 0.25, cx, yt); ctx.quadraticCurveTo(x1, yt + nh * 0.25, x1, yt + nh); ctx.lineTo(x1, yb); ctx.closePath();
  }
  function tanks(ctx, cx, w, yb, yt, s, c) {          // paint propellant tanks inside a stage outline (outline is the current clip)
    const x0 = cx - w / 2 - 1, ww = w + 2, hh = yb - yt;
    if (s.P.solid) { ctx.fillStyle = c.fire; ctx.fillRect(x0, yt, ww, hh); return; }
    const bay = hh * 0.06, ht = hh - bay, fo = s.Vox / (s.Vox + s.Vfu), ho = ht * fo, hf = ht - ho, oxTop = s.top !== 'fu';
    const yoT = oxTop ? yt : yt + hf, yfT = oxTop ? yt + ho : yt;
    ctx.fillStyle = c.air; ctx.fillRect(x0, yoT, ww, ho); ctx.fillStyle = c.fuel; ctx.fillRect(x0, yfT, ww, hf); ctx.fillStyle = c.metal; ctx.fillRect(x0, yb - bay, ww, bay);
  }
  function drawLine() {
    const c = pL.begin().col, ctx = pL.ctx, byTank = byProp.get();
    pL.axes(); hits = [];
    const base = pL.Y(0), k = (base - pL.Y(1)) / 1, slotW = (pL.iw - 20) / VEH.length, x0 = pL.m.l + 20;
    // the human (1.8 m) and the CJ-1 engine (0.19 m)
    const hx = pL.m.l + 10; ctx.fillStyle = c.strong; ctx.strokeStyle = c.strong; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx, base - 0.1 * k); ctx.lineTo(hx, base - 1.45 * k); ctx.stroke(); ctx.beginPath(); ctx.arc(hx, base - 1.68 * k, 2, 0, 7); ctx.fill();
    ctx.fillStyle = c.fire; ctx.beginPath(); ctx.arc(hx + 6, base - 0.1 * k, 1.1, 0, 7); ctx.fill();
    pL.ptext(hx, base + 6, 'you', { color: c.muted, size: 10, align: 'center', weight: 600 });
    VEH.forEach((v, i) => {
      const cx = x0 + slotW * (i + 0.5), sel = i === vi, a = sel ? 1 : 0.58, an = A[i], Y = (m) => pL.Y(m);
      ctx.globalAlpha = a;
      const draw = (g, cxx, s, idx, isPl, kind) => {
        const yb = Y(g.y0), yt = Y(g.y0 + (g.dh || g.h)), w = g.w * k;
        const stSel = sel && idx >= 0 && si === idx;
        path(ctx, cxx, w, yb, yt, g.nf, kind);
        ctx.save(); ctx.clip();
        if (isPl) { ctx.fillStyle = c.violet; ctx.fillRect(cxx - w, yt - 1, 2 * w, yb - yt + 2); }
        else if (byTank) tanks(ctx, cxx, w, yb, yt, s, c);
        else { ctx.fillStyle = c[s.col]; ctx.fillRect(cxx - w, yt - 1, 2 * w, yb - yt + 2); }
        ctx.restore();
        path(ctx, cxx, w, yb, yt, g.nf, kind); ctx.lineWidth = stSel ? 2.4 : 1; ctx.strokeStyle = stSel ? c.strong : c.bg; ctx.globalAlpha = 1; ctx.stroke(); ctx.globalAlpha = a;
        if (kind === 'orbiter') { ctx.fillStyle = c.violet; const wy = Y(g.y0 + 12); ctx.beginPath(); ctx.moveTo(cxx - w / 2, wy); ctx.lineTo(cxx - w / 2 - 1.8 * k, yb); ctx.lineTo(cxx - w / 2, yb); ctx.closePath(); ctx.moveTo(cxx + w / 2, wy); ctx.lineTo(cxx + w / 2 + 1.8 * k, yb); ctx.lineTo(cxx + w / 2, yb); ctx.closePath(); ctx.fill(); }
        hits.push({ i, s: idx, x0: cxx - w / 2 - 1, x1: cxx + w / 2 + 1, y0: yt, y1: yb });
      };
      an.st.forEach((s, j) => {
        const g = s.g, cps = s.n > 1 ? [-1, 1] : [0]; if (!g.dx) { draw(g, cx, s, j, false); return; }
        cps.forEach(sg => draw(g, cx + sg * g.dx * k, s, j, false));
      });
      // order: strap-ons were drawn first for Soyuz/Shuttle core overlap; the payload last
      draw(v.plg, cx, null, -1, true, v.plg.kind);
      // stage-separation lines at the top of every serial stage (not the very top of the vehicle)
      ctx.setLineDash([3, 3]); ctx.strokeStyle = c.strong; ctx.lineWidth = 1; ctx.globalAlpha = 0.8 * a;
      an.st.forEach((s) => { const top = s.g.y0 + s.g.h; if (s.par || top > v.H - 0.5) return; const y = Y(top), w = s.g.w * k / 2 + 4; ctx.beginPath(); ctx.moveTo(cx - w, y); ctx.lineTo(cx + w, y); ctx.stroke(); });
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      pL.ptext(cx, Y(v.H) - 4, v.H + ' m', { color: sel ? c.strong : c.muted, size: 10.5, align: 'center', base: 'bottom', weight: sel ? 800 : 600 });
      (slotW < 56 && v.short.includes(' ') ? v.short.split(' ') : [v.short]).forEach((t, q) => pL.ptext(cx, base + 6 + q * 11, t, { color: sel ? c.strong : c.muted, size: 10, align: 'center', weight: sel ? 800 : 600 }));
    });
    const sw = (col, t) => h('span', {}, h('i', { style: { background: col } }), t);
    leg.replaceChildren(...(byTank ? [sw('var(--air)', 'oxidiser tank'), sw('var(--fuel)', 'fuel tank'), sw('var(--fire)', 'solid propellant'), sw('var(--metal)', 'engine bay'), sw('var(--violet)', 'payload / spacecraft')]
      : [sw('var(--fire)', 'first stage / boosters'), sw('var(--fuel)', 'second stage / core'), sw('var(--air)', 'third stage'), sw('var(--violet)', 'payload / spacecraft'), h('span', {}, '┄ stage separation')]));
  }

  /* ---------- tank volumes ---------- */
  function drawTanks() {
    const a = A[vi], v = VEH[vi], rows = a.st, rowH = 70, top = 24;
    fit(pT, top + rows.length * rowH + 6);
    const c = pT.begin().col, ctx = pT.ctx, W = pT.W, m = pT.m, vmax = Math.max(...rows.map(s => Math.max(s.Vox, s.Vfu))), bw = W - m.l - m.r - 92;
    pT.ptext(m.l, 4, fitTxt(ctx, 800, 11.5, ['Tank volumes per stage (m³), drawn to one scale', 'Tank volumes per stage (m³)'], W - 2 * m.l), { color: c.strong, size: 11.5, weight: 800 });
    rows.forEach((s, j) => {
      const y = top + j * rowH, on = j === si;
      if (on) { ctx.fillStyle = c.air; ctx.globalAlpha = 0.1; ctx.fillRect(2, y - 3, W - 4, rowH - 2); ctx.globalAlpha = 1; }
      ctx.fillStyle = c[s.col]; ctx.fillRect(m.l, y + 3, 9, 9);
      pT.ptext(m.l + 14, y, s.nm + (s.n > 1 ? ', each' : ''), { color: c.strong, size: 11.5, weight: 800 });
      const sub = s.P.solid ? 'solid propellant, cast in one case: ' + tons(s.prop) : fitTxt(ctx, 600, 10, ['mass ' + s.P.ox + ' : fuel = ' + num(s.ofr, 3) + ' : 1  ·  volume fuel : ' + s.P.ox + ' = ' + num(s.Vfu / s.Vox, 2) + ' : 1', 'mass ' + s.P.ox + ':fuel ' + num(s.ofr, 3) + ':1 · volume fuel:' + s.P.ox + ' ' + num(s.Vfu / s.Vox, 2) + ':1', 'volume fuel : ' + s.P.ox + ' = ' + num(s.Vfu / s.Vox, 2) + ' : 1'], W - m.l - 20);
      pT.ptext(m.l + 14, y + 16, sub, { color: c.text, size: 10, weight: 600 });
      const bar = (yy, vol, col, lab) => {
        const w = Math.max(1.5, vol / vmax * bw); ctx.fillStyle = col; ctx.globalAlpha = on ? 1 : 0.85; ctx.fillRect(m.l, yy, w, 13); ctx.globalAlpha = 1;
        pT.ptext(m.l + w + 5, yy + 6.5, num(vol) + ' m³ ' + lab, { color: c.text, size: 10.5, weight: 700, base: 'middle' });
      };
      if (s.P.solid) bar(y + 34, s.Vfu, c.fire, 'grain');
      else { bar(y + 32, s.Vfu, c.fuel, s.P.fu); bar(y + 49, s.Vox, c.air, s.P.ox); }
    });
    const s = si >= 0 ? rows[si] : null;
    if (!s) info.innerHTML = '<b>' + v.name + ':</b> tap a stage in the drawing or the table to see its tanks. Propellant is ' + Math.round(100 * rows.reduce((q, x) => q + x.n * x.prop, 0) / a.total0) + ' % of the lift-off mass.';
    else if (s.P.solid) info.innerHTML = '<b>' + s.nm + ':</b> ' + tons(s.prop) + ' of solid propellant (≈ ' + num(s.Vfu) + ' m³ at ≈ 1 750 kg/m³) sits in a steel case: fuel, oxidiser and binder are already mixed in the grain, so there are no separate tanks, no pumps and no way to shut it off. The case itself is heavy: ε ≈ ' + (s.eps * 100).toFixed(0) + ' %, against 4–9 % for the liquid stages.';
    else info.innerHTML = '<b>' + s.nm + ':</b> oxidiser ' + tons(s.mox) + ' (' + num(s.Vox) + ' m³), fuel ' + tons(s.mfu) + ' (' + num(s.Vfu) + ' m³). ' + (s.Vfu > s.Vox ? 'By mass the oxidiser is ' + num(s.ofr, 2) + ' times the fuel, but ' + s.P.fu + ' is so light that its <b>tank is ' + num(s.Vfu / s.Vox, 2) + ' times bigger</b>. ' : 'The oxidiser is both heavier and bulkier: its tank is ' + num(s.Vox / s.Vfu, 2) + ' times the fuel tank. ') + 'At ' + s.d + ' m diameter that is ≈ ' + num(s.Lox, 2) + ' m of oxidiser tank and ≈ ' + num(s.Lfu, 2) + ' m of fuel tank. Mean density of the propellant: ' + num(s.rhoBulk, 2) + ' kg/m³ (' + s.P.n + ').';
  }

  /* ---------- Δv ---------- */
  function drawDv() {
    fit(pD, 192);
    const a = A[vi], v = VEH[vi], c = pD.begin().col, ctx = pD.ctx; pD.axes();
    const bh = 24, y1 = 44, y2 = 104, X = (km) => pD.X(km), tot = a.dv / 1000, need = ORBIT_DV / 1000;
    pD.ptext(pD.m.l + 2, 4, 'Ideal Δv, phase by phase', { color: c.strong, size: 11.5, weight: 800 });
    pD.ptext(pD.m.l + 2, 21, v.name + ': ' + a.phases.length + ' burn' + (a.phases.length > 1 ? 's' : '') + ' counted', { color: c.text, size: 10.5 });
    let x = 0; a.phases.forEach((p) => { const k0 = X(x / 1000), k1 = X((x + p.dv) / 1000), col = c[a.st.find(s => s.id === p.ids[0]).col]; ctx.fillStyle = col; ctx.fillRect(k0, y1, k1 - k0 - 1, bh); if (k1 - k0 > 26) pD.ptext((k0 + k1) / 2, y1 + bh / 2, kms(p.dv), { color: '#0b0f14', size: 11.5, weight: 800, align: 'center', base: 'middle' }); x += p.dv; });
    pD.ptext(X(tot), y1 - 3, 'Σ ' + tot.toFixed(1) + ' km/s', { color: c.strong, size: 11.5, weight: 800, align: 'right', base: 'bottom' });
    pD.ptext(pD.m.l + 2, y2 - 17, 'needed for a ~200 km orbit', { color: c.text, size: 10.5 });
    ctx.fillStyle = c.air; ctx.fillRect(X(0), y2, X(7.8) - X(0) - 1, bh); ctx.fillStyle = c.bad; ctx.fillRect(X(7.8), y2, X(need) - X(7.8), bh);
    pD.ptext((X(0) + X(7.8)) / 2, y2 + bh / 2, '7.8 orbital speed', { color: '#0b0f14', size: 10.5, weight: 800, align: 'center', base: 'middle' });
    pD.ptext((X(7.8) + X(need)) / 2, y2 + bh / 2, '1.6', { color: '#0b0f14', size: 10.5, weight: 800, align: 'center', base: 'middle' });
    pD.vline(need, { color: c.ok, dash: [4, 3], width: 1.5 }); pD.ptext(X(need) - 4, y2 + bh + 3, '9.4 needed', { color: c.ok, size: 10.5, weight: 800, align: 'right' });
    const r = a.dv / ORBIT_DV, pc = Math.round((r - 1) * 100), side = pc > 0 ? 'above' : 'below';
    const cnt = { saturn: 'Counted: the three stages, with the S-IVB’s first burn (to orbit) only; the Moon burn comes on top.', shuttle: 'Counted: boosters and main engines up to tank cut-off; the orbiter’s own small engines finish the orbit.', ss: 'Counted: the booster ascent burn and the ship burn; both keep propellant back for landing. Approximate.', soyuz: 'Counted: boosters with core, core alone, third stage. Baikonur’s latitude and the 52° orbit change the real need a little.', f9: 'Counted: stage 1 (without its landing reserve) and stage 2.' }[v.id];
    dvNote.innerHTML = 'Stack total <b>≈ ' + tot.toFixed(1) + ' km/s</b>, ' + (pc === 0 ? 'right at' : Math.abs(pc) + ' % ' + side) + ' the ≈ 9.4 km/s of a launch to low orbit (7.8 km/s orbital speed plus ≈ 1.6 km/s lost to gravity and drag). ' + cnt;
    const rows = a.phases.map((p, i) => '<tr><td>' + (i + 1) + '. ' + p.ids.map(id => a.st.find(s => s.id === id).sh).join(' + ') + '</td><td class="num" style="white-space:nowrap">' + num(p.m0 / 1000) + ' → ' + num(p.mf / 1000) + '</td><td class="num">' + num(p.R, 3) + '</td><td class="num">' + Math.round(p.isp) + '</td><td class="num">' + (p.dv / 1000).toFixed(2) + '</td></tr>').join('');
    tabP.innerHTML = '<table class="data ra-tab" style="font-size:.8rem"><caption style="caption-side:bottom;text-align:left;padding:6px 12px;font-size:.78rem;color:var(--muted)">Each row: the burn’s start and end mass in tonnes (including everything above), the mass ratio, the Isp used and Δv = Isp·g₀·ln(ratio).</caption><tr><th>Burning</th><th class="num">Mass t, start → end</th><th class="num">Ratio</th><th class="num">Isp (s)</th><th class="num">Δv (km/s)</th></tr>' + rows + '</table>';
  }

  /* ---------- stage table + headline readouts ---------- */
  function drawTable() {
    const a = A[vi], v = VEH[vi];
    title.textContent = v.name + ' · ' + v.era; blurb.textContent = v.blurb;
    if (v.approx) title.append(' ', h('span', { class: 'chip bad', style: { marginLeft: '6px' } }, '≈ design figures'));
    R.H.set(num(v.H)); R.m0.set(num(a.total0 / 1000)); R.F.set(num(a.F0 / 1e6, 3)); R.tw.set(a.tw.toFixed(2)); R.pl.set(num(v.plPub, 3)); R.pf.set((a.pf * 100).toFixed(1));
    plCap.innerHTML = 'Propellant is <b>≈ ' + Math.round(100 * a.st.reduce((q, x) => q + x.n * x.prop, 0) / a.total0) + ' %</b> of the lift-off mass; the payload is ≈ ' + (a.pf * 100).toFixed(1) + ' %. Payload counted: ' + v.plNote + '. In orbit after the last counted burn: ≈ ' + num(a.mOrbit / 1000) + ' t (payload plus the upper stage or orbiter).';
    R.dv.set(kms(a.dv)); const r = a.dv / ORBIT_DV; R.ok.set(Math.round(r * 100), Math.abs(r - 1) <= 0.1 ? 'good' : 'bad');
    const rows = a.st.map((s, j) => {
      const sw = '<span class="sw" style="background:var(--' + s.col + ')"></span>', on = j === si, nw = ' style="white-space:nowrap"';
      const tank = s.P.solid ? '<td class="num" colspan="2"' + nw + '>grain ≈ ' + num(s.Vfu) + '</td>' : '<td class="num">' + num(s.Vfu) + '</td><td class="num">' + num(s.Vox) + '</td>';
      return '<tr data-s="' + j + '"' + (on ? ' data-on' : '') + ' style="cursor:pointer;' + (on ? 'background:color-mix(in srgb,var(--air) 12%,var(--panel))' : '') + '"><td>' + sw + '<b>' + s.nm + '</b><div style="font-size:.74rem;color:var(--muted)">' + s.P.n + '</div></td><td class="num">' + num(s.prop / 1000) + '</td><td class="num">' + num(s.dry / 1000) + '</td><td class="num">' + (s.eps * 100).toFixed(1) + '</td><td class="num"' + nw + '>' + (s.Fsl != null ? num(s.Fsl / 1e6) : '–') + ' / ' + num(s.Fvac / 1e6) + '</td><td class="num"' + nw + '>' + (s.ispSl != null ? s.ispSl : '–') + ' / ' + s.ispVac + '</td><td class="num"' + (s.tbTxt ? '' : nw) + '>' + (s.tbTxt || s.tb) + '</td>' + tank + '</tr>';
    }).join('');
    const pl = '<tr><td><span class="sw" style="background:var(--violet)"></span><b>' + v.plName + '</b></td><td colspan="8" style="color:var(--text-2)">≈ ' + num(v.pl) + ' t carried to orbit (' + v.plNote + ')</td></tr>';
    const th = (t, cls) => '<th' + (cls ? ' class="' + cls + '"' : '') + '>' + t + '</th>';
    tabS.innerHTML = '<table class="data ra-tab" style="font-size:.82rem"><caption style="caption-side:bottom;text-align:left;padding:6px 12px;font-size:.78rem;color:var(--muted)">Per unit (boosters are ×2 or ×4 as marked). sl = sea level, vac = vacuum. ε = empty mass ÷ (empty + propellant). Thrust is the nominal lift-off value. Fuel and oxidiser columns are tank volumes, computed (not published).</caption><tr>' + th('Stage') + th('Prop. (t)', 'num') + th('Dry (t)', 'num') + th('ε (%)', 'num') + th('Thrust MN sl / vac', 'num') + th('Isp s sl / vac', 'num') + th('Burn (s)', 'num') + th('Fuel (m³)', 'num') + th('Ox. (m³)', 'num') + '</tr>' + rows + pl + '</table>';
    tabS.querySelectorAll('tr[data-s]').forEach(tr => tr.addEventListener('click', () => { const j = +tr.dataset.s; si = si === j ? -1 : j; render(); }));
    chips.forEach((b, i) => b.classList.toggle('on', i === vi));
  }

  function render() { drawLine(); drawTable(); drawTanks(); drawDv(); }
  const pick = (e) => {
    const r = cvL.getBoundingClientRect(), x = (e.clientX - r.left) * (pL.W / r.width), y = (e.clientY - r.top) * (pL.H / r.height);
    return [...hits].reverse().find(q => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
  };
  cvL.addEventListener('pointerdown', (e) => { const q = pick(e); if (!q) return; if (q.i === vi && q.s === si) si = -1; else { vi = q.i; si = q.s; } render(); });
  cvL.addEventListener('pointermove', (e) => { cvL.style.cursor = pick(e) ? 'pointer' : 'default'; });

  /* ---------- scale-it-down ---------- */
  function upd2() {
    const pr = PAIRS[pairSel.get()], isp = sI.get(), dv = sV.get(), eps = sE.get() / 100, pay = sP.get(), x = Math.exp(-dv / (isp * G0));
    const lam = (x - eps) / (1 - eps), ok = lam > 0.0005, m0 = ok ? pay / lam : NaN, mp = ok ? (1 - eps) * (m0 - pay) : NaN, mox = mp * pr.ofr / (1 + pr.ofr), mfu = mp - mox;
    const Vo = mox / pr.ro, Vf = mfu / pr.rf, mass = (kg) => (kg >= 1e6 ? num(kg / 1e6) + ' kt' : kg >= 1000 ? num(kg / 1000) + ' t' : num(kg) + ' kg');
    Q.R.set(num(1 / x, 3)); Q.emax.set((x * 100).toFixed(1)); Q.lam.set(ok ? (lam * 100).toFixed(2) : '< 0', ok ? 'good' : 'bad');
    Q.m0.set(ok ? mass(m0) : '–'); Q.mp.set(ok ? mass(mp) : '–'); Q.vox.set(ok ? num(Vo) : '–'); Q.vfu.set(ok ? num(Vf) : '–');
    Q.st.set(!ok ? 'impossible' : lam < 0.01 ? 'marginal' : 'possible', !ok ? 'bad' : lam < 0.01 ? 'fuel' : 'good');
    verdict.innerHTML = !ok ? 'With ε = ' + (eps * 100).toFixed(1) + ' % and Isp ' + isp + ' s the tank and engines alone would use up the whole mass budget (the largest ε that works is ' + (x * 100).toFixed(1) + ' %). Add a second stage, which drops its dead weight on the way up, or raise Isp.' : 'A single stage lifting ' + mass(pay) + ' would weigh ≈ ' + mass(m0) + ' at lift-off and need ≈ ' + mass(mp) + ' of propellant, a tank volume of ≈ ' + num(Vo + Vf) + ' m³ (a 3.7 m-wide tank would be ≈ ' + num((Vo + Vf) / (Math.PI / 4 * 3.7 * 3.7)) + ' m long). ' + (lam < 0.02 ? 'The payload is only ' + (lam * 100).toFixed(1) + ' % of the rocket: one slip in the structure mass and there is nothing left. ' : '') + 'Compare Falcon 9’s first stage ε ≈ 6 % and its second stage ≈ 3.6 %.';
    const qs = ['lox-rp1', 'lox-ch4', 'lox-lh2'].map(k => Math.exp(-dv / (PAIRS[k].isp * G0))), ymax = Math.max(4, Math.ceil(Math.max(x, ...qs) * 100 + 1.6));
    pS.set({ ymax, yticks: ymax > 12 ? [0, 4, 8, 12, 16, 20] : [0, 2, 4, 6, 8, 10, 12] }); const c = pS.begin().col; pS.axes(); pS.clip(true);
    pS.band(3.5, 9.1, { color: c.violet, alpha: 0.13 });
    ['lox-rp1', 'lox-ch4', 'lox-lh2'].forEach((k, i) => { const q = qs[i], xs = [], ys = []; for (let e = 0; e <= 14; e += 0.25) { const l = (q - e / 100) / (1 - e / 100) * 100; if (l >= 0) { xs.push(e); ys.push(l); } } pS.line(xs, ys, { color: c.muted, width: 1.4, dash: [4, 4], alpha: 0.9 }); });
    const xs = [], ys = []; for (let e = 0; e <= 14; e += 0.1) { const l = (x - e / 100) / (1 - e / 100) * 100; if (l >= 0) { xs.push(e); ys.push(l); } } pS.line(xs, ys, { color: c.fire, width: 3.2 });
    pS.clip(false);
    pS.text(6.3, ymax - 0.45 * ymax / 12, 'real big liquid stages', { color: c.violet, align: 'center', size: 10.5, weight: 700 });
    if (ok) pS.dot(eps * 100, lam * 100, { color: c.fire, r: 7 }); else { pS.vline(x * 100, { color: c.bad, dash: [3, 3] }); pS.dot(Math.min(14, eps * 100), 0, { color: c.bad, r: 7 }); pS.text(Math.min(13.8, eps * 100) + (eps * 100 > 10 ? -0.4 : 0.4), ymax * 0.07 + 0.2, 'no payload', { color: c.bad, size: 10.5, align: eps * 100 > 10 ? 'right' : 'left' }); }
  }
  pS.onDraw(upd2);
  pL.onDraw(drawLine); pT.onDraw(drawTanks); pD.onDraw(drawDv);
  render(); upd2();
}
