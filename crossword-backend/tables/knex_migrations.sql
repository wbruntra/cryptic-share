CREATE TABLE `knex_migrations` (
  `id` integer not null primary key autoincrement,
  `name` varchar(255),
  `batch` integer,
  `migration_time` datetime
)