
import React, { useContext, useState, useCallback } from 'react';
import { GoogleDriveUploader } from '@/components/GoogleDriveUploader';
import type { Product, HoveredImage, ProductVideos, UploadedVideo, VideoType } from '@/types';
import { LanguageContext } from '@/contexts/LanguageContext';

/**
 * VideoPreview component - handles Google Drive video preview with fallback
 * Google Drive embed iframes can fail to load, so we provide:
 * 1. First try: iframe embed (Google Drive preview)
 * 2. On error: show a clickable play button that opens the video in a new tab
 */
const VideoPreview = ({ video, width, height, title }: { 
  video: UploadedVideo; 
  width: number; 
  height: number; 
  title: string;
}) => {
  const [iframeError, setIframeError] = useState(false);
  const downloadUrl = video.downloadLink || video.embedLink;
  const embedUrl = video.embedLink;

  const handleIframeError = useCallback(() => {
    setIframeError(true);
  }, []);

  if (iframeError || !embedUrl) {
    // Fallback: show a clickable play button that opens the video
    return (
      <a 
        href={downloadUrl} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="video-preview-fallback"
        title={`Open ${title}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: `${width}px`,
          height: `${height}px`,
          backgroundColor: '#f0f0f0',
          borderRadius: '6px',
          textDecoration: 'none',
          color: '#4285f4',
          border: '1px solid #ddd',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: '28px' }}>▶</span>
        <span style={{ fontSize: '10px', marginTop: '4px', color: '#666' }}>Click to play</span>
      </a>
    );
  }

  return (
    <iframe 
      src={embedUrl} 
      width={width} 
      height={height} 
      allow="encrypted-media" 
      allowFullScreen 
      title={title}
      onError={handleIframeError}
      style={{ border: 'none', borderRadius: '6px' }}
    />
  );
};

export const ProductTable = ({
  products,
  catalogId,
  clientName,
  isLoading,
  loadingProgress,
  accessToken,
  currentUserEmail,
  onImageHover,
  uploadedVideos,
  onUploadSuccess,
  onRetrySave,
  onLoginRequest,
  selectedRetailerIds,
  onSelectionChange,
  onSelectAll,
  isAllSelected,
}: {
  products: Product[];
  catalogId: string;
  clientName: string;
  isLoading: boolean;
  loadingProgress: { loaded: number; total: number | null } | null;
  accessToken: string | null;
  currentUserEmail: string | null;
  onImageHover: (image: HoveredImage | null) => void;
  uploadedVideos: Record<string, ProductVideos>;
  onUploadSuccess: (product: Product, video: Omit<UploadedVideo, 'saveError' | 'productName' | 'isProcessing' | 'uploadTimestamp'>, videoType: VideoType) => void;
  onRetrySave: (product: Product, video: UploadedVideo, videoType: VideoType) => void;
  onLoginRequest: () => void;
  selectedRetailerIds: Set<string>;
  onSelectionChange: (retailerId: string, isSelected: boolean) => void;
  onSelectAll: (isSelected: boolean) => void;
  isAllSelected: boolean;
}) => {
  const { t } = useContext(LanguageContext);
  if (isLoading) {
    return (
        <div className="loading-container">
            <div className="loader"></div>
            {loadingProgress && (
                <p className="loading-progress-text">
                    {t('loadingProducts')} {loadingProgress.loaded}
                    {loadingProgress.total ? ` ${t('of')} ${loadingProgress.total}` : ''}
                </p>
            )}
        </div>
    );
  }

  if (products.length === 0) {
    return <p className="info-text">{t('noProducts')}</p>;
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>
                <input
                    type="checkbox"
                    onChange={(e) => onSelectAll(e.target.checked)}
                    checked={isAllSelected}
                    title={isAllSelected ? "Deselect all visible products" : "Select all visible products"}
                />
            </th>
            <th>{t('image')}</th>
            <th>{t('name')}</th>
            <th>{t('availability')}</th>
            <th>{t('retailerId')}</th>
            <th>{t('masterVideo')}</th>
            <th>{t('otherVideo')}</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const productVideos = uploadedVideos[product.retailer_id] || {};
            const masterVideo = productVideos.master;
            const nineBySixteenVideo = productVideos.nineBySixteen;
            const isSelected = selectedRetailerIds.has(product.retailer_id);

            return (
              <tr key={product.id} className={isSelected ? 'selected' : ''}>
                <td>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => onSelectionChange(product.retailer_id, e.target.checked)}
                    />
                </td>
                <td>
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="product-image"
                    loading="lazy"
                    onMouseEnter={(e) => onImageHover({ src: product.image_url, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => onImageHover(null)}
                    onMouseMove={(e) => onImageHover({ src: product.image_url, x: e.clientX, y: e.clientY })}
                  />
                </td>
                <td data-label={t('name')}>{product.name}</td>
                <td data-label={t('availability')}>
                  <span className={`availability ${product.availability.replace(/\s+/g, "-")}`}>
                    {product.availability}
                  </span>
                </td>
                <td data-label={t('retailerId')}>{product.retailer_id}</td>
                <td data-label={t('masterVideo')}>
                    {masterVideo && (
                      <div className="video-actions-container">
                          {masterVideo.isProcessing ? (
                              <div className="video-processing-container">
                                  <div className="loader-small"></div>
                                  <p>Upload completed ✓</p>
                                  <p className="info-text-small">Processing preview...</p>
                                  <a 
                                    href={masterVideo.downloadLink || masterVideo.embedLink} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="info-text-small"
                                    style={{ color: '#4285f4', textDecoration: 'underline', cursor: 'pointer' }}
                                  >
                                    Open video directly ↗
                                  </a>
                              </div>
                          ) : (
                              <VideoPreview video={masterVideo} width={128} height={160} title="Master Video Preview" />
                          )}
                          {masterVideo.saveError && (
                              <div className="save-error-container">
                                  <p className="error-text-small">{masterVideo.saveError}</p>
                                  <button onClick={() => onRetrySave(product, masterVideo, 'master')} className="retry-button">
                                      Retry Save
                                  </button>
                              </div>
                          )}
                      </div>
                    )}
                    <GoogleDriveUploader
                        clientName={clientName}
                        catalogId={catalogId}
                        retailerId={product.retailer_id}
                        accessToken={accessToken}
                        isReupload={!!masterVideo}
                        onUploadSuccess={(video) => onUploadSuccess(product, video, 'master')}
                        videoType="master"
                        onLoginRequest={onLoginRequest}
                    />
                </td>
                 <td data-label={t('otherVideo')}>
                    {nineBySixteenVideo && (
                      <div className="video-actions-container">
                          {nineBySixteenVideo.isProcessing ? (
                                <div className="video-processing-container nine-by-sixteen">
                                    <div className="loader-small"></div>
                                    <p>Upload completed ✓</p>
                                    <p className="info-text-small">Processing preview...</p>
                                    <a 
                                      href={nineBySixteenVideo.downloadLink || nineBySixteenVideo.embedLink} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="info-text-small"
                                      style={{ color: '#4285f4', textDecoration: 'underline', cursor: 'pointer' }}
                                    >
                                      Open video directly ↗
                                    </a>
                                </div>
                          ) : (
                              <VideoPreview video={nineBySixteenVideo} width={72} height={128} title="Other Size Video Preview" />
                          )}
                          {nineBySixteenVideo.saveError && (
                              <div className="save-error-container">
                                  <p className="error-text-small">{nineBySixteenVideo.saveError}</p>
                                  <button onClick={() => onRetrySave(product, nineBySixteenVideo, 'nineBySixteen')} className="retry-button">
                                      Retry Save
                                  </button>
                              </div>
                          )}
                      </div>
                    )}
                    <GoogleDriveUploader
                        clientName={clientName}
                        catalogId={catalogId}
                        retailerId={product.retailer_id}
                        accessToken={accessToken}
                        isReupload={!!nineBySixteenVideo}
                        onUploadSuccess={(video) => onUploadSuccess(product, video, 'nineBySixteen')}
                        videoType="nineBySixteen"
                        onLoginRequest={onLoginRequest}
                    />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  );
};
