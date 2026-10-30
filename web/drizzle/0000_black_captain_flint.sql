CREATE TABLE `feed_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`payload_json` text,
	`fetched_at` text,
	`next_fetch_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stockbit_snapshots` (
	`user_id` text NOT NULL,
	`symbol` text NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `symbol`)
);
