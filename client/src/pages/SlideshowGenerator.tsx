import { useState, useEffect, useContext, useRef, useMemo, useCallback } from "react";
import { LanguageContext } from "@/contexts/LanguageContext";
import { AppFooter } from "@/components/AppFooter";
import { ReelsOverlay } from "@/components/ReelsOverlay";
import {
  getCompaniesByEmail,
  loadCompanySettings,
  loadSettings,
  loadSettingsFromServer,
  getSelectedCompany,
  saveSelectedCompany,
  type CatalogConfig,
  type CompanyInfo,
} from "@/settingsStore";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_AUTH_TOKEN_KEY,
  GOOGLE_API_SCOPES,
} from "@/constants";
import { getDriveFolderId } from "@/lib/google";

declare const google: any;
declare const gapi: any;

// ===== Types =====
interface CatalogProduct {
  id: string;
  retailerId: string;
  name: string;
  imageUrl: string;
  additionalImages: string[];
}

interface SelectedImage {
  url: string;
  label: string;
  productId: string;
  isCustom?: boolean;
}

type TransitionType = "fade" | "slideleft" | "slideright" | "slideup" | "slidedown" | "wipeleft" | "wiperight" | "none";
type AspectRatio = "4:5" | "9:16";
type TextPosition = "top" | "center" | "bottom";
type FontFamily = "noto-sans-cjk" | "noto-serif-cjk" | "dejavu-sans" | "liberation-sans";

// ===== Helpers =====
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const trpcMutate = async (path: string, input: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/trpc/${path}`, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.withCredentials = true;
    xhr.onload = () => {
      if (xhr.status === 0) {
        reject(new Error("Network error: connection was lost"));
        return;
      }
      if (xhr.status >= 500) {
        reject(new Error(`Server error (${xhr.status}): ${xhr.statusText || 'Internal server error'}`));
        return;
      }
      if (xhr.status >= 400) {
        try {
          const errData = JSON.parse(xhr.responseText);
          reject(new Error(errData?.error?.json?.message || `Request failed (${xhr.status})`));
        } catch {
          reject(new Error(`Request failed (${xhr.status}): ${xhr.statusText}`));
        }
        return;
      }
      try {
        const data = JSON.parse(xhr.responseText);
        if (data?.error) {
          reject(new Error(data.error?.json?.message || "API error"));
        } else {
          resolve(data?.result?.data?.json);
        }
      } catch (e) {
        console.error("[trpcMutate] Failed to parse response:", xhr.status, xhr.responseText?.substring(0, 200));
        reject(new Error(`Failed to parse response (status: ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error: unable to connect to server"));
    xhr.timeout = 300000; // 5 min for video generation
    xhr.ontimeout = () => reject(new Error("Request timeout: video generation took too long (>5 min)"));
    xhr.send(JSON.stringify({ json: input }));
  });
};

