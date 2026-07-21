// Replay-engine unit tests (DESIGN.md §5.3), DOM-free. Run from the repo
// root after `make trace`: node --test tests/replay.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { ReplayEngine, STYLE, describeStep } = require('../web/replay.js');

const ROOT = path.join(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'sudoku_trace');
const library = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'puzzles.json'), 'utf8'));

function trace(puzzle) {
  return JSON.parse(execFileSync(BIN, [puzzle], { maxBuffer: 64 * 1024 * 1024 }));
}

function stateSignature(e) {
  return `${e.bits.join(',')}|${e.det.join(',')}|${e.value.join(',')}`;
}

for (const p of library) {
  test(`${p.id}: replaying to the end reproduces the solution`, () => {
    const t = trace(p.puzzle);
    const e = new ReplayEngine(t);
    e.seek(e.length);
    for (let k = 0; k < 81; k++) {
      assert.equal(e.det[k] !== STYLE.NONE, true, `cell ${k} undetermined`);
      assert.equal(String(e.value[k]), t.solution[k], `cell ${k} wrong digit`);
      assert.equal(e.bits[k], 1 << (t.solution[k] - '1'), `cell ${k} bits wrong`);
    }
  });
}

test('seek(n) equals stepping forward n times (incl. across backtracks)', () => {
  const p = library.find((x) => x.difficulty === 'hard');
  const t = trace(p.puzzle);
  const stepped = new ReplayEngine(t);
  const seeker = new ReplayEngine(t);
  // Verify at every backtrack boundary plus a sample of ordinary positions.
  const positions = new Set([0, 1, t.steps.length]);
  t.steps.forEach((s, i) => {
    if (s.t === 'backtrack' || s.t === 'guess') {
      positions.add(i); positions.add(i + 1);
    }
  });
  for (let i = 0; i < t.steps.length; i += 97) positions.add(i);
  for (let n = 0; n <= t.steps.length; n++) {
    if (positions.has(n)) {
      seeker.seek(n);
      assert.equal(stateSignature(seeker), stateSignature(stepped),
        `state mismatch at step ${n}`);
    }
    stepped.stepForward();
  }
});

test('backtrack restores the exact pre-guess state', () => {
  const p = library.find((x) => x.stats.backtracks > 0);
  assert.ok(p, 'library should contain a puzzle with backtracks');
  const t = trace(p.puzzle);
  const e = new ReplayEngine(t);
  let checked = 0;
  for (let i = 0; i < t.steps.length && checked < 20; i++) {
    if (t.steps[i].t !== 'backtrack') continue;
    // matching guess: the last guess at the same depth before i
    let g = -1;
    for (let j = i - 1; j >= 0; j--) {
      if (t.steps[j].t === 'guess' && t.steps[j].depth === t.steps[i].depth) {
        g = j; break;
      }
    }
    assert.ok(g >= 0, `backtrack at ${i} has no matching guess`);
    e.seek(i + 1);           // just after the backtrack
    const after = stateSignature(e);
    e.seek(g);               // just before the matching guess
    assert.equal(after, stateSignature(e), `backtrack at ${i} broke state`);
    checked++;
  }
  assert.ok(checked > 0);
});

test('redundant naked singles are flagged and skipped from display', () => {
  const p = library.find((x) => x.stats.guesses > 0);
  const t = trace(p.puzzle);
  const e = new ReplayEngine(t);
  // Every guess assign narrows the guessed cell, so its follow-up
  // naked_single must be marked redundant.
  let found = 0;
  for (let i = 0; i < t.steps.length; i++) {
    const s = t.steps[i];
    if (s.t !== 'guess') continue;
    for (let j = i + 1; j < t.steps.length; j++) {
      const n = t.steps[j];
      if (n.t === 'naked_single' && n.cell === s.cell) {
        assert.equal(e.redundant[j], 1, `naked after guess at ${j} not redundant`);
        found++;
        break;
      }
      if (n.t === 'guess' || n.t === 'backtrack') break;
    }
  }
  assert.ok(found > 0, 'no guess/naked pairs found to verify');
});

test('key boundaries only stop at non-eliminate, non-redundant steps', () => {
  const t = trace(library[0].puzzle);
  const e = new ReplayEngine(t);
  while (!e.atEnd()) {
    const b = e.nextKeyBoundary();
    e.seek(b);
    if (b <= t.steps.length && e.idx === b) {
      const s = t.steps[b - 1];
      assert.notEqual(s.t, 'eliminate');
      assert.equal(e.redundant[b - 1], 0);
    }
  }
});

test('describeStep renders every step type without throwing', () => {
  const t = trace(library.find((x) => x.difficulty === 'expert').puzzle);
  const seen = new Set();
  for (const s of t.steps) {
    assert.equal(typeof describeStep(s), 'string');
    seen.add(s.t);
  }
  for (const want of ['given', 'eliminate', 'naked_single', 'guess', 'backtrack']) {
    assert.ok(seen.has(want), `expert trace should contain ${want}`);
  }
});
