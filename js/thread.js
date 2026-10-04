/* ==========================================================================
   thread.js - the red thread of the guide.
   Every chapter gets (1) a progress rail with the question the chapter answers and what it adds to
   the running ledger, (2) the ledger itself, a table from air to 58 N whose numbers come LIVE from the
   same engine model the simulator uses, with the rows this chapter touches highlighted, and (3) a
   bridge to the next chapter.  The story lives here, in one place, so the chapters stay consistent.
   ========================================================================== */

export const LHV = 46.35e6;                                              // propane, J/kg

/* ledger rows: id, label, how to show it, chapters that explain it */
export const ROWS = [
  { id: 'air',   label: 'Air swallowed',                    ch: [1, 2],   val: g => `${g.m.toFixed(3)} kg/s (${(g.m * 3600).toFixed(0)} kg/h)` },
  { id: 'comp',  label: 'Compressor: pressure ratio, exit temperature', ch: [3, 4], val: g => `${g.PRc.toFixed(2)} : 1, ${(g.T02 - 273.15).toFixed(0)} °C` },
  { id: 'work',  label: 'Compressor power',                 ch: [4],      val: g => `${(g.Pc / 1000).toFixed(1)} kW` },
  { id: 'fuel',  label: 'Fuel burned',                      ch: [1, 10],  val: g => `${(g.mf * 1000).toFixed(2)} g/s = ${(g.mf * LHV / 1000).toFixed(0)} kW of heat` },
  { id: 'flame', label: 'Fuel/air ratio overall (φ)',       ch: [10, 11], val: g => `φ = ${g.phi.toFixed(2)} (the flame itself burns near φ ≈ 1, the rest is dilution air)` },
  { id: 'tit',   label: 'Turbine inlet temperature',        ch: [3, 9],   val: g => `${(g.T03 - 273.15).toFixed(0)} °C` },
  { id: 'turb',  label: 'Turbine power (compressor + bearings)', ch: [4, 5], val: g => `${(g.Pt / 1000).toFixed(1)} kW` },
  { id: 'noz',   label: 'Jet speed, nozzle Mach number',    ch: [2, 12],  val: g => `${g.Ve.toFixed(0)} m/s, Mach ${g.Mexit.toFixed(2)} (not choked: no bell needed)` },
  { id: 'thr',   label: 'Thrust = mass flow × jet speed',   ch: [2],      val: g => `${g.m.toFixed(3)} × ${g.Ve.toFixed(0)} = ${g.thrust.toFixed(0)} N` },
  { id: 'eff',   label: 'Efficiency: Isp, TSFC, jet power ÷ fuel power', ch: [2, 8, 12], val: g => `${(Math.round(g.thrust / (g.mf * 9.80665) / 10) * 10).toFixed(0)} s, ${(g.tsfc * 3600).toFixed(3)} kg/(N h), ${(100 * 0.5 * g.mg * g.Ve ** 2 / (g.mf * LHV)).toFixed(0)} %` },
  { id: 'ctl',   label: 'Control',                          ch: [7],      val: () => 'ECU trims fuel to hold rpm; EGT limiter, start sequence, surge margin' },
  { id: 'ign',   label: 'Ignition',                         ch: [11],     val: () => 'a spark of tens of mJ into a primary zone at φ ≈ 0.65 – 2.6' },
];

