#pragma once
#include <cstddef>
#include <cstdint>
#include <vector>

enum StepType : uint8_t {
   ST_GIVEN = 0,
   ST_ELIMINATE = 1,
   ST_NAKED = 2,     // naked single: cell narrowed to one candidate
   ST_HIDDEN = 3,    // hidden single: only place for val in a group
   ST_GUESS = 4,
   ST_BACKTRACK = 5,
};

struct Step {
   uint8_t t;
   int8_t  cell;    // 0..80, -1 when unused
   int8_t  val;     // 1..9, -1 when unused
   int8_t  by;      // cause cell for ST_ELIMINATE, -1 otherwise
   int8_t  group;   // 0..26 for ST_HIDDEN (0-8 rows, 9-17 cols, 18-26 boxes)
   int8_t  depth;   // 1.. for ST_GUESS / ST_BACKTRACK
   int16_t cands;   // candidate bitmask at guess time
};

// Records the solver's step sequence. Elimination steps are fine-grained and
// dominate the volume; past max_steps they stop being recorded (truncated set)
// while key steps continue, so the determination sequence stays complete.
// Counters always reflect the true totals regardless of truncation.
class TraceRecorder {
   std::vector<Step> _steps;
   size_t _max;
   bool _record_elims;
   bool _truncated = false;

   void push(const Step& s) { _steps.push_back(s); }
public:
   long n_elim = 0, n_given = 0, n_naked = 0, n_hidden = 0;
   long n_guess = 0, n_backtrack = 0;

   explicit TraceRecorder(size_t max_steps = 40000, bool record_elims = true)
      : _max(max_steps), _record_elims(record_elims) {}

   void given(int cell, int val) {
      n_given++;
      push({ST_GIVEN, (int8_t)cell, (int8_t)val, -1, -1, -1, 0});
   }
   void eliminate(int cell, int val, int by) {
      n_elim++;
      if (!_record_elims) return;
      if (_steps.size() >= _max) { _truncated = true; return; }
      push({ST_ELIMINATE, (int8_t)cell, (int8_t)val, (int8_t)by, -1, -1, 0});
   }
   void naked(int cell, int val) {
      n_naked++;
      push({ST_NAKED, (int8_t)cell, (int8_t)val, -1, -1, -1, 0});
   }
   void hidden(int cell, int val, int group) {
      n_hidden++;
      push({ST_HIDDEN, (int8_t)cell, (int8_t)val, -1, (int8_t)group, -1, 0});
   }
   void guess(int cell, int val, int depth, int cands) {
      n_guess++;
      push({ST_GUESS, (int8_t)cell, (int8_t)val, -1, -1,
            (int8_t)(depth > 127 ? 127 : depth), (int16_t)cands});
   }
   void backtrack(int depth) {
      n_backtrack++;
      push({ST_BACKTRACK, -1, -1, -1, -1,
            (int8_t)(depth > 127 ? 127 : depth), 0});
   }

   const std::vector<Step>& steps() const { return _steps; }
   bool truncated() const { return _truncated; }
   bool records_elims() const { return _record_elims; }
   long key_steps() const { return n_given + n_naked + n_hidden + n_guess + n_backtrack; }
};
