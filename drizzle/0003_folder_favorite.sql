CREATE TABLE `folder_favorite` (
	`user_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `folder_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`folder_id`) REFERENCES `client`(`id`) ON UPDATE no action ON DELETE cascade
);
