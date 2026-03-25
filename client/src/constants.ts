export const API_VERSION = "v23.0";
export const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;
export const GOOGLE_API_SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";
export const GOOGLE_AUTH_TOKEN_KEY = 'google_auth_token';
export const SESSION_DATA_KEY = 'cpv_session_data';
export const INTRO_GUIDE_KEY = 'hasSeenIntroGuide';
export const LANGUAGE_KEY = 'cpv_language';

// --- Facebook Access Token is now managed via Admin Panel Settings ---
// Use getAccessToken() from settingsStore.ts to retrieve it.
// This constant is kept for backward compatibility only.
export const FACEBOOK_ACCESS_TOKEN = "MANAGED_VIA_ADMIN_PANEL";

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
