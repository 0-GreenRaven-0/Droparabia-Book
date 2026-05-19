import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = './dist/server/chunks';
const file = readdirSync(dir).find(f => f.startsWith('worker-entry'));
const filePath = join(dir, file);
let content = readFileSync(filePath, 'utf8');
const original = content;

// Patch 1: ASSETS fetch for known static assets (line ~13284)
const p1old = `ASSETS.fetch(request.url.replace(/\\.html$/, ""))`;
const p1new = `ASSETS.fetch((()=>{const _u=new URL(request.url);_u.search="";return _u.href.replace(/\\.html$/,"")})())`;
content = content.replace(p1old, p1new);

// Patch 2: ASSETS fetch fallback for prerendered pages (lines ~13296-13298)
const p2old = `ASSETS.fetch(\n      request.url.replace(/index.html$/, "").replace(/\\.html$/, "")\n    )`;
const p2new = `ASSETS.fetch((()=>{const _u=new URL(request.url);_u.search="";return _u.href.replace(/index.html$/,"").replace(/\\.html$/,"")})())`;
content = content.replace(p2old, p2new);

if (content !== original) {
  writeFileSync(filePath, content);
  console.log('Worker patched successfully:', file);
} else {
  console.error('ERROR: Patch patterns not found in', file);
  process.exit(1);
}
