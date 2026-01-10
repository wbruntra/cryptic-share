CREATE TABLE `push_subscriptions` (
  `id` integer not null primary key autoincrement,
  `endpoint` text not null,
  `p256dh` text not null,
  `auth` text not null,
  `notified` boolean default '0',
  `created_at` datetime default CURRENT_TIMESTAMP
)