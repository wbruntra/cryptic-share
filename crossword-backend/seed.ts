import { Database } from 'bun:sqlite';

const db = new Database('crossword.db');

// Create table
db.run(`
  CREATE TABLE IF NOT EXISTS puzzles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    grid TEXT NOT NULL,
    clues TEXT NOT NULL -- Stored as JSON string
  );

  CREATE TABLE IF NOT EXISTS puzzle_sessions (
    session_id TEXT PRIMARY KEY,
    puzzle_id INTEGER NOT NULL,
    state TEXT NOT NULL, -- JSON string of user answers
    FOREIGN KEY(puzzle_id) REFERENCES puzzles(id)
  );
`);

const INITIAL_GRID_DATA = `
N W N W N W N B N W N W N W B
W B W B W B W B W B W B W B N
N W W W W W W B N W W W W W W
W B W B B B W B W B W B W B W
N W W B N W W W W W W W W W W
W B W B N B B B W B B B W B W
N W W W W B N W W W W N W W W
B B W B W B W B W B W B W B B
N W W W W W W W W B N W W W N
W B W B B B W B B B W B W B W
N W W W N W W W W N W B N W W
W B W B W B W B W B B B W B W
N W W W W W W B N W N W W W W
W B W B W B B B W B W B W B W
B N W W W W W B N W W W W W W
`.trim();

const INITIAL_CLUES = {
  "across": [
    {
      "number": 1,
      "clue": "Features of devil-may-care ne'er-do-well (7)"
    },
    {
      "number": 5,
      "clue": "Portray regularly idle old denizen of Scotland (6)"
    },
    {
      "number": 9,
      "clue": "With Christmas nearly over recall dance's sleepy tune (7)"
    },
    {
      "number": 10,
      "clue": "Beat counter, frustrated (7)"
    },
    {
      "number": 11,
      "clue": "Cold is on the way back, exactly as it was written (3)"
    },
    {
      "number": 12,
      "clue": "I left the nice Scottish river from that point on (11)"
    },
    {
      "number": 13,
      "clue": "He introduces many comedians at the start in full (5)"
    },
    {
      "number": 14,
      "clue": "Marie cleverly engages peer in buying by post (4,5)"
    },
    {
      "number": 16,
      "clue": "Retribution e.g. can never get rid of king sadly (9)"
    },
    {
      "number": 17,
      "clue": "It sounds like 40 in Rome do very well (5)"
    },
    {
      "number": 19,
      "clue": "Doing stint working with wife on sofa perhaps (7,4)"
    },
    {
      "number": 22,
      "clue": "Possess 19 at last (3)"
    },
    {
      "number": 23,
      "clue": "Carrying more weight but about to face German beer (7)"
    },
    {
      "number": 24,
      "clue": "Mournful form of Gaelic English brought in (7)"
    },
    {
      "number": 26,
      "clue": "Several clubs together inveigle a guest inside (6)"
    },
    {
      "number": 27,
      "clue": "Stanley loses energy worried about a lab worker (7)"
    }
  ],
  "down": [
    {
      "number": 1,
      "clue": "Exclusively visit, say, the Vatican? (4,3)"
    },
    {
      "number": 2,
      "clue": "Local cop's been wrestling with it - this one? (6,9)"
    },
    {
      "number": 3,
      "clue": "Operation takes a long time (3)"
    },
    {
      "number": 4,
      "clue": "Let's somehow incorporate variable design (5)"
    },
    {
      "number": 5,
      "clue": "E.g. Bergerac river keeps ITV etc. flummoxed (9)"
    },
    {
      "number": 6,
      "clue": "A trial print - what 5 Down and 2 Down need in trial (5)"
    },
    {
      "number": 7,
      "clue": "Inconsistently try cordial and tonic cocktail (15)"
    },
    {
      "number": 8,
      "clue": "Tie up animals together and go back out (6)"
    },
    {
      "number": 12,
      "clue": "The Queen's up yonder (5)"
    },
    {
      "number": 14,
      "clue": "More or less regain dilapidated English zoo (9)"
    },
    {
      "number": 15,
      "clue": "Where to paddle canoe at sea (5)"
    },
    {
      "number": 16,
      "clue": "Goes to see island - TV is possibly covering it (6)"
    },
    {
      "number": 18,
      "clue": "Mix nut oil with carbon and make impression with it (7)"
    },
    {
      "number": 20,
      "clue": "Here in Paris new government offers bonus perhaps (5)"
    },
    {
      "number": 21,
      "clue": "Last character in home game ... (5)"
    },
    {
      "number": 25,
      "clue": "... an earlier one had a meal sent up (3)"
    }
  ]
};

// Check if data exists
const count = db.prepare('SELECT count(*) as count FROM puzzles').get() as { count: number };

if (count.count === 0) {
    console.log("Seeding database...");
    const insert = db.prepare('INSERT INTO puzzles (title, grid, clues) VALUES ($title, $grid, $clues)');
    insert.run({
        $title: 'Cryptic #1', 
        $grid: INITIAL_GRID_DATA, 
        $clues: JSON.stringify(INITIAL_CLUES)
    });
    console.log("Database seeded!");
} else {
    console.log("Database already has data.");
}

db.close();
