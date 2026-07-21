// End-to-end tests for the sudoku visualizer (DESIGN.md §5.3).
// Run: npx playwright test
'use strict';
const { test, expect } = require('@playwright/test');

async function library(request) {
  return (await request.get('/api/puzzles')).json();
}

function boardString(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#board .cell'))
      .map((c) => c.dataset.value || '.').join(''));
}

test('1. lists 10 puzzles grouped by difficulty 3/3/2/2', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.puzzle-item')).toHaveCount(10);
  for (const [diff, n] of [['easy', 3], ['medium', 3], ['hard', 2], ['expert', 2]]) {
    await expect(page.locator(`.puzzle-item .badge.${diff}`)).toHaveCount(n);
  }
  await expect(page.locator('.diff-title')).toHaveCount(4);
});

test('2. selecting a medium puzzle renders its givens', async ({ page, request }) => {
  const lib = await library(request);
  const medium = lib.find((p) => p.id === 'medium-1');
  await page.goto('/');
  await page.click('.puzzle-item[data-id="medium-1"]');
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#board .cell.st-given')).toHaveCount(medium.givens);
  expect(await boardString(page)).toBe(medium.puzzle);
  await expect(page.locator('#btn-solve')).toBeEnabled();
});

test('3. solve + playback reaches the exact solution', async ({ page, request }) => {
  const lib = await library(request);
  const medium = lib.find((p) => p.id === 'medium-2');
  const solveRes = await request.post('/api/solve', { data: { puzzle: medium.puzzle } });
  expect(solveRes.status()).toBe(200);
  const { solution } = await solveRes.json();

  await page.goto('/');
  await page.click('.puzzle-item[data-id="medium-2"]');
  await page.click('#btn-solve');
  await expect(page.locator('#playback')).toBeVisible();
  await expect(page.locator('#stats')).toBeVisible();

  // At step 0 the givens must still be on the board.
  expect(await boardString(page)).toBe(medium.puzzle);

  // Let the animation actually run a few steps, then jump to the end.
  await page.click('#btn-play');
  await page.waitForFunction(() =>
    Number(document.getElementById('progress').value) > 0);
  await page.click('#btn-play'); // pause
  await page.click('#btn-end');
  await expect(page.locator('#board .cell[data-value]')).toHaveCount(81);
  expect(await boardString(page)).toBe(solution);
  const progress = page.locator('#progress');
  expect(await progress.inputValue()).toBe(await progress.getAttribute('max'));
});

test('4. stepping back and forward is state-consistent', async ({ page }) => {
  await page.goto('/');
  await page.click('.puzzle-item[data-id="easy-1"]');
  await page.click('#btn-solve');
  await expect(page.locator('#playback')).toBeVisible();
  for (let i = 0; i < 8; i++) await page.click('#btn-step-f');
  const snapshot = await boardString(page);
  const pos = await page.locator('#progress').inputValue();
  for (let i = 0; i < 3; i++) await page.click('#btn-step-b');
  expect(await page.locator('#progress').inputValue()).not.toBe(pos);
  for (let i = 0; i < 3; i++) await page.click('#btn-step-f');
  expect(await boardString(page)).toBe(snapshot);
  expect(await page.locator('#progress').inputValue()).toBe(pos);
});

test('5. unsolvable custom puzzle shows an error and stays usable', async ({ page }) => {
  await page.goto('/');
  await page.fill('#custom-input', '11' + '.'.repeat(79));
  await page.click('#btn-custom');
  await page.click('#btn-solve');
  await expect(page.locator('#message')).toBeVisible();
  await expect(page.locator('#message')).toContainText('无解');
  // the contradiction trace is still replayable
  await expect(page.locator('#playback')).toBeVisible();
  // and the page still works: pick a library puzzle afterwards
  await page.click('.puzzle-item[data-id="easy-2"]');
  await expect(page.locator('#board .cell.st-given')).not.toHaveCount(0);
});

test('7. playback must not scroll the page (log auto-scroll stays local)', async ({ page }) => {
  // Small viewport so the page overflows and window scrolling is possible.
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto('/');
  await page.click('.puzzle-item[data-id="medium-1"]');
  await page.click('#btn-solve');
  await expect(page.locator('#playback')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  // JS clicks: a Playwright click would itself scroll the button into view.
  await page.evaluate(() => document.getElementById('btn-play').click());
  await page.waitForFunction(() =>
    Number(document.getElementById('progress').value) > 30);
  await page.evaluate(() => document.getElementById('btn-play').click()); // pause
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // the log itself did auto-scroll
  expect(await page.evaluate(() =>
    document.getElementById('log').scrollTop)).toBeGreaterThan(0);
});

test('6. invalid custom input is rejected client-side without a request', async ({ page }) => {
  await page.goto('/');
  const solveCalls = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/solve')) solveCalls.push(r.url());
  });
  await page.fill('#custom-input', 'abc123');
  await page.click('#btn-custom');
  await expect(page.locator('#message')).toBeVisible();
  await expect(page.locator('#message')).toContainText('无效');
  expect(solveCalls).toHaveLength(0);
});
