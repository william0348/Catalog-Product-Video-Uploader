import { getDb } from "./db";
import { users, companies, companyMembers, uploadRecords, appSettings, slideshowTemplates } from "../drizzle/schema";

const FOLDER_ID = process.env.BACKUP_DRIVE_FOLDER_ID || "1OJxHK6RrbV46rKSnBDo3vTEQP5ZUtcIH";
const RETENTION_DAYS = 30;

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

async function uploadToDrive(token: string, fileName: string, content: string): Promise<string> {
  const metadata = {
    name: fileName,
    mimeType: "application/json",
    parents: [FOLDER_ID],
  };

  const boundary = "backup_boundary_" + Date.now();
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${err}`);
  }

  const file = await res.json();
  return file.id;
}

async function cleanupOldBackups(token: string): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString();

  const query = `'${FOLDER_ID}' in parents and name contains 'cpv-backup-' and createdTime < '${cutoffStr}' and trashed = false`;
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)`;

  const res = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return 0;

  const data = await res.json();
  const files = data.files || [];
  let deleted = 0;

  for (const file of files) {
    const delRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (delRes.ok) deleted++;
  }

  return deleted;
}

export async function runBackup(): Promise<{ success: boolean; message: string; fileId?: string }> {
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
  const fileId = await uploadToDrive(token, fileName, content);

  const deleted = await cleanupOldBackups(token);

  const totalRecords = usersData.length + companiesData.length + membersData.length +
    recordsData.length + settingsData.length + templatesData.length;

  return {
    success: true,
    message: `Backup "${fileName}" uploaded (${totalRecords} records). ${deleted > 0 ? `Cleaned up ${deleted} old backup(s).` : ""}`,
    fileId,
  };
}
