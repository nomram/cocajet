/* ==========================================================================
   catalog.js - the parts you can swap in the design workbench (no DOM).

   Prices are typical hobby-market figures in US dollars, build times are honest guesses for someone
   with the listed skill, lives are rough minutes at the rated condition.  They are *illustrative*:
   change them to match your own supplier and your own workshop, then rebuild nothing: only
   the performance table (tools/build-design-table.mjs) depends on the engine model, not on prices.

   skill: 0 hand tools · 1 drill press, hacksaw, bench grinder · 2 lathe and TIG welding · 3 CNC / specialist
   ========================================================================== */

/* the casing donor: the first part you pick; everything else is sized to fit inside it */
export const CASINGS = {
  can:      { tag: 'soda can', name: 'Soda can (aluminium)',            OD: 66,  L: 115, wall: 0.10, rho: 2700, Tliner: 800,  price: 0.5, hours: 1.5, skill: 0, life0: 4,    mat: 'Al 3004',     note: 'Free, cuts with scissors. Melts at 660 °C, so the can is a consumable teaching liner: minutes of life at full power.' },
  tall:     { tag: 'tall can', name: 'Tall energy-drink can (aluminium)', OD: 66, L: 160, wall: 0.10, rho: 2700, Tliner: 800,  price: 1.2, hours: 1.5, skill: 0, life0: 4,    mat: 'Al 3004',     note: 'Same diameter as the soda can but 45 mm longer: more room for the flame, same short life.' },
  tomato:   { tag: 'steel tin', name: 'Steel food can (400 g tin)',      OD: 73,  L: 105, wall: 0.20, rho: 7850, Tliner: 950,  price: 0.9, hours: 3,   skill: 1, life0: 20,   mat: 'tinplate',    note: 'Scale and oxidise above 600 °C but outlast aluminium by a good margin. Cut with snips, strip the coating by burning it off outdoors.' },
  thermos:  { tag: 'flask liner', name: 'Stainless vacuum flask (inner wall)', OD: 70, L: 190, wall: 0.45, rho: 8000, Tliner: 1150, price: 14,  hours: 5,   skill: 1, life0: 600,  mat: 'stainless 304', note: 'The inner stainless container is a thin, oxidation-resistant tube: a real liner material. Cut it from the outer shell, the vacuum is lost.' },
  paint:    { tag: 'paint tin', name: 'Paint tin (1 litre, steel)',      OD: 101, L: 110, wall: 0.30, rho: 7850, Tliner: 950,  price: 3.5, hours: 4,   skill: 1, life0: 25,   mat: 'tinplate',    note: 'A bigger diameter means a bigger engine, with more thrust, and more air to cool the flame.' },
  catering: { tag: 'catering tin', name: 'Catering tin (#10, 3 litres)',    OD: 155, L: 175, wall: 0.25, rho: 7850, Tliner: 950,  price: 3,   hours: 6,   skill: 1, life0: 30,   mat: 'tinplate',    note: 'The biggest food can you can find: enough room for a 130 mm wheel, but then the wheel needs serious machining.' },
  pipe:     { tag: 'steel pipe', name: 'Stainless tube offcut (102 mm)',  OD: 102, L: 250, wall: 1.20, rho: 8000, Tliner: 1200, price: 38,  hours: 7,   skill: 2, life0: 1500, mat: 'stainless 304', note: 'Thick wall, long life, high price and weight. The engineer’s choice.' },
};

/* compressor wheel options.  sizes: standard exducer diameters available (mm); ratios define the wheel proportions */
export const COMPRESSORS = {
  billet: { tag: 'billet', name: 'Machined from billet (custom size)', price: D => 25 + 0.012 * D * D, hours: D => 28 + 0.2 * D, skill: 3, sizes: null, Ulimit: 380, Z: [7, 7], beta2: 30, d1t: 0.75, d1h: 0.214, b2: 0.107, etaDiff: 0.70, clr: 1.0, note: 'Any diameter, the best fit to the casing, and tuned (vaned diffuser, splitter blades). Needs a very good lathe or CNC and a way to balance it.' },
  turbo:  { tag: 'scrap turbo', name: 'Scrap turbocharger wheel',           price: D => 12 + 0.012 * D * D, hours: () => 6, skill: 1, sizes: [36, 41, 46, 52, 58, 64, 72, 82, 94, 110, 130], Ulimit: 460, Z: [6, 6], beta2: 38, d1t: 0.68, d1h: 0.20, b2: 0.120, etaDiff: 0.60, clr: 1.15, note: 'Cheap, strong and already balanced. Only certain diameters exist; the diffuser is a simple volute so efficiency is a little lower.' },
  rc:     { tag: 'model wheel', name: 'Ready-made model-turbine wheel',     price: D => 40 + 0.015 * D * D, hours: () => 3, skill: 0, sizes: [44, 50, 56, 62, 70, 80, 90], Ulimit: 450, Z: [8, 8], beta2: 33, d1t: 0.72, d1h: 0.21, b2: 0.108, etaDiff: 0.74, clr: 0.9, note: 'Bought with its diffuser, balanced and matched. The expensive but easy way to get a good compressor.' },
};

