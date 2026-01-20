CREATE TABLE `puzzles` (
  `id` integer not null primary key autoincrement,
  `title` varchar(255) not null,
  `grid` text not null,
  `clues` text not null,
  `letter_count` integer null,
  `answers_encrypted` text,
  `book` varchar(255),
  `puzzle_number` integer
)