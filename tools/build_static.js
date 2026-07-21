#!/usr/bin/env node
// Builds a self-contained static bundle of the visualizer: the 10 library
// traces are pre-generated with bin/sudoku_trace and inlined together with
// the CSS/JS, so the result needs no backend (custom input is disabled).
// The output is a body fragment (title + style + markup + scripts) suitable
// for publishing as a Claude Artifact, which supplies the document shell.
// Usage: node tools/build_static.js <output.html>
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'sudoku_trace');
const out = process.argv[2];
if (!out) {
  console.error('usage: node tools/build_static.js <output.html>');
  process.exit(1);
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const puzzles = JSON.parse(read('web/puzzles.json'));

const traces = {};
for (const p of puzzles) {
  traces[p.id] = JSON.parse(execFileSync(BIN, [p.puzzle, '--granularity=full'],
    { maxBuffer: 64 * 1024 * 1024 }).toString());
}

const body = read('web/index.html')
  .replace(/^[\s\S]*<body>/, '')
  .replace(/<\/body>[\s\S]*$/, '')
  .replace(/<script src="replay\.js"><\/script>\s*/, '')
  .replace(/<script src="app\.js"><\/script>\s*/, '');

// </script> cannot appear inside an inline script tag.
const escapeInline = (s) => s.replace(/<\/script>/gi, '<\\/script>');
const data = `window.STATIC_BUNDLE=${JSON.stringify({ puzzles, traces })};`;

const html = [
  '<title>数独解题过程可视化</title>',
  `<style>\n${read('web/style.css')}\n</style>`,
  body.trim(),
  `<script>\n${escapeInline(read('web/replay.js'))}\n</script>`,
  `<script>\n${escapeInline(data)}\n</script>`,
  `<script>\n${escapeInline(read('web/app.js'))}\n</script>`,
].join('\n');

fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)}KB, ` +
  `${puzzles.length} puzzles, traces inlined)`);
