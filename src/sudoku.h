#pragma once
#include <iosfwd>
#include <memory>
#include <string>
#include <vector>

class TraceRecorder;

// Candidate set of one cell: bits 0..8 of _b represent digits 1..9.
class Possible {
   int _b;
public:
   Possible() : _b(511) {}
   explicit Possible(int raw) : _b(raw) {}
   bool is_on(int i) const { return (_b >> (i - 1)) & 1; }
   int  count()      const { return __builtin_popcount(_b); }
   void eliminate(int i)   { _b &= ~(1 << (i - 1)); }
   int  val()        const { return _b ? __builtin_ctz(_b) + 1 : -1; }
   int  bits()       const { return _b; }
   std::string str(int width) const;
};

class Sudoku {
   std::vector<Possible> _cells;
   TraceRecorder* _rec;
   bool _valid;
   static std::vector<std::vector<int>> _group, _neighbors, _groups_of;

   bool eliminate(int k, int val, int by);
public:
   // s must be a normalized 81-char string of [1-9.] (see parse_puzzle).
   explicit Sudoku(const std::string& s, TraceRecorder* rec = nullptr);
   static void init();
   static const std::vector<std::vector<int>>& groups() { return _group; }

   Possible possible(int k) const { return _cells[k]; }
   bool     valid() const { return _valid; }
   bool     is_solved() const;
   bool     assign(int k, int val);
   int      least_count() const;
   void     write(std::ostream& o) const;
   std::string solution_str() const;  // 81 chars; '.' for undetermined cells
   TraceRecorder* recorder() const { return _rec; }
};

// Depth-first search with MRV; depth is 1-based for the trace.
std::unique_ptr<Sudoku> solve(std::unique_ptr<Sudoku> S, int depth = 1);

// Normalizes an input line into exactly 81 chars of [1-9.].
// Digits 1-9 are givens; '0' and '.' are blanks; whitespace is ignored.
// Returns false (with err set) on any other character or wrong cell count.
bool parse_puzzle(const std::string& line, std::string& normalized, std::string& err);
