CREATE TABLE `api_key` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `key_hash` text NOT NULL,
  `prefix` text NOT NULL,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL,
  `last_used_at` integer,
  `revoked_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_key_key_hash_unique` ON `api_key` (`key_hash`);
--> statement-breakpoint
CREATE INDEX `api_key_user_id_idx` ON `api_key` (`user_id`);
