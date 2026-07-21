// Unit and regression tests for the sudoku solver library, including the
// trace replay validator described in DESIGN.md §5.1.
// Run from the repo root (data files are loaded via relative paths).
#include "sudoku.h"
#include "trace.h"
#include <chrono>
#include <cstdio>
#include <fstream>
#include <map>
#include <string>
#include <vector>

using namespace std;

static int g_failures = 0;
static int g_checks = 0;

#define CHECK(cond, msg)                                                    \
   do {                                                                     \
      g_checks++;                                                           \
      if (!(cond)) {                                                        \
         g_failures++;                                                      \
         printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, string(msg).c_str()); \
      }                                                                     \
   } while (0)

// ---------------------------------------------------------------- Possible

static void test_possible_exhaustive() {
   for (int b = 0; b < 512; b++) {
      Possible p(b);
      int naive_count = 0, naive_low = -1;
      for (int i = 1; i <= 9; i++) {
         const bool on = (b >> (i - 1)) & 1;
         CHECK(p.is_on(i) == on, "is_on mismatch");
         if (on) {
            naive_count++;
            if (naive_low == -1) naive_low = i;
         }
      }
      CHECK(p.count() == naive_count, "count mismatch");
      CHECK(p.val() == naive_low, "val mismatch");
      for (int i = 1; i <= 9; i++) {
         Possible q(b);
         q.eliminate(i);
         CHECK(q.bits() == (b & ~(1 << (i - 1))), "eliminate mismatch");
         q.eliminate(i);  // must be idempotent (the old XOR version was not)
         CHECK(q.bits() == (b & ~(1 << (i - 1))), "eliminate not idempotent");
      }
   }
}

// ------------------------------------------------------- solution checking

static bool is_valid_solution(const string& sol, const string& puzzle) {
   if (sol.size() != 81) return false;
   for (int k = 0; k < 81; k++) {
      if (sol[k] < '1' || sol[k] > '9') return false;
      if (puzzle[k] != '.' && puzzle[k] != sol[k]) return false;
   }
   for (const auto& g : Sudoku::groups()) {
      int mask = 0;
      for (int cell : g) mask |= 1 << (sol[cell] - '1');
      if (mask != 511) return false;
   }
   return true;
}

// -------------------------------------------------- trace replay validator

struct RState {
   int bits[81];
   bool det[81];
};

// Replays a full-granularity, untruncated trace of a solved puzzle and
// checks every step is legal in the replayed state (DESIGN.md §5.1).
// Returns "" on success, or a description of the first violation.
static string validate_trace(const vector<Step>& steps, const string& solution) {
   RState st;
   for (int i = 0; i < 81; i++) { st.bits[i] = 511; st.det[i] = false; }
   map<int, RState> snaps;

   for (size_t i = 0; i < steps.size(); i++) {
      const Step& s = steps[i];
      char where[64];
      snprintf(where, sizeof(where), " (step %zu)", i);
      switch (s.t) {
         case ST_GIVEN:
            if (!((st.bits[s.cell] >> (s.val - 1)) & 1))
               return string("given value not a candidate") + where;
            st.det[s.cell] = true;
            break;
         case ST_ELIMINATE:
            if (!((st.bits[s.cell] >> (s.val - 1)) & 1))
               return string("eliminating an already-absent candidate") + where;
            st.bits[s.cell] &= ~(1 << (s.val - 1));
            break;
         case ST_NAKED:
            if (st.det[s.cell]) break;  // redundant with a prior determination
            if (st.bits[s.cell] != (1 << (s.val - 1)))
               return string("naked single but cell not narrowed to val") + where;
            st.det[s.cell] = true;
            break;
         case ST_HIDDEN: {
            if (!((st.bits[s.cell] >> (s.val - 1)) & 1))
               return string("hidden single value not a candidate") + where;
            int n = 0;
            for (int cell : Sudoku::groups()[s.group]) {
               if ((st.bits[cell] >> (s.val - 1)) & 1) n++;
            }
            if (n != 1)
               return string("hidden single not unique in group") + where;
            st.det[s.cell] = true;
            break;
         }
         case ST_GUESS:
            if (st.bits[s.cell] != s.cands)
               return string("guess candidates do not match state") + where;
            if (__builtin_popcount(s.cands) < 2)
               return string("guess on a determined cell") + where;
            if (!((s.cands >> (s.val - 1)) & 1))
               return string("guessed value not a candidate") + where;
            snaps[s.depth] = st;  // snapshot before the guess takes effect
            st.det[s.cell] = true;
            break;
         case ST_BACKTRACK: {
            auto it = snaps.find(s.depth);
            if (it == snaps.end())
               return string("backtrack without matching guess") + where;
            st = it->second;
            break;
         }
         default:
            return string("unknown step type") + where;
      }
   }
   for (int k = 0; k < 81; k++) {
      if (__builtin_popcount(st.bits[k]) != 1)
         return "final state has an undetermined cell";
      const int v = __builtin_ctz(st.bits[k]) + 1;
      if (solution[k] - '0' != v) return "final state differs from solution";
   }
   return "";
}

