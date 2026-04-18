import { eq, and, or, sql, desc, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  uploadRecords, InsertUploadRecord, UploadRecord,
  appSettings,
  companies, InsertCompany, Company,
  companyMembers, InsertCompanyMember, CompanyMember,
  slideshowTemplates, InsertSlideshowTemplate, SlideshowTemplate,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Append ssl param for TiDB Cloud secure connections
      let dbUrl = process.env.DATABASE_URL;
      if (!dbUrl.includes('ssl=')) {
        dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'ssl={"rejectUnauthorized":true}';
      }
      _db = drizzle(dbUrl);
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

// ==================== Companies ====================

export async function createCompany(data: InsertCompany): Promise<Company | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(companies).values(data);
  const insertId = result[0].insertId;
  const rows = await db.select().from(companies).where(eq(companies.id, insertId)).limit(1);
  return rows[0];
}

export async function getCompanyById(id: number): Promise<Company | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return rows[0];
}

export async function updateCompany(id: number, data: Partial<InsertCompany>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(companies).set(data).where(eq(companies.id, id));
}

export async function deleteCompany(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Delete all members first, then the company
  await db.delete(companyMembers).where(eq(companyMembers.companyId, id));
  await db.delete(companies).where(eq(companies.id, id));
}

export async function getCompaniesByUserId(userId: number): Promise<(Company & { memberRole: string })[]> {
  const db = await getDb();
  if (!db) return [];
  // Get all companies where the user is a member
  const memberships = await db.select().from(companyMembers)
    .where(and(eq(companyMembers.userId, userId), eq(companyMembers.status, "active")));
  
  if (memberships.length === 0) return [];
  
  const result: (Company & { memberRole: string })[] = [];
  for (const m of memberships) {
    const companyRows = await db.select().from(companies).where(eq(companies.id, m.companyId)).limit(1);
    if (companyRows[0]) {
      result.push({ ...companyRows[0], memberRole: m.memberRole });
    }
  }
  return result;
}

export async function getCompaniesByEmail(email: string): Promise<(Company & { memberRole: string; status: string })[]> {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db.select().from(companyMembers)
    .where(eq(companyMembers.email, email.toLowerCase()));
  
  if (memberships.length === 0) return [];
  
  const result: (Company & { memberRole: string; status: string })[] = [];
  for (const m of memberships) {
    const companyRows = await db.select().from(companies).where(eq(companies.id, m.companyId)).limit(1);
    if (companyRows[0]) {
      result.push({ ...companyRows[0], memberRole: m.memberRole, status: m.status });
    }
  }
  return result;
}

// ==================== Company Members ====================

export async function addCompanyMember(data: InsertCompanyMember): Promise<CompanyMember | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  
  // Check if member already exists
  const existing = await db.select().from(companyMembers)
    .where(and(
      eq(companyMembers.companyId, data.companyId),
      eq(companyMembers.email, data.email.toLowerCase())
    )).limit(1);
  
  if (existing.length > 0) {
    return existing[0]; // Already a member
  }
  
  const result = await db.insert(companyMembers).values({
    ...data,
    email: data.email.toLowerCase(),
    status: data.status || "active",
  });
  const insertId = result[0].insertId;
  const rows = await db.select().from(companyMembers).where(eq(companyMembers.id, insertId)).limit(1);
  return rows[0];
}

export async function getCompanyMembers(companyId: number): Promise<CompanyMember[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companyMembers).where(eq(companyMembers.companyId, companyId));
}

export async function removeCompanyMember(companyId: number, email: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(companyMembers).where(
    and(eq(companyMembers.companyId, companyId), eq(companyMembers.email, email.toLowerCase()))
  );
}

export async function isCompanyMember(companyId: number, email: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(companyMembers)
    .where(and(
      eq(companyMembers.companyId, companyId),
      eq(companyMembers.email, email.toLowerCase()),
      eq(companyMembers.status, "active")
    )).limit(1);
  return rows.length > 0;
}

