# Jet Engines for Dummies: build the Coke-can turbojet

An interactive, from-scratch guide to jet engines, written in plain HTML, CSS and JavaScript, with no build step and no external CDNs. It starts with a breath of air and ends with a complete, rotatable 3D homemade turbojet (the "Coke-can jet motor", CJ-1) that you can cut open, pull apart, download as STL files and run in a simulator.

**Live site (GitHub Pages):** enable Pages for this repository (see below) and open `https://<user>.github.io/cocajet/`.

## What is in it

| Page | Contents |
| --- | --- |
| `index.html` | Start here: the whole idea, the path through the guide, a live 3D engine |
| `safety.html` | Rotor energy, fire, noise, test cell, legal notes, pre-run checklist |
| `01-air.html` | Air, gases and chemistry: composition, the gas laws, combustion |
| `02-forces.html` | Newton's third law, the thrust equation, energy and efficiency, power in fluids |
| `03-thermo.html` | Pressure, heat and the Brayton cycle (P-V and T-s diagrams, pressure ratio) |
| `04-blades.html` | Wings, angle of attack and vortices, fans and the fan laws, wind turbines and windmill types, hydro, steam (Rankine, combined cycle) and nuclear plants, blade count, Euler work |
| `05-engine.html` | The finished engine on one page: cross-section, stations, power balance |
| `06-build.html` | Ten-step, layer-by-layer 3D build, with the physics of every part |
| `07-run.html` | The engine simulator: start, throttle, air, flame and heat, failures |
| `08-improve.html` | Cheap upgrades ranked by thrust per dollar, balancing, bearings, turbofan, controller |
| `09-materials.html` | Strength vs temperature, creep, centrifugal and thermal stress, alloy choice |
| `10-chemistry.html` | The chemistry of heat: formulas and balancing, moles, endo/exothermic reactions, bond energies, Hess's law, flame temperature, Arrhenius, Semenov runaway and its control, the fuel menu, flammability limits, mixing fuel and air, the oxidiser menu, the families of energetic chemicals and what makes a good propellant |
| `11-ignition.html` | Ignition and spark plugs: minimum ignition energy, Paschen's law, coil / CDI / piezo, plug anatomy and heat range, igniter placement, a home-made plug with printable parts |
| `12-rockets.html` | Rockets: the rocket equation and staging, the de Laval (venturi) nozzle, choking, thrust vs speed, a water rocket |
| `13-solid.html` | Solid rockets at concept level: burn-rate law, chamber-pressure balance and stability, grain geometry bench, motor classes, failure modes |
| `14-hybrid.html` | Hybrid, liquid and air-breathing engines: O/F shift, propellant choice, hard starts, Isp vs Mach |
| `15-electric.html` | Electric propulsion: ducted fan vs turbojet, ion thrusters, ion wind, one map of every engine |
| `16-classes.html` | The rocket zoo: motor classes A–O, hobby certification levels, sounding rockets, small to super-heavy launchers, Δv budgets, thrust-to-weight, tank and stage sizes of Shuttle / Saturn V / Soyuz / Falcon 9 / Starship, what a jet engine can carry up versus sideways |
| `17-workbench.html` | The design workbench: pick a can or tin as the flame-tube donor, swap compressor wheel, turbine, bearings and fuel system, choose what to optimise (price, ease, thrust per size, speed, range, life) and see the ranked designs, single-swap suggestions and a trade-off frontier |
| `models.html` | STL gallery: per-part downloads, whole assembly, one-click ZIP, printing and casting notes |
| `reference.html` | Formula sheet, searchable glossary, bill of materials, FAQ, sources |

About 95 interactive widgets (plots, calculators, simulators) are shared by the chapters. Every chapter opens with a **thread strip** (`js/thread.js`): the question the chapter answers, what it adds to the running ledger, the ledger itself (live numbers from the engine model, from air to 58 N) and a bridge to the next chapter. A single small physics model (`js/engine-model.js`) drives all the cycle calculators, the compressor map, the thrust numbers and the simulator, so the numbers agree everywhere.

## Run it locally

The pages load ES modules and STL files, which browsers block on `file://` URLs, so use any static server:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Publish with GitHub Pages

1. Push this repository to GitHub.
2. In **Settings, Pages**, choose **Deploy from a branch**, select your branch (for example `main`) and the **`/ (root)`** folder.
3. Wait a minute and open the URL GitHub shows.

An empty `.nojekyll` file is included so Pages serves the files exactly as they are. All links are relative, so the site also works from a sub-path.

## The STL files

