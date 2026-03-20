import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ==================== Upload Records ====================
export const uploadRecords = mysqlTable("upload_records", {
  id: int("id").autoincrement().primaryKey(),
  catalogId: varchar("catalogId", { length: 64 }).notNull(),
  retailerId: varchar("retailerId", { length: 255 }).notNull(),
  productName: varchar("productName", { length: 512 }).notNull(),
  productImageUrl: text("productImageUrl"),
  video4x5Download: text("video4x5Download"),
  video4x5Embed: text("video4x5Embed"),
  video9x16Download: text("video9x16Download"),
  video9x16Embed: text("video9x16Embed"),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  uploadTimestamp: timestamp("uploadTimestamp").defaultNow().notNull(),
  uploadedBy: varchar("uploadedBy", { length: 255 }),
});

export type UploadRecord = typeof uploadRecords.$inferSelect;
export type InsertUploadRecord = typeof uploadRecords.$inferInsert;

// ==================== App Settings (shared across all users) ====================
export const appSettings = mysqlTable("app_settings", {
  id: int("id").autoincrement().primaryKey(),
  settingKey: varchar("settingKey", { length: 128 }).notNull().unique(),
  settingValue: text("settingValue"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;
export type InsertAppSetting = typeof appSettings.$inferInsert;