
import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import * as XLSX from 'xlsx';
import { AppFooter } from '@/components/AppFooter';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { LanguageContext } from '@/contexts/LanguageContext';
import { loadSettings, saveSettings, fetchCatalogName, validateAccessToken, loadSettingsFromServer, type AppSettings, type CatalogConfig } from '@/settingsStore';

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

    useEffect(() => {
        loadSettingsFromServer().then(s => setSettings(s));
    }, []);

    const handleTokenChange = (value: string) => {
        const updated = { ...settings, facebookAccessToken: value };
        setSettings(updated);
        setTokenStatus({ type: null, message: '' });
        setIsSaved(false);
    };

    const handleSaveToken = async () => {
        await saveSettings(settings);
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
            await saveSettings(updated);
            setNewCatalogId('');
        } catch (e: any) {
            setCatalogError(`${t('fetchCatalogFailed')}: ${e.message}`);
        } finally {
            setIsAddingCatalog(false);
        }
    };

    const handleRemoveCatalog = async (catalogId: string) => {
        const updated = {
            ...settings,
            catalogs: settings.catalogs.filter(c => c.id !== catalogId),
        };
        setSettings(updated);
        await saveSettings(updated);
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
            await saveSettings(updated);
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


// ==================== Video Log Component (Database-backed) ====================
interface UploadRecord {
    id: number;
    catalogId: string;
    retailerId: string;
    productName: string;
    productImageUrl: string | null;
    video4x5Download: string | null;
    video4x5Embed: string | null;
    video9x16Download: string | null;
    video9x16Embed: string | null;
    clientName: string;
    uploadTimestamp: string;
    uploadedBy: string | null;
}

const RECORDS_PER_PAGE = 50;

const VideoLog = ({ t }: { t: (key: string) => string }) => {
    const [records, setRecords] = useState<UploadRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [catalogFilter, setCatalogFilter] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    
    // Image preview
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    
    // Delete confirmation
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

    // Available catalogs from settings
    const [catalogs, setCatalogs] = useState<CatalogConfig[]>([]);

    // Load records from database
    const fetchRecords = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch('/api/trpc/uploads.listAll', {
                method: 'GET',
                credentials: 'include',
            });
            const data = await response.json();
            const result = data?.result?.data?.json;
            if (Array.isArray(result)) {
                setRecords(result);
            } else {
                setRecords([]);
            }
        } catch (e: any) {
            setError(`Failed to load records: ${e.message}`);
            setRecords([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Load catalogs from settings
    useEffect(() => {
        loadSettingsFromServer().then(s => setCatalogs(s.catalogs));
        fetchRecords();
    }, [fetchRecords]);

    // Delete a record
    const handleDelete = async (id: number) => {
        try {
            await fetch('/api/trpc/uploads.delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ "0": { json: { id } } }),
            });
            setRecords(prev => prev.filter(r => r.id !== id));
            setDeleteConfirmId(null);
        } catch (e: any) {
            setError(`Failed to delete record: ${e.message}`);
        }
    };

    // Filtered records
    const filteredRecords = useMemo(() => {
        let result = [...records];

        // Filter by catalog
        if (catalogFilter !== 'all') {
            result = result.filter(r => r.catalogId === catalogFilter);
        }

        // Filter by date range
        if (dateFrom) {
            const fromDate = new Date(dateFrom);
            result = result.filter(r => new Date(r.uploadTimestamp) >= fromDate);
        }
        if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            result = result.filter(r => new Date(r.uploadTimestamp) <= toDate);
        }

        // Filter by search term
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            result = result.filter(r =>
                r.productName.toLowerCase().includes(lower) ||
                r.retailerId.toLowerCase().includes(lower) ||
                r.clientName.toLowerCase().includes(lower) ||
                r.catalogId.toLowerCase().includes(lower)
            );
        }

        return result;
    }, [records, catalogFilter, dateFrom, dateTo, searchTerm]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / RECORDS_PER_PAGE));
    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * RECORDS_PER_PAGE;
        return filteredRecords.slice(start, start + RECORDS_PER_PAGE);
    }, [filteredRecords, currentPage]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, catalogFilter, dateFrom, dateTo]);

    // Unique catalog IDs from records
    const uniqueCatalogs = useMemo(() => {
        const ids = new Set(records.map(r => r.catalogId));
        return Array.from(ids).map(id => {
            const config = catalogs.find(c => c.id === id);
            return { id, name: config?.name || id };
        });
    }, [records, catalogs]);

    // Export to XLSX
    const handleExport = () => {
        if (filteredRecords.length === 0) return;

        const exportData = filteredRecords.map(r => ({
            'Catalog ID': r.catalogId,
            'Retailer ID': r.retailerId,
            'Product Name': r.productName,
            'Product Image URL': r.productImageUrl || '',
            '4x5 Download': r.video4x5Download || '',
            '4x5 Video Embed URL': r.video4x5Embed || '',
            '9x16 Download': r.video9x16Download || '',
            '9x16 Video Embed URL': r.video9x16Embed || '',
            'Client Name': r.clientName,
            'Upload Timestamp': r.uploadTimestamp ? new Date(r.uploadTimestamp).toLocaleString() : '',
            'Uploaded By': r.uploadedBy || '',
        }));

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Upload Records');
        XLSX.writeFile(workbook, `cpas_video_log_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // Get catalog name helper
    const getCatalogDisplayName = (catalogId: string) => {
        const config = catalogs.find(c => c.id === catalogId);
        return config?.name || catalogId;
    };

    return (
        <div className="video-log">
            {/* Image Preview Modal */}
            {previewImageUrl && (
                <div className="image-modal-backdrop" onClick={() => setPreviewImageUrl(null)}>
                    <div className="image-modal-content" onClick={e => e.stopPropagation()}>
                        <img src={previewImageUrl} alt="Preview" />
                        <button onClick={() => setPreviewImageUrl(null)} className="close-modal-button">&times;</button>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmId !== null && (
                <div className="image-modal-backdrop" onClick={() => setDeleteConfirmId(null)}>
                    <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
                        <h3>{t('deleteConfirmTitle') || 'Delete Record'}</h3>
                        <p>{t('deleteConfirmMessage') || 'Are you sure you want to delete this record? This action cannot be undone.'}</p>
                        <div className="delete-confirm-actions">
                            <button className="cancel-delete-btn" onClick={() => setDeleteConfirmId(null)}>
                                {t('cancel')}
                            </button>
                            <button className="confirm-delete-btn" onClick={() => handleDelete(deleteConfirmId)}>
                                {t('deleteRecord') || 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Stats Bar */}
            <div className="log-stats-bar">
                <div className="log-stat">
                    <span className="log-stat-number">{records.length}</span>
                    <span className="log-stat-label">{t('totalRecords') || 'Total Records'}</span>
                </div>
                <div className="log-stat">
                    <span className="log-stat-number">{filteredRecords.length}</span>
                    <span className="log-stat-label">{t('filteredRecords') || 'Filtered'}</span>
                </div>
                <div className="log-stat">
                    <span className="log-stat-number">{uniqueCatalogs.length}</span>
                    <span className="log-stat-label">{t('catalogCount') || 'Catalogs'}</span>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="log-filter-bar">
                <div className="log-filter-row">
                    <div className="log-filter-item log-filter-search">
                        <label>{t('searchLabel')}</label>
                        <input
                            type="text"
                            placeholder={t('searchPlaceholder') || 'Search by name, ID, client...'}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="log-filter-item">
                        <label>{t('filterByCatalog') || 'Catalog'}</label>
                        <select
                            value={catalogFilter}
                            onChange={e => setCatalogFilter(e.target.value)}
                        >
                            <option value="all">{t('showAll')}</option>
                            {uniqueCatalogs.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="log-filter-row">
                    <div className="log-filter-item">
                        <label>{t('dateFrom') || 'From'}</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                        />
                    </div>
                    <div className="log-filter-item">
                        <label>{t('dateTo') || 'To'}</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                        />
                    </div>
                </div>
                <div className="log-filter-row" style={{ justifyContent: 'flex-end' }}>
                    <div className="log-filter-actions">
                        <button
                            className="log-action-btn log-refresh-btn"
                            onClick={fetchRecords}
                            disabled={isLoading}
                        >
                            {isLoading ? '...' : '↻ ' + (t('refresh') || 'Refresh')}
                        </button>
                        <button
                            className="log-action-btn log-export-btn"
                            onClick={handleExport}
                            disabled={filteredRecords.length === 0}
                        >
                            ↓ {t('exportXlsx') || 'Export XLSX'}
                        </button>
                        <button
                            className="log-action-btn log-clear-btn"
                            onClick={() => { setSearchTerm(''); setCatalogFilter('all'); setDateFrom(''); setDateTo(''); }}
                        >
                            ✕ {t('clearFilters') || 'Clear'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Error */}
            {error && <p className="error-text" style={{ margin: '12px 0' }}>{error}</p>}

            {/* Loading */}
            {isLoading && (
                <div className="log-loading">
                    <div className="loader"></div>
                </div>
            )}

            {/* Records Table */}
            {!isLoading && (
                <>
                    {paginatedRecords.length === 0 ? (
                        <div className="log-empty-state">
                            <p>{filteredRecords.length === 0 && records.length > 0
                                ? (t('noMatchingRecords') || 'No records match your filters.')
                                : (t('noRecordsYet') || 'No upload records yet. Records will appear here after uploading videos.')
                            }</p>
                        </div>
                    ) : (
                        <div className="log-table-container">
                            <table className="log-table">
                                <thead>
                                    <tr>
                                        <th className="col-image">{t('image')}</th>
                                        <th className="col-product">{t('name')}</th>
                                        <th className="col-retailer">{t('retailerId')}</th>
                                        <th className="col-catalog">{t('catalogId')}</th>
                                        <th className="col-client">{t('clientNameLabel')}</th>
                                        <th className="col-video">4:5</th>
                                        <th className="col-video">9:16</th>
                                        <th className="col-date">{t('uploadDate') || 'Date'}</th>
                                        <th className="col-actions">{t('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedRecords.map((record) => (
                                        <tr key={record.id}>
                                            <td className="col-image">
                                                {record.productImageUrl ? (
                                                    <img
                                                        src={record.productImageUrl}
                                                        alt={record.productName}
                                                        className="log-product-image"
                                                        loading="lazy"
                                                        onClick={() => setPreviewImageUrl(record.productImageUrl)}
                                                    />
                                                ) : (
                                                    <div className="log-no-image">—</div>
                                                )}
                                            </td>
                                            <td className="col-product">
                                                <span className="log-product-name">{record.productName}</span>
                                            </td>
                                            <td className="col-retailer">
                                                <code className="log-retailer-id">{record.retailerId}</code>
                                            </td>
                                            <td className="col-catalog">
                                                <span className="log-catalog-badge">{getCatalogDisplayName(record.catalogId)}</span>
                                            </td>
                                            <td className="col-client">{record.clientName}</td>
                                            <td className="col-video">
                                                {record.video4x5Embed ? (
                                                    <a href={record.video4x5Download || record.video4x5Embed} target="_blank" rel="noopener noreferrer" className="log-video-link" title="Open 4:5 video">
                                                        ▶
                                                    </a>
                                                ) : (
                                                    <span className="log-no-video">—</span>
                                                )}
                                            </td>
                                            <td className="col-video">
                                                {record.video9x16Embed ? (
                                                    <a href={record.video9x16Download || record.video9x16Embed} target="_blank" rel="noopener noreferrer" className="log-video-link" title="Open 9:16 video">
                                                        ▶
                                                    </a>
                                                ) : (
                                                    <span className="log-no-video">—</span>
                                                )}
                                            </td>
                                            <td className="col-date">
                                                <span className="log-date">{new Date(record.uploadTimestamp).toLocaleDateString()}</span>
                                                <span className="log-time">{new Date(record.uploadTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </td>
                                            <td className="col-actions">
                                                <button
                                                    className="log-delete-btn"
                                                    onClick={() => setDeleteConfirmId(record.id)}
                                                    title={t('deleteRecord') || 'Delete'}
                                                >
                                                    🗑
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="log-pagination">
                            <button
                                className="log-page-btn"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(1)}
                            >
                                ««
                            </button>
                            <button
                                className="log-page-btn"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            >
                                «
                            </button>
                            <span className="log-page-info">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                className="log-page-btn"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            >
                                »
                            </button>
                            <button
                                className="log-page-btn"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(totalPages)}
                            >
                                »»
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};


// ==================== Main AdminPanel Component ====================
export const AdminPanel = ({ onBack }: AdminPanelProps) => {
    const [activeTab, setActiveTab] = useState<'settings' | 'log'>('log');
    const { t } = useContext(LanguageContext);

    return (
        <main className="container data-view">
            <div className="card admin-panel">
                <header className="admin-header">
                    <h1>{t('adminPanel')}</h1>
                    <div className="header-actions">
                        <LanguageSwitcher />
                        <button onClick={onBack} className="back-button">{t('backToHome')}</button>
                    </div>
                </header>

                {/* Tab Navigation */}
                <div className="admin-tabs">
                    <button
                        className={`admin-tab ${activeTab === 'log' ? 'active' : ''}`}
                        onClick={() => setActiveTab('log')}
                    >
                        📋 Video Log
                    </button>
                    <button
                        className={`admin-tab ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        ⚙️ {t('systemSettings')}
                    </button>
                </div>
                
                {/* Log Tab (now default) */}
                {activeTab === 'log' && (
                    <VideoLog t={t} />
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                    <SettingsManager t={t} />
                )}
            </div>
            <AppFooter />
        </main>
    );
};
