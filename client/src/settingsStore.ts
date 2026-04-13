/**
 * settingsStore.ts
 * 
 * Centralized settings store backed by the server database via tRPC API.
 * Supports both legacy global settings and company-level shared settings.
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

export interface CompanyInfo {
  id: number;
  name: string;
  facebookAccessToken: string | null;
  catalogs: string; // JSON string of CatalogConfig[]
  accessKey: string | null;
  tokenExpiresAt: string | null;
  createdAt: string;
  memberRole?: string;
  status?: string;
}

const SETTINGS_STORAGE_KEY = 'cpv_app_settings';
const COMPANY_STORAGE_KEY = 'cpv_selected_company';

const DEFAULT_SETTINGS: AppSettings = {
  facebookAccessToken: '',
  catalogs: [],
  accessKey: '',
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

// ==================== Legacy Global Settings ====================

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
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings to localStorage:', e);
  }
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
        accessKey: result.accessKey ?? DEFAULT_SETTINGS.accessKey,
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

// ==================== Company-Level Settings ====================

/**
 * Get companies by user email
 */
export const getCompaniesByEmail = async (email: string): Promise<CompanyInfo[]> => {
  try {
    return await trpcQuery('company.getByEmail', { email: email.toLowerCase() });
  } catch (e) {
    console.error('Failed to get companies by email:', e);
    return [];
  }
};

/**
 * Get full company details including access token
 * @param email - If provided, server verifies this email is a company member
 */
export const getCompanyDetails = async (companyId: number, email?: string): Promise<CompanyInfo | null> => {
  try {
    const params: any = { id: companyId };
    if (email) params.email = email.toLowerCase();
    return await trpcQuery('company.get', params);
  } catch (e: any) {
    console.error('Failed to get company details:', e);
    // Re-throw access denied errors so the caller can handle them
    if (e.message?.includes('不是此公司的成員')) throw e;
    return null;
  }
};

/**
 * Get company's full access token (not masked)
 * @param email - If provided, server verifies this email is a company member
 */
export const getCompanyAccessToken = async (companyId: number, email?: string): Promise<string | null> => {
  try {
    const params: any = { id: companyId };
    if (email) params.email = email.toLowerCase();
    const result = await trpcQuery('company.getAccessToken', params);
    return result?.accessToken ?? null;
  } catch (e: any) {
    console.error('Failed to get company access token:', e);
    if (e.message?.includes('不是此公司的成員')) throw e;
    return null;
  }
};

/**
 * Load settings from a specific company
 * @param email - If provided, server verifies this email is a company member
 */
export const loadCompanySettings = async (companyId: number, email?: string): Promise<AppSettings> => {
  try {
    const company = await getCompanyDetails(companyId, email);
    if (!company) return { ...DEFAULT_SETTINGS };

    // Get the full (unmasked) access token
    const fullToken = await getCompanyAccessToken(companyId, email);

    const catalogs: CatalogConfig[] = company.catalogs ? JSON.parse(company.catalogs) : [];
    const settings: AppSettings = {
      facebookAccessToken: fullToken || '',
      catalogs,
      accessKey: company.accessKey || '',
    };

    // Cache locally for fast reads
    _cachedSettings = { ...settings };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));

    return settings;
  } catch (e: any) {
    console.error('Failed to load company settings:', e);
    if (e.message?.includes('不是此公司的成員')) throw e;
    return loadSettings();
  }
};

/**
 * Save settings to a specific company
 * @param email - If provided, server verifies this email is a company member
 */
export const saveCompanySettings = async (companyId: number, settings: Partial<AppSettings>, email?: string): Promise<void> => {
  try {
    const updateData: Record<string, string> = {};
    if (settings.facebookAccessToken !== undefined) {
      updateData.facebookAccessToken = settings.facebookAccessToken;
    }
    if (settings.catalogs !== undefined) {
      updateData.catalogs = JSON.stringify(settings.catalogs);
    }
    if (settings.accessKey !== undefined) {
      updateData.accessKey = settings.accessKey;
    }

    const mutateData: any = { id: companyId, ...updateData };
    if (email) mutateData.email = email.toLowerCase();
    await trpcMutate('company.update', mutateData);

    // Update local cache
    if (_cachedSettings) {
      if (settings.facebookAccessToken !== undefined) _cachedSettings.facebookAccessToken = settings.facebookAccessToken;
      if (settings.catalogs !== undefined) _cachedSettings.catalogs = settings.catalogs;
      if (settings.accessKey !== undefined) _cachedSettings.accessKey = settings.accessKey;
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(_cachedSettings));
    }
  } catch (e) {
    console.error('Failed to save company settings:', e);
    throw e;
  }
};

/**
 * Activate pending memberships when user logs in
 */
export const activateMemberships = async (email: string): Promise<void> => {
  try {
    await trpcMutate('members.activate', { email: email.toLowerCase() });
  } catch (e) {
    console.error('Failed to activate memberships:', e);
  }
};

/**
 * Save selected company ID to localStorage
 */
export const saveSelectedCompany = (companyId: number | null): void => {
  if (companyId) {
    localStorage.setItem(COMPANY_STORAGE_KEY, String(companyId));
  } else {
    localStorage.removeItem(COMPANY_STORAGE_KEY);
  }
};

/**
 * Get selected company ID from localStorage
 */
export const getSelectedCompany = (): number | null => {
  const stored = localStorage.getItem(COMPANY_STORAGE_KEY);
  return stored ? parseInt(stored, 10) : null;
};

// ==================== Shared Utilities ====================

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
  companyId?: number;
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

// ==================== Token Expiration Helpers ====================

/**
 * Get token expiration info for a company
 */
export const getTokenExpiration = async (companyId: number): Promise<{ tokenExpiresAt: string | null; hasToken: boolean }> => {
  try {
    return await trpcQuery('company.getTokenExpiration', { id: companyId });
  } catch (e) {
    console.error('Failed to get token expiration:', e);
    return { tokenExpiresAt: null, hasToken: false };
  }
};

/**
 * Refresh token expiration info from Facebook API
 */
export const refreshTokenExpiration = async (companyId: number): Promise<{ tokenExpiresAt: string | null; neverExpires?: boolean; error?: string }> => {
  try {
    return await trpcMutate('company.refreshTokenExpiration', { id: companyId });
  } catch (e: any) {
    console.error('Failed to refresh token expiration:', e);
    return { tokenExpiresAt: null, error: e.message || 'Failed to refresh' };
  }
};

/**
 * Check if token is expiring soon (within given days)
 */
export const isTokenExpiringSoon = (expiresAt: string | null, withinDays: number = 7): { expiring: boolean; daysLeft: number | null; expired: boolean } => {
  if (!expiresAt) return { expiring: false, daysLeft: null, expired: false };
  const now = new Date();
  const expiryDate = new Date(expiresAt);
  const diffMs = expiryDate.getTime() - now.getTime();
  const daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (daysLeft < 0) return { expiring: true, daysLeft, expired: true };
  if (daysLeft <= withinDays) return { expiring: true, daysLeft, expired: false };
  return { expiring: false, daysLeft, expired: false };
};
