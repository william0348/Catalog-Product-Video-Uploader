
import React, { useState, useEffect, useContext } from 'react';
import { LanguageContext } from '@/contexts/LanguageContext';

declare const gapi: any;

const STORAGE_CACHE_KEY = 'google_drive_storage_quota';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface StorageQuota {
    limit: number;
    usage: number;
    usageInDrive: number;
    usageInDriveTrash: number;
}

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const DriveStorageIndicator = ({ accessToken }: { accessToken: string | null }) => {
    const [quota, setQuota] = useState<StorageQuota | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const { t } = useContext(LanguageContext);

    useEffect(() => {
        if (!accessToken) {
            setQuota(null);
            return;
        }

        const cached = sessionStorage.getItem(STORAGE_CACHE_KEY);
        if (cached) {
            try {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_TTL_MS) {
                    setQuota(data);
                    return;
                }
            } catch {}
        }

        const fetchQuota = async () => {
            setLoading(true);
            setError(false);
            try {
                const res = await fetch(
                    'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                if (!res.ok) {
                    setError(true);
                    return;
                }
                const data = await res.json();
                const sq = data.storageQuota;
                const parsed: StorageQuota = {
                    limit: parseInt(sq.limit || '0', 10),
                    usage: parseInt(sq.usage || '0', 10),
                    usageInDrive: parseInt(sq.usageInDrive || '0', 10),
                    usageInDriveTrash: parseInt(sq.usageInDriveTrash || '0', 10),
                };
                setQuota(parsed);
                sessionStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify({ data: parsed, timestamp: Date.now() }));
            } catch {
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        fetchQuota();
    }, [accessToken]);

    if (!accessToken) return null;

    if (loading) {
        return (
            <div className="drive-storage-indicator">
                <span className="drive-storage-text">{t('driveStorageLoading')}</span>
            </div>
        );
    }

    if (error || !quota) {
        if (error) {
            return (
                <div className="drive-storage-indicator">
                    <span className="drive-storage-text drive-storage-error">{t('driveStorageError')}</span>
                </div>
            );
        }
        return null;
    }

    const isUnlimited = quota.limit === 0;
    const percentage = isUnlimited ? 0 : Math.min((quota.usage / quota.limit) * 100, 100);
    const colorClass = percentage >= 90 ? 'drive-storage-red' : percentage >= 70 ? 'drive-storage-yellow' : 'drive-storage-green';

    const usedStr = formatBytes(quota.usage);
    const totalStr = isUnlimited ? t('driveStorageUnlimited') : formatBytes(quota.limit);
    const label = t('driveStorageUsed').replace('{used}', usedStr).replace('{total}', totalStr);

    return (
        <div className="drive-storage-indicator" title={label}>
            <div className="drive-storage-bar-container">
                <div className={`drive-storage-bar-fill ${colorClass}`} style={{ width: `${isUnlimited ? 0 : percentage}%` }} />
            </div>
            <span className={`drive-storage-text ${percentage >= 90 ? 'drive-storage-text-red' : ''}`}>
                {label}
            </span>
        </div>
    );
};
