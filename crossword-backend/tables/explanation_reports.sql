CREATE TABLE `explanation_reports` (
  `id` integer not null primary key autoincrement,
  `puzzle_id` integer not null,
  `clue_number` integer not null,
  `direction` varchar(10) not null,
  `user_id` integer null,
  `anonymous_id` varchar(36) null,
  `feedback` text null,
  `explanation_updated` boolean not null default '0',
  `reported_at` datetime default CURRENT_TIMESTAMP,
  foreign key(`puzzle_id`) references `puzzles`(`id`),
  foreign key(`user_id`) references `users`(`id`)
)