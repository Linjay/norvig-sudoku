CXX      ?= g++
CXXFLAGS ?= -O2 -std=c++11 -Wall -Wextra
BIN      := bin

CORE := src/sudoku.cc

.PHONY: all cli trace test clean

all: cli trace

cli: $(BIN)/sudoku
trace: $(BIN)/sudoku_trace

$(BIN):
	mkdir -p $(BIN)

$(BIN)/sudoku: $(CORE) src/main_cli.cc src/sudoku.h src/trace.h | $(BIN)
	$(CXX) $(CXXFLAGS) -o $@ $(CORE) src/main_cli.cc

$(BIN)/sudoku_trace: $(CORE) src/main_trace.cc src/sudoku.h src/trace.h | $(BIN)
	$(CXX) $(CXXFLAGS) -o $@ $(CORE) src/main_trace.cc

$(BIN)/sudoku_test: $(CORE) tests/cpp/test_main.cc src/sudoku.h src/trace.h | $(BIN)
	$(CXX) $(CXXFLAGS) -Isrc -o $@ $(CORE) tests/cpp/test_main.cc

test: $(BIN)/sudoku_test
	./$(BIN)/sudoku_test

clean:
	rm -rf $(BIN)
