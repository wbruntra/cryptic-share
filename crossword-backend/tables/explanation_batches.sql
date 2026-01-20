CREATE TABLE `explanation_batches` (
  `id` integer not null primary key autoincrement,
  `batch_id` varchar(255) not null,
  `puzzle_id` integer not null,
  `status` varchar(255) not null,
  `input_file_id` varchar(255) not null,
  `output_file_id` varchar(255),
  `created_at` datetime default CURRENT_TIMESTAMP,
  `updated_at` datetime default CURRENT_TIMESTAMP,
  foreign key(`puzzle_id`) references `puzzles`(`id`) on delete CASCADE
)