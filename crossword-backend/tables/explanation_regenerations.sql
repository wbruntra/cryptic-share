CREATE TABLE `explanation_regenerations` (
  `request_id` varchar(36),
  `clue_text` text not null,
  `answer` text not null,
  `feedback` text null,
  `previous_explanation_json` text null,
  `explanation_json` text null,
  `status` varchar(20) not null default 'pending',
  `error_message` text null,
  `created_at` datetime default CURRENT_TIMESTAMP,
  `updated_at` datetime default CURRENT_TIMESTAMP,
  primary key (`request_id`)
)