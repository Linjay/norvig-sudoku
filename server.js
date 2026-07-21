#!/usr/bin/env node
// Zero-dependency web server for the sudoku visualizer (DESIGN.md §4.5).
//   GET  /api/puzzles          -> the fixed 10-puzzle library
//   POST /api/solve            -> {puzzle, granularity} => trace JSON
//   GET  /*                    -> static files from web/
// The C++ solver runs as a child process via execFile (no shell involved).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = __dirname;
const WEB = path.join(ROOT, 'web');
const BIN = path.join(ROOT, 'bin', 'sudoku_trace');
const SOLVE_TIMEOUT_MS = 5000;
const PUZZLE_RE = /^[1-9.0]{81}$/;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, obj) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': MIME['.json'] });
  res.end(body);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const file = path.normalize(path.join(WEB, rel));
  if (!file.startsWith(WEB + path.sep) && file !== path.join(WEB, 'index.html')) {
    return sendJson(res, 403, { error: 'forbidden' });
  }
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'not_found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

function handleSolve(req, res) {
  let body = '';
  let overflow = false;
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 4096) { overflow = true; req.destroy(); }
  });
  req.on('close', () => {
    if (overflow) { /* connection dropped, nothing to answer */ }
  });
  req.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return sendJson(res, 400, { error: 'invalid_json' });
    }
    const puzzle = payload.puzzle;
    const granularity = payload.granularity || 'full';
    if (typeof puzzle !== 'string' || !PUZZLE_RE.test(puzzle)) {
      return sendJson(res, 400, {
        error: 'invalid_input',
        message: 'puzzle must be 81 chars of [1-9.0]',
      });
    }
    if (granularity !== 'full' && granularity !== 'key') {
      return sendJson(res, 400, { error: 'invalid_input', message: 'bad granularity' });
    }
    execFile(BIN, [puzzle, `--granularity=${granularity}`], {
      timeout: SOLVE_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      maxBuffer: 32 * 1024 * 1024,
    }, (err, stdout) => {
      if (err && err.killed) {
        return sendJson(res, 504, {
          error: 'timeout',
          message: `solver exceeded ${SOLVE_TIMEOUT_MS}ms`,
        });
      }
      if (err && err.code === 2) {
        // solver-side validation error; stdout carries the structured reason
        return sendJson(res, 400, stdout.toString().trim() ||
          JSON.stringify({ error: 'invalid_input' }));
      }
      if (err) {
        return sendJson(res, 500, { error: 'solver_failed' });
      }
      const out = stdout.toString().trim();
      let solved = true;
      try {
        solved = JSON.parse(out).solved === true;
      } catch {
        return sendJson(res, 500, { error: 'bad_solver_output' });
      }
      sendJson(res, solved ? 200 : 422, out);
    });
  });
}

function createApp() {
  return http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.split('?')[0] === '/api/puzzles') {
      return fs.readFile(path.join(WEB, 'puzzles.json'), (err, data) => {
        if (err) return sendJson(res, 500, { error: 'library_missing' });
        sendJson(res, 200, data.toString());
      });
    }
    if (req.method === 'POST' && req.url.split('?')[0] === '/api/solve') {
      return handleSolve(req, res);
    }
    if (req.method === 'GET') return serveStatic(req, res);
    sendJson(res, 405, { error: 'method_not_allowed' });
  });
}

module.exports = { createApp };

if (require.main === module) {
  const port = Number(process.env.PORT) || 8000;
  createApp().listen(port, () => {
    console.log(`sudoku visualizer at http://localhost:${port}`);
  });
}
