#include "sudoku.h"
#include "trace.h"
#include <algorithm>
#include <ostream>

using namespace std;

string Possible::str(int width) const {
   string s(width, ' ');
   int k = 0;
   for (int i = 1; i <= 9; i++) {
      if (is_on(i)) s[k++] = '0' + i;
   }
   return s;
}

vector<vector<int>>
Sudoku::_group(27), Sudoku::_neighbors(81), Sudoku::_groups_of(81);

void Sudoku::init() {
   if (!_group[0].empty()) return;
   for (int i = 0; i < 9; i++) {
      for (int j = 0; j < 9; j++) {
         const int k = i * 9 + j;
         const int x[3] = {i, 9 + j, 18 + (i / 3) * 3 + j / 3};
         for (int g = 0; g < 3; g++) {
            _group[x[g]].push_back(k);
            _groups_of[k].push_back(x[g]);
         }
      }
   }
   for (size_t k = 0; k < _neighbors.size(); k++) {
      for (size_t x = 0; x < _groups_of[k].size(); x++) {
         for (int j = 0; j < 9; j++) {
            int k2 = _group[_groups_of[k][x]][j];
            if (k2 != (int)k) _neighbors[k].push_back(k2);
         }
      }
   }
}

bool Sudoku::is_solved() const {
   for (size_t k = 0; k < _cells.size(); k++) {
      if (_cells[k].count() != 1) return false;
   }
   return true;
}

void Sudoku::write(ostream& o) const {
   int width = 1;
   for (size_t k = 0; k < _cells.size(); k++) {
      width = max(width, 1 + _cells[k].count());
   }
   const string sep(3 * width, '-');
   for (int i = 0; i < 9; i++) {
      if (i == 3 || i == 6) {
         o << sep << "+-" << sep << "+" << sep << "\n";
      }
      for (int j = 0; j < 9; j++) {
         if (j == 3 || j == 6) o << "| ";
         o << _cells[i * 9 + j].str(width);
      }
      o << "\n";
   }
}

string Sudoku::solution_str() const {
   string s(81, '.');
   for (int k = 0; k < 81; k++) {
      if (_cells[k].count() == 1) s[k] = '0' + _cells[k].val();
   }
   return s;
}

bool Sudoku::assign(int k, int val) {
   for (int i = 1; i <= 9; i++) {
      if (i != val) {
         if (!eliminate(k, i, k)) return false;
      }
   }
   return true;
}

bool Sudoku::eliminate(int k, int val, int by) {
   if (!_cells[k].is_on(val)) return true;
   _cells[k].eliminate(val);
   if (_rec) _rec->eliminate(k, val, by);
   const int N = _cells[k].count();
   if (N == 0) return false;
   if (N == 1) {
      const int v = _cells[k].val();
      if (_rec) _rec->naked(k, v);
      for (size_t i = 0; i < _neighbors[k].size(); i++) {
         if (!eliminate(_neighbors[k][i], v, k)) return false;
      }
   }
   for (size_t i = 0; i < _groups_of[k].size(); i++) {
      const int x = _groups_of[k][i];
      int n = 0, ks = -1;
      for (int j = 0; j < 9; j++) {
         const int p = _group[x][j];
         if (_cells[p].is_on(val)) { n++; ks = p; }
      }
      if (n == 0) return false;
      if (n == 1 && _cells[ks].count() > 1) {
         if (_rec) _rec->hidden(ks, val, x);
         if (!assign(ks, val)) return false;
      }
   }
   return true;
}

int Sudoku::least_count() const {
   int k = -1, min_count = 10;
   for (int i = 0; i < 81; i++) {
      const int m = _cells[i].count();
      if (m > 1 && m < min_count) { min_count = m; k = i; }
   }
   return k;
}

Sudoku::Sudoku(const string& s, TraceRecorder* rec)
   : _cells(81), _rec(rec), _valid(true) {
   for (int k = 0; k < 81 && k < (int)s.size(); k++) {
      if (s[k] >= '1' && s[k] <= '9') {
         const int v = s[k] - '0';
         if (_rec) _rec->given(k, v);
         if (!assign(k, v)) {
            _valid = false;
            return;
         }
      }
   }
}

unique_ptr<Sudoku> solve(unique_ptr<Sudoku> S, int depth) {
   if (S == nullptr || S->is_solved()) return S;
   const int k = S->least_count();
   if (k < 0) return {};
   const Possible p = S->possible(k);
   TraceRecorder* rec = S->recorder();
   for (int i = 9; i >= 1; i--) {
      if (p.is_on(i)) {
         unique_ptr<Sudoku> S1(new Sudoku(*S));
         if (rec) rec->guess(k, i, depth, p.bits());
         if (S1->assign(k, i)) {
            if (auto S2 = solve(std::move(S1), depth + 1)) return S2;
         }
         if (rec) rec->backtrack(depth);
      }
   }
   return {};
}

bool parse_puzzle(const string& line, string& normalized, string& err) {
   normalized.clear();
   normalized.reserve(81);
   for (size_t i = 0; i < line.size(); i++) {
      const char c = line[i];
      if (c >= '1' && c <= '9') {
         normalized += c;
      } else if (c == '0' || c == '.') {
         normalized += '.';
      } else if (c == ' ' || c == '\t' || c == '\r' || c == '\n') {
         continue;
      } else {
         err = "invalid character in puzzle";
         return false;
      }
      if (normalized.size() > 81) break;
   }
   if (normalized.size() != 81) {
      err = "puzzle must contain exactly 81 cells";
      return false;
   }
   return true;
}
