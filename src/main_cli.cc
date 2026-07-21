#include "sudoku.h"
#include <chrono>
#include <iostream>

using namespace std;
using namespace std::chrono;

int main() {
   Sudoku::init();
   string line;
   while (getline(cin, line)) {
      if (line.empty()) continue;
      string puzzle, err;
      if (!parse_puzzle(line, puzzle, err)) {
         cerr << "error: " << err << endl;
         continue;
      }
      const auto t0 = steady_clock::now();
      unique_ptr<Sudoku> S(new Sudoku(puzzle));
      if (S->valid()) {
         S = solve(std::move(S));
      } else {
         S.reset();
      }
      const auto t1 = steady_clock::now();
      if (S) {
         S->write(cout);
      } else {
         cout << "No solution" << "\n";
      }
      const long us = duration_cast<microseconds>(t1 - t0).count();
      cout << "The elapsed time:" << us / 1000000 << "s "
           << (us / 1000) % 1000 << "ms " << us % 1000 << "us" << endl;
   }
}
