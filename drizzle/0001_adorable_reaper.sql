CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`settingKey` varchar(128) NOT NULL,
	`settingValue` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_settingKey_unique` UNIQUE(`settingKey`)
);
--> statement-breakpoint
CREATE TABLE `upload_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`catalogId` varchar(64) NOT NULL,
	`retailerId` varchar(255) NOT NULL,
	`productName` varchar(512) NOT NULL,
	`productImageUrl` text,
	`video4x5Download` text,
	`video4x5Embed` text,
	`video9x16Download` text,
	`video9x16Embed` text,
	`clientName` varchar(255) NOT NULL,
	`uploadTimestamp` timestamp NOT NULL DEFAULT (now()),
	`uploadedBy` varchar(255),
	CONSTRAINT `upload_records_id` PRIMARY KEY(`id`)
);
