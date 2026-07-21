// UI wiring for the sudoku visualizer. All replay state lives in
// SudokuReplay.ReplayEngine (replay.js); this file only renders it.
'use strict';
(() => {
  const { ReplayEngine, STYLE, GROUPS, describeStep } = window.SudokuReplay;
  // Static bundle mode (tools/build_static.js): the puzzle library and all
  // traces are inlined and there is no backend, so custom input is hidden.
  const BUNDLE = window.STATIC_BUNDLE || null;

  const $ = (id) => document.getElementById(id);
  const els = {
    list: $('puzzle-list'), board: $('board'), placeholder: $('placeholder'),
    message: $('message'), controls: $('controls'), playback: $('playback'),
    solve: $('btn-solve'), play: $('btn-play'), stepF: $('btn-step-f'),
    stepB: $('btn-step-b'), toStart: $('btn-start'), toEnd: $('btn-end'),
    speed: $('speed'), granularity: $('granularity'),
    progressRow: $('progress-row'), progress: $('progress'),
    progressText: $('progress-text'), log: $('log'), stats: $('stats'),
    customInput: $('custom-input'), customBtn: $('btn-custom'),
  };

  const DIFF_NAMES = { easy: '简单', medium: '中等', hard: '困难', expert: '专家' };
  const STYLE_CLASS = ['', 'st-given', 'st-naked', 'st-hidden', 'st-guess'];
  const STEP_TAGS = {
    given: '提示数', eliminate: '传播', naked_single: '唯一候选',
    hidden_single: '唯一位置', guess: '猜测', backtrack: '回溯',
  };

  let selected = null;   // {id, label, puzzle}
  let trace = null;
  let engine = null;
  let playing = false;
  let playTimer = null;
  const cells = [];

  // ---------------------------------------------------------------- board

  (function buildBoard() {
    for (let k = 0; k < 81; k++) {
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.cell = k;
      const r = Math.floor(k / 9), c = k % 9;
      if (c % 3 === 2 && c !== 8) el.classList.add('br3');
      if (r % 3 === 2 && r !== 8) el.classList.add('bb3');
      el.dataset.base = el.className;
      els.board.appendChild(el);
      cells.push(el);
    }
    els.board.classList.add('hidden');
  })();

  function renderCell(k) {
    const el = cells[k];
    el.className = el.dataset.base;
    delete el.dataset.value;
    if (!engine) {
      const ch = selected.puzzle[k];
      if (ch !== '.') {
        el.classList.add('st-given');
        el.dataset.value = ch;
        el.innerHTML = `<span class="digit">${ch}</span>`;
      } else {
        el.innerHTML = '';
      }
      return;
    }
    const st = engine.det[k];
    if (st !== STYLE.NONE) {
      el.classList.add(STYLE_CLASS[st]);
      el.dataset.value = engine.value[k];
      el.innerHTML = `<span class="digit">${engine.value[k]}</span>`;
    } else {
      let html = '<div class="cands">';
      for (let v = 1; v <= 9; v++) {
        html += `<span>${(engine.bits[k] >> (v - 1)) & 1 ? v : ''}</span>`;
      }
      el.innerHTML = html + '</div>';
    }
  }

  function clearHighlights() {
    for (const el of cells) {
      el.classList.remove('active', 'group-hi', 'flash-elim');
    }
  }

  function applyHighlights() {
    clearHighlights();
    if (!engine || engine.idx === 0) return;
    const s = engine.steps[engine.idx - 1];
    if (s.cell !== undefined && s.cell >= 0) cells[s.cell].classList.add('active');
    if (s.t === 'eliminate') cells[s.cell].classList.add('flash-elim');
    if (s.t === 'hidden_single' && GROUPS[s.group]) {
      for (const k of GROUPS[s.group]) cells[k].classList.add('group-hi');
    }
  }

  function renderAll() {
    for (let k = 0; k < 81; k++) renderCell(k);
    applyHighlights();
  }

  function renderDirty(dirty) {
    if (dirty === null) { renderAll(); return; }
    for (const k of dirty) renderCell(k);
    applyHighlights();
  }

  // ------------------------------------------------------------------ log

  let visibleLog = [];  // step indices shown in the log for current granularity

  function rebuildVisibleLog() {
    visibleLog = [];
    if (!engine) return;
    const keyOnly = els.granularity.value === 'key';
    for (let i = 0; i < engine.steps.length; i++) {
      if (engine.redundant[i]) continue;
      if (keyOnly && engine.steps[i].t === 'eliminate') continue;
      visibleLog.push(i);
    }
  }

  function renderLog() {
    if (!engine) return;
    // current = last applied visible step
    let lo = 0, hi = visibleLog.length - 1, cur = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (visibleLog[mid] < engine.idx) { cur = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    const from = Math.max(0, cur - 80);
    const to = Math.min(visibleLog.length, cur + 40);
    let html = '';
    for (let i = from; i < to; i++) {
      const si = visibleLog[i];
      const s = engine.steps[si];
      html += `<div class="log-line t-${s.t}${i === cur ? ' current' : ''}" data-step="${si}">` +
        `<span class="tag">[${STEP_TAGS[s.t] || s.t}]</span>#${si + 1} ${describeStep(s)}</div>`;
    }
    els.log.innerHTML = html;
    // Scroll only the log container itself — scrollIntoView would also
    // scroll every ancestor and yank the whole page along on each step.
    const curEl = els.log.querySelector('.current');
    if (curEl) {
      els.log.scrollTop =
        curEl.offsetTop - els.log.clientHeight / 2 + curEl.offsetHeight / 2;
    }
  }

  els.log.addEventListener('click', (e) => {
    const line = e.target.closest('.log-line');
    if (!line) return;
    pause();
    engine.seek(Number(line.dataset.step) + 1);
    renderAll(); syncProgress(); renderLog(); maybeEndBanner();
  });

  // ------------------------------------------------------------- messages

  function showMessage(text, isError) {
    els.message.textContent = text;
    els.message.classList.toggle('error', !!isError);
    els.message.classList.remove('hidden');
  }
  function hideMessage() { els.message.classList.add('hidden'); }

  // ------------------------------------------------------------- playback

  function syncProgress() {
    els.progress.max = engine ? engine.length : 0;
    els.progress.value = engine ? engine.idx : 0;
    els.progressText.textContent = `${engine ? engine.idx : 0} / ${engine ? engine.length : 0}`;
  }

  function maybeEndBanner() {
    if (engine && engine.atEnd() && trace && !trace.solved) {
      showMessage(trace.reason === 'contradiction_in_givens'
        ? '此题无解：初始盘面即存在矛盾。'
        : '此题无解：搜索已穷尽所有分支（以上回放展示了矛盾推导过程）。', true);
    }
  }

  function stepDelay() {
    const speed = Number(els.speed.value);
    if (els.granularity.value === 'key') return 350 / speed;
    const next = engine.steps[engine.idx];
    return (next && next.t === 'eliminate' ? 30 : 300) / speed;
  }

  function advanceOnce() {
    if (engine.atEnd()) return false;
    if (els.granularity.value === 'key') {
      const boundary = engine.nextKeyBoundary();
      engine.seek(boundary);
      renderAll();
    } else {
      renderDirty(engine.stepForward().dirty);
    }
    syncProgress(); renderLog();
    if (engine.atEnd()) maybeEndBanner();
    return !engine.atEnd();
  }

  function tick() {
    if (!playing) return;
    if (!advanceOnce()) { pause(); return; }
    playTimer = setTimeout(tick, stepDelay());
  }

  function play() {
    if (!engine || engine.atEnd()) return;
    playing = true;
    els.play.textContent = '⏸ 暂停';
    playTimer = setTimeout(tick, 0);
  }

  function pause() {
    playing = false;
    clearTimeout(playTimer);
    els.play.textContent = '▶ 播放';
  }

  els.play.addEventListener('click', () => (playing ? pause() : play()));
  els.stepF.addEventListener('click', () => { pause(); advanceOnce(); });
  els.stepB.addEventListener('click', () => {
    pause();
    if (!engine) return;
    if (els.granularity.value === 'key') {
      let target = 0;
      for (const i of engine.keyIndices) {
        if (i + 1 < engine.idx) target = i + 1; else break;
      }
      engine.seek(target);
    } else {
      engine.stepBack();
    }
    renderAll(); syncProgress(); renderLog();
  });
  els.toStart.addEventListener('click', () => {
    pause(); engine.seek(0); renderAll(); syncProgress(); renderLog();
  });
  els.toEnd.addEventListener('click', () => {
    pause(); engine.seek(engine.length); renderAll(); syncProgress(); renderLog();
    maybeEndBanner();
  });
  els.progress.addEventListener('input', () => {
    pause(); engine.seek(Number(els.progress.value));
    renderAll(); syncProgress(); renderLog();
  });
  els.granularity.addEventListener('change', () => { rebuildVisibleLog(); renderLog(); });

  // ------------------------------------------------------------ selection

  function confirmDiscard() {
    if (engine && engine.idx > 0 && !engine.atEnd()) {
      return window.confirm('切换将丢弃当前回放进度，确定继续？');
    }
    return true;
  }

  function select(item) {
    if (!confirmDiscard()) return false;
    pause();
    selected = item;
    trace = null;
    engine = null;
    hideMessage();
    els.placeholder.classList.add('hidden');
    els.board.classList.remove('hidden');
    els.controls.classList.remove('hidden');
    els.playback.classList.add('hidden');
    els.progressRow.classList.add('hidden');
    els.log.classList.add('hidden');
    els.stats.classList.add('hidden');
    els.solve.disabled = false;
    renderAll();
    document.querySelectorAll('.puzzle-item').forEach((el) =>
      el.classList.toggle('selected', el.dataset.id === item.id));
    return true;
  }

  function loadTrace(body) {
    trace = body;
    engine = new ReplayEngine(body);
    if (body.truncated) {
      els.granularity.value = 'key';
      showMessage('该题的推导步骤过多，已截断为关键步回放。');
    }
    $('stat-guesses').textContent = body.stats.guesses;
    $('stat-backtracks').textContent = body.stats.backtracks;
    $('stat-eliminations').textContent = body.stats.eliminations;
    $('stat-steps').textContent = body.stats.totalSteps;
    $('stat-time').textContent = body.stats.timeUs < 1000
      ? `${body.stats.timeUs}µs`
      : `${(body.stats.timeUs / 1000).toFixed(1)}ms`;
    els.stats.classList.remove('hidden');
    els.playback.classList.remove('hidden');
    els.progressRow.classList.remove('hidden');
    els.log.classList.remove('hidden');
    engine.seek(0);
    rebuildVisibleLog();
    renderAll(); syncProgress(); renderLog();
  }

  async function doSolve() {
    if (!selected) return;
    if (BUNDLE) {
      const body = BUNDLE.decode
        ? BUNDLE.decode(selected.id)
        : BUNDLE.traces[selected.id];
      if (!body) {
        showMessage('该题没有预生成的解题路径。', true);
        return;
      }
      hideMessage();
      loadTrace(body);
      els.solve.textContent = '重新求解';
      return;
    }
    els.solve.disabled = true;
    els.solve.textContent = '求解中…';
    try {
      const res = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzle: selected.puzzle, granularity: 'full' }),
      });
      const body = await res.json();
      if (res.status === 200) {
        hideMessage();
        loadTrace(body);
      } else if (res.status === 422) {
        showMessage('此题无解。可回放查看矛盾是如何推导出来的。', true);
        loadTrace(body);
      } else if (res.status === 504) {
        showMessage('求解超时（超过 5 秒）：该盘面对搜索来说过于病态。', true);
      } else {
        showMessage(`求解失败：${body.message || body.error || res.status}`, true);
      }
    } catch (e) {
      showMessage(`请求失败：${e.message}`, true);
    } finally {
      els.solve.disabled = false;
      els.solve.textContent = '重新求解';
    }
  }
  els.solve.addEventListener('click', doSolve);

  // --------------------------------------------------------- puzzle list

  let activeFilter = 'all';

  function renderList(lib) {
    const order = ['easy', 'medium', 'hard', 'expert'];
    const count = (d) => lib.filter((x) => x.difficulty === d).length;
    let html = '<div class="filters">' +
      `<button class="filter-chip${activeFilter === 'all' ? ' active' : ''}" ` +
      `data-diff="all">全部 ${lib.length}</button>`;
    for (const d of order) {
      html += `<button class="filter-chip${activeFilter === d ? ' active' : ''}" ` +
        `data-diff="${d}">${DIFF_NAMES[d]} ${count(d)}</button>`;
    }
    html += '</div><div class="list-scroll">';
    for (const d of order) {
      if (activeFilter !== 'all' && activeFilter !== d) continue;
      html += `<div class="diff-title">${DIFF_NAMES[d]}</div>`;
      for (const p of lib.filter((x) => x.difficulty === d)) {
        const sel = selected && selected.id === p.id ? ' selected' : '';
        html += `<button class="puzzle-item${sel}" data-id="${p.id}">` +
          `<span class="badge ${d}">${DIFF_NAMES[d]}</span>${p.label}` +
          `<span class="puzzle-meta">${p.givens} 提示 · ${p.stats.guesses} 猜测</span></button>`;
      }
    }
    html += '</div>';
    els.list.innerHTML = html;
  }

  async function loadLibrary() {
    const lib = BUNDLE
      ? BUNDLE.puzzles
      : await (await fetch('/api/puzzles')).json();
    renderList(lib);
    els.list.addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (chip) {
        activeFilter = chip.dataset.diff;
        renderList(lib);
        return;
      }
      const btn = e.target.closest('.puzzle-item');
      if (!btn) return;
      const item = lib.find((p) => p.id === btn.dataset.id);
      if (item) select(item);
    });
  }

  // --------------------------------------------------------- custom input

  els.customBtn.addEventListener('click', () => {
    const raw = els.customInput.value.replace(/\s+/g, '').replace(/0/g, '.');
    if (!/^[1-9.]{81}$/.test(raw)) {
      showMessage('自定义题串无效：需要恰好 81 个字符，仅限 1-9、0 和 .', true);
      return;
    }
    select({ id: 'custom', label: '自定义', puzzle: raw });
  });

  if (BUNDLE) document.querySelector('.custom').classList.add('hidden');

  loadLibrary().catch((e) => showMessage(`题库加载失败：${e.message}`, true));
})();
