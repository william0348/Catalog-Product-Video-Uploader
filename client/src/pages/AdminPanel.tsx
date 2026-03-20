
import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import * as XLSX from 'xlsx';
import { AppFooter } from '@/components/AppFooter';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LanguageContext } from '@/contexts/LanguageContext';
import { GOOGLE_AUTH_TOKEN_KEY, MASTER_GOOGLE_SHEET_ID, SHEET_DATA_HEADER, SHEET_TAB_NAME, ADMIN_ACCESS_SHEET_TAB_NAME, ADMIN_ACCESS_EMAIL_COLUMN, ADMIN_ACCESS_CATALOG_COLUMN, GOOGLE_CLIENT_ID, GOOGLE_API_SCOPES } from '@/constants';
import type { AdminAccessInfo } from '@/types';
import { getColumnLetter } from '@/lib/helpers';
import { loadSettings, saveSettings, fetchCatalogName, validateAccessToken, type AppSettings, type CatalogConfig } from '@/settingsStore';

declare const gapi: any;
declare const window: any;

interface AdminPanelProps {
    onBack: () => void;
}

// ==================== Settings Management Component ====================
const SettingsManager = ({ t }: { t: (key: string) => string }) => {
    const [settings, setSettings] = useState<AppSettings>(loadSettings());
    const [newCatalogId, setNewCatalogId] = useState('');
    const [isAddingCatalog, setIsAddingCatalog] = useState(false);
    const [isValidatingToken, setIsValidatingToken] = useState(false);
    const [tokenStatus, setTokenStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [showToken, setShowToken] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    const handleTokenChange = (value: string) => {
        const updated = { ...settings, facebookAccessToken: value };
        setSettings(updated);
        setTokenStatus({ type: null, message: '' });
        setIsSaved(false);
    };

    const handleSaveToken = () => {
        saveSettings(settings);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    };

    const handleValidateToken = async () => {
        if (!settings.facebookAccessToken) {
            setTokenStatus({ type: 'error', message: t('tokenRequired') });
            return;
        }
        setIsValidatingToken(true);
        setTokenStatus({ type: null, message: '' });
        try {
            const result = await validateAccessToken(settings.facebookAccessToken);
            setTokenStatus({ type: result.valid ? 'success' : 'error', message: result.message });
        } catch (e: any) {
            setTokenStatus({ type: 'error', message: e.message });
        } finally {
            setIsValidatingToken(false);
        }
    };

    const handleAddCatalog = async () => {
        const trimmedId = newCatalogId.trim();
        if (!trimmedId) {
            setCatalogError(t('catalogIdRequired'));
            return;
        }
        if (!settings.facebookAccessToken) {
            setCatalogError(t('tokenRequiredForCatalog'));
            return;
        }
        if (settings.catalogs.some(c => c.id === trimmedId)) {
            setCatalogError(t('catalogAlreadyExists'));
            return;
        }

        setIsAddingCatalog(true);
        setCatalogError(null);
        try {
            const name = await fetchCatalogName(trimmedId, settings.facebookAccessToken);
            const newCatalog: CatalogConfig = {
                id: trimmedId,
                name: name,
                addedAt: new Date().toISOString(),
            };
            const updated = {
                ...settings,
                catalogs: [...settings.catalogs, newCatalog],
            };
            setSettings(updated);
            saveSettings(updated);
            setNewCatalogId('');
        } catch (e: any) {
            setCatalogError(`${t('fetchCatalogFailed')}: ${e.message}`);
        } finally {
            setIsAddingCatalog(false);
        }
    };

    const handleRemoveCatalog = (catalogId: string) => {
        const updated = {
            ...settings,
            catalogs: settings.catalogs.filter(c => c.id !== catalogId),
        };
        setSettings(updated);
        saveSettings(updated);
    };

    const handleRefreshCatalogName = async (catalogId: string) => {
        if (!settings.facebookAccessToken) {
            setCatalogError(t('tokenRequiredForCatalog'));
            return;
        }
        setCatalogError(null);
        try {
            const name = await fetchCatalogName(catalogId, settings.facebookAccessToken);
            const updated = {
                ...settings,
                catalogs: settings.catalogs.map(c =>
                    c.id === catalogId ? { ...c, name } : c
                ),
            };
            setSettings(updated);
            saveSettings(updated);
        } catch (e: any) {
            setCatalogError(`${t('refreshFailed')}: ${e.message}`);
        }
    };

    return (
        <div className="settings-manager">
            <h2>{t('systemSettings')}</h2>
            <p className="info-text">{t('settingsDescription')}</p>

            {/* Facebook Access Token Section */}
            <div className="settings-section">
                <h3>{t('fbAccessToken')}</h3>
                <div className="form-group">
                    <label htmlFor="fbToken">{t('accessToken')}</label>
                    <div className="token-input-group">
                        <input
                            id="fbToken"
                            type={showToken ? 'text' : 'password'}
                            value={settings.facebookAccessToken}
                            onChange={(e) => handleTokenChange(e.target.value)}
                            placeholder={t('enterAccessToken')}
                            className="token-input"
                        />
                        <button
                            onClick={() => setShowToken(!showToken)}
                            className="toggle-visibility-button"
                            title={showToken ? t('hideToken') : t('showToken')}
                        >
                            {showToken ? '🙈' : '👁️'}
                        </button>
                    </div>
                    <div className="token-actions">
                        <button onClick={handleSaveToken} className="save-token-button">
                            {isSaved ? `✓ ${t('saved')}` : t('saveToken')}
                        </button>
                        <button onClick={handleValidateToken} disabled={isValidatingToken} className="validate-token-button">
                            {isValidatingToken ? <div className="loader-small"></div> : t('validateToken')}
                        </button>
                    </div>
                    {tokenStatus.type && (
                        <p className={tokenStatus.type === 'success' ? 'success-text' : 'error-text'}>
                            {tokenStatus.message}
                        </p>
                    )}
                </div>
            </div>

            {/* Catalog Management Section */}
            <div className="settings-section">
                <h3>{t('catalogManagement')}</h3>
                <p className="info-text">{t('catalogManagementDesc')}</p>

                {/* Add New Catalog */}
                <div className="add-catalog-form">
                    <div className="form-group">
                        <label htmlFor="newCatalogId">{t('addNewCatalog')}</label>
                        <div className="add-catalog-input-group">
                            <input
                                id="newCatalogId"
                                type="text"
                                value={newCatalogId}
                                onChange={(e) => { setNewCatalogId(e.target.value.trim()); setCatalogError(null); }}
                                placeholder={t('enterCatalogId')}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCatalog(); }}
                            />
                            <button onClick={handleAddCatalog} disabled={isAddingCatalog || !newCatalogId.trim()} className="add-catalog-button">
                                {isAddingCatalog ? <div className="loader-small"></div> : `+ ${t('addCatalog')}`}
                            </button>
                        </div>
                        {catalogError && <p className="error-text">{catalogError}</p>}
                    </div>
                </div>

                {/* Configured Catalogs List */}
                <div className="catalogs-list">
                    {settings.catalogs.length === 0 ? (
                        <p className="info-text empty-catalogs">{t('noCatalogsConfigured')}</p>
                    ) : (
                        <table className="catalogs-table">
                            <thead>
                                <tr>
                                    <th>{t('catalogId')}</th>
                                    <th>{t('catalogName')}</th>
                                    <th>{t('addedDate')}</th>
                                    <th>{t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {settings.catalogs.map((catalog) => (
                                    <tr key={catalog.id}>
                                        <td><code>{catalog.id}</code></td>
                                        <td>{catalog.name}</td>
                                        <td>{new Date(catalog.addedAt).toLocaleDateString()}</td>
                                        <td className="catalog-actions">
                                            <button
                                                onClick={() => handleRefreshCatalogName(catalog.id)}
                                                className="refresh-catalog-button"
                                                title={t('refreshName')}
                                            >
                                                ↻
                                            </button>
                                            <button
                                                onClick={() => handleRemoveCatalog(catalog.id)}
                                                className="remove-catalog-button"
                                                title={t('removeCatalog')}
                                            >
                                                ✕
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};


// ==================== Main AdminPanel Component ====================
export const AdminPanel = ({ onBack }: AdminPanelProps) => {
    const [activeTab, setActiveTab] = useState<'settings' | 'log'>('settings');
    const [sheetData, setSheetData] = useState<any[][] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [googleTokenClient, setGoogleTokenClient] = useState<any>(null);
    const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string|null>(null);
    const [isGapiClientReady, setIsGapiClientReady] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [isCheckingAccess, setIsCheckingAccess] = useState(false);
    const [adminAccessInfo, setAdminAccessInfo] = useState<AdminAccessInfo>({ type: null, allowedCatalogs: [] });
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const { t } = useContext(LanguageContext);


    const handleLogout = useCallback(() => {
        localStorage.removeItem(GOOGLE_AUTH_TOKEN_KEY);
        sessionStorage.removeItem('google_drive_folder_id');
        setGoogleAccessToken(null);
        setUserEmail(null);
        setSheetData(null);
        setAdminAccessInfo({ type: null, allowedCatalogs: [] });
    }, []);

    const fetchDataFromSheet = useCallback(async () => {
        if (!googleAccessToken || !isGapiClientReady) {
            setError("Google API client is not ready.");
            return;
        }
        if (MASTER_GOOGLE_SHEET_ID.includes("YOUR_GOOGLE_SHEET_ID_HERE")) {
            setError("Please configure the Master Google Sheet ID in index.tsx.");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            gapi.client.setToken({ access_token: googleAccessToken });
            
            const lastColumn = getColumnLetter(SHEET_DATA_HEADER.length);
            const rangeToFetch = `${SHEET_TAB_NAME}!A:${lastColumn}`;

            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: MASTER_GOOGLE_SHEET_ID,
                range: rangeToFetch,
                valueRenderOption: 'UNFORMATTED_VALUE',
            });
            setSheetData(response.result.values || []);
        } catch (apiError: any) {
            const message = apiError.result?.error?.message || apiError.message || "An unknown error occurred.";
             if (message.toLowerCase().includes('token') && (message.toLowerCase().includes('expired') || message.toLowerCase().includes('invalid'))) {
                setError("Your Google session has expired. Please log in again.");
                handleLogout();
            } else {
                setError(`Failed to load data from Google Sheet. Check Sheet ID, tab name, and permissions. Error: ${message}`);
            }
            setSheetData(null);
        } finally {
            setIsLoading(false);
        }
    }, [googleAccessToken, isGapiClientReady, handleLogout]);
    
    useEffect(() => {
        const checkGapi = () => {
            if (window.gapi) {
                gapi.load('client', () => {
                    gapi.client.init({
                        discoveryDocs: [
                            "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
                            "https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest"
                        ]
                    }).then(() => setIsGapiClientReady(true))
                      .catch((initError: any) => setError(`Failed to initialize Google APIs. Error: ${initError.message}`));
                });
            } else {
                setTimeout(checkGapi, 100);
            }
        };
        checkGapi();
    }, []);

    useEffect(() => {
        if (!isGapiClientReady) return;
        const checkGis = () => {
            if (window.google) {
                const tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: GOOGLE_CLIENT_ID,
                    scope: GOOGLE_API_SCOPES,
                    callback: (tokenResponse: any) => {
                        if (tokenResponse.error) {
                            setError(`Google login error: ${tokenResponse.error_description || tokenResponse.error}`);
                            setGoogleAccessToken(null);
                            localStorage.removeItem(GOOGLE_AUTH_TOKEN_KEY);
                            return;
                        }
                        const token = tokenResponse.access_token;
                        setGoogleAccessToken(token);
                        localStorage.setItem(GOOGLE_AUTH_TOKEN_KEY, token);
                        gapi.client.setToken({ access_token: token });
                    },
                });
                setGoogleTokenClient(tokenClient);
            } else {
                setTimeout(checkGis, 100);
            }
        };
        checkGis();
    }, [isGapiClientReady]);
    
    useEffect(() => {
        const storedToken = localStorage.getItem(GOOGLE_AUTH_TOKEN_KEY);
        if (storedToken && isGapiClientReady) {
            setGoogleAccessToken(storedToken);
            gapi.client.setToken({ access_token: storedToken });
        }
    }, [isGapiClientReady]);

    const checkAdminAccess = useCallback(async (email: string): Promise<AdminAccessInfo> => {
        if (!googleAccessToken || !isGapiClientReady) {
            setError("Google API client is not ready for access check.");
            return { type: 'denied', allowedCatalogs: [] };
        }
        if (MASTER_GOOGLE_SHEET_ID.includes("YOUR_GOOGLE_SHEET_ID_HERE")) {
            setError("Master Google Sheet ID is not configured. Cannot verify permissions.");
            return { type: 'denied', allowedCatalogs: [] };
        }
    
        setIsCheckingAccess(true);
        setError(null);
        try {
            gapi.client.setToken({ access_token: googleAccessToken });
            const range = `${ADMIN_ACCESS_SHEET_TAB_NAME}!${ADMIN_ACCESS_EMAIL_COLUMN}:${ADMIN_ACCESS_CATALOG_COLUMN}`;
            const response = await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: MASTER_GOOGLE_SHEET_ID,
                range: range,
            });
    
            const userRows = response?.result?.values?.filter((row: any[]) => 
                row[0] && String(row[0]).toLowerCase().trim() === email.toLowerCase().trim()
            ) || [];

            if (userRows.length === 0) {
                 return { type: 'denied', allowedCatalogs: [] };
            }

            const hasAllAccess = userRows.some((row: any[]) => String(row[1] || '').toLowerCase().trim() === 'all');
            if (hasAllAccess) {
                return { type: 'all', allowedCatalogs: [] };
            }

            const allowedCatalogs = userRows
                .map((row: any[]) => String(row[1] || '').trim())
                .filter((catalogId: string) => catalogId && catalogId.toLowerCase() !== 'all');
            
            if (allowedCatalogs.length > 0) {
                return { type: 'specific', allowedCatalogs: Array.from(new Set(allowedCatalogs as string[])) };
            }

            return { type: 'denied', allowedCatalogs: [] };
    
        } catch (apiError: any) {
            const message = apiError.result?.error?.message || apiError.message || "An unknown error occurred.";
            if (message.includes('Unable to parse range')) {
                setError(`Failed to verify permissions. Please ensure a tab named "${ADMIN_ACCESS_SHEET_TAB_NAME}" exists in your Google Sheet.`);
            } else {
                 setError(`Failed to verify admin permissions. Error: ${message}`);
            }
            return { type: 'denied', allowedCatalogs: [] };
        } finally {
            setIsCheckingAccess(false);
        }
    }, [googleAccessToken, isGapiClientReady]);

    useEffect(() => {
        const verifyUserAndAccess = async (token: string) => {
            try {
                const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!userInfoResponse.ok) {
                    if (userInfoResponse.status === 401) {
                        handleLogout();
                        throw new Error('Google session expired. Please log in again.');
                    }
                    throw new Error('Failed to fetch user info');
                }
                const userInfo = await userInfoResponse.json();
                if (!userInfo.email) {
                    throw new Error("Could not retrieve your Google email address.");
                }
                setUserEmail(userInfo.email);
                
                const accessInfo = await checkAdminAccess(userInfo.email);
                setAdminAccessInfo(accessInfo);

            } catch (err: any) {
                console.error("Error during user verification:", err);
                if (!err.message.includes('session expired')) {
                    setError(err.message || "An error occurred during verification.");
                }
                setAdminAccessInfo({ type: 'denied', allowedCatalogs: [] });
            }
        };

        if (googleAccessToken && isGapiClientReady && userEmail === null) {
            verifyUserAndAccess(googleAccessToken);
        }
    }, [googleAccessToken, isGapiClientReady, userEmail, handleLogout, checkAdminAccess]);

    useEffect(() => {
        if ((adminAccessInfo.type === 'all' || adminAccessInfo.type === 'specific') && activeTab === 'log') {
            fetchDataFromSheet();
        }
    }, [adminAccessInfo, fetchDataFromSheet, activeTab]);


    const handleGoogleLogin = () => {
        if (googleTokenClient) {
            setError(null);
            setAdminAccessInfo({ type: null, allowedCatalogs: [] });
            googleTokenClient.requestAccessToken();
        }
    };
    
    const filteredSheetData = useMemo(() => {
        if (!sheetData || sheetData.length <= 1) return sheetData;
    
        const header = sheetData[0];
        const dataRows = sheetData.slice(1);
    
        let accessFilteredRows = dataRows;
        if (adminAccessInfo.type === 'specific') {
            const catalogIdHeaderIndex = header.indexOf('Catalog ID');
            if (catalogIdHeaderIndex !== -1) {
                const allowedSet = new Set(adminAccessInfo.allowedCatalogs);
                accessFilteredRows = dataRows.filter(row => {
                    if (!row) return false;
                    const rowCatalogId = String(row[catalogIdHeaderIndex] || '').trim();
                    return rowCatalogId && allowedSet.has(rowCatalogId);
                });
            }
        }
    
        if (!searchTerm) {
            return [header, ...accessFilteredRows];
        }
    
        const lowercasedSearchTerm = searchTerm.toLowerCase();
        const searchableHeaders = ['Catalog ID', 'Client Name', 'Product Name', 'Retailer ID'];
        const searchIndices = searchableHeaders.map(h => header.indexOf(h)).filter(index => index !== -1);
        if (searchIndices.length === 0) return [header, ...accessFilteredRows];
    
        const searchFilteredRows = accessFilteredRows.filter(row => {
            if (!row) return false;
            return searchIndices.some(index => {
                const cellValue = row[index];
                return cellValue && String(cellValue).toLowerCase().includes(lowercasedSearchTerm);
            });
        });
    
        return [header, ...searchFilteredRows];
    }, [sheetData, searchTerm, adminAccessInfo]);

    const handleDownload = () => {
        if (!filteredSheetData || filteredSheetData.length <= 1) {
            alert("No data available to export.");
            return;
        }

        const worksheet = XLSX.utils.aoa_to_sheet(filteredSheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Uploaded Videos Log');
        XLSX.writeFile(workbook, `cpas_video_log_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const isGoogleReady = isGapiClientReady && !!googleTokenClient;
    const isLoggedIn = !!googleAccessToken;
    const hasAccess = adminAccessInfo.type === 'all' || adminAccessInfo.type === 'specific';

    return (
        <main className="container data-view">
             {previewImageUrl && (
                <div className="image-modal-backdrop" onClick={() => setPreviewImageUrl(null)}>
                    <div className="image-modal-content" onClick={e => e.stopPropagation()}>
                        <img src={previewImageUrl} alt="Enlarged Product Preview" />
                        <button onClick={() => setPreviewImageUrl(null)} className="close-modal-button">&times;</button>
                    </div>
                </div>
            )}
            <div className="card admin-panel">
                <header className="admin-header">
                    <h1>{t('adminPanel')}</h1>
                    <div className="header-actions">
                         {userEmail && (
                            <div className="user-info-header-small">
                                <span>{userEmail}</span>
                                <button onClick={handleLogout} className="logout-button-small" title={t('logout')}>{t('logout')}</button>
                            </div>
                        )}
                        <LanguageSwitcher />
                        <button onClick={onBack} className="back-button">{t('backToHome')}</button>
                    </div>
                </header>

                {/* Tab Navigation */}
                <div className="admin-tabs">
                    <button
                        className={`admin-tab ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        ⚙️ {t('systemSettings')}
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'log' ? 'active' : ''}`}
                        onClick={() => setActiveTab('log')}
                    >
                        📋 Video Log
                    </button>
                </div>
                
                {/* Settings Tab */}
                {activeTab === 'settings' && (
                    <SettingsManager t={t} />
                )}

                {/* Log Tab */}
                {activeTab === 'log' && (
                    <>
                        {!isLoggedIn ? (
                            <div className="centered-prompt">
                                <p>Please log in with Google to access the master data log from Google Sheets.</p>
                                <button onClick={handleGoogleLogin} disabled={!isGoogleReady} className="google-login-button large">
                                    {t('loginWithGoogle')}
                                </button>
                                {!isGoogleReady && <p className="info-text">{t('initializing')} Google Services...</p>}
                                {error && <p className="error-text">{error}</p>}
                            </div>
                        ) : isCheckingAccess ? (
                             <div className="centered-prompt">
                                <div className="loader"></div>
                                <p className="info-text" style={{marginTop: '1rem'}}>Verifying permissions for {userEmail}...</p>
                            </div>
                        ) : adminAccessInfo.type === 'denied' ? (
                            <div className="centered-prompt">
                                <h2 style={{color: 'var(--error-color)'}}>Access Denied</h2>
                                <p>Your account (<strong>{userEmail}</strong>) is not authorized to access this panel.</p>
                                <p className="info-text">Please contact an administrator to request access.</p>
                                {error && <p className="error-text">{error}</p>}
                            </div>
                        ) : hasAccess ? (
                            <>
                                {adminAccessInfo.type === 'specific' && (
                                    <p className="info-text notice">
                                        Displaying records for {adminAccessInfo.allowedCatalogs.length} specific catalog(s) you have access to.
                                    </p>
                                )}
                                <div className="admin-controls">
                                    <div className="form-group admin-search-bar">
                                        <input
                                            type="text"
                                            placeholder="Search by Catalog ID, Name, Retailer ID, etc..."
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <div className="admin-action-buttons">
                                        <button onClick={fetchDataFromSheet} className="refresh-button" disabled={isLoading} style={{height: '40px'}}>
                                            {isLoading ? <div className="loader-small"></div> : "Refresh"}
                                        </button>
                                        {filteredSheetData && (
                                           <button onClick={handleDownload} className="download-button" disabled={!filteredSheetData || filteredSheetData.length <= 1} style={{height: '40px'}}>
                                                Download Filtered
                                            </button>
                                        )}
                                    </div>
                                </div>
            
                                {isLoading && <div className="loader"></div>}
                                {error && !isLoading && <p className="error-text">{error}</p>}
            
                                {filteredSheetData && (
                                    <div className="admin-data-section">
                                        <div className="admin-data-header">
                                            <h2>Sheet Data ({filteredSheetData.length > 1 ? filteredSheetData.length - 1 : 0} Records Found)</h2>
                                        </div>
                                        <div className="table-container">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        {filteredSheetData[0]?.map((header, index) => {
                                                            if (header === '4x5 Download' || header === '9x16 Download') {
                                                                return null;
                                                            }
                                                            return <th key={index}>{header}</th>
                                                        })}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredSheetData.slice(1).map((row, rowIndex) => (
                                                        <tr key={rowIndex}>
                                                            {row.map((cell, cellIndex) => {
                                                                const header = filteredSheetData[0]?.[cellIndex] || '';
                                                                
                                                                if (header === '4x5 Download' || header === '9x16 Download') {
                                                                    return null;
                                                                }

                                                                if (header === 'Product Image URL' && cell) {
                                                                    return (
                                                                        <td key={cellIndex} data-label={header}>
                                                                            <img src={cell} className="admin-product-image clickable" alt="Product" loading="lazy" onClick={() => setPreviewImageUrl(cell)} />
                                                                        </td>
                                                                    );
                                                                }
                                                                if ((header === '4x5 Video Embed URL' || header === '9x16 Video Embed URL') && cell) {
                                                                    const isNineBySixteen = header === '9x16 Video Embed URL';
                                                                    return (
                                                                        <td key={cellIndex} data-label={header}>
                                                                            <iframe
                                                                                src={cell}
                                                                                className="admin-video-preview"
                                                                                title="Video Preview"
                                                                                allow="encrypted-media"
                                                                                allowFullScreen
                                                                                style={{width: isNineBySixteen ? '72px' : '128px', height: isNineBySixteen ? '128px' : '160px'}}
                                                                            ></iframe>
                                                                        </td>
                                                                    );
                                                                }
                                                                
                                                                return <td key={cellIndex} data-label={header}>{cell}</td>;
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {filteredSheetData.length <= 1 && <p className="info-text">No records match your search.</p>}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                              {error && <p className="error-text">{error}</p>}
                            </>
                        )}
                    </>
                )}
            </div>
            <AppFooter />
        </main>
    );
};
