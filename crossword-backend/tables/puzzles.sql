CREATE TABLE "puzzles" (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `title` varchar(255) NOT NULL,
  `grid` text NOT NULL,
  `clues` text NOT NULL,
  `letter_count` integer NULL,
  `answers_encrypted` text,
  `book` varchar(255),
  `puzzle_number` integer
)