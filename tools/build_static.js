#!/usr/bin/env node
// Builds a self-contained static bundle of the visualizer: every library
// trace is pre-generated with bin/sudoku_trace and inlined together with
// the CSS/JS, so the result needs no backend (custom input is disabled).
// Traces are stored in a compact token encoding (~8x smaller than the raw
// step JSON) and decoded lazily per puzzle when it is selected.
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

// One token per step: g=given e=eliminate n=naked h=hidden u=guess b=backtrack.
// hidden groups become indices (0-8 rows, 9-17 cols, 18-26 boxes); guess
// candidate lists become bitmasks. The in-page decoder reverses all of this.
const GROUP_IDX = (name) => {
  const n = Number(name.slice(3)) - 1;
  return name.startsWith('row') ? n : name.startsWith('col') ? 9 + n : 18 + n;
};
function encodeSteps(steps) {
  return steps.map((s) => {
    switch (s.t) {
      case 'given': return `g${s.cell},${s.val}`;
      case 'eliminate': return `e${s.cell},${s.val},${s.by}`;
      case 'naked_single': return `n${s.cell},${s.val}`;
      case 'hidden_single': return `h${s.cell},${s.val},${GROUP_IDX(s.group)}`;
      case 'guess': {
        const mask = s.cands.reduce((m, v) => m | (1 << (v - 1)), 0);
        return `u${s.cell},${s.val},${s.depth},${mask}`;
      }
      case 'backtrack': return `b${s.depth}`;
      default: throw new Error(`unknown step type ${s.t}`);
    }
  }).join(';');
}

const traces = {};
for (const p of puzzles) {
  const t = JSON.parse(execFileSync(BIN, [p.puzzle, '--granularity=full'],
    { maxBuffer: 64 * 1024 * 1024 }).toString());
  const { steps, ...meta } = t;
  traces[p.id] = { ...meta, enc: encodeSteps(steps) };
}

const body = read('web/index.html')
  .replace(/^[\s\S]*<body>/, '')
  .replace(/<\/body>[\s\S]*$/, '')
  .replace(/<script src="replay\.js"><\/script>\s*/, '')
  .replace(/<script src="app\.js"><\/script>\s*/, '');

// </script> cannot appear inside an inline script tag.
const escapeInline = (s) => s.replace(/<\/script>/gi, '<\\/script>');

const decoder = `
window.STATIC_BUNDLE = {
  puzzles: ${JSON.stringify(puzzles)},
  traces: ${JSON.stringify(traces)},
  decode(id) {
    const t = this.traces[id];
    if (!t || t.steps) return t;
    const gname = (i) => i < 9 ? 'row' + (i + 1)
      : i < 18 ? 'col' + (i - 8) : 'box' + (i - 17);
    t.steps = t.enc.split(';').map((tok) => {
      const a = tok.slice(1).split(',').map(Number);
      switch (tok[0]) {
        case 'g': return { t: 'given', cell: a[0], val: a[1] };
        case 'e': return { t: 'eliminate', cell: a[0], val: a[1], by: a[2] };
        case 'n': return { t: 'naked_single', cell: a[0], val: a[1] };
        case 'h': return { t: 'hidden_single', cell: a[0], val: a[1], group: gname(a[2]) };
        case 'u': {
          const cands = [];
          for (let v = 1; v <= 9; v++) if ((a[3] >> (v - 1)) & 1) cands.push(v);
          return { t: 'guess', cell: a[0], val: a[1], depth: a[2], cands };
        }
        case 'b': return { t: 'backtrack', depth: a[0] };
      }
    });
    delete t.enc;
    return t;
  },
};`;

const html = [
  '<title>数独解题过程可视化</title>',
  `<style>\n${read('web/style.css')}\n</style>`,
  body.trim(),
  `<script>\n${escapeInline(read('web/replay.js'))}\n</script>`,
  `<script>\n${escapeInline(decoder)}\n</script>`,
  `<script>\n${escapeInline(read('web/app.js'))}\n</script>`,
].join('\n');

fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(1)}MB, ` +
  `${puzzles.length} puzzles, traces inlined)`);
