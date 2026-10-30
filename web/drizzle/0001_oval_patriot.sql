CREATE TABLE `daily_research` (
	`date` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `equity_research` (
	`symbol` text PRIMARY KEY NOT NULL,
	`detail_json` text,
	`summary_json` text,
	`last_success_at` text,
	`last_attempt_at` text,
	`scan_date` text,
	`next_scan_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
