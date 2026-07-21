// API tests (DESIGN.md §5.2). Run from the repo root after `make trace`:
//   node --test tests/api.test.js
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../server.js');

let server;
let base;

before(async () => {
  server = createApp();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function solve(body) {
  const res = await fetch(`${base}/api/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test('GET /api/puzzles returns the 10-puzzle library with 3/3/2/2 spread', async () => {
  const res = await fetch(`${base}/api/puzzles`);
  assert.equal(res.status, 200);
  const lib = await res.json();
  assert.equal(lib.length, 10);
  const byDiff = {};
  for (const p of lib) {
    byDiff[p.difficulty] = (byDiff[p.difficulty] || 0) + 1;
    assert.match(p.puzzle, /^[1-9.]{81}$/, `${p.id}: bad puzzle string`);
    assert.ok(p.id && p.label && p.givens > 0 && p.stats, `${p.id}: missing fields`);
  }
  assert.deepEqual(byDiff, { easy: 3, medium: 3, hard: 2, expert: 2 });
});

test('POST /api/solve solves every library puzzle within 500ms', async () => {
  const lib = await (await fetch(`${base}/api/puzzles`)).json();
  for (const p of lib) {
    const t0 = Date.now();
    const { status, body } = await solve({ puzzle: p.puzzle });
    const ms = Date.now() - t0;
    assert.equal(status, 200, `${p.id}: status ${status}`);
    assert.equal(body.solved, true, `${p.id}: not solved`);
    assert.match(body.solution, /^[1-9]{81}$/, `${p.id}: bad solution`);
    assert.equal(body.stats.guesses, p.stats.guesses, `${p.id}: stats drifted from library`);
    assert.ok(body.steps.length > 0, `${p.id}: empty trace`);
    assert.ok(ms < 500, `${p.id}: took ${ms}ms`);
  }
});

test('key granularity omits eliminate steps but keeps counters', async () => {
  const lib = await (await fetch(`${base}/api/puzzles`)).json();
  const { status, body } = await solve({ puzzle: lib[0].puzzle, granularity: 'key' });
  assert.equal(status, 200);
  assert.equal(body.granularity, 'key');
  assert.ok(body.steps.every((s) => s.t !== 'eliminate'));
  assert.ok(body.stats.eliminations > 0);
});

test('invalid inputs are rejected with 400', async () => {
  assert.equal((await solve({ puzzle: '123' })).status, 400);
  assert.equal((await solve({ puzzle: 'x'.repeat(81) })).status, 400);
  assert.equal((await solve({ puzzle: `; rm -rf /tmp/x #${'.'.repeat(63)}` })).status, 400);
  assert.equal((await solve({ puzzle: '.'.repeat(81), granularity: 'nope' })).status, 400);
  assert.equal((await solve('not json')).status, 400);
  assert.equal((await solve({})).status, 400);
});

test('contradictory givens return 422 with a trace', async () => {
  const { status, body } = await solve({ puzzle: '11' + '.'.repeat(79) });
  assert.equal(status, 422);
  assert.equal(body.solved, false);
  assert.equal(body.reason, 'contradiction_in_givens');
  assert.ok(body.steps.length >= 2, 'trace should include the given steps');
});

test('pathological unsolvable puzzle hits the 5s timeout with 504', async () => {
  // README Q4: proven unsolvable only after ~14s of search on this hardware.
  const q4 = '.....5.8....6.1.43..........1.5........1.6...3.......553.....61........4.........';
  const { status, body } = await solve({ puzzle: q4 });
  assert.equal(status, 504);
  assert.equal(body.error, 'timeout');
});

test('10 concurrent solves all succeed', async () => {
  const lib = await (await fetch(`${base}/api/puzzles`)).json();
  const results = await Promise.all(lib.map((p) => solve({ puzzle: p.puzzle })));
  for (let i = 0; i < lib.length; i++) {
    assert.equal(results[i].status, 200, `${lib[i].id} failed under concurrency`);
    assert.equal(results[i].body.solution.length, 81);
  }
});

test('static files and unknown paths', async () => {
  const idx = await fetch(`${base}/`);
  assert.equal(idx.status, 200);
  assert.match(idx.headers.get('content-type'), /text\/html/);
  assert.equal((await fetch(`${base}/no-such-file`)).status, 404);
  assert.equal((await fetch(`${base}/../server.js`)).status, 404);
});