// Solves one puzzle with full tracing and runs all trace-level assertions.
static void check_traced_solve(const string& puzzle, const string& label,
                               const string& expected_solution = "") {
   TraceRecorder rec(5000000, true);
   unique_ptr<Sudoku> S(new Sudoku(puzzle, &rec));
   CHECK(S->valid(), label + ": puzzle rejected by constructor");
   if (!S->valid()) return;
   const auto t0 = chrono::steady_clock::now();
   S = solve(std::move(S));
   const auto ms = chrono::duration_cast<chrono::milliseconds>(
                      chrono::steady_clock::now() - t0).count();
   CHECK(S != nullptr, label + ": no solution found");
   if (!S) return;
   CHECK(ms < 2000, label + ": solve took too long");

   const string sol = S->solution_str();
   CHECK(is_valid_solution(sol, puzzle), label + ": invalid solution grid");
   if (!expected_solution.empty()) {
      CHECK(sol == expected_solution, label + ": solution mismatch");
   }

   CHECK(!rec.truncated(), label + ": trace unexpectedly truncated");
   const string verr = validate_trace(rec.steps(), sol);
   CHECK(verr.empty(), label + ": trace replay: " + verr);

   // Stats consistency: counters must match the recorded steps.
   long n[6] = {0, 0, 0, 0, 0, 0};
   for (const Step& s : rec.steps()) n[s.t]++;
   CHECK(n[ST_GIVEN] == rec.n_given, label + ": given count mismatch");
   CHECK(n[ST_ELIMINATE] == rec.n_elim, label + ": elim count mismatch");
   CHECK(n[ST_NAKED] == rec.n_naked, label + ": naked count mismatch");
   CHECK(n[ST_HIDDEN] == rec.n_hidden, label + ": hidden count mismatch");
   CHECK(n[ST_GUESS] == rec.n_guess, label + ": guess count mismatch");
   CHECK(n[ST_BACKTRACK] == rec.n_backtrack, label + ": backtrack count mismatch");
}

// ------------------------------------------------------------- known cases

static const char* Q1 =
   ".......1.4.........2...........5.4.7..8...3....1.9....3..4..2...5.1........8.6...";
static const char* Q2 =
   "..1..4.......6.3.5...9.....8.....7.3.......285...7.6..3...8...6..92......4...1...";
static const char* Q3 =
   ".....6....59.....82....8....45........3........6..3.54...325..6..................";

static void test_known_puzzles() {
   check_traced_solve(Q1, "Q1");
   check_traced_solve(Q2, "Q2");
   // Q3 (17 givens) has multiple valid solutions, so only grid validity is
   // asserted — the specific solution depends on search order.
   check_traced_solve(Q3, "Q3");
}

static void test_invalid_inputs() {
   string norm, err;
   CHECK(!parse_puzzle("123", norm, err), "short input accepted");
   CHECK(!parse_puzzle(string(80, '.') + "x", norm, err), "bad char accepted");
   CHECK(!parse_puzzle(string(82, '.'), norm, err), "long input accepted");
   CHECK(parse_puzzle(string(81, '0'), norm, err), "all-zero input rejected");
   CHECK(norm == string(81, '.'), "zeros not normalized to dots");
   CHECK(parse_puzzle(" . 1 " + string(79, '.'), norm, err),
         "whitespace not ignored");

   // Two 1s in the same row: contradiction while assigning givens.
   const string contradiction = "11" + string(79, '.');
   TraceRecorder rec;
   Sudoku S(contradiction, &rec);
   CHECK(!S.valid(), "contradictory givens accepted");
   CHECK(rec.n_given == 2, "given steps not recorded up to contradiction");
}

static void test_truncation() {
   // A tiny cap forces elimination steps to be dropped while key steps stay
   // (Q3's full trace is ~800 steps, so the cap must sit well below that).
   TraceRecorder rec(200, true);
   unique_ptr<Sudoku> S(new Sudoku(Q3, &rec));
   S = solve(std::move(S));
   CHECK(S != nullptr, "Q3 unsolved under truncation");
   CHECK(rec.truncated(), "truncation flag not set");
   CHECK(rec.n_elim > (long)rec.steps().size(), "elim counter should exceed recorded steps");
   long key_recorded = 0;
   for (const Step& s : rec.steps()) {
      if (s.t != ST_ELIMINATE) key_recorded++;
   }
   CHECK(key_recorded == rec.key_steps(), "key steps must survive truncation");
}

static void test_key_granularity() {
   TraceRecorder rec(5000000, false);
   unique_ptr<Sudoku> S(new Sudoku(Q1, &rec));
   S = solve(std::move(S));
   CHECK(S != nullptr, "Q1 unsolved in key mode");
   CHECK(!rec.truncated(), "key mode marked truncated");
   for (const Step& s : rec.steps()) {
      CHECK(s.t != ST_ELIMINATE, "eliminate step recorded in key mode");
   }
   CHECK(rec.n_elim > 0, "elim counter not maintained in key mode");
}

static void test_datafile(const string& path, const string& label) {
   ifstream f(path);
   CHECK(f.good(), label + ": cannot open " + path);
   if (!f.good()) return;
   string line;
   int count = 0;
   while (getline(f, line)) {
      if (line.empty()) continue;
      string norm, err;
      CHECK(parse_puzzle(line, norm, err), label + ": bad line in data file");
      char lbl[64];
      snprintf(lbl, sizeof(lbl), "%s#%d", label.c_str(), ++count);
      check_traced_solve(norm, lbl);
   }
   CHECK(count > 0, label + ": data file empty");
}

int main() {
   Sudoku::init();
   test_possible_exhaustive();
   test_known_puzzles();
   test_invalid_inputs();
   test_truncation();
   test_key_granularity();
   test_datafile("data/top95.txt", "top95");
   test_datafile("data/hardest.txt", "hardest");
   printf("%d checks, %d failures\n", g_checks, g_failures);
   return g_failures ? 1 : 0;
}