export const TURBINES = {
  inconel:   { tag: 'superalloy', name: 'Superalloy wheel (cast or machined)', price: D => 60 + 0.03 * D * D, hours: D => 22 + 0.15 * D, skill: 3, Tcont: 1200, etaTpk: 0.80, life0: 1500, note: 'Strongest and most efficient at 900 °C+. Expensive and very hard to machine.' },
  stainless: { tag: 'laser-cut 310', name: 'Laser-cut stainless 310 wheel',       price: D => 20 + 0.012 * D * D, hours: () => 14, skill: 2, Tcont: 1030, etaTpk: 0.74, life0: 300,  note: 'Flat blades from a sheet of heat-resistant stainless, welded to the shaft. Cheap, creeps at the top end.' },
  turbo:     { tag: 'scrap turbo', name: 'Scrap turbocharger turbine wheel',    price: D => 10 + 0.010 * D * D, hours: () => 5, skill: 1, Tcont: 1130, etaTpk: 0.78, life0: 800,  note: 'A cast superalloy wheel with its shaft attached. Designed for 900 °C exhaust: the best value in the catalogue.' },
};

export const BEARINGS = {
  bronze:  { tag: 'bronze', name: 'Bronze bushings (oil-fed)',        price: 8,   hours: 3, skill: 0, etaM: 0.94,  mechScale: 1.6, xmax: 0.62, life0: 15,   note: 'Free to make and forgiving, but friction and heat limit the speed to about 60 % of the design speed.' },
  steel:   { tag: 'steel balls', name: 'Steel ball bearings (oil mist)',   price: 30,  hours: 5, skill: 1, etaM: 0.97,  mechScale: 1.0, xmax: 1.0,  life0: 400,  note: 'The standard hobby answer: good to about 115 000 rpm on a 56 mm engine.' },
  ceramic: { tag: 'ceramic', name: 'Ceramic hybrid ball bearings',     price: 130, hours: 5, skill: 1, etaM: 0.985, mechScale: 0.7, xmax: 1.15, life0: 1500, note: 'Lower friction, higher speed limit, longer life. Four times the price.' },
};

export const FUELSYS = {
  propane:  { tag: 'propane', name: 'Propane from a bottle (vapour)', price: 55,  hours: 6,  skill: 0, fuel: 'propane',  etaBfactor: 1.0,  rhoTank: 0.50, LHV: 46.35e6, note: 'No pump, no atomiser, one regulator and a valve. The freeze-off of chapter 7 limits long runs.' },
  kerosene: { tag: 'kerosene', name: 'Kerosene / Jet-A (pump and vaporiser)', price: 135, hours: 16, skill: 2, fuel: 'kerosene', etaBfactor: 0.96, rhoTank: 0.80, LHV: 43.2e6,  note: 'More energy per litre of tank, and cheap fuel, but a fuel pump, a filter and a vaporiser tube to build and tune.' },
};

/* what every engine needs besides the five slots: shaft, fasteners, gaskets, sensors, ignition, starter motor, assembly and balancing */
export const BASE = { price: 110, hours: 14, skill: 1 };

/* reference airframe for the speed and range scores: a small wing-borne jet */
export const AIRFRAME = { mass: 2.5, S: 0.5, AR: 7, CD0: 0.03, e: 0.8, tankL: 1.2 };

export const SKILL = ['hand tools only', 'drill press and hacksaw', 'lathe and welding', 'CNC or specialist machining'];

/* the goals the optimiser can aim at; key = metric name in design-model.js, dir: +1 higher is better, -1 lower is better */
export const GOALS = {
  price:   { name: 'Lowest price',                 metric: 'price',   dir: -1, unit: '$',    blurb: 'Pays only for what you cannot scrounge.' },
  ease:    { name: 'Easiest to build',             metric: 'hours',   dir: -1, unit: 'h',    blurb: 'Fewest hours, lowest skill: a first build that works.' },
  density: { name: 'Most thrust for its size',     metric: 'density', dir: +1, unit: 'N/L',  blurb: 'Thrust per litre of engine envelope: for a small airframe or a vehicle.' },
  speed:   { name: 'Fastest (top speed)',          metric: 'vmax',    dir: +1, unit: 'm/s',  blurb: 'The highest level speed of the reference jet.' },
  range:   { name: 'Longest range',                metric: 'range',   dir: +1, unit: 'km',   blurb: 'How far the reference jet flies on one tank.' },
  life:    { name: 'Longest life',                 metric: 'life',    dir: +1, unit: 'min',  blurb: 'Minutes of full-power running before the weakest part gives up.' },
};
export const PRESETS = {
  cheap:    { label: 'Cheapest',                w: { price: 1, ease: 0.15, density: 0, speed: 0, range: 0, life: 0.1 } },
  easy:     { label: 'Easiest first build',     w: { price: 0.3, ease: 1, density: 0, speed: 0, range: 0, life: 0.3 } },
  compact:  { label: 'Most thrust for its size', w: { price: 0.1, ease: 0.05, density: 1, speed: 0, range: 0, life: 0.1 } },
  fast:     { label: 'Fastest',                 w: { price: 0.05, ease: 0.05, density: 0.2, speed: 1, range: 0, life: 0.1 } },
  far:      { label: 'Longest range',           w: { price: 0.1, ease: 0.05, density: 0, speed: 0.1, range: 1, life: 0.2 } },
  balanced: { label: 'Balanced',                w: { price: 0.5, ease: 0.5, density: 0.5, speed: 0.4, range: 0.4, life: 0.5 } },
};
