#!/usr/bin/env node
// Puzzle-library calibration (DESIGN.md §2). Buckets candidate puzzles by the
// solver's own guess count, carves easy (0-guess) puzzles out of solved grids,
// and writes the fixed 3/3/2/2 library to web/puzzles.json.
//
// Difficulty rules: easy = 0 guesses, medium = 1-5, hard = 6-30, expert > 30.
// Run from the repo root after `make trace`: node tools/calibrate.js
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'sudoku_trace');

function trace(puzzle, granularity = 'key') {
  const out = execFileSync(BIN, [puzzle, `--granularity=${granularity}`],
    { timeout: 30000, maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.toString());
}

function readPuzzles(file) {
  return fs.readFileSync(path.join(ROOT, 'data', file), 'utf8')
    .split('\n').map(s => s.trim()).filter(Boolean)
    .map(s => s.replace(/0/g, '.'));
}

// Deterministic PRNG so the generated easy puzzles are reproducible.
function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

// Carves an easy puzzle out of a solved grid: blanks cells in a seeded random
// order, keeping a removal only while the puzzle still solves with 0 guesses.
// A 0-guess puzzle is uniquely solvable by construction (pure deduction).
function carveEasy(solution, seed, targetGivens) {
  const rand = lcg(seed);
  const order = [...Array(81).keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  let cells = solution.split('');
  let givens = 81;
  for (const k of order) {
    if (givens <= targetGivens) break;
    const saved = cells[k];
    cells[k] = '.';
    const t = trace(cells.join(''));
    if (t.solved && t.stats.guesses === 0) {
      givens--;
    } else {
      cells[k] = saved;
    }
  }
  return cells.join('');
}

function entry(id, difficulty, label, puzzle) {
  const t = trace(puzzle, 'full');
  if (!t.solved) throw new Error(`${id}: not solvable`);
  const json = JSON.stringify(t);
  if (json.length > 2 * 1024 * 1024) throw new Error(`${id}: trace too large (${json.length}B)`);
  if (t.stats.timeUs > 200000) throw new Error(`${id}: too slow (${t.stats.timeUs}us)`);
  const givens = puzzle.split('').filter(c => c !== '.').length;
  console.log(`${id.padEnd(9)} ${difficulty.padEnd(7)} givens=${givens} ` +
    `guesses=${t.stats.guesses} backtracks=${t.stats.backtracks} ` +
    `steps=${t.stats.totalSteps} trace=${(json.length / 1024).toFixed(0)}KB ` +
    `time=${(t.stats.timeUs / 1000).toFixed(1)}ms`);
  return {
    id, difficulty, label, puzzle, givens,
    stats: {
      guesses: t.stats.guesses,
      backtracks: t.stats.backtracks,
      keySteps: t.stats.keySteps,
    },
  };
}

function main() {
  const buckets = { medium: [], hard: [], expert: [] };
  const sources = [
    ...readPuzzles('top95.txt').map((p, i) => ({ p, src: `top95#${i + 1}` })),
    ...readPuzzles('hardest.txt').map((p, i) => ({ p, src: `hardest#${i + 1}` })),
  ];
  console.log(`calibrating ${sources.length} candidate puzzles...`);
  for (const { p, src } of sources) {
    let t;
    try {
      t = trace(p);
    } catch {
      console.log(`  skip ${src}: timeout/error`);
      continue;
    }
    if (!t.solved || t.stats.timeUs > 200000) continue;
    const g = t.stats.guesses;
    const rec = { p, src, guesses: g, timeUs: t.stats.timeUs };
    if (g >= 1 && g <= 5) buckets.medium.push(rec);
    else if (g >= 6 && g <= 30) buckets.hard.push(rec);
    else if (g > 30) buckets.expert.push(rec);
  }
  for (const b of Object.keys(buckets)) {
    console.log(`${b}: ${buckets[b].length} candidates`);
  }

  // Easy puzzles: carve from the solutions of the first medium candidates so
  // the three easy grids are unrelated to each other.
  const easyBases = buckets.medium.slice(0, 3).map(r => trace(r.p).solution);
  const easy = easyBases.map((sol, i) => carveEasy(sol, 42 + i, 36));

  // Prefer expert picks from the hardest.txt set when available.
  const expertPool = [
    ...buckets.expert.filter(r => r.src.startsWith('hardest')),
    ...buckets.expert.filter(r => !r.src.startsWith('hardest')),
  ];
  // Spread hard/expert picks by guess count: take the median and the max so
  // the two puzzles in each bucket feel distinct.
  const byGuesses = arr => [...arr].sort((a, b) => a.guesses - b.guesses);
  const pick2 = arr => {
    const s = byGuesses(arr);
    return [s[Math.floor(s.length / 2)], s[s.length - 1]];
  };

  const lib = [];
  easy.forEach((p, i) =>
    lib.push(entry(`easy-${i + 1}`, 'easy', `简单 ${i + 1}`, p)));
  buckets.medium.slice(0, 3).forEach((r, i) =>
    lib.push(entry(`medium-${i + 1}`, 'medium', `中等 ${i + 1}`, r.p)));
  pick2(buckets.hard).forEach((r, i) =>
    lib.push(entry(`hard-${i + 1}`, 'hard', `困难 ${i + 1}`, r.p)));
  pick2(expertPool).forEach((r, i) =>
    lib.push(entry(`expert-${i + 1}`, 'expert', `专家 ${i + 1}`, r.p)));

  if (lib.length !== 10) throw new Error(`expected 10 puzzles, got ${lib.length}`);
  const outPath = path.join(ROOT, 'web', 'puzzles.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(lib, null, 2) + '\n');
  console.log(`wrote ${outPath}`);
}

main();
