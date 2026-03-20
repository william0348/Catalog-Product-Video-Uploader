import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, uploadRecords, InsertUploadRecord, UploadRecord, appSettings } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== Upload Records ====================

export async function createUploadRecord(record: InsertUploadRecord): Promise<UploadRecord | undefined> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create upload record: database not available");
    return undefined;
  }
  const result = await db.insert(uploadRecords).values(record);
  const insertId = result[0].insertId;
  const rows = await db.select().from(uploadRecords).where(eq(uploadRecords.id, insertId)).limit(1);
  return rows[0];
}

export async function createUploadRecordsBatch(records: InsertUploadRecord[]): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create upload records: database not available");
    return;
  }
  if (records.length === 0) return;
  await db.insert(uploadRecords).values(records);
}

export async function getUploadRecordsByCatalog(catalogId: string): Promise<UploadRecord[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(uploadRecords).where(eq(uploadRecords.catalogId, catalogId)).orderBy(uploadRecords.uploadTimestamp);
}

export async function getAllUploadRecords(): Promise<UploadRecord[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(uploadRecords).orderBy(uploadRecords.uploadTimestamp);
}

export async function getUploadRecordById(id: number): Promise<UploadRecord | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(uploadRecords).where(eq(uploadRecords.id, id)).limit(1);
  return rows[0];
}

export async function deleteUploadRecord(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(uploadRecords).where(eq(uploadRecords.id, id));
}

// ==================== App Settings ====================

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.settingKey, key)).limit(1);
  return rows[0]?.settingValue ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(appSettings).values({ settingKey: key, settingValue: value })
    .onDuplicateKeyUpdate({ set: { settingValue: value } });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(appSettings);
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.settingValue) result[row.settingKey] = row.settingValue;
  }
  return result;
}
