// Run database migrations on startup
// Usage: node run-migrations.js
import mysql from 'mysql2/promise';

const MIGRATIONS = [
  // 0000 - users table
  `CREATE TABLE IF NOT EXISTS \`users\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`openId\` varchar(64) NOT NULL,
    \`name\` text,
    \`email\` varchar(320),
    \`loginMethod\` varchar(64),
    \`role\` enum('user','admin') NOT NULL DEFAULT 'user',
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    \`lastSignedIn\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`users_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`users_openId_unique\` UNIQUE(\`openId\`)
  )`,

  // 0001 - app_settings and upload_records
  `CREATE TABLE IF NOT EXISTS \`app_settings\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`settingKey\` varchar(128) NOT NULL,
    \`settingValue\` text,
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`app_settings_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`app_settings_settingKey_unique\` UNIQUE(\`settingKey\`)
  )`,

  `CREATE TABLE IF NOT EXISTS \`upload_records\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`catalogId\` varchar(64) NOT NULL,
    \`retailerId\` varchar(255) NOT NULL,
    \`productName\` varchar(512) NOT NULL,
    \`productImageUrl\` text,
    \`video4x5Download\` text,
    \`video4x5Embed\` text,
    \`video9x16Download\` text,
    \`video9x16Embed\` text,
    \`clientName\` varchar(255) NOT NULL,
    \`uploadTimestamp\` timestamp NOT NULL DEFAULT (now()),
    \`uploadedBy\` varchar(255),
    CONSTRAINT \`upload_records_id\` PRIMARY KEY(\`id\`)
  )`,

  // 0002 - companies and company_members
  `CREATE TABLE IF NOT EXISTS \`companies\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`name\` varchar(255) NOT NULL,
    \`facebookAccessToken\` text,
    \`catalogs\` text,
    \`accessKey\` varchar(255),
    \`createdBy\` int NOT NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`companies_id\` PRIMARY KEY(\`id\`)
  )`,

  `CREATE TABLE IF NOT EXISTS \`company_members\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`companyId\` int NOT NULL,
    \`email\` varchar(320) NOT NULL,
    \`memberRole\` enum('owner','member') NOT NULL DEFAULT 'member',
    \`status\` enum('active','pending') NOT NULL DEFAULT 'pending',
    \`userId\` int,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`company_members_id\` PRIMARY KEY(\`id\`)
  )`,

  // 0003 - add companyId to upload_records (ignore if exists)
  `ALTER TABLE \`upload_records\` ADD COLUMN \`companyId\` int`,

  // 0004 - slideshow_templates and tokenExpiresAt
  `CREATE TABLE IF NOT EXISTS \`slideshow_templates\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`name\` varchar(255) NOT NULL,
    \`aspectRatio\` varchar(10) NOT NULL DEFAULT '4:5',
    \`durationPerImage\` int NOT NULL DEFAULT 3,
    \`transition\` varchar(50) NOT NULL DEFAULT 'fade',
    \`transitionDuration\` int NOT NULL DEFAULT 50,
    \`showProductName\` int NOT NULL DEFAULT 0,
    \`textPosition\` varchar(20) NOT NULL DEFAULT 'bottom',
    \`fontSize\` int NOT NULL DEFAULT 40,
    \`fontFamily\` varchar(100) NOT NULL DEFAULT 'noto-sans-cjk',
    \`fontColor\` varchar(20) NOT NULL DEFAULT '#FFFFFF',
    \`backgroundColor\` varchar(20) NOT NULL DEFAULT '#FFFFFF',
    \`imageScale\` int NOT NULL DEFAULT 100,
    \`imageOffsetX\` int NOT NULL DEFAULT 0,
    \`imageOffsetY\` int NOT NULL DEFAULT 0,
    \`overlayText\` text,
    \`createdBy\` int NOT NULL,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`slideshow_templates_id\` PRIMARY KEY(\`id\`)
  )`,

  `ALTER TABLE \`companies\` ADD COLUMN \`tokenExpiresAt\` timestamp`,
];

async function runMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  // Parse socketPath from URL if present
  const socketMatch = url.match(/[?&]socketPath=([^&]+)/);
  const urlWithoutSocket = url.replace(/[?&]socketPath=[^&]+/, '');
  const parsed = new URL(urlWithoutSocket);

  const config = {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1),
    ssl: {},
  };

  if (socketMatch) {
    config.socketPath = decodeURIComponent(socketMatch[1]);
    delete config.host;
    delete config.port;
  }

  const conn = await mysql.createConnection(config);
  console.log('[Migration] Connected to database');

  for (const sql of MIGRATIONS) {
    try {
      await conn.query(sql);
      console.log('[Migration] OK:', sql.substring(0, 60) + '...');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_TABLE_EXISTS_ERROR') {
        console.log('[Migration] Skipped (already exists):', sql.substring(0, 60) + '...');
      } else {
        console.error('[Migration] Error:', err.message);
      }
    }
  }

  await conn.end();
  console.log('[Migration] Done');
}

runMigrations();
