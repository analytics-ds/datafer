ALTER TABLE `client` ADD `share_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `client_share_token_unique` ON `client` (`share_token`);