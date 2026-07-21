#!/usr/bin/env bash
# macOS 一键启动脚本：检查环境 → 编译求解器 → 启动服务 → 打开浏览器。
# Finder 里双击本文件即可（首次可能需要在"系统设置 → 隐私与安全性"里允许），
# 或在终端运行 ./start-mac.command。停止服务：在打开的终端窗口按 Ctrl+C。
set -euo pipefail
cd "$(dirname "$0")"

info() { printf '\033[1;34m[启动]\033[0m %s\n' "$1"; }
fail() { printf '\033[1;31m[错误]\033[0m %s\n' "$1"; exit 1; }

# 1. 编译器（macOS 上 g++/c++ 由 Xcode 命令行工具提供）
if ! command -v g++ >/dev/null 2>&1 && ! command -v c++ >/dev/null 2>&1; then
  fail "未找到 C++ 编译器。请先安装 Xcode 命令行工具：xcode-select --install"
fi

# 2. Node.js ≥ 18
if ! command -v node >/dev/null 2>&1; then
  fail "未找到 Node.js。请先安装（推荐 brew install node，或从 nodejs.org 下载）"
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js 版本过低（当前 $(node -v)，需要 ≥ 18）"
fi

# 3. 编译求解器（make 会自动跳过已是最新的目标）
info "编译求解器…"
if command -v g++ >/dev/null 2>&1; then
  make trace
else
  make trace CXX=c++
fi

# 4. 选一个空闲端口（默认 8000，被占用则向后找）
PORT="${PORT:-8000}"
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  info "端口 $PORT 已被占用，尝试 $((PORT + 1))"
  PORT=$((PORT + 1))
  [ "$PORT" -gt 8020 ] && fail "8000-8020 端口均被占用，请设置 PORT 环境变量后重试"
done

# 5. 启动服务并等待就绪
info "启动服务（端口 $PORT）…"
PORT="$PORT" node server.js &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:$PORT/api/puzzles" >/dev/null 2>&1; then
    break
  fi
  kill -0 "$SERVER_PID" 2>/dev/null || fail "服务启动失败"
  sleep 0.2
done
curl -sf "http://127.0.0.1:$PORT/api/puzzles" >/dev/null 2>&1 \
  || fail "服务未在预期时间内就绪"

# 6. 打开浏览器
URL="http://localhost:$PORT"
info "已就绪：$URL（按 Ctrl+C 停止服务）"
if command -v open >/dev/null 2>&1; then
  open "$URL"          # macOS
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"      # Linux 桌面环境顺带兼容
fi

wait "$SERVER_PID"
