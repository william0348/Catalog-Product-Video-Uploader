/**
 * settingsStore.ts
 * 
 * Centralized settings store using localStorage.
 * All users share the same Access Token and Catalog configurations.
 * Admin panel writes settings; MainApp reads them.
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
  accessKey: string; // The shared access key for front-end users
}

const SETTINGS_STORAGE_KEY = 'cpv_app_settings';

const DEFAULT_SETTINGS: AppSettings = {
  facebookAccessToken: '',
  catalogs: [],
  accessKey: 'RhinoShield2025',
};

/**
 * Load settings from localStorage
 */
export const loadSettings = (): AppSettings => {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
      };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return { ...DEFAULT_SETTINGS };
};

/**
 * Save settings to localStorage
 */
export const saveSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
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
