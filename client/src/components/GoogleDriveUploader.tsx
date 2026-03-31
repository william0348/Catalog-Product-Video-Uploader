
import React, { useState, useRef, useEffect, useContext } from 'react';
import { getDriveFolderId } from '@/lib/google';
import { LanguageContext } from '@/contexts/LanguageContext';
import { useGoogleAuth } from '@/contexts/GoogleAuthContext';
import type { UploadedVideo, VideoType } from '@/types';

declare const gapi: any;

/**
 * Detects if an error is related to Google Drive permission/scope issues.
 * Returns true if the user likely didn't grant Drive access during login.
 */
const isDrivePermissionError = (error: any, statusCode?: number): boolean => {
    if (statusCode === 403 || statusCode === 401) return true;
    
    const msg = (error?.message || error?.result?.error?.message || String(error)).toLowerCase();
    return (
        msg.includes('insufficient permission') ||
        msg.includes('access not configured') ||
        msg.includes('forbidden') ||
        msg.includes('the user has not granted') ||
        msg.includes('request had insufficient authentication scopes') ||
        msg.includes('login required') ||
        msg.includes('invalid credentials')
    );
};

export const GoogleDriveUploader = ({
    clientName,
    catalogId,
    retailerId,
    accessToken,
    isReupload,
    onUploadSuccess,
    videoType,
    onLoginRequest,
}: {
    clientName: string;
    catalogId: string;
    retailerId: string;
    accessToken: string | null;
    isReupload: boolean;
    onUploadSuccess: (video: Omit<UploadedVideo, 'saveError' | 'productName' | 'isProcessing' | 'uploadTimestamp'>) => void;
    videoType: VideoType;
    onLoginRequest: () => void;
}) => {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string|null>(null);
    const [warning, setWarning] = useState<string|null>(null);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [showUploader, setShowUploader] = useState(!isReupload);
    const [isPermissionError, setIsPermissionError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { t } = useContext(LanguageContext);
    const { handleReauthorize: contextReauthorize } = useGoogleAuth();
    
    const handleSuccess = (videoData: Omit<UploadedVideo, 'saveError' | 'productName' | 'isProcessing' | 'uploadTimestamp'>) => {
        onUploadSuccess(videoData);
        if (isReupload) {
          setShowUploader(false);
        }
    };

    const handlePermissionError = () => {
        setIsPermissionError(true);
        setError(t('drivePermissionError'));
        setUploading(false);
    };

    const handleReauthorize = () => {
        // Clear current token and states
        setError(null);
        setIsPermissionError(false);
        // Revoke current token and re-request with all scopes (forces consent screen)
        contextReauthorize();
    };

    const uploadFile = async (file: File) => {
        if (!file || !accessToken) return;

        // Reset states for new upload
        setWarning(null);
        setError(null);
        setIsPermissionError(false);
        
        if (!file.type.startsWith('video/')) {
            setError(t('invalidFileType') || "Invalid file type. Please upload a video file.");
            return;
        }

        if (file.size > 100 * 1024 * 1024) {
            setError(t('fileTooLarge') || "File size cannot exceed 100MB.");
            return;
        }
        
        setUploading(true);
        setProgress(0);

        try {
            gapi.client.setToken({ access_token: accessToken });
            
            // Step 1: Try to get/create the Drive folder - this is where permission errors usually surface
            let folderId: string;
            try {
                folderId = await getDriveFolderId();
            } catch (folderError: any) {
                if (isDrivePermissionError(folderError)) {
                    handlePermissionError();
                    return;
                }
                throw folderError;
            }
            
            const lastDotIndex = file.name.lastIndexOf('.');
            const fileExtension = lastDotIndex !== -1 ? file.name.slice(lastDotIndex) : '.mp4';

            const sanitizedRetailerId = retailerId.replace(/[^a-zA-Z0-9-_\.]/g, '_');
            const sanitizedCatalogId = catalogId.replace(/[^a-zA-Z0-9-_\.]/g, '_');
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            
            const fileName = `${sanitizedCatalogId}_${sanitizedRetailerId}_${dateStr}${fileExtension}`;

            const metadata = { name: fileName, mimeType: file.type, parents: [folderId] };

            // Step 2: Initiate resumable upload session
            const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`, {
                method: 'POST',
                headers: new Headers({
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                }),
                body: JSON.stringify(metadata)
            });

            if (!res.ok) {
                if (res.status === 403 || res.status === 401) {
                    handlePermissionError();
                    return;
                }
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || `Failed to initiate upload session: ${res.statusText}`);
            }
            
            const location = res.headers.get('Location');
            if (!location) {
                throw new Error('Could not get resumable upload URL.');
            }

            // Step 3: Upload the file
            const xhr = new XMLHttpRequest();
            
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percentage = Math.round((e.loaded / e.total) * 100);
                    setProgress(percentage);
                }
            };

            xhr.onload = async () => {
                if (xhr.status === 200 || xhr.status === 201) {
                    setProgress(100);
                    const uploadedFile = JSON.parse(xhr.responseText);
                    try {
                        await gapi.client.drive.permissions.create({ fileId: uploadedFile.id, resource: { role: 'reader', type: 'anyone' } });
                        const downloadLink = `https://drive.google.com/uc?export=download&id=${uploadedFile.id}`;
                        const embedLink = `https://drive.google.com/file/d/${uploadedFile.id}/preview`;
                        handleSuccess({ downloadLink, embedLink });
                    } catch(permissionError: any) {
                        if (isDrivePermissionError(permissionError)) {
                            handlePermissionError();
                            return;
                        }
                        const message = permissionError.result?.error?.message || permissionError.message || "An error occurred while setting file permissions.";
                        setError(message);
                        setUploading(false);
                    }
                } else if (xhr.status === 403 || xhr.status === 401) {
                    handlePermissionError();
                } else {
                    setUploading(false);
                    try {
                        const errorResponse = JSON.parse(xhr.responseText);
                        setError(errorResponse.error.message || `Upload failed with status: ${xhr.status}`);
                    } catch (e) {
                        setError(`Upload failed with status: ${xhr.status}`);
                    }
                }
            };
            
            xhr.onerror = () => {
                 setError(t('uploadNetworkError') || "An error occurred during the upload. Please try again.");
                 setUploading(false);
            };

            xhr.open('PUT', location, true);
            xhr.setRequestHeader('Content-Type', file.type);
            xhr.send(file);
        } catch (e: any) {
            if (isDrivePermissionError(e)) {
                handlePermissionError();
                return;
            }
            const message = e.message || t('unknownUploadError') || "An unknown error occurred during the upload process.";
            setError(message);
            setUploading(false);
        }
    };
    
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) uploadFile(file);
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
        if (uploading) return;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            uploadFile(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!uploading) setIsDraggingOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOver(false);
    };

    const handleContainerClick = () => {
        if (!accessToken) {
            onLoginRequest();
        }
    };

    const isDisabled = uploading || !accessToken;
    
    useEffect(() => {
        if (isReupload) {
            setShowUploader(false);
        }
    }, [isReupload]);


    if (!showUploader) {
        return (
            <button onClick={() => setShowUploader(true)} className="re-upload-button" disabled={!accessToken}>
                {accessToken ? t('reupload') : t('loginToReupload')}
            </button>
        );
    }

    return (
        <div
            className={`upload-container ${isDraggingOver ? 'dragging-over' : ''} ${!accessToken ? 'login-prompt' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleContainerClick}
        >
            <input type="file" accept="video/*" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileChange} disabled={isDisabled} />

            {uploading ? (
                <div className="progress-container">
                    <progress value={progress} max="100" className="upload-progress"></progress>
                    <span className="progress-text">{progress}%</span>
                </div>
            ) : (
                <>
                    <div className="upload-instructions">
                        <p>{accessToken ? (isReupload ? t('chooseNewVideo') : t('dragDrop')) : t('loginToUpload')}</p>
                    </div>
                    <div className="upload-buttons-group">
                         <button 
                             onClick={handleUploadClick} 
                             disabled={isDisabled} 
                             className="upload-button-computer"
                         >
                             {isReupload ? t('fromComputer') : t('uploadFromComputer')}
                         </button>
                    </div>
                     {isReupload && (
                        <button onClick={() => setShowUploader(false)} className="cancel-upload-button">
                            {t('cancel')}
                        </button>
                    )}
                </>
            )}

            {warning && <p className="warning-text-small">{warning}</p>}
            
            {/* Permission error with re-authorize button */}
            {isPermissionError && error && (
                <div className="permission-error-container">
                    <p className="error-text-small" style={{ marginBottom: '4px' }}>{error}</p>
                    <p className="permission-hint-text">{t('drivePermissionHint')}</p>
                    <button 
                        onClick={handleReauthorize} 
                        className="reauthorize-button"
                    >
                        🔄 {t('reauthorizeGoogleDrive')}
                    </button>
                </div>
            )}
            
            {/* Regular error (non-permission) */}
            {!isPermissionError && error && <p className="error-text-small">{error}</p>}
        </div>
    );
};
