// Replay engine for solver traces (DESIGN.md §4.4). Pure state machine, no
// DOM — the same file is unit-tested under Node (tests/replay.test.js).
'use strict';

const STYLE = { NONE: 0, GIVEN: 1, NAKED: 2, HIDDEN: 3, GUESS: 4 };

// Cell indices of each named group, mirroring the C++ layout:
// row1..row9, col1..col9, box1..box9.
const GROUPS = (() => {
  const g = {};
  for (let i = 0; i < 9; i++) {
    g[`row${i + 1}`] = Array.from({ length: 9 }, (_, j) => i * 9 + j);
    g[`col${i + 1}`] = Array.from({ length: 9 }, (_, j) => j * 9 + i);
    const r = Math.floor(i / 3) * 3, c = (i % 3) * 3;
    g[`box${i + 1}`] = Array.from({ length: 9 },
      (_, j) => (r + Math.floor(j / 3)) * 9 + c + (j % 3));
  }
  return g;
})();

class ReplayEngine {
  constructor(trace) {
    this.trace = trace;
    this.steps = trace.steps;
    this._reset();
    // Prescan: mark redundant naked_single steps (a cell already determined
    // by a given/hidden/guess) so display and logs can skip them, and collect
    // the indices of key steps for coarse-grained playback.
    this.redundant = new Uint8Array(this.steps.length);
    this.keyIndices = [];
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i];
      if (s.t === 'naked_single' && this.det[s.cell] !== STYLE.NONE) {
        this.redundant[i] = 1;
      } else if (s.t !== 'eliminate') {
        this.keyIndices.push(i);
      }
      this._apply(s);
    }
    this._reset();
  }

  _reset() {
    this.idx = 0;
    this.bits = new Int16Array(81).fill(511);
    this.det = new Uint8Array(81);   // STYLE.* per cell
    this.value = new Uint8Array(81); // displayed digit for determined cells
    this.snaps = {};                 // depth -> pre-guess snapshot
    // Givens are displayed from step 0 on — the puzzle's own digits must
    // never vanish from the board. Their trace steps then become visual
    // no-ops and playback only animates the deduction.
    const puzzle = this.trace.puzzle || '';
    for (let k = 0; k < puzzle.length && k < 81; k++) {
      if (puzzle[k] >= '1' && puzzle[k] <= '9') {
        this.det[k] = STYLE.GIVEN;
        this.value[k] = puzzle[k].charCodeAt(0) - 48;
      }
    }
  }

  _apply(s) {
    switch (s.t) {
      case 'given':
        this.det[s.cell] = STYLE.GIVEN;
        this.value[s.cell] = s.val;
        return [s.cell];
      case 'eliminate':
        this.bits[s.cell] &= ~(1 << (s.val - 1));
        return [s.cell];
      case 'naked_single':
        if (this.det[s.cell] !== STYLE.NONE) return [];
        this.det[s.cell] = STYLE.NAKED;
        this.value[s.cell] = s.val;
        return [s.cell];
      case 'hidden_single':
        if (this.det[s.cell] !== STYLE.NONE) return [];
        this.det[s.cell] = STYLE.HIDDEN;
        this.value[s.cell] = s.val;
        return [s.cell];
      case 'guess':
        this.snaps[s.depth] = {
          bits: this.bits.slice(),
          det: this.det.slice(),
          value: this.value.slice(),
        };
        this.det[s.cell] = STYLE.GUESS;
        this.value[s.cell] = s.val;
        return [s.cell];
      case 'backtrack': {
        const snap = this.snaps[s.depth];
        if (!snap) return [];
        this.bits = snap.bits.slice();
        this.det = snap.det.slice();
        this.value = snap.value.slice();
        return null; // whole board changed
      }
      default:
        return [];
    }
  }

  get length() { return this.steps.length; }
  atEnd() { return this.idx >= this.steps.length; }

  // Applies one step; returns {step, dirty} where dirty is a cell list or
  // null for a full-board change. Returns null at the end of the trace.
  stepForward() {
    if (this.atEnd()) return null;
    const step = this.steps[this.idx];
    const dirty = this._apply(step);
    this.idx++;
    return { step, dirty, index: this.idx - 1 };
  }

  // Rebuilds state so that exactly n steps are applied. Traces are at most a
  // few tens of thousands of pure bit operations, so a rebuild from zero is
  // well under a frame; no checkpointing needed.
  seek(n) {
    n = Math.max(0, Math.min(n, this.steps.length));
    this._reset();
    while (this.idx < n) {
      this._apply(this.steps[this.idx]);
      this.idx++;
    }
  }

  stepBack() {
    if (this.idx > 0) this.seek(this.idx - 1);
  }

  // Index just past the next key step at-or-after idx (for coarse playback).
  nextKeyBoundary() {
    for (let i = this.idx; i < this.steps.length; i++) {
      if (this.steps[i].t !== 'eliminate' && !this.redundant[i]) return i + 1;
    }
    return this.steps.length;
  }

  candidates(cell) {
    const out = [];
    for (let v = 1; v <= 9; v++) {
      if ((this.bits[cell] >> (v - 1)) & 1) out.push(v);
    }
    return out;
  }
}

function cellName(k) {
  return `R${Math.floor(k / 9) + 1}C${(k % 9) + 1}`;
}

function groupLabel(g) {
  const n = g.slice(3);
  if (g.startsWith('row')) return `第${n}行`;
  if (g.startsWith('col')) return `第${n}列`;
  return `第${n}宫`;
}

function describeStep(s) {
  switch (s.t) {
    case 'given':
      return `提示数 ${cellName(s.cell)} = ${s.val}`;
    case 'eliminate':
      return `传播 ${cellName(s.cell)} 删除候选 ${s.val}` +
        (s.by >= 0 && s.by !== s.cell ? `（由 ${cellName(s.by)}）` : '');
    case 'naked_single':
      return `唯一候选 ${cellName(s.cell)} = ${s.val}`;
    case 'hidden_single':
      return `唯一位置 ${groupLabel(s.group)}中 ${s.val} 只能填 ${cellName(s.cell)}`;
    case 'guess':
      return `猜测(深度${s.depth}) ${cellName(s.cell)} 试 ${s.val}，候选 {${s.cands.join(',')}}`;
    case 'backtrack':
      return `回溯 撤销深度 ${s.depth} 的猜测`;
    default:
      return s.t;
  }
}

const api = { ReplayEngine, STYLE, GROUPS, cellName, describeStep, groupLabel };
if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.SudokuReplay = api;
}