export async function activateMemberByEmail(email: string, userId: number | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // When a user logs in, activate all pending memberships matching their email
  const updateData: Record<string, unknown> = { status: "active" };
  if (userId !== null) {
    updateData.userId = userId;
  }
  await db.update(companyMembers)
    .set(updateData)
    .where(and(
      eq(companyMembers.email, email.toLowerCase()),
      eq(companyMembers.status, "pending")
    ));
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

export async function getUploadRecordsByCompany(companyId: number): Promise<UploadRecord[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(uploadRecords).where(eq(uploadRecords.companyId, companyId)).orderBy(uploadRecords.uploadTimestamp);
}

export async function getAllUploadRecords(): Promise<UploadRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(uploadRecords)
    .orderBy(desc(uploadRecords.uploadTimestamp));

  const seen = new Map<string, UploadRecord>();
  for (const row of rows) {
    const key = `${row.retailerId}::${row.catalogId}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return Array.from(seen.values());
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

// ==================== Uploader Statistics ====================

export interface UploaderStats {
  uploadedBy: string;
  totalUploads: number;
  lastUploadDate: string;
  catalogs: string[]; // distinct catalog IDs
}

export async function getUploadersByCompany(companyId: number): Promise<UploaderStats[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      uploadedBy: uploadRecords.uploadedBy,
      totalUploads: sql<number>`COUNT(*)`.as('totalUploads'),
      lastUploadDate: sql<string>`MAX(${uploadRecords.uploadTimestamp})`.as('lastUploadDate'),
      catalogList: sql<string>`GROUP_CONCAT(DISTINCT ${uploadRecords.catalogId})`.as('catalogList'),
    })
    .from(uploadRecords)
    .where(and(
      eq(uploadRecords.companyId, companyId),
      isNotNull(uploadRecords.uploadedBy),
    ))
    .groupBy(uploadRecords.uploadedBy)
    .orderBy(desc(sql`MAX(${uploadRecords.uploadTimestamp})`));

  return rows.map(r => ({
    uploadedBy: r.uploadedBy || '',
    totalUploads: Number(r.totalUploads),
    lastUploadDate: r.lastUploadDate || '',
    catalogs: r.catalogList ? r.catalogList.split(',') : [],
  }));
}

export async function getAllUploaders(): Promise<UploaderStats[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      uploadedBy: uploadRecords.uploadedBy,
      totalUploads: sql<number>`COUNT(*)`.as('totalUploads'),
      lastUploadDate: sql<string>`MAX(${uploadRecords.uploadTimestamp})`.as('lastUploadDate'),
      catalogList: sql<string>`GROUP_CONCAT(DISTINCT ${uploadRecords.catalogId})`.as('catalogList'),
    })
    .from(uploadRecords)
    .where(isNotNull(uploadRecords.uploadedBy))
    .groupBy(uploadRecords.uploadedBy)
    .orderBy(desc(sql`MAX(${uploadRecords.uploadTimestamp})`));

  return rows.map(r => ({
    uploadedBy: r.uploadedBy || '',
    totalUploads: Number(r.totalUploads),
    lastUploadDate: r.lastUploadDate || '',
    catalogs: r.catalogList ? r.catalogList.split(',') : [],
  }));
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

// ==================== Slideshow Templates ====================

export async function createSlideshowTemplate(data: Omit<InsertSlideshowTemplate, "id" | "createdAt" | "updatedAt">): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(slideshowTemplates).values(data);
  return result[0].insertId;
}

export async function getSlideshowTemplates(): Promise<SlideshowTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(slideshowTemplates).orderBy(slideshowTemplates.updatedAt);
}

export async function getSlideshowTemplateById(id: number): Promise<SlideshowTemplate | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(slideshowTemplates).where(eq(slideshowTemplates.id, id)).limit(1);
  return rows[0];
}

export async function updateSlideshowTemplate(id: number, data: Partial<Omit<InsertSlideshowTemplate, "id" | "createdAt" | "updatedAt" | "createdBy">>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(slideshowTemplates).set(data).where(eq(slideshowTemplates.id, id));
}

export async function deleteSlideshowTemplate(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(slideshowTemplates).where(eq(slideshowTemplates.id, id));
}
