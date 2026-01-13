CREATE TABLE "puzzle_sessions" (
  `session_id` varchar(255),
  `puzzle_id` integer NOT NULL,
  `state` text NOT NULL,
  `user_id` integer NULL,
  `anonymous_id` varchar(255) null,
  `is_complete` boolean default '0',
  `created_at` datetime not null default '2026-01-13T05:33:18.929Z',
  `updated_at` datetime not null default '2026-01-13T05:33:18.929Z',
  FOREIGN KEY (`puzzle_id`) REFERENCES `puzzles` (`id`),
  PRIMARY KEY (`session_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
)