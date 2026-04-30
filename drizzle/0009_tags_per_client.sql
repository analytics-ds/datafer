DROP TABLE IF EXISTS `brief_tag`;
--> statement-breakpoint
DROP TABLE IF EXISTS `tag`;
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`source` text DEFAULT 'agency' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `client`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_client_name_unique` ON `tag` (`client_id`, `name`);
--> statement-breakpoint
CREATE TABLE `brief_tag` (
	`brief_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`brief_id`, `tag_id`),
	FOREIGN KEY (`brief_id`) REFERENCES `brief`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE cascade
);
