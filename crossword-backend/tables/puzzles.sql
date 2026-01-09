CREATE TABLE `puzzles` (
  `id` integer not null primary key autoincrement,
  `title` varchar(255) not null,
  `grid` text not null,
  `clues` text not null
)