CREATE TABLE `brief_comment` (
	`id` text PRIMARY KEY NOT NULL,
	`brief_id` text NOT NULL,
	`anchor_id` text NOT NULL,
	`anchor_text` text NOT NULL,
	`parent_id` text,
	`author_type` text NOT NULL,
	`author_id` text,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`resolved_at` integer,
	`resolved_by_name` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`brief_id`) REFERENCES `brief`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
