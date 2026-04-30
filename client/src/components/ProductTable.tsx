
import React, { useContext, useState, useCallback } from 'react';
import { GoogleDriveUploader } from '@/components/GoogleDriveUploader';
import type { Product, HoveredImage, ProductVideos, UploadedVideo, VideoType } from '@/types';
import { LanguageContext } from '@/contexts/LanguageContext';

const trpcMutate = async (path: string, input: any): Promise<any> => {
  const response = await fetch(`/api/trpc/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ json: input }),
  });
  const data = await response.json();
  if (data?.error) throw new Error(data.error?.json?.message || data.error?.message || 'Request failed');
  return data?.result?.data?.json;
};

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
  const downloadUrl = video.downloadLink || video.embedLink;
  const embedUrl = video.embedLink;

  const driveViewUrl = embedUrl
    ? embedUrl.replace('/preview', '/view')
    : downloadUrl;

  return (
    <a
      href={driveViewUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${title} in Google Drive`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: '8px',
        cursor: 'pointer',
        border: '1px solid #e0e0e0',
        background: 'linear-gradient(135deg, #e8f0fe 0%, #f1f3f4 100%)',
        textDecoration: 'none',
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#4285f4';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(66,133,244,0.2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#e0e0e0';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        backgroundColor: '#4285f4',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ color: '#fff', fontSize: '18px', marginLeft: '2px' }}>▶</span>
      </div>
      <span style={{ fontSize: '11px', color: '#5f6368', textAlign: 'center', lineHeight: '1.3' }}>
        已上傳
      </span>
      <span style={{ fontSize: '10px', color: '#4285f4' }}>
        點擊預覽
      </span>
    </a>
  );
};

const AiGenerateButton = ({ product, aiSettings }: {
  product: Product;
  aiSettings: { prismApiKey: string; model: string; aspectRatio: string; duration: number; promptTemplate: string; geminiApiKey?: string };
}) => {
  const [status, setStatus] = useState<'idle' | 'generating' | 'polling' | 'done' | 'error'>('idle');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const geminiKey = aiSettings.geminiApiKey || aiSettings.prismApiKey;

  const handleGenerate = async () => {
    if (!geminiKey) { setErrorMsg('請先在管理面板設定 Gemini API Key'); return; }
    setStatus('generating');
    setErrorMsg(null);
    try {
      const result = await trpcMutate('prism.generate', {
        geminiApiKey: geminiKey,
        prompt: `${aiSettings.promptTemplate}. Product: ${product.name}`,
        imageUrl: product.image_url || undefined,
        duration: aiSettings.duration,
        aspectRatio: aiSettings.aspectRatio,
      });
      setStatus('polling');
      const opName = result.operationName;
      const poll = async () => {
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 5000));
          try {
            const res = await fetch(`/api/trpc/prism.status?input=${encodeURIComponent(JSON.stringify({ json: { geminiApiKey: geminiKey, operationName: opName } }))}`, { credentials: 'include' });
            const data = await res.json();
            const gen = data?.result?.data?.json;
            if (gen?.status === 'completed' && gen?.videoUrl) {
              setVideoUrl(gen.videoUrl);
              setStatus('done');
              return;
            }
            if (gen?.status === 'failed') {
              setErrorMsg(gen?.error || '影片生成失敗');
              setStatus('error');
              return;
            }
          } catch {}
        }
        setErrorMsg('生成超時，請稍後再試');
        setStatus('error');
      };
      poll();
    } catch (e: any) {
      setErrorMsg(e.message || '生成失敗');
      setStatus('error');
    }
  };

  if (status === 'done' && videoUrl) {
    return (
      <div style={{ marginTop: '8px' }}>
        <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="ai-generate-btn" style={{ background: '#22c55e', textDecoration: 'none' }}>
          ✅ 下載影片
        </a>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '8px' }}>
      <button className="ai-generate-btn" onClick={handleGenerate} disabled={status === 'generating' || status === 'polling'}>
        {status === 'generating' ? '⏳ 提交中...' : status === 'polling' ? '⏳ 生成中...' : '🤖 AI 生成'}
      </button>
      {errorMsg && <p style={{ color: '#dc2626', fontSize: '10px', marginTop: '4px' }}>{errorMsg}</p>}
    </div>
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
  aiVideoEnabled = false,
  aiSettings = null,
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
  aiVideoEnabled?: boolean;
  aiSettings?: { prismApiKey: string; model: string; aspectRatio: string; duration: number; promptTemplate: string } | null;
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
                  <span className={`availability ${(product.availability || '').replace(/\s+/g, "-")}`}>
                    {product.availability || 'N/A'}
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
                    {aiVideoEnabled && (aiSettings?.prismApiKey || aiSettings?.geminiApiKey) && (
                      <AiGenerateButton product={product} aiSettings={aiSettings!} />
                    )}
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
