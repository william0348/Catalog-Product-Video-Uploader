
import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import * as XLSX from 'xlsx';
import { AppFooter } from '@/components/AppFooter';
import { LanguageContext } from '@/contexts/LanguageContext';
import { loadSettings, saveSettings, fetchCatalogName, validateAccessToken, loadSettingsFromServer, type AppSettings, type CatalogConfig } from '@/settingsStore';

interface AdminPanelProps {
    onBack: () => void;
}

// ==================== tRPC helpers ====================
const trpcMutate = async (path: string, input: any): Promise<any> => {
    const response = await fetch(`/api/trpc/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ json: input }),
    });
    const data = await response.json();
    if (data?.error) {
        throw new Error(data.error?.json?.message || data.error?.message || 'API error');
    }
    return data?.result?.data?.json;
};

const trpcQuery = async (path: string, input?: any): Promise<any> => {
    let url = `/api/trpc/${path}`;
    if (input !== undefined) {
        url += `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
    }
    const response = await fetch(url, { method: 'GET', credentials: 'include' });
    const data = await response.json();
    if (data?.error) {
        throw new Error(data.error?.json?.message || data.error?.message || 'API error');
    }
    return data?.result?.data?.json;
};

// ==================== Company Management Component ====================
interface CompanyData {
    id: number;
    name: string;
    facebookAccessToken: string | null;
    catalogs: string;
    accessKey: string | null;
    createdAt: string;
}

interface MemberData {
    id: number;
    companyId: number;
    email: string;
    memberRole: string;
    status: string;
    joinedAt: string;
}

