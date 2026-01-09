CREATE TABLE "puzzle_sessions" (
  `session_id` varchar(255),
  `puzzle_id` integer NOT NULL,
  `state` text NOT NULL,
  `user_id` integer NULL,
  `anonymous_id` varchar(255) null,
  FOREIGN KEY (`puzzle_id`) REFERENCES `puzzles` (`id`),
  PRIMARY KEY (`session_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
)