`models/` contains 14 binary STL parts, `00-cj1-full-assembly.stl` (everything but the test stand, merged) and `manifest.json` (materials, masses, bounding boxes and every design parameter). Units are millimetres; the engine axis is +Z (inlet at z = 0, exhaust at z about 255) and +Y is up. All parts share one origin, so they assemble themselves.

They are generated by a script, not drawn by hand. All dimensions live in one table at the top of `tools/build-stl.mjs`:

```sh
cd tools
npm install                  # manifold-3d (solid modelling), three, katex
node build-stl.mjs           # rewrites ../models/*.stl and manifest.json
node build-stl.mjs --check   # sanity checks
node section-svg.mjs         # redraws img/cj1-section.svg from the STLs
node thumbs.mjs              # re-renders img/parts/*.png (needs Playwright + Chromium)
```

After changing dimensions, the gallery, the 3D builder and the viewers pick up the new manifest automatically. `js/engine-model.js` has its own copy of the key dimensions (the `CJ1` object); update both if you want the simulator and the calculators to follow your design.

## Project layout

```
index.html, 01-…09-*.html, safety.html, models.html, reference.html
css/style.css                 design system (light + dark themes)
js/site.js                    navigation, theme, KaTeX loader, lazy widget loader
js/ui.js, js/plot.js          small DOM helpers and a canvas plotting library
js/engine-model.js            the physics: ISA, compressor, combustor, turbine, nozzle, spool matching
js/engine-sim.js              the running-engine simulator: start sequence, ECU, failures, thermal model
js/thermo.js                  real-gas properties (vibrational cp, enthalpy, entropy), humidity, propane vapour pressure
js/fuel-supply.js             propane bottle, regulator and valve (freeze-off)
js/ignition-model.js          minimum ignition energy, Paschen's law, plug and igniter models
js/rocket-model.js            nozzle relations, rocket equation, motor classes
js/solid-model.js             solid-motor interior ballistics (burn rate, chamber filling, grains)
js/electric-model.js          ducted fan, ion thruster and ion-wind relations
js/thread.js                  the red thread: chapter questions, live ledger, bridges
js/viewer3d.js, js/flow3d.js  three.js viewer and the air / flame / exhaust particle system
js/widgets/*.js               one file per interactive widget (<div data-widget="name">)
models/                       STL files + manifest
img/                          cross-section drawing, part thumbnails
vendor/                       three.js r160 and KaTeX (both MIT), copied from npm, no CDN
tools/                        STL generator, extras (DIY plug), numbers and regression tests, section drawing, thumbnails, vendoring, headless QA
```

A widget is added by writing `js/widgets/<name>.js` with `export default function init(el) {…}` and dropping `<div data-widget="<name>"></div>` into a page. It loads when it scrolls into view.

## Testing

`tools/qa.mjs` opens pages in headless Chromium (software WebGL) and reports console errors, failed requests and writes screenshots:

```sh
node tools/qa.mjs index.html 07-run.html --full           # scroll through, screenshot
node tools/qa.mjs 08-improve.html --widgets               # one screenshot per widget
node tools/test-sim.mjs                                   # regression tests of the simulator scenarios
node tools/numbers.mjs                                    # print the model's headline numbers (keep the text in step with them)
node tools/build-extras.mjs                               # regenerate models/extras (home-made spark plug STLs)
node tools/build-design-table.mjs                         # regenerate data/design-table.json (workbench performance table; run after changing the engine model or the parts catalogue)
python3 tools/build-steam-tables.py                       # regenerate data/steam-tables.json (needs the iapws package)
```

It needs Playwright and `http-server` to be installed globally.

## Rocket chapters: scope

Chapters 12–15 are physics and engineering at textbook level. They contain **no propellant formulations, mixing ratios or manufacturing steps**; the widgets work with generic burn-rate numbers, not ingredients. Readers who want to fly rockets are directed to the water rocket (chapter 12) and to certified motors through a club (NAR, Tripoli, UKRA).

## Safety and honesty

This is an educational project. The design has been simulated, not built and tested. A real micro gas turbine spins at 100 000+ rpm and burns fuel at 800 °C; read `safety.html` before thinking about building one. The STL files are for understanding, fit checks and casting patterns: never run a 3D-printed part.

The model is a simplified one-dimensional (mean-line) physics model with typical hobby-turbine loss figures. It reproduces trends and orders of magnitude, not the last 10 %.

## Licence and credits

The code and text are licensed under the GNU Affero General Public License v3.0, see `LICENSE`. three.js (MIT) and KaTeX (MIT) are bundled under `vendor/`; manifold-3d (Apache-2.0) is used only to generate the STL files. "Coca-Cola" is a trademark of its owner; this project is not affiliated with or endorsed by them, and "Coke can" is just the nickname of this style of homemade engine.