const CompanyManager = ({ t }: { t: (key: string) => string }) => {
    // Email state for loading companies
    const [userEmail, setUserEmail] = useState(() => localStorage.getItem('cpv_user_email') || '');
    const [emailSubmitted, setEmailSubmitted] = useState(false);

    // Companies list
    const [companies, setCompanies] = useState<CompanyData[]>([]);
    const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);

    // Selected company
    const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
    const [companyDetail, setCompanyDetail] = useState<CompanyData | null>(null);
    const [companyMembers, setCompanyMembers] = useState<MemberData[]>([]);

    // Create company form
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newCompanyName, setNewCompanyName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Company settings edit
    const [editToken, setEditToken] = useState('');
    const [editAccessKey, setEditAccessKey] = useState('');
    const [showEditToken, setShowEditToken] = useState(false);
    const [isSavingCompany, setIsSavingCompany] = useState(false);
    const [companySaveMsg, setCompanySaveMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Token validation
    const [isValidatingToken, setIsValidatingToken] = useState(false);
    const [tokenStatus, setTokenStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });

    // Catalog management
    const [newCatalogId, setNewCatalogId] = useState('');
    const [isAddingCatalog, setIsAddingCatalog] = useState(false);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [copiedCsvUrl, setCopiedCsvUrl] = useState<string | null>(null);

    // Member invite
    const [inviteEmail, setInviteEmail] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    const [inviteMsg, setInviteMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Status messages
    const [statusMsg, setStatusMsg] = useState<string | null>(null);

    // Load companies by email
    const loadCompanies = useCallback(async () => {
        if (!userEmail) return;
        setIsLoadingCompanies(true);
        try {
            const result = await trpcQuery('company.getByEmail', { email: userEmail.toLowerCase() });
            setCompanies(Array.isArray(result) ? result : []);
            localStorage.setItem('cpv_user_email', userEmail);
            setEmailSubmitted(true);
        } catch (e: any) {
            console.error('Failed to load companies:', e);
            setCompanies([]);
        } finally {
            setIsLoadingCompanies(false);
        }
    }, [userEmail]);

    // Auto-load if email was saved
    useEffect(() => {
        if (userEmail && !emailSubmitted) {
            loadCompanies();
        }
    }, []);

    // Load company detail when selected
    useEffect(() => {
        if (selectedCompanyId === null) {
            setCompanyDetail(null);
            setCompanyMembers([]);
            return;
        }
        const loadDetail = async () => {
            try {
                const detail = await trpcQuery('company.get', { id: selectedCompanyId });
                setCompanyDetail(detail);
                setEditToken(detail.facebookAccessTokenFull || '');
                setEditAccessKey(detail.accessKey || '');
                setTokenStatus({ type: null, message: '' });

                const members = await trpcQuery('members.list', { companyId: selectedCompanyId });
                setCompanyMembers(Array.isArray(members) ? members : []);
            } catch (e: any) {
                console.error('Failed to load company detail:', e);
            }
        };
        loadDetail();
    }, [selectedCompanyId]);

    // Create company
    const handleCreateCompany = async () => {
        if (!newCompanyName.trim() || !userEmail) return;
        setIsCreating(true);
        try {
            const company = await trpcMutate('company.create', {
                name: newCompanyName.trim(),
                email: userEmail.toLowerCase(),
            });
            setStatusMsg(t('companyCreated'));
            setNewCompanyName('');
            setShowCreateForm(false);
            await loadCompanies();
            setSelectedCompanyId(company.id);
            setTimeout(() => setStatusMsg(null), 3000);
        } catch (e: any) {
            setStatusMsg(`Error: ${e.message}`);
        } finally {
            setIsCreating(false);
        }
    };

    // Save company settings
    const handleSaveCompanySettings = async () => {
        if (!selectedCompanyId) return;
        setIsSavingCompany(true);
        setCompanySaveMsg(null);
        try {
            await trpcMutate('company.update', {
                id: selectedCompanyId,
                facebookAccessToken: editToken,
                accessKey: editAccessKey,
            });
            setCompanySaveMsg({ type: 'success', message: t('companySaved') });
            setTimeout(() => setCompanySaveMsg(null), 3000);
        } catch (e: any) {
            setCompanySaveMsg({ type: 'error', message: e.message });
        } finally {
            setIsSavingCompany(false);
        }
    };

    // Validate token
    const handleValidateToken = async () => {
        if (!editToken) {
            setTokenStatus({ type: 'error', message: t('tokenRequired') });
            return;
        }
        setIsValidatingToken(true);
        setTokenStatus({ type: null, message: '' });
        try {
            const result = await trpcMutate('facebook.validateToken', { accessToken: editToken });
            setTokenStatus({ type: result.valid ? 'success' : 'error', message: result.message });
        } catch (e: any) {
            setTokenStatus({ type: 'error', message: e.message });
        } finally {
            setIsValidatingToken(false);
        }
    };

    // Parse catalogs from company
    const companyCatalogs: CatalogConfig[] = useMemo(() => {
        if (!companyDetail?.catalogs) return [];
        try {
            return JSON.parse(companyDetail.catalogs);
        } catch {
            return [];
        }
    }, [companyDetail?.catalogs]);

    // Add catalog to company
    const handleAddCatalog = async () => {
        const trimmedId = newCatalogId.trim();
        if (!trimmedId) { setCatalogError(t('catalogIdRequired')); return; }
        if (!editToken) { setCatalogError(t('tokenRequiredForCatalog')); return; }
        if (companyCatalogs.some(c => c.id === trimmedId)) { setCatalogError(t('catalogAlreadyExists')); return; }

        setIsAddingCatalog(true);
        setCatalogError(null);
        try {
            const nameResult = await trpcMutate('facebook.fetchCatalogName', { catalogId: trimmedId, accessToken: editToken });
            const newCatalog: CatalogConfig = { id: trimmedId, name: nameResult.name, addedAt: new Date().toISOString() };
            const updatedCatalogs = [...companyCatalogs, newCatalog];

            await trpcMutate('company.update', {
                id: selectedCompanyId!,
                catalogs: JSON.stringify(updatedCatalogs),
            });

            // Refresh detail
            setCompanyDetail(prev => prev ? { ...prev, catalogs: JSON.stringify(updatedCatalogs) } : prev);
            setNewCatalogId('');
        } catch (e: any) {
            setCatalogError(`${t('fetchCatalogFailed')}: ${e.message}`);
        } finally {
            setIsAddingCatalog(false);
        }
    };

    // Remove catalog from company
    const handleRemoveCatalog = async (catalogId: string) => {
        const updatedCatalogs = companyCatalogs.filter(c => c.id !== catalogId);
        try {
            await trpcMutate('company.update', {
                id: selectedCompanyId!,
                catalogs: JSON.stringify(updatedCatalogs),
            });
            setCompanyDetail(prev => prev ? { ...prev, catalogs: JSON.stringify(updatedCatalogs) } : prev);
        } catch (e: any) {
            setCatalogError(e.message);
        }
    };

    // Refresh catalog name
    const handleRefreshCatalogName = async (catalogId: string) => {
        if (!editToken) { setCatalogError(t('tokenRequiredForCatalog')); return; }
        setCatalogError(null);
        try {
            const nameResult = await trpcMutate('facebook.fetchCatalogName', { catalogId, accessToken: editToken });
            const updatedCatalogs = companyCatalogs.map(c => c.id === catalogId ? { ...c, name: nameResult.name } : c);
            await trpcMutate('company.update', {
                id: selectedCompanyId!,
                catalogs: JSON.stringify(updatedCatalogs),
            });
            setCompanyDetail(prev => prev ? { ...prev, catalogs: JSON.stringify(updatedCatalogs) } : prev);
        } catch (e: any) {
            setCatalogError(`${t('refreshFailed')}: ${e.message}`);
        }
    };

    const getCsvUrl = (catalogId: string) => `${window.location.origin}/api/export/csv/${catalogId}`;

    const handleCopyCsvUrl = (catalogId: string) => {
        navigator.clipboard.writeText(getCsvUrl(catalogId)).then(() => {
            setCopiedCsvUrl(catalogId);
            setTimeout(() => setCopiedCsvUrl(null), 2000);
        });
    };

    // Invite member
    const handleInviteMember = async () => {
        if (!inviteEmail.trim() || !selectedCompanyId) return;
        // Check if already a member
        if (companyMembers.some(m => m.email === inviteEmail.toLowerCase())) {
            setInviteMsg({ type: 'error', message: t('memberAlreadyExists') });
            return;
        }
        setIsInviting(true);
        setInviteMsg(null);
        try {
            await trpcMutate('members.invite', {
                companyId: selectedCompanyId,
                email: inviteEmail.trim(),
            });
            setInviteMsg({ type: 'success', message: t('inviteSuccess') });
            setInviteEmail('');
            // Refresh members
            const members = await trpcQuery('members.list', { companyId: selectedCompanyId });
            setCompanyMembers(Array.isArray(members) ? members : []);
            setTimeout(() => setInviteMsg(null), 3000);
        } catch (e: any) {
            setInviteMsg({ type: 'error', message: e.message });
        } finally {
            setIsInviting(false);
        }
    };

    // Remove member
    const handleRemoveMember = async (email: string) => {
        if (!selectedCompanyId) return;
        try {
            await trpcMutate('members.remove', { companyId: selectedCompanyId, email });
            setCompanyMembers(prev => prev.filter(m => m.email !== email));
        } catch (e: any) {
            console.error('Failed to remove member:', e);
        }
    };

    // ===== RENDER =====

    // Step 1: Enter email
    if (!emailSubmitted) {
        return (
            <div className="settings-manager">
                <h2>{t('companyManagement')}</h2>
                <p className="info-text">{t('enterEmailToStart')}</p>
                <div className="settings-section">
                    <div className="form-group">
                        <label htmlFor="userEmail">{t('yourEmail')}</label>
                        <div className="add-catalog-input-group">
                            <input
                                id="userEmail"
                                type="email"
                                value={userEmail}
                                onChange={(e) => setUserEmail(e.target.value)}
                                placeholder={t('yourEmailPlaceholder')}
                                onKeyDown={(e) => { if (e.key === 'Enter') loadCompanies(); }}
                            />
                            <button
                                onClick={loadCompanies}
                                disabled={!userEmail || isLoadingCompanies}
                                className="add-catalog-button"
                            >
                                {isLoadingCompanies ? <div className="loader-small"></div> : t('loadCompanies')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Step 2: Company list (no company selected)
    if (selectedCompanyId === null) {
        return (
            <div className="settings-manager">
                <h2>{t('companyManagement')}</h2>
                <p className="info-text">{t('companyManagementDesc')}</p>

                {/* User email display */}
                <div className="settings-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                    <span style={{ fontSize: '14px', color: '#666' }}>📧 {userEmail}</span>
                    <button
                        onClick={() => { setEmailSubmitted(false); setCompanies([]); }}
                        className="validate-token-button"
                        style={{ padding: '4px 12px', fontSize: '13px' }}
                    >
                        {t('switchAccount')}
                    </button>
                </div>

                {statusMsg && <p className="success-text" style={{ margin: '8px 0' }}>{statusMsg}</p>}

                {/* Company list */}
                <div className="settings-section">
                    <h3>{t('myCompanies')}</h3>
                    {companies.length === 0 ? (
                        <p className="info-text empty-catalogs">{t('noCompaniesYet')}</p>
                    ) : (
                        <div className="catalogs-list">
                            {companies.map(company => (
                                <div
                                    key={company.id}
                                    className="company-card"
                                    onClick={() => setSelectedCompanyId(company.id)}
                                    style={{
                                        padding: '16px',
                                        margin: '8px 0',
                                        borderRadius: '12px',
                                        border: '1px solid #e0e0e0',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        background: '#fafafa',
                                    }}
                                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f0f0f0'; (e.currentTarget as HTMLDivElement).style.borderColor = '#007aff'; }}
                                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#fafafa'; (e.currentTarget as HTMLDivElement).style.borderColor = '#e0e0e0'; }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <strong style={{ fontSize: '16px' }}>{company.name}</strong>
                                            <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>
                                                ID: {company.id} · {t('accessToken')}: {company.facebookAccessToken ? '✓' : '✕'}
                                            </div>
                                        </div>
                                        <span style={{ color: '#007aff', fontSize: '20px' }}>→</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Create company button/form */}
                    {!showCreateForm ? (
                        <button
                            onClick={() => setShowCreateForm(true)}
                            className="add-catalog-button"
                            style={{ marginTop: '12px', width: 'auto' }}
                        >
                            + {t('createCompany')}
                        </button>
                    ) : (
                        <div className="add-catalog-form" style={{ marginTop: '12px' }}>
                            <div className="form-group">
                                <label>{t('companyName')}</label>
                                <div className="add-catalog-input-group">
                                    <input
                                        type="text"
                                        value={newCompanyName}
                                        onChange={(e) => setNewCompanyName(e.target.value)}
                                        placeholder={t('companyNamePlaceholder')}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCompany(); }}
                                    />
                                    <button
                                        onClick={handleCreateCompany}
                                        disabled={!newCompanyName.trim() || isCreating}
                                        className="add-catalog-button"
                                    >
                                        {isCreating ? <div className="loader-small"></div> : t('createCompanyBtn')}
                                    </button>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowCreateForm(false)}
                                className="validate-token-button"
                                style={{ marginTop: '8px', padding: '4px 12px', fontSize: '13px' }}
                            >
                                {t('cancel')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Step 3: Company detail view
    return (
        <div className="settings-manager">
            {/* Back to company list */}
            <div style={{ marginBottom: '16px' }}>
                <button
                    onClick={() => { setSelectedCompanyId(null); setTokenStatus({ type: null, message: '' }); setCompanySaveMsg(null); setCatalogError(null); }}
                    className="back-nav-button"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                >
                    ← {t('myCompanies')}
                </button>
            </div>

            <h2>{companyDetail?.name || '...'}</h2>
            <p className="info-text">{t('companyManagementDesc')}</p>

            {companySaveMsg && (
                <p className={companySaveMsg.type === 'success' ? 'success-text' : 'error-text'} style={{ margin: '8px 0' }}>
                    {companySaveMsg.message}
                </p>
            )}

            {/* Facebook Access Token Section */}
            <div className="settings-section">
                <h3>{t('fbAccessToken')}</h3>
                <div className="form-group">
                    <label htmlFor="companyFbToken">{t('accessToken')}</label>
                    <div className="token-input-group">
                        <input
                            id="companyFbToken"
                            type={showEditToken ? 'text' : 'password'}
                            value={editToken}
                            onChange={(e) => { setEditToken(e.target.value); setTokenStatus({ type: null, message: '' }); }}
                            placeholder={t('enterAccessToken')}
                            className="token-input"
                        />
                        <button
                            onClick={() => setShowEditToken(!showEditToken)}
                            className="toggle-visibility-button"
                            title={showEditToken ? t('hideToken') : t('showToken')}
                        >
                            {showEditToken ? '🙈' : '👁️'}
                        </button>
                    </div>
                    <div className="token-actions">
                        <button onClick={handleSaveCompanySettings} disabled={isSavingCompany} className="save-token-button">
                            {isSavingCompany ? <div className="loader-small"></div> : t('saveCompanySettings')}
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

            {/* Access Key Section */}
            <div className="settings-section">
                <h3>{t('companyAccessKey')}</h3>
                <div className="form-group">
                    <input
                        type="text"
                        value={editAccessKey}
                        onChange={(e) => setEditAccessKey(e.target.value)}
                        placeholder={t('companyAccessKeyPlaceholder')}
                    />
                </div>
            </div>

            {/* Catalog Management Section */}
            <div className="settings-section">
                <h3>{t('catalogManagement')}</h3>
                <p className="info-text">{t('catalogManagementDesc')}</p>

                <div className="add-catalog-form">
                    <div className="form-group">
                        <label htmlFor="companyCatalogId">{t('addNewCatalog')}</label>
                        <div className="add-catalog-input-group">
                            <input
                                id="companyCatalogId"
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
                    {companyCatalogs.length === 0 ? (
                        <p className="info-text empty-catalogs">{t('noCatalogsConfigured')}</p>
                    ) : (
                        <table className="catalogs-table">
                            <thead>
                                <tr>
                                    <th>{t('catalogId')}</th>
                                    <th>{t('catalogName')}</th>
                                    <th>{t('catalogSupplementUrl')}</th>
                                    <th>{t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {companyCatalogs.map((catalog) => (
                                    <tr key={catalog.id}>
                                        <td><code>{catalog.id}</code></td>
                                        <td>{catalog.name}</td>
                                        <td className="csv-url-cell">
                                            <div className="csv-url-group">
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={getCsvUrl(catalog.id)}
                                                    className="csv-url-input"
                                                    onClick={(e) => (e.target as HTMLInputElement).select()}
                                                />
                                                <button
                                                    onClick={() => handleCopyCsvUrl(catalog.id)}
                                                    className="copy-csv-btn"
                                                    title={t('copyCatalogSupplementUrl')}
                                                >
                                                    {copiedCsvUrl === catalog.id ? '✓' : '📋'}
                                                </button>
                                            </div>
                                        </td>
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

            {/* Member Management Section */}
            <div className="settings-section">
                <h3>{t('memberManagement')}</h3>

                {/* Invite form */}
                <div className="add-catalog-form">
                    <div className="form-group">
                        <label>{t('inviteMember')}</label>
                        <div className="add-catalog-input-group">
                            <input
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => { setInviteEmail(e.target.value); setInviteMsg(null); }}
                                placeholder={t('memberEmailPlaceholder')}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleInviteMember(); }}
                            />
                            <button
                                onClick={handleInviteMember}
                                disabled={!inviteEmail.trim() || isInviting}
                                className="add-catalog-button"
                            >
                                {isInviting ? <div className="loader-small"></div> : t('invite')}
                            </button>
                        </div>
                        {inviteMsg && (
                            <p className={inviteMsg.type === 'success' ? 'success-text' : 'error-text'}>
                                {inviteMsg.message}
                            </p>
                        )}
                    </div>
                </div>

                {/* Members list */}
                <div className="catalogs-list">
                    {companyMembers.length === 0 ? (
                        <p className="info-text empty-catalogs">{t('noMembers')}</p>
                    ) : (
                        <table className="catalogs-table">
                            <thead>
                                <tr>
                                    <th>Email</th>
                                    <th>{t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {companyMembers.map((member) => (
                                    <tr key={member.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span>{member.email}</span>
                                                <span style={{
                                                    fontSize: '11px',
                                                    padding: '2px 8px',
                                                    borderRadius: '10px',
                                                    background: member.memberRole === 'owner' ? '#007aff' : '#e0e0e0',
                                                    color: member.memberRole === 'owner' ? '#fff' : '#666',
                                                }}>
                                                    {member.memberRole === 'owner' ? t('owner') : t('member')}
                                                </span>
                                                <span style={{
                                                    fontSize: '11px',
                                                    padding: '2px 8px',
                                                    borderRadius: '10px',
                                                    background: member.status === 'active' ? '#34c759' : '#ff9500',
                                                    color: '#fff',
                                                }}>
                                                    {member.status === 'active' ? t('active') : t('pending')}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="catalog-actions">
                                            {member.memberRole !== 'owner' && (
                                                <button
                                                    onClick={() => handleRemoveMember(member.email)}
                                                    className="remove-catalog-button"
                                                    title={t('removeMember')}
                                                >
                                                    ✕
                                                </button>
                                            )}
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
    companyId: number | null;
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

const VideoLog = ({ t, companies }: { t: (key: string) => string; companies: CompanyData[] }) => {
    const [records, setRecords] = useState<UploadRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [companyFilter, setCompanyFilter] = useState<string>('all');
    const [catalogFilter, setCatalogFilter] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    
    // Image preview
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    
    // Delete confirmation
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // Available catalogs from settings
    const [catalogs, setCatalogs] = useState<CatalogConfig[]>([]);

    // Excel Import
    const [showImportModal, setShowImportModal] = useState(false);
    const [importData, setImportData] = useState<Array<{
        catalogId: string;
        retailerId: string;
        videoUrl: string;
        videoType: '4x5' | '9x16';
        productName: string;
    }>>([]);
    const [importError, setImportError] = useState<string | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importSuccess, setImportSuccess] = useState<string | null>(null);
    const importFileRef = React.useRef<HTMLInputElement>(null);

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

    // Load catalogs from companies (merge all company catalogs)
    useEffect(() => {
        const allCatalogs: CatalogConfig[] = [];
        for (const company of companies) {
            try {
                const parsed = JSON.parse(company.catalogs || '[]');
                if (Array.isArray(parsed)) {
                    allCatalogs.push(...parsed);
                }
            } catch { /* ignore parse errors */ }
        }
        // Deduplicate by catalog id
        const uniqueMap = new Map<string, CatalogConfig>();
        for (const cat of allCatalogs) {
            if (!uniqueMap.has(cat.id)) uniqueMap.set(cat.id, cat);
        }
        setCatalogs(Array.from(uniqueMap.values()));
        fetchRecords();
    }, [fetchRecords, companies]);

    // Delete a record — calls FB Catalog Batch API first, then ALWAYS deletes from DB
    const handleDeleteVideo = async (id: number) => {
        setIsDeleting(true);
        setDeleteError(null);
        try {
            // Find the record to get its companyId
            const record = records.find(r => r.id === id);
            const companyId = record?.companyId || undefined;

            const response = await fetch('/api/trpc/uploads.deleteVideoFromCatalog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ json: { id, companyId } }),
            });
            const data = await response.json();
            
            // Check for errors in tRPC response
            if (data?.error) {
                const errorMsg = data.error?.json?.message || data.error?.message || 'Unknown error';
                throw new Error(errorMsg);
            }

            // Show warning if Facebook API failed but DB record was still deleted
            const result = data?.result?.data?.json;
            if (result?.warning) {
                setDeleteError(result.warning);
            }
            
            setRecords(prev => prev.filter(r => r.id !== id));
            setDeleteConfirmId(null);
        } catch (e: any) {
            setDeleteError(e.message || 'Failed to delete video');
        } finally {
            setIsDeleting(false);
        }
    };

    // Helper: get company name by id
    const getCompanyName = useCallback((companyId: number | null) => {
        if (!companyId) return '—';
        const company = companies.find(c => c.id === companyId);
        return company?.name || `Company #${companyId}`;
    }, [companies]);

    // Filtered records
    const filteredRecords = useMemo(() => {
        let result = [...records];

        // Filter by company
        if (companyFilter !== 'all') {
            const cid = parseInt(companyFilter, 10);
            result = result.filter(r => r.companyId === cid);
        }

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
    }, [records, companyFilter, catalogFilter, dateFrom, dateTo, searchTerm]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / RECORDS_PER_PAGE));
    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * RECORDS_PER_PAGE;
        return filteredRecords.slice(start, start + RECORDS_PER_PAGE);
    }, [filteredRecords, currentPage]);

    // Reset page when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, companyFilter, catalogFilter, dateFrom, dateTo]);

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
            'Company': getCompanyName(r.companyId),
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

    // ==================== Excel Import Handlers ====================
    const handleExcelFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportError(null);
        setImportSuccess(null);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: '' });

                if (jsonData.length === 0) {
                    setImportError(t('excelImportNoData'));
                    return;
                }

                // Try to find columns by various names
                const headers = Object.keys(jsonData[0]);
                const findCol = (candidates: string[]) => {
                    for (const c of candidates) {
                        const found = headers.find(h => h.toLowerCase().trim() === c.toLowerCase());
                        if (found) return found;
                    }
                    // Partial match
                    for (const c of candidates) {
                        const found = headers.find(h => h.toLowerCase().includes(c.toLowerCase()));
                        if (found) return found;
                    }
                    return null;
                };

                const catalogCol = findCol(['catalog id', 'catalogid', 'catalog_id', '\u76ee\u9304 id', '\u76ee\u9304id', '\u76ee\u9304']);
                const retailerCol = findCol(['retailer id', 'retailerid', 'retailer_id', '\u96f6\u552e\u5546 id', '\u96f6\u552e\u5546id', '\u96f6\u552e\u5546']);
                const videoCol = findCol(['video url', 'videourl', 'video_url', '\u5f71\u7247\u7db2\u5740', '\u5f71\u7247\u9023\u7d50', '\u5f71\u7247', 'url']);
                const videoTypeCol = findCol(['video type', 'videotype', 'video_type', '\u5f71\u7247\u985e\u578b', '\u6bd4\u4f8b', 'type', 'ratio']);
                const productNameCol = findCol(['product name', 'productname', 'product_name', '\u5546\u54c1\u540d\u7a31', '\u540d\u7a31', 'name']);

                if (!catalogCol || !retailerCol || !videoCol) {
                    setImportError(
                        `${t('excelImportMissingColumns')}\n` +
                        `Found columns: ${headers.join(', ')}\n` +
                        `Catalog ID column: ${catalogCol || 'NOT FOUND'}\n` +
                        `Retailer ID column: ${retailerCol || 'NOT FOUND'}\n` +
                        `Video URL column: ${videoCol || 'NOT FOUND'}`
                    );
                    return;
                }

                const parsed = jsonData
                    .map(row => {
                        const catalogId = String(row[catalogCol] || '').trim();
                        const retailerId = String(row[retailerCol] || '').trim();
                        const videoUrl = String(row[videoCol] || '').trim();
                        const rawType = videoTypeCol ? String(row[videoTypeCol] || '').trim().toLowerCase() : '';
                        const videoType: '4x5' | '9x16' = (rawType.includes('9x16') || rawType.includes('9:16') || rawType === '9x16') ? '9x16' : '4x5';
                        const productName = productNameCol ? String(row[productNameCol] || '').trim() : retailerId;
                        return { catalogId, retailerId, videoUrl, videoType, productName };
                    })
                    .filter(r => r.catalogId && r.retailerId && r.videoUrl);

                if (parsed.length === 0) {
                    setImportError(t('excelImportNoData'));
                    return;
                }

                setImportData(parsed);
                setShowImportModal(true);
            } catch (err: any) {
                setImportError(t('excelImportError').replace('{error}', err.message));
            }
        };
        reader.readAsArrayBuffer(file);
        // Reset input so same file can be re-selected
        e.target.value = '';
    };

    const handleImportConfirm = async () => {
        if (importData.length === 0) return;
        setIsImporting(true);
        setImportError(null);
        setImportSuccess(null);

        try {
            // Build records for batch insert
            const batchRecords = importData.map(row => ({
                catalogId: row.catalogId,
                retailerId: row.retailerId,
                productName: row.productName || row.retailerId,
                clientName: 'Excel Import',
                uploadedBy: 'excel_import',
                ...(row.videoType === '9x16'
                    ? { video9x16Download: row.videoUrl, video9x16Embed: row.videoUrl }
                    : { video4x5Download: row.videoUrl, video4x5Embed: row.videoUrl }
                ),
            }));

            // Send in batches of 100
            const BATCH_SIZE = 100;
            for (let i = 0; i < batchRecords.length; i += BATCH_SIZE) {
                const batch = batchRecords.slice(i, i + BATCH_SIZE);
                await trpcMutate('uploads.createBatch', batch);
            }

            setImportSuccess(t('excelImportSuccess').replace('{count}', String(importData.length)));
            setShowImportModal(false);
            setImportData([]);
            fetchRecords(); // Refresh the list
        } catch (err: any) {
            setImportError(t('excelImportError').replace('{error}', err.message));
        } finally {
            setIsImporting(false);
        }
    };

    const handleImportCancel = () => {
        setShowImportModal(false);
        setImportData([]);
        setImportError(null);
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
                <div className="image-modal-backdrop" onClick={() => { if (!isDeleting) setDeleteConfirmId(null); }}>
                    <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
                        <h3>{t('deleteVideoTitle') || 'Delete Video from Catalog'}</h3>
                        <p>{t('deleteVideoMessage') || 'This will remove the video from the Facebook Catalog (via Batch API with UPDATE method and empty video array), then delete the record from the database.'}</p>
                        {deleteError && (
                            <p className="error-text" style={{ marginTop: '8px' }}>{deleteError}</p>
                        )}
                        <div className="delete-confirm-actions">
                            <button
                                className="cancel-delete-btn"
                                onClick={() => { setDeleteConfirmId(null); setDeleteError(null); }}
                                disabled={isDeleting}
                            >
                                {t('cancel')}
                            </button>
                            <button
                                className="confirm-delete-btn"
                                onClick={() => handleDeleteVideo(deleteConfirmId)}
                                disabled={isDeleting}
                            >
                                {isDeleting ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div className="loader-small"></div>
                                        {t('deletingVideo') || 'Deleting...'}
                                    </span>
                                ) : (
                                    t('deleteRecord') || 'Delete'
                                )}
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
                    {companies.length > 0 && (
                        <div className="log-filter-item">
                            <label>{t('company') || 'Company'}</label>
                            <select
                                value={companyFilter}
                                onChange={e => setCompanyFilter(e.target.value)}
                            >
                                <option value="all">{t('showAll')}</option>
                                {companies.map(c => (
                                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
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
                            className="log-action-btn log-import-btn"
                            onClick={() => importFileRef.current?.click()}
                            style={{ backgroundColor: '#10b981', color: '#fff' }}
                        >
                            ↑ {t('excelImportBtn') || 'Import Excel'}
                        </button>
                        <input
                            ref={importFileRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            style={{ display: 'none' }}
                            onChange={handleExcelFileSelect}
                        />
                        <button
                            className="log-action-btn log-clear-btn"
                            onClick={() => { setSearchTerm(''); setCompanyFilter('all'); setCatalogFilter('all'); setDateFrom(''); setDateTo(''); }}
                        >
                            ✕ {t('clearFilters') || 'Clear'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Import Success Message */}
            {importSuccess && (
                <div style={{ margin: '12px 0', padding: '12px 16px', backgroundColor: '#d1fae5', color: '#065f46', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{importSuccess}</span>
                    <button onClick={() => setImportSuccess(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#065f46' }}>✕</button>
                </div>
            )}

            {/* Import Error Message */}
            {importError && !showImportModal && (
                <div style={{ margin: '12px 0', padding: '12px 16px', backgroundColor: '#fee2e2', color: '#991b1b', borderRadius: '8px', whiteSpace: 'pre-line', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <span>{importError}</span>
                    <button onClick={() => setImportError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#991b1b', flexShrink: 0 }}>✕</button>
                </div>
            )}

            {/* Excel Import Preview Modal */}
            {showImportModal && (
                <div className="image-modal-backdrop" onClick={() => { if (!isImporting) handleImportCancel(); }}>
                    <div className="delete-confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', maxHeight: '80vh', overflow: 'auto' }}>
                        <h3>{t('excelImportPreview') || 'Preview Import Data'}</h3>
                        <p style={{ color: '#6b7280', marginBottom: '12px' }}>
                            {t('excelImportRowCount')?.replace('{count}', String(importData.length)) || `${importData.length} rows to import`}
                        </p>
                        {importError && (
                            <p className="error-text" style={{ marginBottom: '12px', whiteSpace: 'pre-line' }}>{importError}</p>
                        )}
                        <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                            <table className="log-table" style={{ fontSize: '13px' }}>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>{t('catalogId') || 'Catalog ID'}</th>
                                        <th>{t('retailerId') || 'Retailer ID'}</th>
                                        <th>{t('name') || 'Name'}</th>
                                        <th>{t('excelImportVideoUrl') || 'Video URL'}</th>
                                        <th>{t('excelImportVideoType') || 'Type'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {importData.slice(0, 50).map((row, i) => (
                                        <tr key={i}>
                                            <td>{i + 1}</td>
                                            <td><code style={{ fontSize: '11px' }}>{row.catalogId}</code></td>
                                            <td><code style={{ fontSize: '11px' }}>{row.retailerId}</code></td>
                                            <td style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.productName}</td>
                                            <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                <a href={row.videoUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px' }}>{row.videoUrl}</a>
                                            </td>
                                            <td>{row.videoType}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {importData.length > 50 && (
                                <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '8px', textAlign: 'center' }}>
                                    ... and {importData.length - 50} more rows
                                </p>
                            )}
                        </div>
                        <div className="delete-confirm-actions">
                            <button
                                className="cancel-delete-btn"
                                onClick={handleImportCancel}
                                disabled={isImporting}
                            >
                                {t('excelImportCancel') || 'Cancel'}
                            </button>
                            <button
                                className="confirm-delete-btn"
                                onClick={handleImportConfirm}
                                disabled={isImporting}
                                style={{ backgroundColor: '#10b981' }}
                            >
                                {isImporting ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div className="loader-small"></div>
                                        {t('excelImportImporting') || 'Importing...'}
                                    </span>
                                ) : (
                                    `${t('excelImportConfirm') || 'Confirm Import'} (${importData.length})`
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                        <th className="col-company">{t('company') || 'Company'}</th>
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
                                            <td className="col-company">
                                                <span className="log-company-name">{getCompanyName(record.companyId)}</span>
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
    const [activeTab, setActiveTab] = useState<'log' | 'company'>('log');
    const { t } = useContext(LanguageContext);
    const [companies, setCompanies] = useState<CompanyData[]>([]);

    // Load all companies for the current user
    useEffect(() => {
        const email = localStorage.getItem('cpv_user_email');
        if (email) {
            trpcQuery('company.getByEmail', { email: email.toLowerCase() })
                .then(result => setCompanies(Array.isArray(result) ? result : []))
                .catch(() => setCompanies([]));
        }
    }, []);

    return (
        <main className="container data-view">
            <div className="card admin-panel">
                <header className="admin-header">
                    <div className="admin-header-left">
                        <h1>{t('adminPanel')}</h1>
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
                        className={`admin-tab ${activeTab === 'company' ? 'active' : ''}`}
                        onClick={() => setActiveTab('company')}
                    >
                        🏢 {t('companyManagement')}
                    </button>

                </div>
                
                {/* Log Tab */}
                {activeTab === 'log' && (
                    <VideoLog t={t} companies={companies} />
                )}

                {/* Company Management Tab */}
                {activeTab === 'company' && (
                    <CompanyManager t={t} />
                )}


            </div>
            <AppFooter />
        </main>
    );
};
