#!/usr/bin/env node
// Smoke test: syntax-check the inline script and assert required DOM IDs.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const html = fs.readFileSync(path.join(__dirname, '../digitakt-rhythm-aide.html'), 'utf8');

// --- 1. Extract inline script and run node --check ---
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!scriptMatch) {
  console.error('FAIL: could not find inline <script> block before </body>');
  process.exit(1);
}

const tmp = path.join(os.tmpdir(), 'musicbox-smoke.js');
fs.writeFileSync(tmp, scriptMatch[1]);

try {
  execSync(`node --check "${tmp}"`, { stdio: 'pipe' });
  console.log('✓ Inline script syntax OK (node --check)');
} catch (err) {
  console.error('FAIL: syntax error in inline script');
  console.error(err.stderr.toString());
  process.exit(1);
}

// --- 2. Required DOM IDs ---
const required = ['genreSelect', 'trackGrid', 'midiOutDT', 'midiSendBtn', 'harmonyPanel', 'modal'];
let allOk = true;
required.forEach(id => {
  const present = html.includes(`id="${id}"`);
  if (present) {
    console.log(`✓ DOM id #${id}`);
  } else {
    console.error(`✗ FAIL: missing DOM id #${id}`);
    allOk = false;
  }
});

if (!allOk) process.exit(1);
console.log('\nAll smoke checks passed.');
