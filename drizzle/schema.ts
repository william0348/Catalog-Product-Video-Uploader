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

// ==================== Companies ====================
export const companies = mysqlTable("companies", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  /** Facebook Access Token shared by all members */
  facebookAccessToken: text("facebookAccessToken"),
  /** JSON array of catalog objects: [{id, name}] */
  catalogs: text("catalogs"),
  /** Access key/password for the upload tool */
  accessKey: varchar("accessKey", { length: 255 }),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Company = typeof companies.$inferSelect;
export type InsertCompany = typeof companies.$inferInsert;

// ==================== Company Members ====================
export const companyMembers = mysqlTable("company_members", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId").notNull(),
  /** Email of the member (used for invitation matching) */
  email: varchar("email", { length: 320 }).notNull(),
  /** Role within the company */
  memberRole: mysqlEnum("memberRole", ["owner", "member"]).default("member").notNull(),
  /** Status of the membership */
  status: mysqlEnum("status", ["active", "pending"]).default("pending").notNull(),
  /** User ID if the member has logged in and been matched */
  userId: int("userId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CompanyMember = typeof companyMembers.$inferSelect;
export type InsertCompanyMember = typeof companyMembers.$inferInsert;

// ==================== Upload Records ====================
export const uploadRecords = mysqlTable("upload_records", {
  id: int("id").autoincrement().primaryKey(),
  companyId: int("companyId"),
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
