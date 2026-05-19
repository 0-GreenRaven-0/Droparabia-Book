import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const chunksDir = './dist/server/chunks';
const files = readdirSync(chunksDir).filter(f => f.startsWith('worker-entry'));

for (const file of files) {
  const path = join(chunksDir, file);
  let content = readFileSync(path, 'utf8');
  const original = content;

  // Strip query params before ASSETS lookup so ?utm_* and ?gtm_debug= don't 404
  content = content.replace(
    'request.url.replace(/\\.html$/, "")',
    '(()=>{const _u=new URL(request.url);_u.search="";return _u.href.replace(/\\.html$/,"");})()'
  );
  content = content.replace(
    'request.url.replace(/index.html$/, "").replace(/\\.html$/, "")',
    '(()=>{const _u=new URL(request.url);_u.search="";return _u.href.replace(/index.html$/,"").replace(/\\.html$/,"");})()'
  );

  if (content !== original) {
    writeFileSync(path, content);
    console.log(`Patched query-param handling in ${file}`);
  } else {
    console.warn(`WARNING: No patch applied to ${file} — pattern not found`);
  }
}