/* the story: one entry per chapter */
export const STORY = {
  '01-air.html':       { q: 'What is the stuff we are going to push around, and what does it take to burn fuel in it?', touch: ['air', 'fuel'], adds: 'The engine swallows <b>{m} kg of air a second</b> and burns <b>{mf} g of propane</b> in it: one kilogram of fuel for every <b>{afr} kg</b> of air. Only the oxygen (23 % by mass) takes part.', next: 'We know what we push. Chapter 2 asks how hard it pushes back.' },
  '02-forces.html':    { q: 'How do we turn “push air backwards” into a number of newtons?', touch: ['air', 'noz', 'thr', 'eff'], adds: 'F = ṁ(V<sub>e</sub> − V<sub>0</sub>): <b>{m} kg/s × {Ve} m/s = {F} N</b>. The rest of the book is about producing that mass flow and that jet speed at the lowest cost in fuel, weight and risk.', next: 'To make the jet fast, the gas needs energy. Chapter 3 shows how a cycle of squeeze, heat and expand supplies it.' },
  '03-thermo.html':    { q: 'How do we put energy into a gas stream, and how much of it comes back as speed?', touch: ['comp', 'work', 'tit'], adds: 'A pressure ratio of <b>{PRc}</b> warms the air to <b>{T02C} °C</b>; burning fuel takes it to <b>{T03C} °C</b> at the turbine inlet; expanding back to the atmosphere leaves a <b>{Ve} m/s</b> jet. That is the whole cycle.', next: 'A cycle is a plan, and machines carry it out. Chapter 4 designs the two wheels that do the work.' },
  '04-blades.html':    { q: 'How do spinning blades add energy to a gas, and take it out again?', touch: ['comp', 'work', 'turb'], adds: 'The compressor absorbs <b>{Pc} kW</b>; the turbine delivers <b>{Pt} kW</b>: the small difference pays the bearings. The turbine must give exactly what the compressor takes, and that balance <i>sets the speed</i>.', next: 'We have the science. Chapter 5 puts it into one engine with a sheet of numbers.' },
  '05-engine.html':    { q: 'Does it all fit together? What does the finished machine do at its design point?', touch: ROWS.map(r => r.id), adds: 'Every row of the ledger below, evaluated for the real engine, is the same set of numbers the simulator in chapter 7 uses.', next: 'Chapter 6 builds the engine one layer at a time, in 3D.' },
  '06-build.html':     { q: 'What does each part look like, and why that shape?', touch: ['comp', 'tit', 'turb', 'noz'], adds: 'Each station number of chapter 5 is a part you can download as an STL and print or cast.', next: 'Parts are not an engine until they run. Chapter 7 starts it.' },
  '07-run.html':       { q: 'How do you start it, run it and control it without breaking it?', touch: ['ctl', 'ign', 'fuel', 'tit'], adds: 'A controller trims the fuel flow around <b>{mf} g/s</b> to hold the speed, and an exhaust-temperature limiter guards the turbine at <b>{T03C} °C</b>; the thrust you see is the live version of ch. 2’s equation.', next: 'It runs, but wastefully. Chapter 8 follows the fuel and ranks the cheap upgrades.' },
  '08-improve.html':   { q: 'Where do the {fuelkW} kW of fuel heat go, and what is the cheapest way to more thrust?', touch: ['eff', 'tit', 'fuel'], adds: 'Only <b>{effPct} %</b> of the fuel’s heat leaves as jet power; the loss budget tells you which upgrade pays. Isp today: <b>{Isp} s</b>.', next: 'Every upgrade pushes temperature or speed. Chapter 9 asks what the metal can take.' },
  '09-materials.html': { q: 'Why can’t the engine run hotter, and what decides how long it lasts?', touch: ['tit', 'turb'], adds: 'The turbine inlet temperature of <b>{T03C} °C</b> is set by what the wheel survives: creep, oxidation and thermal stress, in a material that must also be cheap.', next: 'So far fire has been taken for granted. Chapter 10 asks what burning actually is.' },
  '10-chemistry.html': { q: 'What is burning, why does it release heat, and how do we stop it from running away?', touch: ['fuel', 'flame'], adds: '<b>{mf} g/s</b> of propane releases <b>{fuelkW} kW</b> (46 MJ/kg): bond energies explain the number, Arrhenius explains why it needs a flame to start, and Semenov’s diagram explains why the combustor is metered and cooled.', next: 'Fuel and air will not burn by themselves. Chapter 11 is about lighting them, reliably.' },
  '11-ignition.html':  { q: 'How do we light it, every time, and only when we want to?', touch: ['ign', 'flame'], adds: 'A spark of tens of mJ lights the mixture only inside the primary zone (φ between about 0.65 and 2.6); the lean and rich limits are the same ones that make a pooled-fuel hot start dangerous.', next: 'We now have a complete jet engine. Chapter 12 changes one thing: carry your own oxygen.' },
  '12-rockets.html':   { q: 'What changes when the engine carries its own oxidiser?', touch: ['noz', 'thr', 'eff'], adds: 'Same <b>{F} N</b>: the jet does it at an Isp of <b>{Isp} s</b>, a rocket at 250–450 s, so it burns 5–9 times more propellant per newton-second, in exchange for working anywhere.', next: 'The simplest rocket keeps fuel and oxidiser in one solid block. Chapter 13 shows how it sets its own pressure.' },
  '13-solid.html':     { q: 'What if fuel and oxidiser are mixed in one block, and how does it avoid blowing up?', touch: ['eff', 'flame'], adds: 'P<sub>c</sub> = (ρ c* a K<sub>n</sub>)<sup>1/(1−n)</sup>: the same “generation vs loss” mathematics as chapter 10’s Semenov diagram, with pressure instead of temperature. The jet’s supply is a valve; the solid’s is built in.', next: 'The cure for “cannot be stopped” is to keep the ingredients apart. Chapter 14 does that.' },
  '14-hybrid.html':    { q: 'What if we separate the ingredients again and let them meet only in the chamber?', touch: ['eff', 'noz', 'ign'], adds: 'Valves give back control, and all five levers of chapter 10 reappear as engineering practice. A hard start is chapter 7’s hot start in a rocket: propellant before flame.', next: 'The last idea changes the energy source itself. Chapter 15 sends it through a wire.' },
  '15-electric.html':  { q: 'What if the energy arrives through a wire instead of in the propellant?', touch: ['eff', 'noz'], adds: 'A 90 mm fan turns <b>4.5 kW</b> of electricity into <b>55 N</b>; the CJ-1 needs <b>{fuelkW} kW</b> of fuel heat for 58 N. The fan wins 27× on efficiency, but a battery holds 70× less energy than propane.', next: 'That completes the map. The simulator (chapter 7) and the reference page put it all in your hands.' },
  'safety.html':       { q: 'What can hurt you, and what stops it?', touch: ['ctl'], adds: 'The numbers of the ledger are the hazards: 100 000+ rpm, 700 °C gas, a 380 m/s jet.', next: null },
};

