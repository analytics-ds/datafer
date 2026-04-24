ALTER TABLE `brief` ADD `status` text DEFAULT 'ready' NOT NULL;
--> statement-breakpoint
ALTER TABLE `brief` ADD `error_message` text;
