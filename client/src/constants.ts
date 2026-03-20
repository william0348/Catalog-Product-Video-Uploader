export const API_VERSION = "v23.0";
export const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;
export const GOOGLE_API_SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email";
export const SHEET_DATA_HEADER = ['Catalog ID', 'Retailer ID', 'Product Name', 'Product Image URL', '4x5 Download', '4x5 Video Embed URL', '9x16 Download', '9x16 Video Embed URL', 'Client Name', 'Upload Timestamp', 'Uploaded By'];
export const GOOGLE_AUTH_TOKEN_KEY = 'google_auth_token';
export const SESSION_DATA_KEY = 'cpas_session_data';
export const INTRO_GUIDE_KEY = 'hasSeenIntroGuide';
export const LANGUAGE_KEY = 'cpas_language';

// --- Facebook Access Token is now managed via Admin Panel Settings ---
// Use getAccessToken() from settingsStore.ts to retrieve it.
// This constant is kept for backward compatibility only.
export const FACEBOOK_ACCESS_TOKEN = "MANAGED_VIA_ADMIN_PANEL";

export const GOOGLE_CLIENT_ID = "1034922920826-p03210cv43c0kgdp15fjgkq90hbjs6uq.apps.googleusercontent.com";

// --- Master Google Sheet & API ---
export const MASTER_GOOGLE_SHEET_ID = "1RhrhQOdDpPBdmHQ1TyDOFn_ynnE0hdmmwXxkAb_NQ-I";
export const SHEET_TAB_NAME = 'CPV';

// --- Google Apps Script URL ---
export const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzF3yJzu4Ph0vjVzDaTzj715sydPt8NQiisAEYaBMlHnxkSCcX3SIN4CCb9Gkf750w5/exec";

// --- Admin Access Control ---
export const ADMIN_ACCESS_SHEET_TAB_NAME = 'Admins';
export const ADMIN_ACCESS_EMAIL_COLUMN = 'A';
export const ADMIN_ACCESS_CATALOG_COLUMN = 'B';
