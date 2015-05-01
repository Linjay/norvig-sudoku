norvig-sudoku
=======================================================
these algorith provided by norvig<br />  
based on Constraint Propagation, assumption, Depth-first traversal<br />  
[here is the page for more detail](http://norvig.com/sudoku.html)<br />  

Norvig's Sudoku solver in C++ (English versions).
------------------------------
		Compile with `--std=c++0x`. 
		> >>g++ -o sudoku sudoku.en.cc --std=c++0x
		> >>./sudoku
		> then input your sudoku with one line such as
		> .......1.4.........2...........5.4.7..8...3....1.9....3..4..2...5.1........8.6...
		> then the solution and elapsed time will be print below if exists, "No solution" will be show up if not;

		These C++ code based on pauek's code with re-implemention of Sudoku Cell Class with bit operation.
		Environment : MacBook Pro (Retina, 13-inch, Late 2013), 2.4 GHz Intel Core i5, 8 GB 1600 MHz DDR3

Here is some Evaluation:
-----------------
### Q1.
		.......1.
		4........
		.2.......
		....5.4.7
		..8...3..
		..1.9....
		3..4..2..
		.5.1.....
		...8.6...

		.......1.4.........2...........5.4.7..8...3....1.9....3..4..2...5.1........8.6...
		before optimized: more than 1 ms
		after optimized : abount 468 us

### Q2:
		..1..4...
		....6.3.5
		...9.....
		8.....7.3
		.......28
		5...7.6..
		3...8...6
		..92.....
		.4...1...

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
