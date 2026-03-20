
import React, { useState, useRef, useEffect, useContext } from 'react';
import { getDriveFolderId } from '@/lib/google';
import { LanguageContext } from '@/contexts/LanguageContext';
import type { UploadedVideo, VideoType } from '@/types';

declare const gapi: any;

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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { t } = useContext(LanguageContext);
    
    const handleSuccess = (videoData: Omit<UploadedVideo, 'saveError' | 'productName' | 'isProcessing' | 'uploadTimestamp'>) => {
        onUploadSuccess(videoData);
        if (isReupload) { // Only auto-hide for individual row re-uploads
          setShowUploader(false);
        }
    };

    const uploadFile = async (file: File) => {
        if (!file || !accessToken) return;

        // Reset states for new upload
        setWarning(null);
        setError(null);
        
        if (!file.type.startsWith('video/')) {
            setError("Invalid file type. Please upload a video file.");
            return;
        }

        if (file.size > 100 * 1024 * 1024) { // 100MB limit
            setError("File size cannot exceed 100MB.");
            return;
        }
        
        setUploading(true);
        setProgress(0);

        try {
            gapi.client.setToken({ access_token: accessToken });
            const folderId = await getDriveFolderId();
            
            const lastDotIndex = file.name.lastIndexOf('.');
            const fileNameWithoutExtension = lastDotIndex !== -1 ? file.name.slice(0, lastDotIndex) : file.name;
            const fileExtension = lastDotIndex !== -1 ? file.name.slice(lastDotIndex) : '.mp4';

            const sanitizedRetailerId = retailerId.replace(/[^a-zA-Z0-9-_\.]/g, '_');
            const sanitizedCatalogId = catalogId.replace(/[^a-zA-Z0-9-_\.]/g, '_');
            
            const fileName = `${fileNameWithoutExtension}-${sanitizedCatalogId}-${sanitizedRetailerId}${fileExtension}`;

            const metadata = { name: fileName, mimeType: file.type, parents: [folderId] };

            const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable`, {
                method: 'POST',
                headers: new Headers({
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                }),
                body: JSON.stringify(metadata)
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData?.error?.message || `Failed to initiate upload session: ${res.statusText}`);
            }
            
            const location = res.headers.get('Location');
            if (!location) {
                throw new Error('Could not get resumable upload URL.');
            }

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
                        const message = permissionError.result?.error?.message || permissionError.message || "An error occurred while setting file permissions.";
                        setError(message);
                        setUploading(false);
                    }
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
                 setError("An error occurred during the upload. Please try again.");
                 setUploading(false);
            };

            xhr.open('PUT', location, true);
            xhr.setRequestHeader('Content-Type', file.type);
            xhr.send(file);
        } catch (e: any) {
            const message = e.message || "An unknown error occurred during the upload process.";
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
            {error && <p className="error-text-small">{error}</p>}
        </div>
    );
};
