CREATE TABLE `friendships` (
  `id` integer not null primary key autoincrement,
  `user_id_1` integer not null,
  `user_id_2` integer not null,
  `status` varchar(255) not null default 'accepted',
  `requested_by` integer not null,
  `created_at` datetime not null default CURRENT_TIMESTAMP,
  `updated_at` datetime not null default CURRENT_TIMESTAMP,
  foreign key(`user_id_1`) references `users`(`id`) on delete CASCADE,
  foreign key(`user_id_2`) references `users`(`id`) on delete CASCADE,
  foreign key(`requested_by`) references `users`(`id`) on delete CASCADE,
  check (user_id_1 < user_id_2)
)