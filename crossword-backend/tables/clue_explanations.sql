CREATE TABLE `clue_explanations` (
  `id` integer not null primary key autoincrement,
  `puzzle_id` integer not null,
  `clue_number` integer not null,
  `direction` varchar(10) not null,
  `clue_text` text not null,
  `answer` text not null,
  `explanation_json` text not null,
  `created_at` datetime default CURRENT_TIMESTAMP,
  foreign key(`puzzle_id`) references `puzzles`(`id`)
)