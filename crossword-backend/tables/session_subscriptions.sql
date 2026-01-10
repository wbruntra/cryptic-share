CREATE TABLE `session_subscriptions` (
  `id` integer not null primary key autoincrement,
  `session_id` varchar(255) not null,
  `endpoint` varchar(255) not null,
  `last_notified` datetime null,
  `notified` boolean default '0',
  `created_at` datetime default CURRENT_TIMESTAMP,
  foreign key(`session_id`) references `puzzle_sessions`(`session_id`) on delete CASCADE
)