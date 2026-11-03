CREATE TABLE `docs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`preview` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `updates` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`data` blob NOT NULL
);
