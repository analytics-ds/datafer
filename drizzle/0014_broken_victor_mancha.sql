CREATE TABLE `client_url_index` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`h1` text,
	`meta_description` text,
	`first_paragraph` text,
	`embedding` blob,
	`content_hash` text,
	`etag` text,
	`last_modified_header` text,
	`last_checked_at` integer,
	`last_changed_at` integer,
	`discovered_at` integer DEFAULT (unixepoch()) NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `client`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_url_index_url_unique` ON `client_url_index` (`client_id`,`url`);--> statement-breakpoint
ALTER TABLE `client` ADD `sitemap_url` text;--> statement-breakpoint
ALTER TABLE `client` ADD `sitemap_last_sync_at` integer;--> statement-breakpoint
ALTER TABLE `client` ADD `sitemap_status` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `client` ADD `sitemap_error` text;