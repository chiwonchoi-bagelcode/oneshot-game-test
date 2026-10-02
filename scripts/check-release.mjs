// Release gate: the shipped bundle must not contain test hooks or debug globals (C-237, R-06 장치 분리).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['dist'];
const banned = ['__jrr', 'installTestHooks', '__app', '__save'];
let bad = 0;
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(f)) {
      const s = readFileSync(p, 'utf8');
      for (const b of banned) if (s.includes(b)) { console.error(`✗ ${p} contains ${b}`); bad++; }
      if (/https?:\/\/fonts\.(googleapis|gstatic)/.test(s)) { console.error(`✗ ${p} loads a remote font`); bad++; }
    }
  }
};
for (const d of dirs) walk(d);
if (bad) process.exit(1);
console.log('release bundle clean:', dirs.join(', '));
