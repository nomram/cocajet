// Copies the few third-party files the site needs into ../vendor so GitHub Pages serves everything itself
// (no CDN, works offline).   node vendor.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const nm = path.join(here, 'node_modules');
const out = path.join(here, '..', 'vendor');
const cp = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); };

// three.js (ES modules)
const t = path.join(nm, 'three');
cp(path.join(t, 'build/three.module.js'), path.join(out, 'three/three.module.js'));
cp(path.join(t, 'examples/jsm/controls/OrbitControls.js'), path.join(out, 'three/OrbitControls.js'));
cp(path.join(t, 'examples/jsm/loaders/STLLoader.js'), path.join(out, 'three/STLLoader.js'));
cp(path.join(t, 'examples/jsm/environments/RoomEnvironment.js'), path.join(out, 'three/RoomEnvironment.js'));
cp(path.join(t, 'examples/jsm/utils/BufferGeometryUtils.js'), path.join(out, 'three/BufferGeometryUtils.js'));
cp(path.join(t, 'LICENSE'), path.join(out, 'three/LICENSE'));
// the example modules import from 'three' (bare specifier) -> resolved by the import map in each page

// KaTeX (woff2 only, to keep it small)
const k = path.join(nm, 'katex/dist');
cp(path.join(k, 'katex.min.js'), path.join(out, 'katex/katex.min.js'));
cp(path.join(k, 'contrib/auto-render.min.js'), path.join(out, 'katex/auto-render.min.js'));
cp(path.join(nm, 'katex/LICENSE'), path.join(out, 'katex/LICENSE'));
let css = fs.readFileSync(path.join(k, 'katex.min.css'), 'utf8');
css = css.replace(/,url\(fonts\/[^)]+\.woff\) format\("woff"\)/g, '').replace(/,url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g, '');
fs.mkdirSync(path.join(out, 'katex/fonts'), { recursive: true });
fs.writeFileSync(path.join(out, 'katex/katex.min.css'), css);
for (const f of fs.readdirSync(path.join(k, 'fonts'))) if (f.endsWith('.woff2')) cp(path.join(k, 'fonts', f), path.join(out, 'katex/fonts', f));
console.log('vendored into', out);
