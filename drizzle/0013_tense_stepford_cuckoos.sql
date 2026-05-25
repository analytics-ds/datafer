CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`user_email` text NOT NULL,
	`user_name` text NOT NULL,
	`category` text NOT NULL,
	`message` text NOT NULL,
	`url` text NOT NULL,
	`user_agent` text,
	`viewport_width` integer,
	`viewport_height` integer,
	`screenshots_json` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`resolved_at` integer,
	`resolved_note` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
