import { getDb } from "./db";
import { users, companies, companyMembers, uploadRecords, appSettings, slideshowTemplates } from "../drizzle/schema";

const BUCKET = process.env.BACKUP_GCS_BUCKET || "cpv-uploader-backups";

async function getAccessToken(): Promise<string> {
  const metadataUrl =
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
  const res = await fetch(metadataUrl, {
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!res.ok) throw new Error(`Failed to get SA token: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function uploadToGCS(token: string, fileName: string, content: string): Promise<string> {
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(fileName)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: content,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GCS upload failed (${res.status}): ${err}`);
  }

  const obj = await res.json();
  return `gs://${BUCKET}/${obj.name}`;
}

const KEEP_COUNT = 2;

async function cleanupOldBackups(token: string): Promise<number> {
  const listUrl = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=cpv-backup-`;
  const res = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return 0;

  const data = await res.json();
  const items: { name: string }[] = data.items || [];

  const sorted = items
    .filter((f) => f.name.startsWith("cpv-backup-") && f.name.endsWith(".json"))
    .sort((a, b) => b.name.localeCompare(a.name));

  const toDelete = sorted.slice(KEEP_COUNT);
  let deleted = 0;

  for (const file of toDelete) {
    const delRes = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(file.name)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    if (delRes.ok || delRes.status === 204) deleted++;
  }

  return deleted;
}

export async function runBackup(): Promise<{ success: boolean; message: string; path?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, message: "Database not available" };
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const fileName = `cpv-backup-${dateStr}.json`;

  const [
    usersData,
    companiesData,
    membersData,
    recordsData,
    settingsData,
    templatesData,
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(companies),
    db.select().from(companyMembers),
    db.select().from(uploadRecords),
    db.select().from(appSettings),
    db.select().from(slideshowTemplates),
  ]);

  const backup = {
    exportedAt: now.toISOString(),
    tables: {
      users: { count: usersData.length, data: usersData },
      companies: { count: companiesData.length, data: companiesData },
      company_members: { count: membersData.length, data: membersData },
      upload_records: { count: recordsData.length, data: recordsData },
      app_settings: { count: settingsData.length, data: settingsData },
      slideshow_templates: { count: templatesData.length, data: templatesData },
    },
  };

  const content = JSON.stringify(backup, null, 2);
  const token = await getAccessToken();
  const gcsPath = await uploadToGCS(token, fileName, content);
  const deleted = await cleanupOldBackups(token);

  const totalRecords = usersData.length + companiesData.length + membersData.length +
    recordsData.length + settingsData.length + templatesData.length;

  return {
    success: true,
    message: `Backup "${fileName}" uploaded to GCS (${totalRecords} records across 6 tables).${deleted > 0 ? ` Cleaned up ${deleted} old backup(s).` : ""}`,
    path: gcsPath,
  };
}
