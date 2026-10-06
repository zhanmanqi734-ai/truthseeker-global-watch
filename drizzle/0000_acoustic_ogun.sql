CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`url` text NOT NULL,
	`published_at` text NOT NULL,
	`first_seen_at` text NOT NULL,
	`analysis` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`date` text PRIMARY KEY NOT NULL,
	`generated_at` text NOT NULL,
	`window_start` text NOT NULL,
	`window_end` text NOT NULL,
	`complete` integer DEFAULT 0 NOT NULL,
	`mode` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`report_date` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text NOT NULL,
	`article_count` integer DEFAULT 0 NOT NULL,
	`error` text
);
