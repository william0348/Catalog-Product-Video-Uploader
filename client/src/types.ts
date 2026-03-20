
export interface Product {
  id: string;
  retailer_id: string;
  name: string;
  image_url: string;
  availability: string;
}

export interface ProductSet {
  id: string;
  name: string;
}

export interface Catalog {
  id: string;
  name: string;
}

export interface Agency {
  id: string;
  name: string;
  access_status: string;
}

export interface ApiError {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}

export interface HoveredImage {
    src: string;
    x: number;
    y: number;
}

export interface UploadedVideo {
    downloadLink: string;
    embedLink: string;
    productName: string;
    saveError?: string;
    isProcessing?: boolean;
    uploadTimestamp?: number;
}

export interface ProductVideos {
    master?: UploadedVideo;
    nineBySixteen?: UploadedVideo;
}

export interface ToastMessage {
    id: number;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
}

export type VideoType = 'master' | 'nineBySixteen';
export type VideoFilterType = 'all' | 'uploaded' | 'not_uploaded';

export type AdminAccessInfo = {
    type: 'all' | 'specific' | 'denied' | null;
    allowedCatalogs: string[];
};
