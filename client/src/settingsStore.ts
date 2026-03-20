/**
 * settingsStore.ts
 * 
 * Centralized settings store backed by the server database via fetch API.
 * All users share the same Access Token and Catalog configurations.
 * Falls back to localStorage for offline/initial loading.
 */

const FB_API_VERSION = "v23.0";
const FB_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`;

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
    await fetch('/api/trpc/settings.set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ "0": { json: { key: 'facebookAccessToken', value: settings.facebookAccessToken } } }),
    });
    await fetch('/api/trpc/settings.set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ "0": { json: { key: 'catalogs', value: JSON.stringify(settings.catalogs) } } }),
    });
    await fetch('/api/trpc/settings.set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ "0": { json: { key: 'accessKey', value: settings.accessKey } } }),
    });
  } catch (e) {
    console.error('Failed to persist settings to server:', e);
  }
};

/**
 * Load settings from server database and update local cache
 */
export const loadSettingsFromServer = async (): Promise<AppSettings> => {
  try {
    const response = await fetch('/api/trpc/settings.getAll', {
      method: 'GET',
      credentials: 'include',
    });
    const data = await response.json();
    const result = data?.result?.data?.json;
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
 * Fetch catalog name from Facebook API using catalog ID and access token
 */
export const fetchCatalogName = async (catalogId: string, accessToken: string): Promise<string> => {
  const url = `${FB_BASE_URL}/${catalogId}?fields=name&access_token=${accessToken}`;
  const response = await fetch(url);
  const data = await response.json();
  
  if (!response.ok) {
    const errorMsg = data?.error?.message || 'Unknown error fetching catalog name';
    throw new Error(errorMsg);
  }
  
  return data.name || `Catalog ${catalogId}`;
};

/**
 * Validate a Facebook Access Token by making a simple API call
 */
export const validateAccessToken = async (accessToken: string): Promise<{ valid: boolean; message: string }> => {
  try {
    const url = `${FB_BASE_URL}/me?access_token=${accessToken}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!response.ok) {
      return { valid: false, message: data?.error?.message || 'Invalid access token' };
    }
    
    return { valid: true, message: `Token valid. User: ${data.name || data.id}` };
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
    const response = await fetch('/api/trpc/uploads.create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ "0": { json: record } }),
    });
    const data = await response.json();
    return !!data?.result?.data?.json;
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
    const response = await fetch(`/api/trpc/uploads.listByCatalog?input=${encodeURIComponent(JSON.stringify({ "0": { json: { catalogId } } }))}`, {
      method: 'GET',
      credentials: 'include',
    });
    const data = await response.json();
    return data?.result?.data?.json || [];
  } catch (e) {
    console.error('Failed to get upload records:', e);
    return [];
  }
};
