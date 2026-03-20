/**
 * settingsStore.ts
 * 
 * Centralized settings store backed by the server database via tRPC API.
 * All users share the same Access Token and Catalog configurations.
 * Falls back to localStorage for offline/initial loading.
 * 
 * Facebook API calls are proxied through the backend to avoid CORS issues.
 */

export interface CatalogConfig {
  id: string;
  name: string;
  addedAt: string; // ISO timestamp
}

export interface AppSettings {
  facebookAccessToken: string;
  catalogs: CatalogConfig[];
  accessKey: string;
}

const SETTINGS_STORAGE_KEY = 'cpv_app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  facebookAccessToken: '',
  catalogs: [],
  accessKey: 'RhinoShield2025',
};

// ===== Local cache for fast reads =====
let _cachedSettings: AppSettings | null = null;

/**
 * Helper: call a tRPC mutation (POST)
 */
const trpcMutate = async (path: string, input: any): Promise<any> => {
  const response = await fetch(`/api/trpc/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ json: input }),
  });
  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error?.json?.message || 'API error');
  }
  return data?.result?.data?.json;
};

/**
 * Helper: call a tRPC query (GET)
 */
const trpcQuery = async (path: string, input?: any): Promise<any> => {
  let url = `/api/trpc/${path}`;
  if (input !== undefined) {
    url += `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  }
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  });
  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error?.json?.message || 'API error');
  }
  return data?.result?.data?.json;
};

/**
 * Load settings from localStorage (fast, synchronous)
 */
export const loadSettings = (): AppSettings => {
  if (_cachedSettings) return { ..._cachedSettings };
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const merged: AppSettings = {
        facebookAccessToken: parsed.facebookAccessToken ?? DEFAULT_SETTINGS.facebookAccessToken,
        catalogs: parsed.catalogs ?? DEFAULT_SETTINGS.catalogs,
        accessKey: parsed.accessKey ?? DEFAULT_SETTINGS.accessKey,
      };
      _cachedSettings = merged;
      return { ...merged };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return { ...DEFAULT_SETTINGS };
};

/**
 * Save settings to both localStorage (for fast reads) and server database
 */
export const saveSettings = async (settings: AppSettings): Promise<void> => {
  _cachedSettings = { ...settings };
  // Save to localStorage for immediate availability
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings to localStorage:', e);
  }
  // Persist to server database
  try {
    await trpcMutate('settings.set', { key: 'facebookAccessToken', value: settings.facebookAccessToken });
    await trpcMutate('settings.set', { key: 'catalogs', value: JSON.stringify(settings.catalogs) });
    await trpcMutate('settings.set', { key: 'accessKey', value: settings.accessKey });
  } catch (e) {
    console.error('Failed to persist settings to server:', e);
  }
};

/**
 * Load settings from server database and update local cache
 */
export const loadSettingsFromServer = async (): Promise<AppSettings> => {
  try {
    const result = await trpcQuery('settings.getAll');
    if (result) {
      const settings: AppSettings = {
        facebookAccessToken: result.facebookAccessToken || DEFAULT_SETTINGS.facebookAccessToken,
        catalogs: result.catalogs ? JSON.parse(result.catalogs) : DEFAULT_SETTINGS.catalogs,
        accessKey: result.accessKey || DEFAULT_SETTINGS.accessKey,
      };
      _cachedSettings = { ...settings };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      return settings;
    }
  } catch (e) {
    console.error('Failed to load settings from server:', e);
  }
  return loadSettings();
};

/**
 * Get the Facebook Access Token from settings
 */
export const getAccessToken = (): string => {
  const settings = loadSettings();
  return settings.facebookAccessToken;
};

/**
 * Get configured catalogs from settings
 */
export const getCatalogs = (): CatalogConfig[] => {
  const settings = loadSettings();
  return settings.catalogs;
};

/**
 * Fetch catalog name via backend proxy (avoids CORS issues)
 */
export const fetchCatalogName = async (catalogId: string, accessToken: string): Promise<string> => {
  const result = await trpcMutate('facebook.fetchCatalogName', { catalogId, accessToken });
  return result.name || `Catalog ${catalogId}`;
};

/**
 * Validate a Facebook Access Token via backend proxy (avoids CORS issues)
 */
export const validateAccessToken = async (accessToken: string): Promise<{ valid: boolean; message: string }> => {
  try {
    const result = await trpcMutate('facebook.validateToken', { accessToken });
    return { valid: result.valid, message: result.message };
  } catch (e: any) {
    return { valid: false, message: e.message || 'Failed to validate token' };
  }
};

/**
 * Save an upload record to the database
 */
export const saveUploadRecord = async (record: {
  catalogId: string;
  retailerId: string;
  productName: string;
  productImageUrl?: string;
  video4x5Download?: string;
  video4x5Embed?: string;
  video9x16Download?: string;
  video9x16Embed?: string;
  clientName: string;
  uploadedBy?: string;
}): Promise<boolean> => {
  try {
    const result = await trpcMutate('uploads.create', record);
    return !!result;
  } catch (e) {
    console.error('Failed to save upload record:', e);
    return false;
  }
};

/**
 * Get upload records for a specific catalog from the database
 */
export const getUploadRecords = async (catalogId: string): Promise<any[]> => {
  try {
    return await trpcQuery('uploads.listByCatalog', { catalogId });
  } catch (e) {
    console.error('Failed to get upload records:', e);
    return [];
  }
};