const CHAPTER_NUM = f => (/^(\d\d)-/.exec(f) || [])[1] ? +(/^(\d\d)-/.exec(f))[1] : null;

/** fill {tokens} in a story string from the live engine model */
function fill(str, g) {
  if (!str || !g) return str;
  const v = {
    m: g.m.toFixed(3), mf: (g.mf * 1000).toFixed(2), afr: (1 / g.far).toFixed(0), Ve: g.Ve.toFixed(0), F: g.thrust.toFixed(0), PRc: g.PRc.toFixed(2),
    T02C: (g.T02 - 273.15).toFixed(0), T03C: (g.T03 - 273.15).toFixed(0), Pc: (g.Pc / 1000).toFixed(1), Pt: (g.Pt / 1000).toFixed(1),
    fuelkW: (g.mf * LHV / 1000).toFixed(0), effPct: (100 * 0.5 * g.mg * g.Ve ** 2 / (g.mf * LHV)).toFixed(0), Isp: (Math.round(g.thrust / (g.mf * 9.80665) / 10) * 10).toFixed(0),
  };
  return str.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '?');
}

export function buildThread({ pages, current }) {
  const st = STORY[current.file];
  const main = document.querySelector('main .chapter') || document.querySelector('main');
  if (!st || !main) return;
  const first = main.querySelector('h2');
  const num = CHAPTER_NUM(current.file);
  const chapters = pages.filter(p => CHAPTER_NUM(p.file));
  const groups = [];
  chapters.forEach(p => { const gname = p.group; let G = groups.find(x => x.name === gname); if (!G) groups.push(G = { name: gname, items: [] }); G.items.push(p); });
  const rail = groups.map(G => `<span class="rail-group" title="${G.name}">${G.items.map(p => { const n = CHAPTER_NUM(p.file); return `<a href="${p.file}" class="dot${n === num ? ' now' : n < (num ?? 0) ? ' done' : ''}" title="${n} · ${p.title}">${n}</a>`; }).join('')}</span>`).join('');
  const box = document.createElement('aside');
  box.className = 'thread';
  box.innerHTML = `<div class="thread-head"><span class="thread-tag">The thread</span><div class="rail" role="navigation" aria-label="Where this chapter sits">${rail}</div></div>
    <p class="thread-q"><b>The question of this chapter:</b> <span data-fill="${encodeURIComponent(st.q)}">${st.q.replace(/\{\w+\}/g, '…')}</span></p>
    <p class="thread-add"><b>What it adds to the ledger:</b> <span data-fill="${encodeURIComponent(st.adds)}">${st.adds.replace(/\{\w+\}/g, '…')}</span></p>
    <details class="ledger"><summary>Open the ledger: from air to 58 N <small>(live numbers from the simulator’s model)</small></summary><div class="ledger-body"><p class="muted">loading…</p></div></details>`;
  if (first) first.parentNode.insertBefore(box, first); else main.appendChild(box);

  // bridge to the next chapter, above the previous/next buttons
  if (st.next) {
    const br = document.createElement('div');
    br.className = 'bridge';
    br.innerHTML = `<span class="thread-tag">Bridge</span> ${st.next}`;
    const pn = document.querySelector('main .pn');
    if (pn) pn.parentNode.insertBefore(br, pn); else main.appendChild(br);
  }

  // live numbers (the model is a separate module: load it only now, after the page is up)
  const run = async () => {
    try {
      const m = await import('./engine-model.js');
      const g = m.steadyAt({ ...m.CJ1 }, m.CJ1.Ndesign, m.isa(0));
      box.querySelectorAll('[data-fill]').forEach(el => { el.innerHTML = fill(decodeURIComponent(el.dataset.fill), g); });
      const rows = ROWS.map(r => `<tr class="${st.touch.includes(r.id) ? 'on' : ''}"><td>${r.label}</td><td>${r.val(g)}</td><td class="chs">${r.ch.map(c => { const p = pages.find(x => CHAPTER_NUM(x.file) === c); return p ? `<a href="${p.file}" title="${p.title}">${c}</a>` : c; }).join(' · ')}</td></tr>`).join('');
      box.querySelector('.ledger-body').innerHTML = `<div class="table-wrap"><table class="data ledger-table"><tr><th>Step</th><th>Value at the design point (115 000 rpm, sea level, 15 °C)</th><th>Chapters</th></tr>${rows}</table></div><p class="muted">Highlighted rows are the ones this chapter touches. Change the conditions in the <a href="07-run.html">simulator</a> and they all change together.</p>`;
      if (window.renderMath) window.renderMath(box);
    } catch (e) { box.querySelector('.ledger-body').innerHTML = '<p class="muted">The live ledger could not be loaded.</p>'; console.error(e); }
  };
  (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(run);
}
