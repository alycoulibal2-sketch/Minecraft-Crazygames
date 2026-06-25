// build-standalone.mjs — bundle the whole game into ONE self-contained HTML file
// that runs by just opening it (no server, no install) — ideal for mobile.
//
// Strategy: a tiny module registry. Each src/*.js file is wrapped in its own
// function scope (so same-named local helpers across files never collide), its
// `import`s are rewritten to __require(), and its `export`s are recorded on the
// module's exports object. A classic <script> (not type=module) is used so the
// file works from file:// on phones where ES-module imports are blocked by CORS.
//
// Run: node tools/build-standalone.mjs   ->   dist/minecraft.html

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

// ---- transform one ES module body into a registry factory body ----
function transform(src) {
  // named imports (single- or multi-line):  import { a, b as c } from './x.js';
  src = src.replace(
    /^[ \t]*import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/([^'"]+)['"];?[ \t]*$/gm,
    (_m, names, file) => {
      const cleaned = names
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((n) => n.replace(/\s+as\s+/, ': ')) // `b as c` -> destructure `b: c`
        .join(', ');
      return `const { ${cleaned} } = __require('${file}');`;
    }
  );
  // namespace import:  import * as ns from './x.js';
  src = src.replace(
    /^[ \t]*import\s*\*\s*as\s+([A-Za-z0-9_$]+)\s*from\s*['"]\.\/([^'"]+)['"];?[ \t]*$/gm,
    (_m, ns, file) => `const ${ns} = __require('${file}');`
  );
  // default import:  import X from './x.js';
  src = src.replace(
    /^[ \t]*import\s+([A-Za-z0-9_$]+)\s+from\s*['"]\.\/([^'"]+)['"];?[ \t]*$/gm,
    (_m, name, file) => `const ${name} = __require('${file}').default;`
  );
  // side-effect import:  import './x.js';
  src = src.replace(
    /^[ \t]*import\s*['"]\.\/([^'"]+)['"];?[ \t]*$/gm,
    (_m, file) => `__require('${file}');`
  );

  // collect exported names, then strip the `export ` keyword
  const names = new Set();
  const re = /^[ \t]*export\s+(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/gm;
  let mm;
  while ((mm = re.exec(src))) names.add(mm[1]);
  src = src.replace(/^([ \t]*)export\s+(const|let|var|function|class)\s/gm, '$1$2 ');

  if (names.size) {
    src += '\n' + [...names].map((n) => `__exports.${n} = ${n};`).join('\n') + '\n';
  }
  return src;
}

// ---- gather modules (main.js is the entry; order of registration doesn't matter) ----
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.js'));
if (!files.includes('main.js')) throw new Error('src/main.js not found');

let registrations = '';
for (const f of files) {
  const body = transform(fs.readFileSync(path.join(SRC, f), 'utf8'));
  registrations += `__modules[${JSON.stringify(f)}] = function(__exports, __require){\n${body}\n};\n`;
}

const bundle = `"use strict";
(function(){
  var __modules = {}, __cache = {};
  function __require(p){
    if (Object.prototype.hasOwnProperty.call(__cache, p)) return __cache[p];
    var __exports = {};
    __cache[p] = __exports;            // set before running, to tolerate cycles
    __modules[p](__exports, __require);
    return __exports;
  }
${registrations}
  __require('main.js');
})();`;

// ---- inline into the HTML (swap the module <script> for an inline classic one) ----
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scriptTag = /<script\s+type=["']module["']\s+src=["']\.\/src\/main\.js["']><\/script>/;
if (!scriptTag.test(html)) throw new Error('could not find the module <script> tag in index.html');
// </script> inside the bundle would close our tag early; none exists, but guard anyway.
const safe = bundle.replace(/<\/script>/gi, '<\\/script>');
html = html.replace(scriptTag, `<script>\n${safe}\n</script>`);

fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, 'minecraft.html');
fs.writeFileSync(out, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`✅ wrote ${path.relative(ROOT, out)} (${kb} KB, ${files.length} modules inlined)`);
