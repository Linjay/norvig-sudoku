// Trace mode: solve one puzzle and emit the full solving path as JSON.
// Usage: sudoku_trace [--granularity=full|key] [--max-steps=N] [puzzle]
// Reads the puzzle from the first positional arg, or one line from stdin.
// Exit codes: 0 = valid run (solved or not), 2 = invalid input.
#include "sudoku.h"
#include "trace.h"
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>

using namespace std;
using namespace std::chrono;

static string json_escape(const string& s) {
   string out;
   out.reserve(s.size());
   for (char c : s) {
      switch (c) {
         case '"':  out += "\\\""; break;
         case '\\': out += "\\\\"; break;
         case '\n': out += "\\n"; break;
         case '\r': out += "\\r"; break;
         case '\t': out += "\\t"; break;
         default:
            if ((unsigned char)c < 0x20) {
               char buf[8];
               snprintf(buf, sizeof(buf), "\\u%04x", c);
               out += buf;
            } else {
               out += c;
            }
      }
   }
   return out;
}

static string group_name(int x) {
   char buf[8];
   if (x < 9)       snprintf(buf, sizeof(buf), "row%d", x + 1);
   else if (x < 18) snprintf(buf, sizeof(buf), "col%d", x - 8);
   else             snprintf(buf, sizeof(buf), "box%d", x - 17);
   return buf;
}

static void append_step(string& out, const Step& s) {
   char buf[128];
   switch (s.t) {
      case ST_GIVEN:
         snprintf(buf, sizeof(buf),
                  "{\"t\":\"given\",\"cell\":%d,\"val\":%d}", s.cell, s.val);
         break;
      case ST_ELIMINATE:
         snprintf(buf, sizeof(buf),
                  "{\"t\":\"eliminate\",\"cell\":%d,\"val\":%d,\"by\":%d}",
                  s.cell, s.val, s.by);
         break;
      case ST_NAKED:
         snprintf(buf, sizeof(buf),
                  "{\"t\":\"naked_single\",\"cell\":%d,\"val\":%d}", s.cell, s.val);
         break;
      case ST_HIDDEN:
         snprintf(buf, sizeof(buf),
                  "{\"t\":\"hidden_single\",\"cell\":%d,\"val\":%d,\"group\":\"%s\"}",
                  s.cell, s.val, group_name(s.group).c_str());
         break;
      case ST_GUESS: {
         string cands;
         for (int i = 1; i <= 9; i++) {
            if ((s.cands >> (i - 1)) & 1) {
               if (!cands.empty()) cands += ',';
               cands += ('0' + i);
            }
         }
         snprintf(buf, sizeof(buf),
                  "{\"t\":\"guess\",\"cell\":%d,\"val\":%d,\"depth\":%d,\"cands\":[%s]}",
                  s.cell, s.val, s.depth, cands.c_str());
         break;
      }
      case ST_BACKTRACK:
         snprintf(buf, sizeof(buf),
                  "{\"t\":\"backtrack\",\"depth\":%d}", s.depth);
         break;
   }
   out += buf;
}

static int fail_invalid(const string& msg) {
   cout << "{\"error\":\"invalid_input\",\"message\":\"" << json_escape(msg)
        << "\"}" << endl;
   return 2;
}

int main(int argc, char** argv) {
   string raw;
   bool have_puzzle = false;
   bool record_elims = true;
   size_t max_steps = 40000;

   for (int i = 1; i < argc; i++) {
      const string arg = argv[i];
      if (arg.rfind("--granularity=", 0) == 0) {
         const string g = arg.substr(14);
         if (g == "key") record_elims = false;
         else if (g != "full") return fail_invalid("granularity must be full or key");
      } else if (arg.rfind("--max-steps=", 0) == 0) {
         const long n = atol(arg.c_str() + 12);
         if (n < 1000) return fail_invalid("max-steps must be >= 1000");
         max_steps = (size_t)n;
      } else if (!have_puzzle) {
         raw = arg;
         have_puzzle = true;
      } else {
         return fail_invalid("unexpected argument");
      }
   }
   if (!have_puzzle && !getline(cin, raw)) return fail_invalid("no puzzle given");

   string puzzle, err;
   if (!parse_puzzle(raw, puzzle, err)) return fail_invalid(err);

   Sudoku::init();
   TraceRecorder rec(max_steps, record_elims);

   const auto t0 = steady_clock::now();
   unique_ptr<Sudoku> S(new Sudoku(puzzle, &rec));
   bool contradiction_in_givens = false;
   if (S->valid()) {
      S = solve(std::move(S));
   } else {
      contradiction_in_givens = true;
      S.reset();
   }
   const auto t1 = steady_clock::now();
   const long time_us = duration_cast<microseconds>(t1 - t0).count();

   string out;
   out.reserve(rec.steps().size() * 48 + 1024);
   out += "{\"solved\":";
   out += S ? "true" : "false";
   out += ",\"puzzle\":\"";
   out += puzzle;
   out += "\"";
   if (S) {
      out += ",\"solution\":\"";
      out += S->solution_str();
      out += "\"";
   }
   if (contradiction_in_givens) {
      out += ",\"reason\":\"contradiction_in_givens\"";
   }
   out += ",\"granularity\":\"";
   out += record_elims ? "full" : "key";
   out += "\",\"truncated\":";
   out += rec.truncated() ? "true" : "false";

   char buf[256];
   snprintf(buf, sizeof(buf),
            ",\"stats\":{\"guesses\":%ld,\"backtracks\":%ld,\"eliminations\":%ld,"
            "\"keySteps\":%ld,\"totalSteps\":%zu,\"timeUs\":%ld}",
            rec.n_guess, rec.n_backtrack, rec.n_elim,
            rec.key_steps(), rec.steps().size(), time_us);
   out += buf;

   out += ",\"steps\":[";
   for (size_t i = 0; i < rec.steps().size(); i++) {
      if (i) out += ',';
      append_step(out, rec.steps()[i]);
   }
   out += "]}";
   cout << out << endl;
   return 0;
}