const trpcQuery = (path: string, input: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
    xhr.open("GET", url, true);
    xhr.withCredentials = true;
    xhr.onload = () => {
      if (xhr.status === 0) {
        reject(new Error("Network error: connection was lost"));
        return;
      }
      if (xhr.status >= 500) {
        reject(new Error(`Server error (${xhr.status}): ${xhr.statusText || 'Internal server error'}`));
        return;
      }
      if (xhr.status >= 400) {
        try {
          const errData = JSON.parse(xhr.responseText);
          reject(new Error(errData?.error?.json?.message || `Request failed (${xhr.status})`));
        } catch {
          reject(new Error(`Request failed (${xhr.status}): ${xhr.statusText}`));
        }
        return;
      }
      try {
        const data = JSON.parse(xhr.responseText);
        if (data?.error) {
          reject(new Error(data.error?.json?.message || "API error"));
        } else {
          resolve(data?.result?.data?.json);
        }
      } catch (e) {
        console.error("[trpcQuery] Failed to parse response:", xhr.status, xhr.responseText?.substring(0, 200));
        reject(new Error(`Failed to parse response (status: ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error: unable to connect to server"));
    xhr.timeout = 60000;
    xhr.ontimeout = () => reject(new Error("Request timeout"));
    xhr.send();
  });
};

// ===== Font options =====
const FONT_OPTIONS: { value: FontFamily; label: string; labelZh: string }[] = [
  { value: "noto-sans-cjk", label: "Noto Sans CJK (Default)", labelZh: "Noto Sans CJK（預設）" },
  { value: "noto-serif-cjk", label: "Noto Serif CJK (Serif)", labelZh: "Noto Serif CJK（襯線）" },
  { value: "dejavu-sans", label: "DejaVu Sans", labelZh: "DejaVu Sans" },
  { value: "liberation-sans", label: "Liberation Sans", labelZh: "Liberation Sans" },
];

const PRESET_COLORS = [
  "#FFFFFF", "#000000", "#FF0000", "#FF6600", "#FFD700",
  "#00CC00", "#0066FF", "#9933FF", "#FF69B4", "#00CED1",
];

// ===== Batch Types =====
interface BatchItem {
  product: CatalogProduct;
  status: "pending" | "generating" | "uploading" | "done" | "error";
  videoUrl?: string;
  driveLink?: string;
  error?: string;
}

// ===== Transition options =====
const TRANSITIONS: { value: TransitionType; label: string; labelZh: string }[] = [
  { value: "fade", label: "Fade", labelZh: "淡入淡出" },
  { value: "slideleft", label: "Slide Left", labelZh: "向左滑動" },
  { value: "slideright", label: "Slide Right", labelZh: "向右滑動" },
  { value: "slideup", label: "Slide Up", labelZh: "向上滑動" },
  { value: "slidedown", label: "Slide Down", labelZh: "向下滑動" },
  { value: "wipeleft", label: "Wipe Left", labelZh: "向左擦除" },
  { value: "wiperight", label: "Wipe Right", labelZh: "向右擦除" },
  { value: "none", label: "None (Cut)", labelZh: "無（直接切換）" },
];

// ===== Main Component =====
export const SlideshowGenerator = () => {
  const { t, language } = useContext(LanguageContext);
  const isZh = language === "zh-TW";

  // Auth state
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleTokenClient, setGoogleTokenClient] = useState<any>(null);
  const [isGapiReady, setIsGapiReady] = useState(false);

  // Company state
  const [userCompanies, setUserCompanies] = useState<CompanyInfo[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(getSelectedCompany());
  const [configuredCatalogs, setConfiguredCatalogs] = useState<CatalogConfig[]>([]);
  const [fbAccessToken, setFbAccessToken] = useState("");
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  // Catalog & product state
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Product Set state
  const [productSets, setProductSets] = useState<{ id: string; name: string; productCount: number }[]>([]);
  const [selectedProductSetId, setSelectedProductSetId] = useState<string>("");
  const [isLoadingProductSets, setIsLoadingProductSets] = useState(false);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [isLoadingAllProducts, setIsLoadingAllProducts] = useState(false);
  const [totalProductCount, setTotalProductCount] = useState(0);

  // Selected products (for batch) and images (for single)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);

  // Manual image upload
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Slideshow settings
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("4:5");
  const [durationPerImage, setDurationPerImage] = useState(3);
  const [transition, setTransition] = useState<TransitionType>("fade");
  const [transitionDuration, setTransitionDuration] = useState(0.5);
  const [overlayText, setOverlayText] = useState("");
  const [textPosition, setTextPosition] = useState<TextPosition>("bottom");
  const [fontSize, setFontSize] = useState(40);
  const [fontFamily, setFontFamily] = useState<FontFamily>("noto-sans-cjk");
  const [fontColor, setFontColor] = useState("#FFFFFF");

  // Background & Image settings
  const [backgroundColor, setBackgroundColor] = useState("#FFFFFF");
  const [imageScale, setImageScale] = useState(1.0);
  const [imageOffsetX, setImageOffsetX] = useState(0);
  const [imageOffsetY, setImageOffsetY] = useState(0);

  // Overlay image (logo, watermark, etc.)
  const [overlayImageUrl, setOverlayImageUrl] = useState<string | null>(null);
  const [overlayImageFileName, setOverlayImageFileName] = useState<string | null>(null);
  const [overlayImageScale, setOverlayImageScale] = useState(0.2);
  const [overlayImageX, setOverlayImageX] = useState(0);
  const [overlayImageY, setOverlayImageY] = useState(0);
  const [isUploadingOverlayImage, setIsUploadingOverlayImage] = useState(false);
  const overlayImageInputRef = useRef<HTMLInputElement>(null);

  // Background video (plays behind product images)
  const [backgroundVideoUrl, setBackgroundVideoUrl] = useState<string | null>(null);
  const [backgroundVideoFileName, setBackgroundVideoFileName] = useState<string | null>(null);
  const [isUploadingBgVideo, setIsUploadingBgVideo] = useState(false);
  const bgVideoInputRef = useRef<HTMLInputElement>(null);

  // Intro video (prepended before slideshow)
  const [introVideoUrl, setIntroVideoUrl] = useState<string | null>(null);
  const [introVideoFileName, setIntroVideoFileName] = useState<string | null>(null);
  const [isUploadingIntroVideo, setIsUploadingIntroVideo] = useState(false);
  const introVideoInputRef = useRef<HTMLInputElement>(null);

  // Outro video (appended after slideshow)
  const [outroVideoUrl, setOutroVideoUrl] = useState<string | null>(null);
  const [outroVideoFileName, setOutroVideoFileName] = useState<string | null>(null);
  const [isUploadingOutroVideo, setIsUploadingOutroVideo] = useState(false);
  const outroVideoInputRef = useRef<HTMLInputElement>(null);

  // Background music
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [audioVolume, setAudioVolume] = useState(0.5);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState<string>("");

  // Google Drive upload state
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [driveUploadResult, setDriveUploadResult] = useState<{ downloadLink: string; embedLink: string } | null>(null);
  const [driveUploadError, setDriveUploadError] = useState<string | null>(null);

  // Catalog update state
  const [isUpdatingCatalog, setIsUpdatingCatalog] = useState(false);
  const [catalogUpdateResult, setCatalogUpdateResult] = useState<string | null>(null);
  const [catalogUpdateError, setCatalogUpdateError] = useState<string | null>(null);
  const [selectedProductForCatalog, setSelectedProductForCatalog] = useState<string>("");

  // Step state
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Preview animation state
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(true);
  const [showReelsOverlay, setShowReelsOverlay] = useState(true);

  // Batch generation state
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchUploadToDrive, setBatchUploadToDrive] = useState(false);
  const [batchUpdateCatalog, setBatchUpdateCatalog] = useState(false);
  const batchAbortRef = useRef(false);

  // Expanded product in list (to show individual images)
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  // Template state
  interface SlideshowTemplateData {
    id: number;
    name: string;
    aspectRatio: string;
    durationPerImage: number;
    transition: string;
    transitionDuration: number;
    showProductName: number;
    textPosition: string;
    fontSize: number;
    fontFamily: string;
    fontColor: string;
    backgroundColor: string;
    imageScale: number;
    imageOffsetX: number;
    imageOffsetY: number;
    overlayText: string | null;
  }
  const [templates, setTemplates] = useState<SlideshowTemplateData[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState("");

  // ===== Load settings on mount =====
  useEffect(() => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/api/trpc/settings.getAll", true);
    xhr.withCredentials = true;
    xhr.onload = function () {
      try {
        const data = JSON.parse(xhr.responseText);
        const result = data?.result?.data?.json;
        if (result) {
          const catalogs = result.catalogs ? JSON.parse(result.catalogs) : [];
          const token = result.facebookAccessToken || "";
          setConfiguredCatalogs(catalogs);
          setFbAccessToken(token);
        }
      } catch (e) {
        console.error("[Slideshow] Failed to parse settings:", e);
        const localSettings = loadSettings();
        setConfiguredCatalogs(localSettings.catalogs);
        setFbAccessToken(localSettings.facebookAccessToken);
      }
      setIsLoadingSettings(false);
    };
    xhr.onerror = function () {
      const localSettings = loadSettings();
      setConfiguredCatalogs(localSettings.catalogs);
      setFbAccessToken(localSettings.facebookAccessToken);
      setIsLoadingSettings(false);
    };
    xhr.timeout = 15000;
    xhr.ontimeout = function () {
      const localSettings = loadSettings();
      setConfiguredCatalogs(localSettings.catalogs);
      setFbAccessToken(localSettings.facebookAccessToken);
      setIsLoadingSettings(false);
    };
    xhr.send();
  }, []);

  // ===== Google Auth =====
  useEffect(() => {
    const savedToken = sessionStorage.getItem(GOOGLE_AUTH_TOKEN_KEY);
    if (savedToken) {
      setGoogleAccessToken(savedToken);
      fetchUserEmail(savedToken);
    }
    const initGoogleAuth = () => {
      if (typeof google !== "undefined" && google.accounts) {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: GOOGLE_API_SCOPES,
          callback: (response: any) => {
            if (response.access_token) {
              setGoogleAccessToken(response.access_token);
              sessionStorage.setItem(GOOGLE_AUTH_TOKEN_KEY, response.access_token);
              fetchUserEmail(response.access_token);
            }
          },
        });
        setGoogleTokenClient(client);
      }
    };
    if (typeof google !== "undefined") {
      initGoogleAuth();
    } else {
      const interval = setInterval(() => {
        if (typeof google !== "undefined") {
          initGoogleAuth();
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, []);

  useEffect(() => {
    const initGapi = () => {
      if (typeof gapi !== "undefined" && gapi.client) {
        gapi.client.load("drive", "v3").then(() => setIsGapiReady(true));
      }
    };
    if (typeof gapi !== "undefined" && gapi.client) {
      initGapi();
    } else {
      const interval = setInterval(() => {
        if (typeof gapi !== "undefined" && gapi.client) {
          initGapi();
          clearInterval(interval);
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, []);

  const fetchUserEmail = async (token: string) => {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.email) setUserEmail(data.email);
    } catch (e) {
      console.error("Failed to fetch user email:", e);
    }
  };

  useEffect(() => {
    if (!userEmail) return;
    (async () => {
      const companies = await getCompaniesByEmail(userEmail);
      setUserCompanies(companies);
      if (companies.length > 0 && !selectedCompanyId) {
        setSelectedCompanyId(companies[0].id);
        saveSelectedCompany(companies[0].id);
      }
    })();
  }, [userEmail]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    (async () => {
      const settings = await loadCompanySettings(selectedCompanyId);
      setFbAccessToken(settings.facebookAccessToken);
      setConfiguredCatalogs(settings.catalogs);
      if (settings.catalogs.length > 0 && !selectedCatalogId) {
        setSelectedCatalogId(settings.catalogs[0].id);
      }
    })();
  }, [selectedCompanyId]);

  // ===== Fetch product sets when catalog changes =====
  const handleFetchProductSets = useCallback(async () => {
    if (!selectedCatalogId || !fbAccessToken) return;
    setIsLoadingProductSets(true);
    setProductSets([]);
    setSelectedProductSetId("");
    try {
      const result = await trpcQuery("slideshow.fetchProductSets", {
        catalogId: selectedCatalogId,
        accessToken: fbAccessToken,
      });
      if (result && Array.isArray(result)) {
        setProductSets(result);
      }
    } catch (e: any) {
      console.error("[Slideshow] Failed to fetch product sets:", e);
    } finally {
      setIsLoadingProductSets(false);
    }
  }, [selectedCatalogId, fbAccessToken]);

  // Auto-fetch product sets when catalog changes
  useEffect(() => {
    if (selectedCatalogId && fbAccessToken) {
      handleFetchProductSets();
    }
  }, [selectedCatalogId, fbAccessToken, handleFetchProductSets]);

  // ===== Fetch products =====
  const handleFetchProducts = useCallback(async () => {
    if (!selectedCatalogId || !fbAccessToken) return;
    setIsLoadingProducts(true);
    setProductError(null);
    setProducts([]);
    setSelectedProductIds(new Set());
    setSelectedImages([]);
    setHasMoreProducts(false);
    setTotalProductCount(0);

    try {
      if (selectedProductSetId) {
        // Fetch from product set (first 1000)
        const result = await trpcQuery("slideshow.fetchProductSetProducts", {
          productSetId: selectedProductSetId,
          accessToken: fbAccessToken,
          limit: 1000,
        });
        if (result) {
          setProducts(result.products || []);
          setHasMoreProducts(result.hasMore || false);
          setTotalProductCount(result.products?.length || 0);
        }
      } else {
        // Fetch from catalog directly (first 100)
        const result = await trpcQuery("slideshow.fetchProducts", {
          catalogId: selectedCatalogId,
          accessToken: fbAccessToken,
          limit: 100,
        });
        if (result) {
          setProducts(result);
          setTotalProductCount(result.length || 0);
        }
      }
    } catch (e: any) {
      setProductError(e.message || "Failed to fetch products");
    } finally {
      setIsLoadingProducts(false);
    }
  }, [selectedCatalogId, selectedProductSetId, fbAccessToken]);

  // Auto-fetch products when product set changes
  useEffect(() => {
    if (selectedProductSetId && fbAccessToken) {
      handleFetchProducts();
    }
  }, [selectedProductSetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== Load ALL products from product set =====
  const handleLoadAllProducts = useCallback(async () => {
    if (!selectedProductSetId || !fbAccessToken) return;
    setIsLoadingAllProducts(true);
    setProductError(null);

    try {
      const result = await trpcQuery("slideshow.fetchAllProductSetProducts", {
        productSetId: selectedProductSetId,
        accessToken: fbAccessToken,
      });
      if (result && Array.isArray(result)) {
        setProducts(result);
        setHasMoreProducts(false);
        setTotalProductCount(result.length);
      }
    } catch (e: any) {
      setProductError(e.message || "Failed to load all products");
    } finally {
      setIsLoadingAllProducts(false);
    }
  }, [selectedProductSetId, fbAccessToken]);

  // ===== Filter products =====
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(term) || p.retailerId.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  // ===== Product selection (toggle) =====
  const toggleProductSelection = (product: CatalogProduct) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(product.id)) {
        next.delete(product.id);
        // Remove all images from this product
        setSelectedImages((imgs) => imgs.filter((img) => img.productId !== product.id));
      } else {
        next.add(product.id);
        // Add all images from this product
        const allImages = [product.imageUrl, ...product.additionalImages].filter(Boolean);
        const newImgs: SelectedImage[] = allImages.map((url, idx) => ({
          url,
          label: product.name,
          productId: product.id,
        }));
        setSelectedImages((imgs) => {
          // Remove any existing images from this product first, then add all
          const filtered = imgs.filter((img) => img.productId !== product.id);
          return [...filtered, ...newImgs];
        });
      }
      return next;
    });
  };

  const selectAllProducts = () => {
    const allIds = new Set(filteredProducts.map((p) => p.id));
    setSelectedProductIds(allIds);
    const allImages: SelectedImage[] = [];
    for (const product of filteredProducts) {
      const imgs = [product.imageUrl, ...product.additionalImages].filter(Boolean);
      for (const url of imgs) {
        allImages.push({ url, label: product.name, productId: product.id });
      }
    }
    setSelectedImages(allImages);
  };

  const deselectAllProducts = () => {
    setSelectedProductIds(new Set());
    setSelectedImages((imgs) => imgs.filter((img) => img.isCustom));
  };

  // ===== Move image in selected list =====
  const moveImage = (index: number, direction: "up" | "down") => {
    const newImages = [...selectedImages];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newImages.length) return;
    [newImages[index], newImages[targetIndex]] = [newImages[targetIndex], newImages[index]];
    setSelectedImages(newImages);
  };

  const removeSelectedImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  // ===== Manual Image Upload =====
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploadingImage(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        if (file.size > 10 * 1024 * 1024) {
          alert(t("slideshowImageTooLarge") || "Image too large. Max 10MB.");
          continue;
        }
        const base64 = await fileToBase64(file);
        const result = await trpcMutate("slideshow.uploadImage", {
          base64Data: base64,
          fileName: file.name,
          mimeType: file.type,
        });
        if (result?.url) {
          setSelectedImages((prev) => [
            ...prev,
            { url: result.url, label: file.name.replace(/\.[^/.]+$/, ""), productId: `custom-${Date.now()}-${i}`, isCustom: true },
          ]);
        }
      }
    } catch (err: any) {
      alert(err.message || "Failed to upload image");
    } finally {
      setIsUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  // ===== Audio Upload =====
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      alert(t("slideshowInvalidAudio") || "Please select an audio file (MP3, WAV, etc.)");
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      alert(t("slideshowAudioTooLarge") || "Audio file too large. Max 16MB.");
      return;
    }
    setIsUploadingAudio(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await trpcMutate("slideshow.uploadAudio", {
        base64Data: base64,
        fileName: file.name,
        mimeType: file.type,
      });
      if (result?.url) {
        setAudioUrl(result.url);
        setAudioFileName(file.name);
      }
    } catch (err: any) {
      alert(err.message || "Failed to upload audio");
    } finally {
      setIsUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  const removeAudio = () => {
    setAudioUrl(null);
    setAudioFileName(null);
  };

  // ===== Drag & Drop State =====
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const createDropHandler = (target: string, accept: string, maxSizeMB: number, onFile: (file: File) => void) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOverTarget(target); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOverTarget(null); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation(); setDragOverTarget(null);
      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (!file.type.startsWith(accept.replace('/*', '/'))) { alert(isZh ? `請拖曳${accept === 'image/*' ? '圖片' : accept === 'video/*' ? '影片' : '音訊'}檔案` : `Please drop a ${accept.replace('/*', '')} file`); return; }
      if (file.size > maxSizeMB * 1024 * 1024) { alert(isZh ? `檔案大小不能超過 ${maxSizeMB}MB` : `File must be under ${maxSizeMB}MB`); return; }
      onFile(file);
    },
  });

  const dropZoneStyle = (target: string): React.CSSProperties => dragOverTarget === target ? {
    borderColor: '#667eea', borderStyle: 'solid', background: '#f0f4ff', boxShadow: '0 0 0 3px rgba(102,126,234,0.2)',
  } : {};

  const handleOverlayImageFile = async (file: File) => {
    setIsUploadingOverlayImage(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await trpcMutate("slideshow.uploadImage", { base64Data: base64, fileName: file.name, mimeType: file.type || "image/png" });
      if (result?.url) { setOverlayImageUrl(result.url); setOverlayImageFileName(file.name); }
    } catch (err: any) { alert(err.message || "Upload failed"); } finally {
      setIsUploadingOverlayImage(false);
      if (overlayImageInputRef.current) overlayImageInputRef.current.value = "";
    }
  };

  const handleVideoFile = async (type: 'bg' | 'intro' | 'outro', file: File) => {
    const setUrl = type === 'bg' ? setBackgroundVideoUrl : type === 'intro' ? setIntroVideoUrl : setOutroVideoUrl;
    const setName = type === 'bg' ? setBackgroundVideoFileName : type === 'intro' ? setIntroVideoFileName : setOutroVideoFileName;
    const setUploading = type === 'bg' ? setIsUploadingBgVideo : type === 'intro' ? setIsUploadingIntroVideo : setIsUploadingOutroVideo;
    const inputRef = type === 'bg' ? bgVideoInputRef : type === 'intro' ? introVideoInputRef : outroVideoInputRef;
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await trpcMutate("slideshow.uploadVideo", { base64Data: base64, fileName: file.name, mimeType: file.type || "video/mp4" });
      if (result?.url) { setUrl(result.url); setName(file.name); }
    } catch (err: any) { alert(err.message || "Upload failed"); } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleAudioFile = async (file: File) => {
    setIsUploadingAudio(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await trpcMutate("slideshow.uploadAudio", { base64Data: base64, fileName: file.name, mimeType: file.type });
      if (result?.url) { setAudioUrl(result.url); setAudioFileName(file.name); }
    } catch (err: any) { alert(err.message || "Upload failed"); } finally {
      setIsUploadingAudio(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  // ===== Preview Drag-to-Reposition =====
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isDraggingOverlay, setIsDraggingOverlay] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; startOffsetX: number; startOffsetY: number } | null>(null);

  const handlePreviewImageMouseDown = (e: React.MouseEvent, target: 'image' | 'overlay') => {
    e.preventDefault(); e.stopPropagation();
    const startX = target === 'image' ? imageOffsetX : overlayImageX;
    const startY = target === 'image' ? imageOffsetY : overlayImageY;
    dragStartRef.current = { x: e.clientX, y: e.clientY, startOffsetX: startX, startOffsetY: startY };
    if (target === 'image') setIsDraggingImage(true); else setIsDraggingOverlay(true);
  };

  useEffect(() => {
    if (!isDraggingImage && !isDraggingOverlay) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !previewContainerRef.current) return;
      const rect = previewContainerRef.current.getBoundingClientRect();
      const dx = ((e.clientX - dragStartRef.current.x) / rect.width) * 100;
      const dy = ((e.clientY - dragStartRef.current.y) / rect.height) * 100;
      const newX = Math.max(-50, Math.min(50, dragStartRef.current.startOffsetX + dx));
      const newY = Math.max(-50, Math.min(50, dragStartRef.current.startOffsetY + dy));
      if (isDraggingImage) { setImageOffsetX(Math.round(newX)); setImageOffsetY(Math.round(newY)); }
      if (isDraggingOverlay) { setOverlayImageX(Math.round(newX)); setOverlayImageY(Math.round(newY)); }
    };
    const handleMouseUp = () => {
      setIsDraggingImage(false); setIsDraggingOverlay(false); dragStartRef.current = null;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isDraggingImage, isDraggingOverlay]);

  // ===== Preview Animation =====
  useEffect(() => {
    if (!isPreviewPlaying || selectedImages.length <= 1 || currentStep !== 2) return;
    const interval = setInterval(() => {
      setPreviewIndex((prev) => (prev + 1) % selectedImages.length);
    }, durationPerImage * 1000);
    return () => clearInterval(interval);
  }, [isPreviewPlaying, selectedImages.length, durationPerImage, currentStep]);

  useEffect(() => {
    setPreviewIndex(0);
  }, [selectedImages.length]);

  // ===== Template Functions =====
  const loadTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const resp = await fetch("/api/trpc/slideshowTemplate.list", { credentials: "include" });
      const json = await resp.json();
      if (json?.result?.data) {
        setTemplates(json.result.data);
      }
    } catch (e) {
      console.error("Failed to load templates", e);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      await trpcMutate("slideshowTemplate.create", {
        name: templateName.trim(),
        aspectRatio,
        durationPerImage,
        transition,
        transitionDuration: Math.round(transitionDuration * 100),
        showProductName: 0,
        textPosition,
        fontSize,
        fontFamily,
        fontColor,
        backgroundColor,
        imageScale: Math.round(imageScale * 100),
        imageOffsetX,
        imageOffsetY,
        overlayText: overlayText.trim() || undefined,
      });
      setTemplateName("");
      setShowSaveTemplate(false);
      loadTemplates();
    } catch (e: any) {
      alert(e.message || "Failed to save template");
    }
  };

  const applyTemplate = (tmpl: SlideshowTemplateData) => {
    setAspectRatio(tmpl.aspectRatio as AspectRatio);
    setDurationPerImage(tmpl.durationPerImage);
    setTransition(tmpl.transition as TransitionType);
    setTransitionDuration(tmpl.transitionDuration / 100);
    setTextPosition(tmpl.textPosition as TextPosition);
    setFontSize(tmpl.fontSize);
    setFontFamily(tmpl.fontFamily as FontFamily);
    setFontColor(tmpl.fontColor);
    setBackgroundColor(tmpl.backgroundColor);
    setImageScale(tmpl.imageScale / 100);
    setImageOffsetX(tmpl.imageOffsetX);
    setImageOffsetY(tmpl.imageOffsetY);
    setOverlayText(tmpl.overlayText || "");
  };

  const updateTemplate = async (id: number) => {
    try {
      await trpcMutate("slideshowTemplate.update", {
        id,
        name: editingTemplateName.trim() || undefined,
        aspectRatio,
        durationPerImage,
        transition,
        transitionDuration: Math.round(transitionDuration * 100),
        showProductName: 0,
        textPosition,
        fontSize,
        fontFamily,
        fontColor,
        backgroundColor,
        imageScale: Math.round(imageScale * 100),
        imageOffsetX,
        imageOffsetY,
        overlayText: overlayText.trim() || undefined,
      });
      setEditingTemplateId(null);
      setEditingTemplateName("");
      loadTemplates();
    } catch (e: any) {
      alert(e.message || "Failed to update template");
    }
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm(isZh ? "確定要刪除此範本嗎？" : "Delete this template?")) return;
    try {
      await trpcMutate("slideshowTemplate.delete", { id });
      loadTemplates();
    } catch (e: any) {
      alert(e.message || "Failed to delete template");
    }
  };

  // ===== Proxy upload images to S3 (solves Facebook CDN URL expiration) =====
  const proxyUploadImagesToS3 = async (imageUrls: string[]): Promise<Map<string, string>> => {
    const urlMap = new Map<string, string>();
    // Skip URLs that are already on S3/CDN (not Facebook CDN)
    const fbUrls = imageUrls.filter(url => 
      url.includes('fbcdn.net') || url.includes('facebook.com') || url.includes('fb.com')
    );
    const nonFbUrls = imageUrls.filter(url => 
      !url.includes('fbcdn.net') && !url.includes('facebook.com') && !url.includes('fb.com')
    );
    
    // Non-FB URLs don't need proxy
    for (const url of nonFbUrls) {
      urlMap.set(url, url);
    }
    
    if (fbUrls.length === 0) return urlMap;
    
    console.log(`[Slideshow] Proxy uploading ${fbUrls.length} Facebook CDN images to S3...`);
    
    // Batch upload FB images
    const result = await trpcMutate("slideshow.proxyUploadImages", {
      imageUrls: fbUrls,
    });
    
    if (result?.results) {
      for (const r of result.results) {
        if (r.s3Url) {
          urlMap.set(r.originalUrl, r.s3Url);
        } else {
          // If proxy failed, use original URL as fallback
          console.warn(`[Slideshow] Proxy upload failed for ${r.originalUrl}: ${r.error}`);
          urlMap.set(r.originalUrl, r.originalUrl);
        }
      }
    }
    
    return urlMap;
  };

  // ===== Generate slideshow (single product) =====
  const handleGenerate = async () => {
    if (selectedImages.length === 0) return;
    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedVideoUrl(null);
    setDriveUploadResult(null);
    setDriveUploadError(null);
    setCatalogUpdateResult(null);
    setCatalogUpdateError(null);
    setGenerationProgress(isZh ? "正在準備圖片..." : "Preparing images...");

    try {
      // Step 1: Proxy upload Facebook CDN images to S3
      const allUrls = selectedImages.map(img => img.url);
      const urlMap = await proxyUploadImagesToS3(allUrls);
      
      setGenerationProgress(isZh ? "正在生成影片..." : "Generating video...");
      
      // Step 2: Generate slideshow with S3 URLs
      const result = await trpcMutate("slideshow.generate", {
        images: selectedImages.map((img) => ({
          url: urlMap.get(img.url) || img.url,
          label: img.label,
        })),
        aspectRatio,
        durationPerImage,
        transition,
        transitionDuration,
        overlayText: overlayText.trim() || undefined,
        textPosition,
        fontSize,
        fontFamily,
        fontColor,
        backgroundColor,
        imageScale,
        imageOffsetX,
        imageOffsetY,
        overlayImageUrl: overlayImageUrl || undefined,
        overlayImageScale: overlayImageUrl ? overlayImageScale : undefined,
        overlayImageX: overlayImageUrl ? overlayImageX : undefined,
        overlayImageY: overlayImageUrl ? overlayImageY : undefined,
        backgroundVideoUrl: backgroundVideoUrl || undefined,
        introVideoUrl: introVideoUrl || undefined,
        outroVideoUrl: outroVideoUrl || undefined,
        audioUrl: audioUrl || undefined,
        audioVolume: audioUrl ? audioVolume : undefined,
      });

      if (result?.success) {
        setGeneratedVideoUrl(result.videoUrl);
        setCurrentStep(3);
      } else {
        setGenerationError("Failed to generate video");
        setCurrentStep(3);
      }
    } catch (e: any) {
      setGenerationError(e.message || "Failed to generate video");
      setCurrentStep(3);
    } finally {
      setIsGenerating(false);
      setGenerationProgress("");
    }
  };

  // ===== Upload to Google Drive =====
  const handleUploadToDrive = async () => {
    if (!generatedVideoUrl || !googleAccessToken) return;
    setIsUploadingToDrive(true);
    setDriveUploadError(null);
    setDriveUploadResult(null);
    try {
      gapi.client.setToken({ access_token: googleAccessToken });
      const folderId = await getDriveFolderId();
      const videoResponse = await fetch(generatedVideoUrl);
      const videoBlob = await videoResponse.blob();
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const suffix = Math.random().toString(36).substring(2, 6);
      const fileName = `slideshow_${selectedCatalogId || "custom"}_${dateStr}_${suffix}.mp4`;
      const metadata = { name: fileName, mimeType: "video/mp4", parents: [folderId] };
      const initRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
        method: "POST",
        headers: { Authorization: `Bearer ${googleAccessToken}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify(metadata),
      });
      if (!initRes.ok) throw new Error(`Failed to initiate upload: ${initRes.statusText}`);
      const location = initRes.headers.get("Location");
      if (!location) throw new Error("Could not get resumable upload URL.");
      const uploadRes = await fetch(location, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: videoBlob });
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.statusText}`);
      const uploadedFile = await uploadRes.json();
      await gapi.client.drive.permissions.create({ fileId: uploadedFile.id, resource: { role: "reader", type: "anyone" } });
      const downloadLink = `https://drive.google.com/uc?export=download&id=${uploadedFile.id}`;
      const embedLink = `https://drive.google.com/file/d/${uploadedFile.id}/preview`;
      setDriveUploadResult({ downloadLink, embedLink });
    } catch (e: any) {
      setDriveUploadError(e.message || "Failed to upload to Drive");
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  // ===== Update Catalog Video =====
  const handleUpdateCatalog = async () => {
    if (!driveUploadResult?.downloadLink || !selectedProductForCatalog || !selectedCatalogId || !fbAccessToken) return;
    setIsUpdatingCatalog(true);
    setCatalogUpdateError(null);
    setCatalogUpdateResult(null);
    try {
      const result = await trpcMutate("slideshow.updateCatalogVideo", {
        catalogId: selectedCatalogId,
        accessToken: fbAccessToken,
        productRetailerId: selectedProductForCatalog,
        videoUrl: driveUploadResult.downloadLink,
      });
      if (result?.success) {
        setCatalogUpdateResult(t("slideshowCatalogUpdateSuccess") || "Catalog updated successfully!");
      } else {
        setCatalogUpdateError(result?.message || "Failed to update catalog");
      }
    } catch (e: any) {
      setCatalogUpdateError(e.message || "Failed to update catalog");
    } finally {
      setIsUpdatingCatalog(false);
    }
  };

  // ===== Batch Generation =====
  const selectedProducts = useMemo(() => {
    return products.filter((p) => selectedProductIds.has(p.id));
  }, [products, selectedProductIds]);

  const batchStats = useMemo(() => {
    const total = batchItems.length;
    const done = batchItems.filter((b) => b.status === "done").length;
    const error = batchItems.filter((b) => b.status === "error").length;
    const running = batchItems.filter((b) => b.status === "generating" || b.status === "uploading").length;
    return { total, done, error, running };
  }, [batchItems]);

  const handleBatchGenerate = async () => {
    if (selectedProducts.length === 0) return;
    batchAbortRef.current = false;
    setIsBatchRunning(true);

    const items: BatchItem[] = selectedProducts.map((p) => ({ product: p, status: "pending" as const }));
    setBatchItems(items);

    for (let i = 0; i < items.length; i++) {
      if (batchAbortRef.current) break;

      setBatchItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, status: "generating" } : item)));

      try {
        const productImages = [items[i].product.imageUrl, ...items[i].product.additionalImages].filter(Boolean);
        
        // Proxy upload Facebook CDN images to S3 first
        const urlMap = await proxyUploadImagesToS3(productImages);
        
        const result = await trpcMutate("slideshow.generate", {
          images: productImages.map((url) => ({
            url: urlMap.get(url) || url,
            label: items[i].product.name,
          })),
          aspectRatio,
          durationPerImage,
          transition,
          transitionDuration,
          overlayText: overlayText.trim() || undefined,
          textPosition,
          fontSize,
          fontFamily,
          fontColor,
          backgroundColor,
          imageScale,
          imageOffsetX,
          imageOffsetY,
          overlayImageUrl: overlayImageUrl || undefined,
          overlayImageScale: overlayImageUrl ? overlayImageScale : undefined,
          overlayImageX: overlayImageUrl ? overlayImageX : undefined,
          overlayImageY: overlayImageUrl ? overlayImageY : undefined,
          backgroundVideoUrl: backgroundVideoUrl || undefined,
          introVideoUrl: introVideoUrl || undefined,
          outroVideoUrl: outroVideoUrl || undefined,
          audioUrl: audioUrl || undefined,
          audioVolume: audioUrl ? audioVolume : undefined,
        });

        if (!result?.success) throw new Error("Generation failed");

        let driveLink: string | undefined;

        // Upload to Drive if enabled
        if (batchUploadToDrive && googleAccessToken) {
          setBatchItems((prev) => prev.map((item, idx) => (idx === i ? { ...item, status: "uploading" } : item)));
          try {
            gapi.client.setToken({ access_token: googleAccessToken });
            const folderId = await getDriveFolderId();
            const videoResponse = await fetch(result.videoUrl);
            const videoBlob = await videoResponse.blob();
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            const suffix = Math.random().toString(36).substring(2, 6);
            const fileName = `slideshow_${items[i].product.retailerId}_${dateStr}_${suffix}.mp4`;
            const metadata = { name: fileName, mimeType: "video/mp4", parents: [folderId] };
            const initRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
              method: "POST",
              headers: { Authorization: `Bearer ${googleAccessToken}`, "Content-Type": "application/json; charset=UTF-8" },
              body: JSON.stringify(metadata),
            });
            if (initRes.ok) {
              const location = initRes.headers.get("Location");
              if (location) {
                const uploadRes = await fetch(location, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: videoBlob });
                if (uploadRes.ok) {
                  const uploadedFile = await uploadRes.json();
                  await gapi.client.drive.permissions.create({ fileId: uploadedFile.id, resource: { role: "reader", type: "anyone" } });
                  driveLink = `https://drive.google.com/file/d/${uploadedFile.id}/view`;

                  // Update catalog if enabled
                  if (batchUpdateCatalog && selectedCatalogId && fbAccessToken) {
                    const downloadUrl = `https://drive.google.com/uc?export=download&id=${uploadedFile.id}`;
                    await trpcMutate("slideshow.updateCatalogVideo", {
                      catalogId: selectedCatalogId,
                      accessToken: fbAccessToken,
                      productRetailerId: items[i].product.retailerId,
                      videoUrl: downloadUrl,
                    });
                  }
                }
              }
            }
          } catch (driveErr) {
            console.error("Drive upload error:", driveErr);
          }
        }

        setBatchItems((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: "done", videoUrl: result.videoUrl, driveLink } : item
          )
        );
      } catch (e: any) {
        setBatchItems((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, status: "error", error: e.message } : item))
        );
      }
    }
    setIsBatchRunning(false);
  };

  const handleStopBatch = () => {
    batchAbortRef.current = true;
    setIsBatchRunning(false);
  };

  // ===== Computed values =====
  const noCatalogs = configuredCatalogs.length === 0;
  const isSingleMode = selectedProductIds.size <= 1;

  // ===== RENDER =====
  return (
    <main style={{ minHeight: "100%", background: "transparent" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "16px 24px",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        borderRadius: "12px",
        marginBottom: 20,
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>🎬 {t("slideshowTitle") || "Slideshow Video Generator"}</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.85 }}>{t("slideshowSubtitle") || "Create slideshow videos from catalog product images"}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {!googleAccessToken && (
            <button
              onClick={() => googleTokenClient?.requestAccessToken()}
              style={{ background: "#fff", color: "#667eea", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {t("loginWithGoogle") || "Login with Google"}
            </button>
          )}
          {googleAccessToken && userEmail && (
            <span style={{ fontSize: 13, opacity: 0.9 }}>✅ {userEmail}</span>
          )}
        </div>
      </div>

      {/* Steps Indicator */}
      <div style={{ display: "flex", justifyContent: "center", gap: 40, padding: "16px 20px 12px", maxWidth: 600, margin: "0 auto" }}>
        {[1, 2, 3].map((step) => (
          <div key={step} style={{ textAlign: "center", cursor: step <= currentStep ? "pointer" : "default", opacity: step <= currentStep ? 1 : 0.4 }} onClick={() => step <= currentStep && setCurrentStep(step as 1 | 2 | 3)}>
            <div style={{
              width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 6px",
              background: step === currentStep ? "linear-gradient(135deg, #667eea, #764ba2)" : step < currentStep ? "#667eea" : "#d0d0d0",
              color: "#fff", fontWeight: 700, fontSize: 15,
            }}>
              {step}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: step === currentStep ? "#667eea" : "#888" }}>
              {step === 1 ? (t("slideshowStep1") || "Select Products") : step === 2 ? (t("slideshowStep2") || "Settings") : (t("slideshowStep3") || "Generate")}
            </div>
          </div>
        ))}
      </div>
      <div style={{ width: "100%", height: 3, background: "#e0e7ff", maxWidth: 600, margin: "0 auto 20px" }}>
        <div style={{ width: `${((currentStep - 1) / 2) * 100}%`, height: "100%", background: "linear-gradient(90deg, #667eea, #764ba2)", transition: "width 0.3s" }} />
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 0 40px" }}>

        {/* ===== STEP 1: Select Products ===== */}
        {currentStep === 1 && (
          <div>
            {/* Catalog Selector */}
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: "#333", marginBottom: 12, textAlign: "center" }}>
                {t("slideshowSelectCatalog") || "Select Catalog"}
              </h3>
              {isLoadingSettings ? (
                <div style={{ textAlign: "center", padding: 20, color: "#888" }}>⏳ {t("loadingSettings") || "Loading settings..."}</div>
              ) : noCatalogs ? (
                <div style={{ textAlign: "center", padding: 20, color: "#e53e3e", background: "#fff5f5", borderRadius: 10, border: "1px solid #fed7d7" }}>
                  ⚠️ {t("slideshowNoCatalogs") || "No catalogs configured. Please set up catalogs in the main tool first."}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <select
                    value={selectedCatalogId}
                    onChange={(e) => setSelectedCatalogId(e.target.value)}
                    style={{ ...selectStyle, flex: 1 }}
                  >
                    <option value="">{t("slideshowSelectCatalog") || "Select Catalog"}</option>
                    {configuredCatalogs.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name || cat.id}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleFetchProducts}
                    disabled={!selectedCatalogId || !fbAccessToken || isLoadingProducts}
                    style={{
                      ...buttonStyle,
                      opacity: !selectedCatalogId || !fbAccessToken || isLoadingProducts ? 0.5 : 1,
                      cursor: !selectedCatalogId || !fbAccessToken || isLoadingProducts ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isLoadingProducts ? "⏳" : "📦"} {t("slideshowFetchProducts") || "Load Products"}
                  </button>
                </div>
              )}
            </div>

            {/* Product Set Selector */}
            {selectedCatalogId && fbAccessToken && productSets.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#333", marginBottom: 12, textAlign: "center" }}>
                  {t("slideshowSelectProductSet") || "Select Product Set (Optional)"}
                </h3>
                {isLoadingProductSets ? (
                  <div style={{ textAlign: "center", padding: 12, color: "#888" }}>
                    ⏳ {t("slideshowLoadingProductSets") || "Loading product sets..."}
                  </div>
                ) : (
                  <select
                    value={selectedProductSetId}
                    onChange={(e) => {
                      setSelectedProductSetId(e.target.value);
                      setProducts([]);
                      setSelectedProductIds(new Set());
                      setSelectedImages([]);
                      setHasMoreProducts(false);
                    }}
                    style={{ ...selectStyle, width: "100%" }}
                  >
                    <option value="">{t("slideshowAllProducts") || "All Products"}</option>
                    {productSets.map((ps) => (
                      <option key={ps.id} value={ps.id}>
                        {ps.name} ({ps.productCount} {t("slideshowProductSetCount") || "products"})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Product count & Load All button */}
            {products.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "8px 12px", background: "#f0f4ff", borderRadius: 8 }}>
                <span style={{ fontSize: 13, color: "#4a5568", fontWeight: 500 }}>
                  📦 {totalProductCount} {t("slideshowProductsLoaded") || "products loaded"}
                </span>
                {hasMoreProducts && (
                  <button
                    onClick={handleLoadAllProducts}
                    disabled={isLoadingAllProducts}
                    style={{
                      ...buttonStyle,
                      fontSize: 13,
                      padding: "6px 16px",
                      background: isLoadingAllProducts ? "#a0aec0" : "#ed8936",
                      cursor: isLoadingAllProducts ? "not-allowed" : "pointer",
                    }}
                  >
                    {isLoadingAllProducts
                      ? `⏳ ${t("slideshowLoadingAllProducts") || "Loading all products..."}`
                      : `📥 ${t("slideshowLoadAllProducts") || "Load All Products"}`}
                  </button>
                )}
              </div>
            )}
            {hasMoreProducts && products.length > 0 && (
              <div style={{ padding: 8, background: "#fffaf0", borderRadius: 8, border: "1px solid #feebc8", color: "#c05621", fontSize: 12, marginBottom: 12, textAlign: "center" }}>
                ⚠️ {t("slideshowHasMoreProducts") || "There are more products. Click 'Load All' to fetch them all."}
              </div>
            )}

            {productError && (
              <div style={{ padding: 12, background: "#fff5f5", borderRadius: 8, border: "1px solid #fed7d7", color: "#e53e3e", fontSize: 13, marginBottom: 16 }}>
                ❌ {productError}
              </div>
            )}

            {/* Product List */}
            {products.length > 0 && (
              <div>
                {/* Search & Select All */}
                <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    placeholder={t("slideshowSearchProducts") || "Search products..."}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ ...inputStyle, flex: 1, minWidth: 200 }}
                  />
                  <span style={{ fontSize: 13, color: "#666", fontWeight: 500 }}>
                    {selectedProductIds.size}/{filteredProducts.length} {isZh ? "已選" : "selected"}
                  </span>
                  <button onClick={selectAllProducts} style={{ ...miniActionBtn, color: "#667eea", borderColor: "#667eea" }}>
                    {t("slideshowSelectAll") || "Select All"}
                  </button>
                  <button onClick={deselectAllProducts} style={{ ...miniActionBtn, color: "#999" }}>
                    {t("slideshowDeselectAll") || "Deselect All"}
                  </button>
                </div>

                {/* Product List Table */}
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e8e8", overflow: "hidden", maxHeight: 500, overflowY: "auto" }}>
                  {filteredProducts.map((product) => {
                    const allImages = [product.imageUrl, ...product.additionalImages].filter(Boolean);
                    const isSelected = selectedProductIds.has(product.id);
                    const isExpanded = expandedProductId === product.id;

                    return (
                      <div key={product.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        {/* Product Row */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "10px 16px",
                            cursor: "pointer",
                            background: isSelected ? "#f0f0ff" : "#fff",
                            transition: "background 0.15s",
                          }}
                          onClick={() => toggleProductSelection(product)}
                          onMouseEnter={(e) => { if (!isSelected) (e.currentTarget.style.background = "#fafafe"); }}
                          onMouseLeave={(e) => { if (!isSelected) (e.currentTarget.style.background = "#fff"); }}
                        >
                          {/* Checkbox */}
                          <div style={{
                            width: 22, height: 22, borderRadius: 4, border: `2px solid ${isSelected ? "#667eea" : "#ccc"}`,
                            background: isSelected ? "#667eea" : "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0, transition: "all 0.15s",
                          }}>
                            {isSelected && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
                          </div>

                          {/* Thumbnail */}
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", flexShrink: 0, border: "1px solid #eee" }}
                          />

                          {/* Product Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {product.name}
                            </div>
                            <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                              ID: {product.retailerId}
                            </div>
                          </div>

                          {/* Image Count Badge */}
                          <div style={{
                            background: allImages.length > 1 ? "#e0e7ff" : "#f0f0f0",
                            color: allImages.length > 1 ? "#667eea" : "#888",
                            padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, flexShrink: 0,
                          }}>
                            🖼 {allImages.length} {isZh ? "張圖片" : "images"}
                          </div>

                          {/* Expand button */}
                          {allImages.length > 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedProductId(isExpanded ? null : product.id); }}
                              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#888", padding: "4px 8px" }}
                              title={isZh ? "展開圖片" : "Expand images"}
                            >
                              {isExpanded ? "▲" : "▼"}
                            </button>
                          )}
                        </div>

                        {/* Expanded Image Grid */}
                        {isExpanded && (
                          <div style={{ padding: "8px 16px 12px 52px", background: "#fafafe", display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {allImages.map((imgUrl, idx) => (
                              <div key={idx} style={{ position: "relative" }}>
                                <img
                                  src={imgUrl}
                                  alt={`${product.name} ${idx + 1}`}
                                  style={{ width: 64, height: 64, borderRadius: 6, objectFit: "cover", border: "2px solid #e0e0e0" }}
                                />
                                <div style={{
                                  position: "absolute", top: 2, left: 2, background: "rgba(0,0,0,0.6)", color: "#fff",
                                  fontSize: 10, fontWeight: 700, borderRadius: 3, padding: "1px 4px",
                                }}>
                                  {idx === 0 ? (isZh ? "主圖" : "Main") : `#${idx + 1}`}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}


            {/* Selected Images Preview (reorderable) */}
            {selectedImages.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#333" }}>
                    📋 {t("slideshowSelectedImages") || "Selected Images"} ({selectedImages.length})
                  </h4>
                  <span style={{ fontSize: 12, color: "#888" }}>{isZh ? "使用箭頭調整順序" : "Use arrows to reorder"}</span>
                </div>
                <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #e8e8e8", overflow: "hidden", maxHeight: 300, overflowY: "auto" }}>
                  {selectedImages.map((img, idx) => (
                    <div key={`${img.url}-${idx}`} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                      borderBottom: idx < selectedImages.length - 1 ? "1px solid #f5f5f5" : "none",
                      background: img.isCustom ? "#fffbf0" : "#fff",
                    }}>
                      <span style={{ fontSize: 12, color: "#999", fontWeight: 600, width: 24, textAlign: "center" }}>{idx + 1}</span>
                      <img src={img.url} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: "cover", border: "1px solid #eee" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {img.label} {img.isCustom && <span style={{ color: "#e6a817", fontSize: 10 }}>(custom)</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => moveImage(idx, "up")} disabled={idx === 0} style={{ ...miniBtn, opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                        <button onClick={() => moveImage(idx, "down")} disabled={idx === selectedImages.length - 1} style={{ ...miniBtn, opacity: idx === selectedImages.length - 1 ? 0.3 : 1 }}>▼</button>
                        <button onClick={() => removeSelectedImage(idx)} style={{ ...miniBtn, color: "#e53e3e" }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Step Button */}
            {selectedImages.length > 0 && (
              <div style={{ textAlign: "center", marginTop: 24 }}>
                <button
                  onClick={() => setCurrentStep(2)}
                  style={{ ...buttonStyle, background: "linear-gradient(135deg, #667eea, #764ba2)", padding: "12px 40px", fontSize: 15 }}
                >
                  {t("slideshowNext") || "Next"} → {t("slideshowStep2") || "Settings"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== STEP 2: Settings ===== */}
        {currentStep === 2 && (
          <div>
            {/* Template Bar */}
            <div style={{ marginBottom: 20, padding: 16, background: "#f0f4ff", borderRadius: 12, border: "1px solid #d0d8ff" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: templates.length > 0 ? 12 : 0 }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#4a5568" }}>
                  📁 {isZh ? "影片生成範本" : "Video Templates"}
                </h4>
                <div style={{ display: "flex", gap: 8 }}>
                  {!showSaveTemplate ? (
                    <button onClick={() => setShowSaveTemplate(true)} style={{ ...miniActionBtn, color: "#667eea", borderColor: "#667eea", fontSize: 12 }}>
                      💾 {isZh ? "儲存為範本" : "Save as Template"}
                    </button>
                  ) : (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)}
                        placeholder={isZh ? "範本名稱..." : "Template name..."}
                        style={{ ...inputStyle, width: 180, padding: "4px 8px", fontSize: 12 }}
                        onKeyDown={(e) => e.key === "Enter" && saveTemplate()}
                        autoFocus
                      />
                      <button onClick={saveTemplate} disabled={!templateName.trim()} style={{ ...miniActionBtn, color: "#38a169", borderColor: "#38a169", fontSize: 12, opacity: templateName.trim() ? 1 : 0.5 }}>
                        ✓
                      </button>
                      <button onClick={() => { setShowSaveTemplate(false); setTemplateName(""); }} style={{ ...miniActionBtn, color: "#e53e3e", borderColor: "#fca5a5", fontSize: 12 }}>
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {templates.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {templates.map((tmpl) => (
                    <div key={tmpl.id} style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "6px 10px",
                      background: "#fff", borderRadius: 8, border: "1px solid #e0e7ff",
                      fontSize: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    }}>
                      {editingTemplateId === tmpl.id ? (
                        <>
                          <input
                            type="text" value={editingTemplateName} onChange={(e) => setEditingTemplateName(e.target.value)}
                            style={{ border: "1px solid #ccc", borderRadius: 4, padding: "2px 6px", fontSize: 12, width: 120 }}
                            onKeyDown={(e) => e.key === "Enter" && updateTemplate(tmpl.id)}
                            autoFocus
                          />
                          <button onClick={() => updateTemplate(tmpl.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#38a169", fontSize: 14, padding: "0 2px" }} title={isZh ? "儲存" : "Save"}>✓</button>
                          <button onClick={() => { setEditingTemplateId(null); setEditingTemplateName(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#e53e3e", fontSize: 14, padding: "0 2px" }} title={isZh ? "取消" : "Cancel"}>✕</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => applyTemplate(tmpl)} style={{ background: "none", border: "none", cursor: "pointer", color: "#333", fontWeight: 500, fontSize: 12, padding: 0 }} title={isZh ? "套用範本" : "Apply template"}>
                            {tmpl.name}
                          </button>
                          <span style={{ color: "#aaa", fontSize: 10 }}>({tmpl.aspectRatio})</span>
                          <button onClick={() => { setEditingTemplateId(tmpl.id); setEditingTemplateName(tmpl.name); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#667eea", fontSize: 12, padding: "0 2px" }} title={isZh ? "編輯" : "Edit"}>✏️</button>
                          <button onClick={() => deleteTemplate(tmpl.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#e53e3e", fontSize: 12, padding: "0 2px" }} title={isZh ? "刪除" : "Delete"}>🗑</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {templates.length === 0 && !isLoadingTemplates && (
                <p style={{ margin: 0, fontSize: 12, color: "#999" }}>{isZh ? "尚無儲存的範本。設定好影片參數後，點擊「儲存為範本」以便下次重複使用。" : "No templates saved yet. Configure your video settings and click \"Save as Template\" to reuse them later."}</p>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(320px, 1.2fr)", gap: 24 }}>
              {/* Left: Settings */}
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#333", marginBottom: 16 }}>
                  ⚙️ {t("slideshowSettings") || "Video Settings"}
                </h3>

                {/* Aspect Ratio */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>{t("slideshowAspectRatio") || "Aspect Ratio"}</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["4:5", "9:16"] as AspectRatio[]).map((ratio) => (
                      <button key={ratio} onClick={() => setAspectRatio(ratio)} style={{
                        flex: 1, padding: "8px", borderRadius: 8,
                        border: `2px solid ${aspectRatio === ratio ? "#667eea" : "#e0e0e0"}`,
                        background: aspectRatio === ratio ? "#f0f0ff" : "#fff",
                        color: aspectRatio === ratio ? "#667eea" : "#666",
                        fontWeight: 600, cursor: "pointer", fontSize: 13,
                      }}>
                        {ratio}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Duration */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>{t("slideshowDuration") || "Duration Per Image"}: {durationPerImage}s</label>
                  <input type="range" min={1} max={15} step={0.5} value={durationPerImage} onChange={(e) => setDurationPerImage(parseFloat(e.target.value))} style={{ width: "100%" }} />
                </div>

                {/* Transition */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>{t("slideshowTransition") || "Transition Effect"}</label>
                  <select value={transition} onChange={(e) => setTransition(e.target.value as TransitionType)} style={selectStyle}>
                    {TRANSITIONS.map((tr) => (
                      <option key={tr.value} value={tr.value}>{isZh ? tr.labelZh : tr.label}</option>
                    ))}
                  </select>
                </div>

                {/* Transition Duration */}
                {transition !== "none" && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>{t("slideshowTransitionDuration") || "Transition Duration"}: {transitionDuration}s</label>
                    <input type="range" min={0.2} max={2} step={0.1} value={transitionDuration} onChange={(e) => setTransitionDuration(parseFloat(e.target.value))} style={{ width: "100%" }} />
                  </div>
                )}

                {/* Text Settings */}
                <div style={{ padding: 16, background: "#f8f9ff", borderRadius: 10, border: "1px solid #e0e7ff", marginBottom: 16 }}>
                    <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#555" }}>
                      🔤 {isZh ? "文字設定" : "Text Settings"}
                    </h4>

                    {/* Font Family */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>{isZh ? "字型" : "Font Family"}</label>
                      <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value as FontFamily)} style={selectStyle}>
                        {FONT_OPTIONS.map((f) => (
                          <option key={f.value} value={f.value}>{isZh ? f.labelZh : f.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Font Size */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>{isZh ? "字體大小" : "Font Size"}: {fontSize}px</label>
                      <input type="range" min={16} max={80} step={2} value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} style={{ width: "100%" }} />
                    </div>

                    {/* Font Color */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={labelStyle}>{isZh ? "字體顏色" : "Font Color"}</label>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        {PRESET_COLORS.map((color) => (
                          <div
                            key={color}
                            onClick={() => setFontColor(color)}
                            style={{
                              width: 28, height: 28, borderRadius: 6, background: color, cursor: "pointer",
                              border: fontColor === color ? "3px solid #667eea" : "2px solid #ddd",
                              boxShadow: fontColor === color ? "0 0 0 2px rgba(102,126,234,0.3)" : "none",
                            }}
                          />
                        ))}
                        <input
                          type="color"
                          value={fontColor}
                          onChange={(e) => setFontColor(e.target.value)}
                          style={{ width: 28, height: 28, border: "none", cursor: "pointer", borderRadius: 4, padding: 0 }}
                          title={isZh ? "自訂顏色" : "Custom color"}
                        />
                        <span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>{fontColor}</span>
                      </div>
                    </div>

                    {/* Text Position */}
                    <div>
                      <label style={labelStyle}>{t("slideshowTextPosition") || "Text Position"}</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["top", "center", "bottom"] as TextPosition[]).map((pos) => (
                          <button key={pos} onClick={() => setTextPosition(pos)} style={{
                            flex: 1, padding: "6px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            border: `2px solid ${textPosition === pos ? "#667eea" : "#e0e0e0"}`,
                            background: textPosition === pos ? "#f0f0ff" : "#fff",
                            color: textPosition === pos ? "#667eea" : "#666",
                          }}>
                            {pos === "top" ? (isZh ? "頂部" : "Top") : pos === "center" ? (isZh ? "中間" : "Center") : (isZh ? "底部" : "Bottom")}
                          </button>
                        ))}
                      </div>
                    </div>
                </div>

                {/* Overlay Text */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>{t("slideshowOverlayText") || "Custom Overlay Text"}</label>
                  <input
                    type="text"
                    value={overlayText}
                    onChange={(e) => setOverlayText(e.target.value)}
                    placeholder={t("slideshowOverlayPlaceholder") || "Optional text on all slides"}
                    style={inputStyle}
                  />
                </div>

                {/* Background Color & Image Settings */}
                <div style={{ padding: 16, background: "#f8f9ff", borderRadius: 10, border: "1px solid #e0e7ff", marginBottom: 16 }}>
                  <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#555" }}>
                    🎨 {isZh ? "背景與圖片設定" : "Background & Image Settings"}
                  </h4>

                  {/* Background Color */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>{isZh ? "背景顏色" : "Background Color"}</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {["#FFFFFF", "#000000", "#F5F5F5", "#1A1A2E", "#E8E8E8", "#FFF8E7", "#F0F4FF", "#FFF0F0", "#F0FFF0", "#2D2D2D"].map((color) => (
                        <div
                          key={color}
                          onClick={() => setBackgroundColor(color)}
                          style={{
                            width: 28, height: 28, borderRadius: 6, background: color, cursor: "pointer",
                            border: backgroundColor === color ? "3px solid #667eea" : "2px solid #ddd",
                            boxShadow: backgroundColor === color ? "0 0 0 2px rgba(102,126,234,0.3)" : "none",
                          }}
                        />
                      ))}
                      <input
                        type="color"
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        style={{ width: 28, height: 28, border: "none", cursor: "pointer", borderRadius: 4, padding: 0 }}
                        title={isZh ? "自訂顏色" : "Custom color"}
                      />
                      <span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>{backgroundColor}</span>
                    </div>
                  </div>

                  {/* Image Scale */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>{isZh ? "圖片大小" : "Image Scale"}: {Math.round(imageScale * 100)}%</label>
                    <input
                      type="range" min={10} max={200} step={5}
                      value={Math.round(imageScale * 100)}
                      onChange={(e) => setImageScale(parseInt(e.target.value) / 100)}
                      style={{ width: "100%" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
                      <span>10%</span>
                      <button onClick={() => setImageScale(1.0)} style={{ background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "1px 8px", fontSize: 11, color: "#667eea", cursor: "pointer" }}>
                        {isZh ? "重置" : "Reset"}
                      </button>
                      <span>200%</span>
                    </div>
                  </div>

                  {/* Image Position X */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>{isZh ? "水平位置" : "Horizontal Position"}: {imageOffsetX > 0 ? "+" : ""}{imageOffsetX}%</label>
                    <input
                      type="range" min={-50} max={50} step={1}
                      value={imageOffsetX}
                      onChange={(e) => setImageOffsetX(parseInt(e.target.value))}
                      style={{ width: "100%" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
                      <span>← {isZh ? "左" : "Left"}</span>
                      <button onClick={() => setImageOffsetX(0)} style={{ background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "1px 8px", fontSize: 11, color: "#667eea", cursor: "pointer" }}>
                        {isZh ? "置中" : "Center"}
                      </button>
                      <span>{isZh ? "右" : "Right"} →</span>
                    </div>
                  </div>

                  {/* Image Position Y */}
                  <div style={{ marginBottom: 4 }}>
                    <label style={labelStyle}>{isZh ? "垂直位置" : "Vertical Position"}: {imageOffsetY > 0 ? "+" : ""}{imageOffsetY}%</label>
                    <input
                      type="range" min={-50} max={50} step={1}
                      value={imageOffsetY}
                      onChange={(e) => setImageOffsetY(parseInt(e.target.value))}
                      style={{ width: "100%" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
                      <span>↑ {isZh ? "上" : "Up"}</span>
                      <button onClick={() => setImageOffsetY(0)} style={{ background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "1px 8px", fontSize: 11, color: "#667eea", cursor: "pointer" }}>
                        {isZh ? "置中" : "Center"}
                      </button>
                      <span>{isZh ? "下" : "Down"} ↓</span>
                    </div>
                  </div>

                  {/* Reset All Button */}
                  <div style={{ textAlign: "center", marginTop: 10 }}>
                    <button
                      onClick={() => { setImageScale(1.0); setImageOffsetX(0); setImageOffsetY(0); }}
                      style={{ ...miniActionBtn, color: "#667eea", borderColor: "#667eea" }}
                    >
                      🔄 {isZh ? "重置圖片位置與大小" : "Reset Image Position & Scale"}
                    </button>
                  </div>
                </div>

                {/* Overlay Image (Logo, Watermark, etc.) */}
                <div style={{ padding: 16, background: "#f8f9ff", borderRadius: 10, border: "1px solid #e0e7ff", marginBottom: 16 }}>
                  <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#555" }}>
                    🖼️ {isZh ? "疊加圖片" : "Overlay Image"}
                  </h4>
                  <p style={{ margin: "0 0 10px", fontSize: 12, color: "#888" }}>
                    {isZh ? "上傳自訂圖片（如 Logo、浮水印）疊加在幻燈片上方" : "Upload a custom image (logo, watermark) to overlay on slides"}
                  </p>
                  {overlayImageUrl ? (
                    <div {...createDropHandler('overlay-image', 'image/*', 10, handleOverlayImageFile)} style={dropZoneStyle('overlay-image')}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <img src={overlayImageUrl} alt="overlay" style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 6, border: "1px solid #ddd" }} />
                        <span style={{ fontSize: 13, color: "#333", flex: 1 }}>{overlayImageFileName}</span>
                        <button onClick={() => { setOverlayImageUrl(null); setOverlayImageFileName(null); setOverlayImageScale(0.2); setOverlayImageX(0); setOverlayImageY(0); }} style={{ ...miniActionBtn, color: "#e53e3e", borderColor: "#fca5a5" }}>✕ {isZh ? "移除" : "Remove"}</button>
                      </div>

                      {/* Overlay Image Scale */}
                      <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>{isZh ? "疊加圖片大小" : "Overlay Size"}: {Math.round(overlayImageScale * 100)}%</label>
                        <input
                          type="range" min={5} max={100} step={1}
                          value={Math.round(overlayImageScale * 100)}
                          onChange={(e) => setOverlayImageScale(parseInt(e.target.value) / 100)}
                          style={{ width: "100%" }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
                          <span>5%</span>
                          <button onClick={() => setOverlayImageScale(0.2)} style={{ background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "1px 8px", fontSize: 11, color: "#667eea", cursor: "pointer" }}>
                            {isZh ? "重置" : "Reset"}
                          </button>
                          <span>100%</span>
                        </div>
                      </div>

                      {/* Overlay Image Position X */}
                      <div style={{ marginBottom: 12 }}>
                        <label style={labelStyle}>{isZh ? "水平位置" : "Horizontal"}: {overlayImageX > 0 ? "+" : ""}{overlayImageX}%</label>
                        <input
                          type="range" min={-50} max={50} step={1}
                          value={overlayImageX}
                          onChange={(e) => setOverlayImageX(parseInt(e.target.value))}
                          style={{ width: "100%" }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
                          <span>← {isZh ? "左" : "Left"}</span>
                          <button onClick={() => setOverlayImageX(0)} style={{ background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "1px 8px", fontSize: 11, color: "#667eea", cursor: "pointer" }}>
                            {isZh ? "置中" : "Center"}
                          </button>
                          <span>{isZh ? "右" : "Right"} →</span>
                        </div>
                      </div>

                      {/* Overlay Image Position Y */}
                      <div style={{ marginBottom: 4 }}>
                        <label style={labelStyle}>{isZh ? "垂直位置" : "Vertical"}: {overlayImageY > 0 ? "+" : ""}{overlayImageY}%</label>
                        <input
                          type="range" min={-50} max={50} step={1}
                          value={overlayImageY}
                          onChange={(e) => setOverlayImageY(parseInt(e.target.value))}
                          style={{ width: "100%" }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
                          <span>↑ {isZh ? "上" : "Up"}</span>
                          <button onClick={() => setOverlayImageY(0)} style={{ background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "1px 8px", fontSize: 11, color: "#667eea", cursor: "pointer" }}>
                            {isZh ? "置中" : "Center"}
                          </button>
                          <span>{isZh ? "下" : "Down"} ↓</span>
                        </div>
                      </div>

                      {/* Reset Overlay Position */}
                      <div style={{ textAlign: "center", marginTop: 10 }}>
                        <button
                          onClick={() => { setOverlayImageScale(0.2); setOverlayImageX(0); setOverlayImageY(0); }}
                          style={{ ...miniActionBtn, color: "#667eea", borderColor: "#667eea" }}
                        >
                          🔄 {isZh ? "重置疊加圖片位置" : "Reset Overlay Position"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div {...createDropHandler('overlay-image', 'image/*', 10, handleOverlayImageFile)} style={{ padding: 16, border: '2px dashed #d0d5dd', borderRadius: 8, textAlign: 'center', transition: 'all 0.2s', ...dropZoneStyle('overlay-image') }}>
                      <input ref={overlayImageInputRef} type="file" accept="image/*" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 10 * 1024 * 1024) { alert(isZh ? "圖片大小不能超過 10MB" : "Image must be under 10MB"); return; }
                        setIsUploadingOverlayImage(true);
                        try {
                          const reader = new FileReader();
                          const base64 = await new Promise<string>((resolve) => {
                            reader.onload = () => resolve((reader.result as string).split(",")[1]);
                            reader.readAsDataURL(file);
                          });
                          const result = await trpcMutate("slideshow.uploadImage", {
                            base64Data: base64,
                            fileName: file.name,
                            mimeType: file.type || "image/png",
                          });
                          if (result?.url) {
                            setOverlayImageUrl(result.url);
                            setOverlayImageFileName(file.name);
                          }
                        } catch (err: any) {
                          alert(err.message || "Upload failed");
                        } finally {
                          setIsUploadingOverlayImage(false);
                          if (overlayImageInputRef.current) overlayImageInputRef.current.value = "";
                        }
                      }} style={{ display: "none" }} />
                      <button onClick={() => overlayImageInputRef.current?.click()} disabled={isUploadingOverlayImage} style={{ ...buttonStyle, background: "#764ba2", fontSize: 13, padding: "8px 16px" }}>
                        {isUploadingOverlayImage ? "⏳ Uploading..." : `🖼️ ${isZh ? "上傳疊加圖片" : "Upload Overlay Image"}`}
                      </button>
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#999" }}>{isZh ? "支援 PNG, JPG, WebP（最大 10MB，建議使用透明背景 PNG）" : "Supports PNG, JPG, WebP (max 10MB, transparent PNG recommended)"}</p>
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: '#667eea' }}>{isZh ? '或拖曳圖片到此處' : 'or drag & drop image here'}</p>
                    </div>
                  )}
                </div>

                {/* Video Sections: Background / Intro / Outro */}
                <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0", marginBottom: 16 }}>
                  <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "#555" }}>
                    🎬 {isZh ? "影片設定" : "Video Settings"}
                  </h4>

                  {/* Background Video */}
                  <div style={{ marginBottom: 16, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>
                      🎥 {isZh ? "背景影片" : "Background Video"}
                    </label>
                    <p style={{ margin: "0 0 8px", fontSize: 11, color: "#888" }}>
                      {isZh ? "上傳影片作為幻燈片背景，商品圖片會疊加在影片上方" : "Upload a video as slideshow background, product images overlay on top"}
                    </p>
                    {backgroundVideoUrl ? (
                      <div>
                        <video src={backgroundVideoUrl} controls style={{ width: "100%", maxHeight: 150, borderRadius: 6, marginBottom: 8, background: "#000" }} />
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 13, color: "#333" }}>🎬 {backgroundVideoFileName}</span>
                          <button onClick={() => { setBackgroundVideoUrl(null); setBackgroundVideoFileName(null); }} style={{ ...miniActionBtn, color: "#e53e3e", borderColor: "#fca5a5" }}>✕ {isZh ? "移除" : "Remove"}</button>
                        </div>
                      </div>
                    ) : (
                      <div {...createDropHandler('bg-video', 'video/*', 50, (f) => handleVideoFile('bg', f))} style={{ padding: 12, border: '2px dashed #d0d5dd', borderRadius: 8, textAlign: 'center', transition: 'all 0.2s', ...dropZoneStyle('bg-video') }}>
                        <input ref={bgVideoInputRef} type="file" accept="video/*" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 50 * 1024 * 1024) { alert(isZh ? "影片大小不能超過 50MB" : "Video must be under 50MB"); return; }
                          setIsUploadingBgVideo(true);
                          try {
                            const base64 = await fileToBase64(file);
                            const result = await trpcMutate("slideshow.uploadVideo", { base64Data: base64, fileName: file.name, mimeType: file.type || "video/mp4" });
                            if (result?.url) { setBackgroundVideoUrl(result.url); setBackgroundVideoFileName(file.name); }
                          } catch (err: any) { alert(err.message || "Upload failed"); } finally {
                            setIsUploadingBgVideo(false);
                            if (bgVideoInputRef.current) bgVideoInputRef.current.value = "";
                          }
                        }} style={{ display: "none" }} />
                        <button onClick={() => bgVideoInputRef.current?.click()} disabled={isUploadingBgVideo} style={{ ...buttonStyle, background: "#16a34a", fontSize: 13, padding: "8px 16px" }}>
                          {isUploadingBgVideo ? "⏳ Uploading..." : `🎥 ${isZh ? "上傳背景影片" : "Upload Background Video"}`}
                        </button>
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#999" }}>{isZh ? "支援 MP4, MOV, WebM（最大 50MB）" : "Supports MP4, MOV, WebM (max 50MB)"}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 11, color: '#667eea' }}>{isZh ? '或拖曳影片到此處' : 'or drag & drop video here'}</p>
                      </div>
                    )}
                  </div>

                  {/* Intro Video */}
                  <div style={{ marginBottom: 16, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>
                      ⏮️ {isZh ? "片頭影片" : "Intro Video"}
                    </label>
                    <p style={{ margin: "0 0 8px", fontSize: 11, color: "#888" }}>
                      {isZh ? "在幻燈片開始前播放的影片" : "Video played before the slideshow starts"}
                    </p>
                    {introVideoUrl ? (
                      <div>
                        <video src={introVideoUrl} controls style={{ width: "100%", maxHeight: 150, borderRadius: 6, marginBottom: 8, background: "#000" }} />
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 13, color: "#333" }}>⏮️ {introVideoFileName}</span>
                          <button onClick={() => { setIntroVideoUrl(null); setIntroVideoFileName(null); }} style={{ ...miniActionBtn, color: "#e53e3e", borderColor: "#fca5a5" }}>✕ {isZh ? "移除" : "Remove"}</button>
                        </div>
                      </div>
                    ) : (
                      <div {...createDropHandler('intro-video', 'video/*', 50, (f) => handleVideoFile('intro', f))} style={{ padding: 12, border: '2px dashed #d0d5dd', borderRadius: 8, textAlign: 'center', transition: 'all 0.2s', ...dropZoneStyle('intro-video') }}>
                        <input ref={introVideoInputRef} type="file" accept="video/*" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 50 * 1024 * 1024) { alert(isZh ? "影片大小不能超過 50MB" : "Video must be under 50MB"); return; }
                          setIsUploadingIntroVideo(true);
                          try {
                            const base64 = await fileToBase64(file);
                            const result = await trpcMutate("slideshow.uploadVideo", { base64Data: base64, fileName: file.name, mimeType: file.type || "video/mp4" });
                            if (result?.url) { setIntroVideoUrl(result.url); setIntroVideoFileName(file.name); }
                          } catch (err: any) { alert(err.message || "Upload failed"); } finally {
                            setIsUploadingIntroVideo(false);
                            if (introVideoInputRef.current) introVideoInputRef.current.value = "";
                          }
                        }} style={{ display: "none" }} />
                        <button onClick={() => introVideoInputRef.current?.click()} disabled={isUploadingIntroVideo} style={{ ...buttonStyle, background: "#2563eb", fontSize: 13, padding: "8px 16px" }}>
                          {isUploadingIntroVideo ? "⏳ Uploading..." : `⏮️ ${isZh ? "上傳片頭影片" : "Upload Intro Video"}`}
                        </button>
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#999" }}>{isZh ? "支援 MP4, MOV, WebM（最大 50MB）" : "Supports MP4, MOV, WebM (max 50MB)"}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 11, color: '#667eea' }}>{isZh ? '或拖曳影片到此處' : 'or drag & drop video here'}</p>
                      </div>
                    )}
                  </div>

                  {/* Outro Video */}
                  <div style={{ padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>
                      ⏭️ {isZh ? "片尾影片" : "Outro Video"}
                    </label>
                    <p style={{ margin: "0 0 8px", fontSize: 11, color: "#888" }}>
                      {isZh ? "在幻燈片結束後播放的影片" : "Video played after the slideshow ends"}
                    </p>
                    {outroVideoUrl ? (
                      <div>
                        <video src={outroVideoUrl} controls style={{ width: "100%", maxHeight: 150, borderRadius: 6, marginBottom: 8, background: "#000" }} />
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 13, color: "#333" }}>⏭️ {outroVideoFileName}</span>
                          <button onClick={() => { setOutroVideoUrl(null); setOutroVideoFileName(null); }} style={{ ...miniActionBtn, color: "#e53e3e", borderColor: "#fca5a5" }}>✕ {isZh ? "移除" : "Remove"}</button>
                        </div>
                      </div>
                    ) : (
                      <div {...createDropHandler('outro-video', 'video/*', 50, (f) => handleVideoFile('outro', f))} style={{ padding: 12, border: '2px dashed #d0d5dd', borderRadius: 8, textAlign: 'center', transition: 'all 0.2s', ...dropZoneStyle('outro-video') }}>
                        <input ref={outroVideoInputRef} type="file" accept="video/*" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 50 * 1024 * 1024) { alert(isZh ? "影片大小不能超過 50MB" : "Video must be under 50MB"); return; }
                          setIsUploadingOutroVideo(true);
                          try {
                            const base64 = await fileToBase64(file);
                            const result = await trpcMutate("slideshow.uploadVideo", { base64Data: base64, fileName: file.name, mimeType: file.type || "video/mp4" });
                            if (result?.url) { setOutroVideoUrl(result.url); setOutroVideoFileName(file.name); }
                          } catch (err: any) { alert(err.message || "Upload failed"); } finally {
                            setIsUploadingOutroVideo(false);
                            if (outroVideoInputRef.current) outroVideoInputRef.current.value = "";
                          }
                        }} style={{ display: "none" }} />
                        <button onClick={() => outroVideoInputRef.current?.click()} disabled={isUploadingOutroVideo} style={{ ...buttonStyle, background: "#9333ea", fontSize: 13, padding: "8px 16px" }}>
                          {isUploadingOutroVideo ? "⏳ Uploading..." : `⏭️ ${isZh ? "上傳片尾影片" : "Upload Outro Video"}`}
                        </button>
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#999" }}>{isZh ? "支援 MP4, MOV, WebM（最大 50MB）" : "Supports MP4, MOV, WebM (max 50MB)"}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 11, color: '#667eea' }}>{isZh ? '或拖曳影片到此處' : 'or drag & drop video here'}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Background Music */}
                <div style={{ padding: 16, background: "#f8f9ff", borderRadius: 10, border: "1px solid #e0e7ff", marginBottom: 16 }}>
                  <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: "#555" }}>
                    🎵 {t("slideshowBackgroundMusic") || "Background Music"}
                  </h4>
                  {audioUrl ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, color: "#333" }}>🎶 {audioFileName}</span>
                      <button onClick={removeAudio} style={{ ...miniActionBtn, color: "#e53e3e", borderColor: "#fca5a5" }}>✕ {isZh ? "移除" : "Remove"}</button>
                      <div style={{ width: "100%", marginTop: 8 }}>
                        <label style={{ fontSize: 12, color: "#666" }}>{isZh ? "音量" : "Volume"}: {Math.round(audioVolume * 100)}%</label>
                        <input type="range" min={0} max={1} step={0.05} value={audioVolume} onChange={(e) => setAudioVolume(parseFloat(e.target.value))} style={{ width: "100%" }} />
                      </div>
                    </div>
                  ) : (
                    <div {...createDropHandler('audio', 'audio/*', 16, handleAudioFile)} style={{ padding: 12, border: '2px dashed #d0d5dd', borderRadius: 8, textAlign: 'center', transition: 'all 0.2s', ...dropZoneStyle('audio') }}>
                      <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleAudioUpload} style={{ display: "none" }} />
                      <button onClick={() => audioInputRef.current?.click()} disabled={isUploadingAudio} style={{ ...buttonStyle, background: "#764ba2", fontSize: 13, padding: "8px 16px" }}>
                        {isUploadingAudio ? "⏳ Uploading..." : `🎵 ${t("slideshowUploadAudio") || "Upload Audio"}`}
                      </button>
                      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#999" }}>{isZh ? "支援 MP3, WAV, OGG（最大 16MB）" : "Supports MP3, WAV, OGG (max 16MB)"}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 11, color: '#667eea' }}>{isZh ? '或拖曳音訊到此處' : 'or drag & drop audio here'}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Preview */}
              <div style={{ position: "sticky", top: 20, alignSelf: "flex-start" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: "#333", margin: 0 }}>
                    👁 {t("slideshowPreview") || "Preview"}
                  </h3>
                  <button
                    onClick={() => setShowReelsOverlay(!showReelsOverlay)}
                    style={{
                      background: showReelsOverlay ? "linear-gradient(135deg, #E1306C, #F77737)" : "#e0e0e0",
                      color: showReelsOverlay ? "#fff" : "#666",
                      border: "none",
                      borderRadius: 8,
                      padding: "5px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      transition: "all 0.2s",
                    }}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                    </svg>
                    Reels
                  </button>
                </div>
                {/* Resolution info */}
                <div style={{ fontSize: 11, color: "#999", marginBottom: 8, textAlign: "center" }}>
                  {aspectRatio === "4:5" ? "1080 × 1350px" : "1080 × 1920px"}
                </div>
                <div ref={previewContainerRef} style={{
                  background: backgroundColor, borderRadius: 12, overflow: "hidden",
                  aspectRatio: aspectRatio === "4:5" ? "4/5" : "9/16",
                  maxHeight: 650, width: "100%", position: "relative",
                  border: "1px solid #e0e0e0",
                  cursor: isDraggingImage || isDraggingOverlay ? 'grabbing' : 'default',
                }}>
                  {selectedImages.length > 0 && (
                    <>
                      <div style={{
                        width: "100%", height: "100%", position: "relative", overflow: "hidden",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <img
                          src={selectedImages[previewIndex % selectedImages.length]?.url}
                          alt=""
                          onMouseDown={(e) => handlePreviewImageMouseDown(e, 'image')}
                          style={{
                            maxWidth: `${Math.round(imageScale * 100)}%`,
                            maxHeight: `${Math.round(imageScale * 100)}%`,
                            objectFit: "contain",
                            animation: "fadeIn 0.5s",
                            transform: `translate(${imageOffsetX}%, ${imageOffsetY}%)`,
                            transition: isDraggingImage ? 'none' : "transform 0.2s, max-width 0.2s, max-height 0.2s",
                            cursor: isDraggingImage ? 'grabbing' : 'grab',
                            userSelect: 'none',
                          }}
                        />
                      </div>
                      {/* Text overlay preview - proportionally scaled to match actual video */}
                      {overlayText.trim() && (() => {
                        const canvasHeight = aspectRatio === "4:5" ? 1350 : 1920;
                        const previewScale = 650 / canvasHeight;
                        const previewFontSize = Math.max(8, Math.round(fontSize * previewScale));
                        return (
                          <div style={{
                            position: "absolute", left: 0, right: 0, padding: `${Math.round(12 * previewScale)}px ${Math.round(16 * previewScale)}px`,
                            background: "rgba(0,0,0,0.5)", textAlign: "center",
                            ...(textPosition === "top" ? { top: 0 } : textPosition === "center" ? { top: "50%", transform: "translateY(-50%)" } : { bottom: 0 }),
                          }}>
                            <div style={{
                              color: fontColor, fontSize: previewFontSize, fontWeight: 700,
                              fontFamily: fontFamily.includes("serif") ? "serif" : "sans-serif",
                              textShadow: "1px 1px 3px rgba(0,0,0,0.7)",
                              lineHeight: 1.3,
                            }}>
                              <div>{overlayText}</div>
                            </div>
                          </div>
                        );
                      })()}
                      {/* Overlay image preview */}
                      {overlayImageUrl && (() => {
                        const canvasWidth = aspectRatio === "4:5" ? 1080 : 1080;
                        const canvasHeight = aspectRatio === "4:5" ? 1350 : 1920;
                        const previewScale = 650 / canvasHeight;
                        const ovWidthPercent = overlayImageScale * 100;
                        return (
                          <img
                            src={overlayImageUrl}
                            alt="overlay preview"
                            onMouseDown={(e) => handlePreviewImageMouseDown(e, 'overlay')}
                            style={{
                              position: "absolute",
                              width: `${ovWidthPercent}%`,
                              height: "auto",
                              left: `${50 + overlayImageX}%`,
                              top: `${50 + overlayImageY}%`,
                              transform: "translate(-50%, -50%)",
                              pointerEvents: "auto",
                              objectFit: "contain",
                              transition: isDraggingOverlay ? 'none' : "all 0.2s",
                              cursor: isDraggingOverlay ? 'grabbing' : 'grab',
                              userSelect: 'none',
                            }}
                          />
                        );
                      })()}
                      {/* IG Reels Overlay */}
                      {showReelsOverlay && (
                        <ReelsOverlay
                          username={userCompanies.find(c => c.id === selectedCompanyId)?.name || "brand_name"}
                          caption={overlayText.trim() || (isZh ? "查看這個商品 🔥" : "Check out this product! 🔥")}
                          ctaText={isZh ? "立即購買" : "Shop Now"}
                          showCta={true}
                        />
                      )}
                      {/* Preview controls - above Reels overlay */}
                      <div style={{ position: "absolute", bottom: showReelsOverlay ? 52 : 12, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8, alignItems: "center", zIndex: 20 }}>
                        <button onClick={() => setPreviewIndex((prev) => (prev - 1 + selectedImages.length) % selectedImages.length)} style={previewBtn}>◀</button>
                        <button onClick={() => setIsPreviewPlaying(!isPreviewPlaying)} style={previewBtn}>{isPreviewPlaying ? "⏸" : "▶"}</button>
                        <button onClick={() => setPreviewIndex((prev) => (prev + 1) % selectedImages.length)} style={previewBtn}>▶</button>
                      </div>
                      <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, zIndex: 20 }}>
                        {(previewIndex % selectedImages.length) + 1}/{selectedImages.length}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Navigation Buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
              <button onClick={() => setCurrentStep(1)} style={{ ...buttonStyle, background: "#888" }}>
                ← {t("slideshowPrev") || "Back"}
              </button>

              {/* Single or Batch */}
              <div style={{ display: "flex", gap: 12 }}>
                {selectedProductIds.size > 1 && (
                  <button
                    onClick={() => {
                      setBatchItems(selectedProducts.map((p) => ({ product: p, status: "pending" })));
                      setCurrentStep(3);
                    }}
                    style={{ ...buttonStyle, background: "linear-gradient(135deg, #f59e0b, #d97706)", padding: "12px 24px" }}
                  >
                    🚀 {isZh ? "批次生成" : "Batch Generate"} ({selectedProductIds.size} {isZh ? "個商品" : "products"})
                  </button>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || selectedImages.length === 0}
                  style={{
                    ...buttonStyle,
                    background: isGenerating ? "#999" : "linear-gradient(135deg, #667eea, #764ba2)",
                    padding: "12px 32px", fontSize: 15,
                    cursor: isGenerating ? "not-allowed" : "pointer",
                  }}
                >
                  {isGenerating ? `⏳ ${t("slideshowGenerating") || "Generating..."}` : `🎬 ${t("slideshowGenerate") || "Generate Video"}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP 3: Generate & Download ===== */}
        {currentStep === 3 && (
          <div>
            {/* Single Mode Results */}
            {batchItems.length === 0 && (
              <div>
                {isGenerating && (
                  <div style={{ textAlign: "center", padding: 40 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                    <h3 style={{ color: "#667eea", marginBottom: 8 }}>{generationProgress || (t("slideshowGenerating") || "Generating video...")}</h3>
                    <p style={{ color: "#888", fontSize: 13 }}>{isZh ? "這可能需要 30-120 秒" : "This may take 30-120 seconds"}</p>
                  </div>
                )}

                {generationError && (
                  <div style={{ padding: 20, background: "#fff5f5", borderRadius: 12, border: "1px solid #fed7d7", textAlign: "center", marginBottom: 20 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>❌</div>
                    <h4 style={{ color: "#e53e3e", margin: "0 0 8px" }}>{isZh ? "生成失敗" : "Generation Failed"}</h4>
                    <p style={{ color: "#999", fontSize: 13 }}>{generationError}</p>
                  </div>
                )}

                {generatedVideoUrl && (
                  <div>
                    <div style={{ textAlign: "center", marginBottom: 20 }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                      <h3 style={{ color: "#16a34a", margin: "0 0 8px" }}>{isZh ? "影片生成成功！" : "Video Generated!"}</h3>
                    </div>

                    {/* Video Player - 9:16 aspect ratio */}
                    <div style={{ maxWidth: 365, margin: "0 auto 24px", borderRadius: 12, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.1)", position: "relative" }}>
                      <div style={{ aspectRatio: aspectRatio === "4:5" ? "4/5" : "9/16", width: "100%", background: "#000" }}>
                        <video src={generatedVideoUrl} controls style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                      </div>
                      {showReelsOverlay && (
                        <ReelsOverlay
                          username={userCompanies.find(c => c.id === selectedCompanyId)?.name || "brand_name"}
                          caption={overlayText.trim() || (isZh ? "查看這個商品 🔥" : "Check out this product! 🔥")}
                          ctaText={isZh ? "立即購買" : "Shop Now"}
                          showCta={true}
                        />
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                      <a href={generatedVideoUrl} download style={{ ...buttonStyle, textDecoration: "none", display: "inline-block" }}>
                        ⬇️ {t("slideshowDownload") || "Download"}
                      </a>
                      {googleAccessToken && (
                        <button
                          onClick={handleUploadToDrive}
                          disabled={isUploadingToDrive}
                          style={{ ...buttonStyle, background: "#0369a1", opacity: isUploadingToDrive ? 0.6 : 1 }}
                        >
                          {isUploadingToDrive ? "⏳ Uploading..." : `📁 ${t("slideshowUploadDrive") || "Upload to Drive"}`}
                        </button>
                      )}
                    </div>

                    {/* Drive Upload Result */}
                    {driveUploadResult && (
                      <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 10, border: "1px solid #bbf7d0", marginBottom: 20 }}>
                        <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "#166534" }}>✅ {isZh ? "已上傳到 Google Drive" : "Uploaded to Google Drive"}</h4>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <a href={driveUploadResult.downloadLink} target="_blank" rel="noopener noreferrer" style={{ color: "#0369a1", fontSize: 13 }}>📥 Download Link</a>
                          <a href={driveUploadResult.embedLink} target="_blank" rel="noopener noreferrer" style={{ color: "#0369a1", fontSize: 13 }}>🔗 Preview Link</a>
                        </div>

                        {/* Catalog Update */}
                        {selectedCatalogId && fbAccessToken && (
                          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #bbf7d0" }}>
                            <h5 style={{ margin: "0 0 8px", fontSize: 13, color: "#166534" }}>📦 {isZh ? "更新 Catalog 商品影片" : "Update Catalog Product Video"}</h5>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <select
                                value={selectedProductForCatalog}
                                onChange={(e) => setSelectedProductForCatalog(e.target.value)}
                                style={{ ...selectStyle, flex: 1, fontSize: 13 }}
                              >
                                <option value="">{isZh ? "選擇商品" : "Select product"}</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.retailerId}>{p.name} ({p.retailerId})</option>
                                ))}
                              </select>
                              <button
                                onClick={handleUpdateCatalog}
                                disabled={isUpdatingCatalog || !selectedProductForCatalog}
                                style={{ ...buttonStyle, fontSize: 12, padding: "8px 16px", background: "#16a34a", opacity: isUpdatingCatalog || !selectedProductForCatalog ? 0.5 : 1 }}
                              >
                                {isUpdatingCatalog ? "⏳" : "📦"} {isZh ? "更新" : "Update"}
                              </button>
                            </div>
                            {catalogUpdateResult && <p style={{ color: "#16a34a", fontSize: 12, marginTop: 6 }}>✅ {catalogUpdateResult}</p>}
                            {catalogUpdateError && <p style={{ color: "#e53e3e", fontSize: 12, marginTop: 6 }}>❌ {catalogUpdateError}</p>}
                          </div>
                        )}
                      </div>
                    )}
                    {driveUploadError && (
                      <div style={{ padding: 12, background: "#fff5f5", borderRadius: 8, border: "1px solid #fed7d7", color: "#e53e3e", fontSize: 13, marginBottom: 16 }}>
                        ❌ {driveUploadError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Batch Mode */}
            {batchItems.length > 0 && (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: "#333", marginBottom: 16 }}>
                  🚀 {isZh ? "批次生成" : "Batch Generation"} ({batchItems.length} {isZh ? "個商品" : "products"})
                </h3>

                {/* Batch Settings */}
                {!isBatchRunning && batchStats.done === 0 && (
                  <div style={{ padding: 16, background: "#f8f9ff", borderRadius: 12, border: "1px solid #e0e7ff", marginBottom: 20 }}>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "#555", cursor: "pointer" }}>
                        <input type="checkbox" checked={batchUploadToDrive} onChange={(e) => setBatchUploadToDrive(e.target.checked)} disabled={!googleAccessToken} style={{ width: 16, height: 16 }} />
                        📁 {isZh ? "上傳到 Google Drive" : "Upload to Google Drive"}
                        {!googleAccessToken && <span style={{ fontSize: 11, color: "#999" }}>({isZh ? "需登入" : "login required"})</span>}
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 500, color: "#555", cursor: "pointer" }}>
                        <input type="checkbox" checked={batchUpdateCatalog} onChange={(e) => setBatchUpdateCatalog(e.target.checked)} style={{ width: 16, height: 16 }} />
                        📦 {isZh ? "更新 Catalog 影片" : "Update Catalog Videos"}
                      </label>
                    </div>
                  </div>
                )}

                {/* Batch Progress */}
                {(batchStats.done > 0 || batchStats.running > 0) && (
                  <div style={{ padding: "16px 20px", background: "#f0fdf4", borderRadius: 12, border: "1px solid #bbf7d0", marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#166534" }}>
                        {isZh ? "進度" : "Progress"}: {batchStats.done}/{batchStats.total}
                      </span>
                      {batchStats.error > 0 && <span style={{ fontSize: 12, color: "#dc2626" }}>{batchStats.error} {isZh ? "個錯誤" : "errors"}</span>}
                    </div>
                    <div style={{ width: "100%", height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${(batchStats.done / batchStats.total) * 100}%`, height: "100%", background: "linear-gradient(135deg, #667eea, #764ba2)", borderRadius: 4, transition: "width 0.3s" }} />
                    </div>
                  </div>
                )}

                {/* Batch Action Buttons */}
                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 20 }}>
                  {!isBatchRunning ? (
                    batchStats.done === 0 ? (
                      <button onClick={handleBatchGenerate} style={{ ...buttonStyle, background: "linear-gradient(135deg, #667eea, #764ba2)", padding: "12px 32px", fontSize: 15 }}>
                        🚀 {isZh ? "開始批次生成" : "Start Batch Generation"}
                      </button>
                    ) : null
                  ) : (
                    <button onClick={handleStopBatch} style={{ ...buttonStyle, background: "#ef4444", padding: "12px 32px", fontSize: 15 }}>
                      ⏹ {isZh ? "停止" : "Stop"}
                    </button>
                  )}
                </div>

                {/* Batch Results Table */}
                <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e8e8", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #e0e0e0" }}>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>{isZh ? "商品" : "Product"}</th>
                        <th style={thStyle}>{isZh ? "圖片數" : "Images"}</th>
                        <th style={thStyle}>{isZh ? "狀態" : "Status"}</th>
                        <th style={thStyle}>{isZh ? "影片" : "Video"}</th>
                        <th style={thStyle}>{isZh ? "Drive" : "Drive"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchItems.map((item, idx) => {
                        const imgCount = [item.product.imageUrl, ...item.product.additionalImages].filter(Boolean).length;
                        return (
                          <tr key={idx} style={{ borderBottom: "1px solid #f0f0f0" }}>
                            <td style={tdStyle}>{idx + 1}</td>
                            <td style={tdStyle}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <img src={item.product.imageUrl} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover" }} />
                                <div>
                                  <div style={{ fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.product.name}</div>
                                  <div style={{ fontSize: 11, color: "#999" }}>{item.product.retailerId}</div>
                                </div>
                              </div>
                            </td>
                            <td style={tdStyle}>{imgCount}</td>
                            <td style={tdStyle}>
                              <span style={{
                                padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                                background: item.status === "done" ? "#dcfce7" : item.status === "error" ? "#fef2f2" : item.status === "pending" ? "#f3f4f6" : "#eff6ff",
                                color: item.status === "done" ? "#166534" : item.status === "error" ? "#991b1b" : item.status === "pending" ? "#6b7280" : "#1e40af",
                              }}>
                                {item.status === "done" ? "✅" : item.status === "error" ? "❌" : item.status === "pending" ? "⏳" : "🔄"} {item.status}
                              </span>
                              {item.error && <div style={{ fontSize: 11, color: "#991b1b", marginTop: 2 }}>{item.error}</div>}
                            </td>
                            <td style={tdStyle}>
                              {item.videoUrl && <a href={item.videoUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#667eea", fontSize: 12 }}>⬇️</a>}
                            </td>
                            <td style={tdStyle}>
                              {item.driveLink && <a href={item.driveLink} target="_blank" rel="noopener noreferrer" style={{ color: "#0369a1", fontSize: 12 }}>📁</a>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Back button */}
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <button onClick={() => { setCurrentStep(2); setBatchItems([]); }} style={{ ...buttonStyle, background: "#888" }}>
                ← {isZh ? "返回設定" : "Back to Settings"}
              </button>
            </div>
          </div>
        )}

        <AppFooter />
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </main>
  );
};

// ===== Shared Styles =====
const buttonStyle: React.CSSProperties = {
  background: "#667eea",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.2s",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #d0d0d0",
  fontSize: 14,
  background: "#fff",
  color: "#333",
  outline: "none",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #d0d0d0",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#555",
  marginBottom: 6,
};

const miniBtn: React.CSSProperties = {
  background: "rgba(240,240,240,0.9)",
  border: "1px solid #e0e0e0",
  borderRadius: 4,
  width: 24,
  height: 24,
  fontSize: 11,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const miniActionBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  border: "1px solid #e0e0e0",
  background: "#fff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const previewBtn: React.CSSProperties = {
  background: "rgba(0,0,0,0.5)",
  border: "none",
  borderRadius: "50%",
  width: 32,
  height: 32,
  color: "#fff",
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontWeight: 600,
  color: "#555",
  fontSize: 12,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
};
