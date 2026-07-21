norvig-sudoku
=======================================================
these algorithm provided by norvig<br />  
based on Constraint Propagation, assumption, Depth-first traversal<br />  
[Here is the page for more detail](http://norvig.com/sudoku.html)<br />  

Web 可视化解题器
------------------------------
基于本仓库求解模块的逐步解题过程可视化（设计文档见 `DESIGN.md`）：
内置 10 道按难度分布的题目（简单×3 / 中等×3 / 困难×2 / 专家×2，
难度按求解器实际猜测次数标定），选题求解后可逐步回放约束传播、
唯一候选、唯一位置、猜测与回溯的完整路径，支持播放/单步/调速/
关键步与全部步两档粒度，也可粘贴自定义 81 字符题串。

	构建与运行（需 g++ 与 Node.js ≥ 18）：
	> make trace          # 编译带 trace 模式的求解器 bin/sudoku_trace
	> node server.js      # 启动后（默认 8000 端口）浏览器打开 http://localhost:8000

	测试：
	> make test           # C++ 单元/回归测试（含 trace 重放校验、top95/hardest 全量）
	> npm test            # 回放引擎 + API 测试（node --test）
	> npm run test:e2e    # Playwright E2E（需先 npm install）

	目录说明：
	- src/                维护版求解器：sudoku.{h,cc} 核心、trace.h 步骤记录、
	                      main_cli.cc 命令行入口、main_trace.cc JSON trace 入口。
	                      相比 sudoku.en.cc 修复了 macOS 专属计时、计时借位、
	                      输入校验与 XOR 清位四个问题（Linux/macOS 均可编译）
	- server.js           零依赖 Node 后端（/api/puzzles、/api/solve）
	- web/                前端页面与回放引擎，puzzles.json 为固化题库
	- tools/calibrate.js  题库难度标定脚本（重新生成 puzzles.json 用）
	- sudoku.en.cc        原始版本，保留作历史参考（仅能在 macOS 编译）

以下为原版说明：
------------------------------

Norvig's Sudoku solver in C++ (English versions).
------------------------------
		Compile with `--std=c++0x`. 
		> g++ -o sudoku sudoku.en.cc --std=c++0x
		> ./sudoku
		> then input your sudoku with one line such as
		> .......1.4.........2...........5.4.7..8...3....1.9....3..4..2...5.1........8.6...
		> then the solution and elapsed time will be print below if exists, "No solution" will be show up if not;

		These C++ code based on pauek's code with re-implemention of Sudoku Cell Class with bit operation.
		Environment : MacBook Pro (Retina, 13-inch, Late 2013), 2.4 GHz Intel Core i5, 8 GB 1600 MHz DDR3

Here is some Evaluation:
-----------------
### Q1.
		. . . | . . . | . 1 .
		4 . . | . . . | . . .
		. 2 . | . . . | . . .
		------+-------+------
		. . . | . 5 . | 4 . 7
		. . 8 | . . . | 3 . .
		. . 1 | . 9 . | . . .
		------+-------+------
		3 . . | 4 . . | 2 . .
		. 5 . | 1 . . | . . .
		. . . | 8 . 6 | . . .

		.......1.4.........2...........5.4.7..8...3....1.9....3..4..2...5.1........8.6...
		before optimized: more than 1 ms
		after optimized : abount 468 us

### Q2:
		. . 1 | . . 4 | . . .
		. . . | . 6 . | 3 . 5
		. . . | 9 . . | . . .
		------+-------+------
		8 . . | . . . | 7 . 3
		. . . | . . . | . 2 8
		5 . . | . 7 . | 6 . .
		------+-------+------
		3 . . | . 8 . | . . 6
		. . 9 | 2 . . | . . .
		. 4 . | . . 1 | . . .
		
		..1..4.......6.3.5...9.....8.....7.3.......285...7.6..3...8...6..92......4...1...
		before optimized: 21~24ms
		after optimized : abount 4ms and 957us

### Q3: a hard sudoku provided by novig
		. . . |. . 6 |. . . 
		. 5 9 |. . . |. . 8 
		2 . . |. . 8 |. . . 
		------+------+------
		. 4 5 |. . . |. . . 
		. . 3 |. . . |. . . 
		. . 6 |. . 3 |. 5 4 
		------+------+------
		. . . |3 2 5 |. . 6 
		. . . |. . . |. . . 
		. . . |. . . |. . . 

		.....6....59.....82....8....45........3........6..3.54...325..6..................
		before optimized : 34710ms
		alter optimized : 1ms 23us
		4 3 8 | 7 9 6 | 2 1 5 
		6 5 9 | 1 3 2 | 4 7 8 
		2 7 1 | 4 5 8 | 6 9 3 
		------+-------+------
		8 4 5 | 2 1 9 | 3 6 7 
		7 1 3 | 5 6 4 | 8 2 9 
		9 2 6 | 8 7 3 | 1 5 4 
		------+-------+------
		1 9 4 | 3 2 5 | 7 8 6 
		3 6 2 | 9 8 7 | 5 4 1 
		5 8 7 | 6 4 1 | 9 3 2 

### Q4: a hard sudoku without solution provided by novig
		. . . |. . 5 |. 8 . 
		. . . |6 . 1 |. 4 3 
		. . . |. . . |. . . 
		------+------+------
		. 1 . |5 . . |. . . 
		. . . |1 . 6 |. . . 
		3 . . |. . . |. . 5 
		------+------+------
		5 3 . |. . . |. 6 1 
		. . . |. . . |. . 4 
		. . . |. . . |. . . 
		.....5.8....6.1.43..........1.5........1.6...3.......553.....61........4.........
		before optimized : No solution,time:274,213ms
		after optimized : 77s 173ms 457us

As it shows: More encapsulation, faster development efficiency, a slower execution efficiency
---------------------
