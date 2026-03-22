import React, { useState, useEffect, useContext, useMemo, useCallback, useRef } from "react";
import { LanguageContext } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AppFooter } from "@/components/AppFooter";
import {
  getCompaniesByEmail,
  loadCompanySettings,
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
  isCustom?: boolean; // true if uploaded by user
}

type TransitionType = "fade" | "slideleft" | "slideright" | "slideup" | "slidedown" | "wipeleft" | "wiperight" | "none";
type AspectRatio = "4:5" | "9:16";
type TextPosition = "top" | "center" | "bottom";

// Helper: convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper: tRPC mutation call
const trpcMutate = async (path: string, input: any): Promise<any> => {
  const response = await fetch(`/api/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ json: input }),
  });
  const data = await response.json();
  if (data?.error) {
    throw new Error(data.error?.json?.message || "API error");
  }
  return data?.result?.data?.json;
};

export const SlideshowGenerator = () => {
  const { t } = useContext(LanguageContext);

  // Auth state
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleTokenClient, setGoogleTokenClient] = useState<any>(null);
  const [isGapiReady, setIsGapiReady] = useState(false);

  // Company state (shared with MainApp)
  const [userCompanies, setUserCompanies] = useState<CompanyInfo[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(getSelectedCompany());
  const [configuredCatalogs, setConfiguredCatalogs] = useState<CatalogConfig[]>([]);
  const [fbAccessToken, setFbAccessToken] = useState("");

  // Catalog & product state
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Selected images for slideshow
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
  const [showProductName, setShowProductName] = useState(false);
  const [textPosition, setTextPosition] = useState<TextPosition>("bottom");
  const [fontSize, setFontSize] = useState(40);

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

  // Initialize gapi client for Drive uploads
  useEffect(() => {
    const initGapi = () => {
      if (typeof gapi !== "undefined" && gapi.client) {
        gapi.client.load("drive", "v3").then(() => {
          setIsGapiReady(true);
        });
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
      if (data.email) {
        setUserEmail(data.email);
      }
    } catch (e) {
      console.error("Failed to fetch user email:", e);
    }
  };

  // ===== Load companies when email is available =====
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

  // ===== Load company settings when company changes =====
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

  // ===== Fetch products when catalog changes =====
  const handleFetchProducts = useCallback(async () => {
    if (!selectedCatalogId || !fbAccessToken) return;
    setIsLoadingProducts(true);
    setProductError(null);
    setProducts([]);

    try {
      const url = `/api/trpc/slideshow.fetchProducts?input=${encodeURIComponent(
        JSON.stringify({ json: { catalogId: selectedCatalogId, accessToken: fbAccessToken, limit: 100 } })
      )}`;
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (data?.result?.data?.json) {
        setProducts(data.result.data.json);
      } else if (data?.error) {
        setProductError(data.error?.json?.message || "Failed to fetch products");
      }
    } catch (e: any) {
      setProductError(e.message || "Failed to fetch products");
    } finally {
      setIsLoadingProducts(false);
    }
  }, [selectedCatalogId, fbAccessToken]);

  // ===== Filter products =====
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.retailerId.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  // ===== Toggle image selection =====
  const toggleImageSelection = (product: CatalogProduct, imageUrl: string) => {
    const exists = selectedImages.find((img) => img.url === imageUrl);
    if (exists) {
      setSelectedImages((prev) => prev.filter((img) => img.url !== imageUrl));
    } else {
      setSelectedImages((prev) => [
        ...prev,
        { url: imageUrl, label: product.name, productId: product.id },
      ]);
    }
  };

  const isImageSelected = (imageUrl: string) =>
    selectedImages.some((img) => img.url === imageUrl);

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
            {
              url: result.url,
              label: file.name.replace(/\.[^/.]+$/, ""),
              productId: `custom-${Date.now()}-${i}`,
              isCustom: true,
            },
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

  // ===== Generate slideshow =====
  const handleGenerate = async () => {
    if (selectedImages.length === 0) return;
    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedVideoUrl(null);
    setDriveUploadResult(null);
    setDriveUploadError(null);
    setCatalogUpdateResult(null);
    setCatalogUpdateError(null);

    try {
      const payload = {
        json: {
          images: selectedImages.map((img) => ({
            url: img.url,
            label: showProductName ? img.label : undefined,
          })),
          aspectRatio,
          durationPerImage,
          transition,
          transitionDuration,
          overlayText: overlayText.trim() || undefined,
          showProductName,
          textPosition,
          fontSize,
          audioUrl: audioUrl || undefined,
          audioVolume: audioUrl ? audioVolume : undefined,
        },
      };

      const res = await fetch("/api/trpc/slideshow.generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data?.result?.data?.json?.success) {
        setGeneratedVideoUrl(data.result.data.json.videoUrl);
        setCurrentStep(3);
      } else {
        const errMsg = data?.error?.json?.message || "Failed to generate video";
        setGenerationError(errMsg);
      }
    } catch (e: any) {
      setGenerationError(e.message || "Failed to generate video");
    } finally {
      setIsGenerating(false);
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

      // Download the video from S3 URL
      const videoResponse = await fetch(generatedVideoUrl);
      const videoBlob = await videoResponse.blob();

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const suffix = Math.random().toString(36).substring(2, 6);
      const fileName = `slideshow_${selectedCatalogId || "custom"}_${dateStr}_${suffix}.mp4`;

      const metadata = { name: fileName, mimeType: "video/mp4", parents: [folderId] };

      // Initiate resumable upload
      const initRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(metadata),
      });

      if (!initRes.ok) {
        throw new Error(`Failed to initiate upload: ${initRes.statusText}`);
      }

      const location = initRes.headers.get("Location");
      if (!location) throw new Error("Could not get resumable upload URL.");

      // Upload the video
      const uploadRes = await fetch(location, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: videoBlob,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.statusText}`);
      }

      const uploadedFile = await uploadRes.json();

      // Set permissions to anyone with link
      await gapi.client.drive.permissions.create({
        fileId: uploadedFile.id,
        resource: { role: "reader", type: "anyone" },
      });

      const downloadLink = `https://drive.google.com/uc?export=download&id=${uploadedFile.id}`;
      const embedLink = `https://drive.google.com/file/d/${uploadedFile.id}/preview`;

      setDriveUploadResult({ downloadLink, embedLink });
    } catch (e: any) {
      setDriveUploadError(e.message || "Failed to upload to Google Drive");
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  // ===== Update Catalog Video =====
  const handleUpdateCatalog = async () => {
    if (!generatedVideoUrl || !fbAccessToken || !selectedCatalogId || !selectedProductForCatalog) return;

    setIsUpdatingCatalog(true);
    setCatalogUpdateError(null);
    setCatalogUpdateResult(null);

    try {
      // Use the Google Drive download link if available, otherwise use S3 URL
      const videoUrlForCatalog = driveUploadResult?.downloadLink || generatedVideoUrl;

      const result = await trpcMutate("slideshow.updateCatalogVideo", {
        catalogId: selectedCatalogId,
        accessToken: fbAccessToken,
        retailerId: selectedProductForCatalog,
        videoUrl: videoUrlForCatalog,
      });

      if (result?.success) {
        setCatalogUpdateResult(
          t("slideshowCatalogUpdateSuccess") || `Catalog updated successfully for product ${selectedProductForCatalog}!`
        );
      } else {
        setCatalogUpdateError(result?.error || "Failed to update catalog");
      }
    } catch (e: any) {
      setCatalogUpdateError(e.message || "Failed to update catalog");
    } finally {
      setIsUpdatingCatalog(false);
    }
  };

  // ===== Estimated video duration =====
  const estimatedDuration = useMemo(() => {
    if (selectedImages.length === 0) return 0;
    if (selectedImages.length === 1 || transition === "none") {
      return selectedImages.length * durationPerImage;
    }
    const clampedTrans = Math.min(transitionDuration, durationPerImage * 0.4);
    return selectedImages.length * durationPerImage - (selectedImages.length - 1) * clampedTrans;
  }, [selectedImages.length, durationPerImage, transition, transitionDuration]);

  // Get unique product retailer IDs from selected images (for catalog update dropdown)
  const selectedProductRetailerIds = useMemo(() => {
    const ids = new Set<string>();
    selectedImages.forEach((img) => {
      if (!img.isCustom) {
        const product = products.find((p) => p.id === img.productId);
        if (product?.retailerId) ids.add(product.retailerId);
      }
    });
    return Array.from(ids);
  }, [selectedImages, products]);

  const transitions: { value: TransitionType; label: string }[] = [
    { value: "fade", label: "Fade" },
    { value: "slideleft", label: "Slide Left" },
    { value: "slideright", label: "Slide Right" },
    { value: "slideup", label: "Slide Up" },
    { value: "slidedown", label: "Slide Down" },
    { value: "wipeleft", label: "Wipe Left" },
    { value: "wiperight", label: "Wipe Right" },
    { value: "none", label: t("slideshowNoTransition") || "None" },
  ];

  return (
    <main className="container" style={{ maxWidth: 1200, margin: "0 auto", padding: "20px" }}>
      <div className="card" style={{ background: "#fff", borderRadius: 16, boxShadow: "0 2px 20px rgba(0,0,0,0.06)", padding: 0, overflow: "hidden" }}>
        {/* Header */}
        <header style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          color: "#fff",
          padding: "24px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={() => { window.location.hash = "#/app"; }}
              style={{
                background: "rgba(255,255,255,0.2)",
                border: "none",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              ← {t("back")}
            </button>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
                🎬 {t("slideshowTitle") || "Slideshow Video Generator"}
              </h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.85 }}>
                {t("slideshowSubtitle") || "Create product slideshow videos from catalog images"}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <LanguageSwitcher />
            {userEmail ? (
              <span style={{ fontSize: 13, opacity: 0.9 }}>📧 {userEmail}</span>
            ) : (
              <button
                onClick={() => googleTokenClient?.requestAccessToken()}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  color: "#fff",
                  borderRadius: 8,
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {t("loginWithGoogle")}
              </button>
            )}
          </div>
        </header>

        {/* Step Indicator */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 0,
          padding: "20px 32px 0",
          borderBottom: "1px solid #f0f0f0",
          paddingBottom: 16,
        }}>
          {[
            { step: 1, label: t("slideshowStep1") || "Select Images" },
            { step: 2, label: t("slideshowStep2") || "Configure Settings" },
            { step: 3, label: t("slideshowStep3") || "Generate & Download" },
          ].map(({ step, label }) => (
            <div
              key={step}
              onClick={() => {
                if (step === 1) setCurrentStep(1);
                else if (step === 2 && selectedImages.length > 0) setCurrentStep(2);
                else if (step === 3 && generatedVideoUrl) setCurrentStep(3);
              }}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "12px 8px",
                cursor: step <= currentStep || (step === 2 && selectedImages.length > 0) ? "pointer" : "default",
                borderBottom: `3px solid ${currentStep === step ? "#667eea" : "transparent"}`,
                transition: "all 0.2s",
              }}
            >
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: currentStep >= step ? "#667eea" : "#e0e0e0",
                color: currentStep >= step ? "#fff" : "#999",
                fontSize: 13,
                fontWeight: 700,
                marginBottom: 4,
              }}>
                {step}
              </div>
              <div style={{
                fontSize: 13,
                fontWeight: currentStep === step ? 600 : 400,
                color: currentStep === step ? "#333" : "#999",
              }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: "24px 32px 32px" }}>
          {/* ===== STEP 1: Select Images ===== */}
          {currentStep === 1 && (
            <div>
              {/* Company & Catalog Selection */}
              <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
                {userCompanies.length > 0 && (
                  <div style={{ flex: "1 1 200px" }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 6 }}>
                      {t("selectCompany")}
                    </label>
                    <select
                      value={selectedCompanyId || ""}
                      onChange={(e) => {
                        const id = parseInt(e.target.value);
                        setSelectedCompanyId(id);
                        saveSelectedCompany(id);
                        setProducts([]);
                        setSelectedImages([]);
                      }}
                      style={selectStyle}
                    >
                      {userCompanies.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ flex: "1 1 200px" }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 6 }}>
                    {t("selectCatalog")}
                  </label>
                  <select
                    value={selectedCatalogId}
                    onChange={(e) => {
                      setSelectedCatalogId(e.target.value);
                      setProducts([]);
                      setSelectedImages([]);
                    }}
                    style={selectStyle}
                  >
                    <option value="">{t("catalogIdPlaceholder")}</option>
                    {configuredCatalogs.map((c) => (
                      <option key={c.id} value={c.id}>{c.name || c.id}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "flex-end" }}>
                  <button
                    onClick={handleFetchProducts}
                    disabled={!selectedCatalogId || !fbAccessToken || isLoadingProducts}
                    style={{
                      ...buttonStyle,
                      background: !selectedCatalogId || !fbAccessToken ? "#ccc" : "#667eea",
                      cursor: !selectedCatalogId || !fbAccessToken ? "not-allowed" : "pointer",
                    }}
                  >
                    {isLoadingProducts ? (t("loadingProducts") || "Loading...") : (t("fetchProducts"))}
                  </button>
                </div>
              </div>

              {/* Search */}
              {products.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t("searchPlaceholder") || "Search products..."}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Error */}
              {productError && (
                <div style={{
                  background: "#fff5f5",
                  border: "1px solid #fed7d7",
                  borderRadius: 8,
                  padding: "12px 16px",
                  color: "#c53030",
                  fontSize: 14,
                  marginBottom: 16,
                }}>
                  {productError}
                </div>
              )}

              {/* Product Grid */}
              {filteredProducts.length > 0 && (
                <>
                  <div style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
                    {t("slideshowProductCount") || "Products"}: {filteredProducts.length}
                    {selectedImages.length > 0 && (
                      <span style={{ marginLeft: 16, color: "#667eea", fontWeight: 600 }}>
                        {t("slideshowSelectedCount") || "Selected"}: {selectedImages.length} {t("slideshowImages") || "images"}
                      </span>
                    )}
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: 12,
                    maxHeight: 500,
                    overflowY: "auto",
                    padding: 4,
                  }}>
                    {filteredProducts.map((product) => (
                      <ProductImageCard
                        key={product.id}
                        product={product}
                        isSelected={isImageSelected}
                        onToggle={toggleImageSelection}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Manual Image Upload Section */}
              <div style={{
                marginTop: 24,
                padding: "16px 20px",
                background: "#f8f9ff",
                borderRadius: 12,
                border: "1px dashed #667eea",
              }}>
                <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600, color: "#444" }}>
                  📤 {t("slideshowUploadCustomImages") || "Upload Custom Images"}
                </h4>
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "#777" }}>
                  {t("slideshowUploadCustomImagesDesc") || "Add your own images to the slideshow (max 10MB per image)"}
                </p>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => imageInputRef.current?.click()}
                  disabled={isUploadingImage}
                  style={{
                    ...buttonStyle,
                    background: isUploadingImage ? "#aaa" : "#667eea",
                    cursor: isUploadingImage ? "not-allowed" : "pointer",
                    fontSize: 13,
                    padding: "8px 20px",
                  }}
                >
                  {isUploadingImage
                    ? (t("slideshowUploading") || "Uploading...")
                    : (t("slideshowChooseImages") || "Choose Images")}
                </button>
              </div>

              {/* Selected Images Preview */}
              {selectedImages.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: "#333" }}>
                    {t("slideshowSelectedImages") || "Selected Images"} ({selectedImages.length})
                  </h3>
                  <div style={{
                    display: "flex",
                    gap: 8,
                    overflowX: "auto",
                    padding: "8px 0",
                  }}>
                    {selectedImages.map((img, idx) => (
                      <div key={`${img.url}-${idx}`} style={{
                        flex: "0 0 100px",
                        position: "relative",
                        borderRadius: 8,
                        overflow: "hidden",
                        border: img.isCustom ? "2px solid #38a169" : "2px solid #667eea",
                      }}>
                        <img
                          src={img.url}
                          alt={img.label}
                          style={{ width: 100, height: 100, objectFit: "cover" }}
                        />
                        <div style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          display: "flex",
                          justifyContent: "space-between",
                          padding: 2,
                        }}>
                          <span style={{
                            background: img.isCustom ? "#38a169" : "#667eea",
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 700,
                            borderRadius: 4,
                            padding: "1px 5px",
                          }}>
                            {idx + 1}{img.isCustom ? " ✦" : ""}
                          </span>
                          <button
                            onClick={() => removeSelectedImage(idx)}
                            style={{
                              background: "rgba(220,38,38,0.85)",
                              color: "#fff",
                              border: "none",
                              borderRadius: 4,
                              width: 18,
                              height: 18,
                              fontSize: 11,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            ✕
                          </button>
                        </div>
                        <div style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          display: "flex",
                          justifyContent: "center",
                          gap: 2,
                          padding: 2,
                        }}>
                          {idx > 0 && (
                            <button onClick={() => moveImage(idx, "up")} style={miniBtn}>◀</button>
                          )}
                          {idx < selectedImages.length - 1 && (
                            <button onClick={() => moveImage(idx, "down")} style={miniBtn}>▶</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next Button */}
              <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setCurrentStep(2)}
                  disabled={selectedImages.length === 0}
                  style={{
                    ...buttonStyle,
                    background: selectedImages.length === 0 ? "#ccc" : "#667eea",
                    cursor: selectedImages.length === 0 ? "not-allowed" : "pointer",
                    padding: "12px 32px",
                    fontSize: 15,
                  }}
                >
                  {t("next")} →
                </button>
              </div>
            </div>
          )}

          {/* ===== STEP 2: Configure Settings ===== */}
          {currentStep === 2 && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                {/* Left: Settings */}
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#333" }}>
                    {t("slideshowVideoSettings") || "Video Settings"}
                  </h3>

                  {/* Aspect Ratio */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>{t("slideshowAspectRatio") || "Aspect Ratio"}</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["4:5", "9:16"] as AspectRatio[]).map((ratio) => (
                        <button
                          key={ratio}
                          onClick={() => setAspectRatio(ratio)}
                          style={{
                            flex: 1,
                            padding: "10px 16px",
                            borderRadius: 8,
                            border: `2px solid ${aspectRatio === ratio ? "#667eea" : "#e0e0e0"}`,
                            background: aspectRatio === ratio ? "#f0f0ff" : "#fff",
                            color: aspectRatio === ratio ? "#667eea" : "#666",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                        >
                          {ratio === "4:5" ? "4:5 (1080×1350)" : "9:16 (1080×1920)"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Duration Per Image */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>
                      {t("slideshowDuration") || "Duration Per Image"}: {durationPerImage}s
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={15}
                      step={0.5}
                      value={durationPerImage}
                      onChange={(e) => setDurationPerImage(parseFloat(e.target.value))}
                      style={{ width: "100%" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
                      <span>1s</span><span>15s</span>
                    </div>
                  </div>

                  {/* Transition */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>{t("slideshowTransition") || "Transition Effect"}</label>
                    <select
                      value={transition}
                      onChange={(e) => setTransition(e.target.value as TransitionType)}
                      style={selectStyle}
                    >
                      {transitions.map((tr) => (
                        <option key={tr.value} value={tr.value}>{tr.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Transition Duration */}
                  {transition !== "none" && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>
                        {t("slideshowTransDuration") || "Transition Duration"}: {transitionDuration}s
                      </label>
                      <input
                        type="range"
                        min={0.2}
                        max={3}
                        step={0.1}
                        value={transitionDuration}
                        onChange={(e) => setTransitionDuration(parseFloat(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>
                  )}

                  {/* Text Overlay */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>{t("slideshowOverlayText") || "Text Overlay"}</label>
                    <input
                      type="text"
                      value={overlayText}
                      onChange={(e) => setOverlayText(e.target.value)}
                      placeholder={t("slideshowOverlayPlaceholder") || "Optional: Add text overlay on all frames"}
                      style={inputStyle}
                    />
                  </div>

                  {/* Show Product Name */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={showProductName}
                        onChange={(e) => setShowProductName(e.target.checked)}
                        style={{ width: 16, height: 16 }}
                      />
                      {t("slideshowShowProductName") || "Show Product Name on Each Image"}
                    </label>
                  </div>

                  {/* Text Position */}
                  {(overlayText || showProductName) && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>{t("slideshowTextPosition") || "Text Position"}</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        {(["top", "center", "bottom"] as TextPosition[]).map((pos) => (
                          <button
                            key={pos}
                            onClick={() => setTextPosition(pos)}
                            style={{
                              flex: 1,
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: `2px solid ${textPosition === pos ? "#667eea" : "#e0e0e0"}`,
                              background: textPosition === pos ? "#f0f0ff" : "#fff",
                              color: textPosition === pos ? "#667eea" : "#666",
                              fontWeight: 500,
                              cursor: "pointer",
                              fontSize: 13,
                              textTransform: "capitalize",
                            }}
                          >
                            {pos === "top" ? (t("slideshowTop") || "Top") : pos === "center" ? (t("slideshowCenter") || "Center") : (t("slideshowBottom") || "Bottom")}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Font Size */}
                  {(overlayText || showProductName) && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle}>
                        {t("slideshowFontSize") || "Font Size"}: {fontSize}px
                      </label>
                      <input
                        type="range"
                        min={16}
                        max={80}
                        step={2}
                        value={fontSize}
                        onChange={(e) => setFontSize(parseInt(e.target.value))}
                        style={{ width: "100%" }}
                      />
                    </div>
                  )}

                  {/* ===== Background Music Section ===== */}
                  <div style={{
                    marginTop: 8,
                    padding: "16px",
                    background: "#fefce8",
                    borderRadius: 10,
                    border: "1px solid #fde68a",
                  }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600, color: "#92400e" }}>
                      🎵 {t("slideshowBackgroundMusic") || "Background Music"}
                    </h4>

                    {audioUrl ? (
                      <div>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 12,
                          background: "#fff",
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #e5e7eb",
                        }}>
                          <span style={{ fontSize: 20 }}>🎶</span>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {audioFileName}
                          </span>
                          <button
                            onClick={removeAudio}
                            style={{
                              background: "#ef4444",
                              color: "#fff",
                              border: "none",
                              borderRadius: 6,
                              padding: "4px 10px",
                              fontSize: 12,
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            ✕ {t("slideshowRemove") || "Remove"}
                          </button>
                        </div>

                        {/* Volume Control */}
                        <div>
                          <label style={{ ...labelStyle, color: "#92400e" }}>
                            {t("slideshowVolume") || "Volume"}: {Math.round(audioVolume * 100)}%
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={audioVolume}
                            onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
                            style={{ width: "100%" }}
                          />
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#999" }}>
                            <span>🔇 0%</span><span>🔊 100%</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <input
                          ref={audioInputRef}
                          type="file"
                          accept="audio/*"
                          onChange={handleAudioUpload}
                          style={{ display: "none" }}
                        />
                        <button
                          onClick={() => audioInputRef.current?.click()}
                          disabled={isUploadingAudio}
                          style={{
                            ...buttonStyle,
                            background: isUploadingAudio ? "#aaa" : "#d97706",
                            cursor: isUploadingAudio ? "not-allowed" : "pointer",
                            fontSize: 13,
                            padding: "8px 20px",
                          }}
                        >
                          {isUploadingAudio
                            ? (t("slideshowUploading") || "Uploading...")
                            : (t("slideshowChooseAudio") || "Choose Audio File")}
                        </button>
                        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#999" }}>
                          {t("slideshowAudioFormats") || "Supports MP3, WAV, OGG (max 16MB)"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Preview */}
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#333" }}>
                    {t("slideshowPreview") || "Preview"}
                  </h3>
                  <div style={{
                    background: "#f8f8f8",
                    borderRadius: 12,
                    padding: 16,
                    border: "1px solid #e8e8e8",
                  }}>
                    {/* Aspect ratio preview */}
                    <div style={{
                      width: "100%",
                      maxWidth: aspectRatio === "4:5" ? 240 : 180,
                      aspectRatio: aspectRatio === "4:5" ? "4/5" : "9/16",
                      margin: "0 auto",
                      background: "#000",
                      borderRadius: 8,
                      overflow: "hidden",
                      position: "relative",
                    }}>
                      {selectedImages.length > 0 && (
                        <img
                          src={selectedImages[0].url}
                          alt="Preview"
                          style={{ width: "100%", height: "100%", objectFit: "contain", background: "#fff" }}
                        />
                      )}
                      {overlayText && (
                        <div style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          textAlign: "center",
                          color: "#fff",
                          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
                          fontSize: Math.max(10, fontSize * 0.3),
                          fontWeight: 700,
                          padding: "4px 8px",
                          ...(textPosition === "top" ? { top: "5%" } : textPosition === "bottom" ? { bottom: "5%" } : { top: "50%", transform: "translateY(-50%)" }),
                        }}>
                          {overlayText}
                        </div>
                      )}
                      {showProductName && selectedImages[0] && (
                        <div style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          textAlign: "center",
                          color: "#fff",
                          textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                          fontSize: Math.max(8, fontSize * 0.25),
                          fontWeight: 500,
                          padding: "4px 8px",
                          ...(textPosition === "top" ? { top: "12%" } : textPosition === "bottom" ? { bottom: "12%" } : { top: "55%" }),
                        }}>
                          {selectedImages[0].label}
                        </div>
                      )}
                    </div>

                    {/* Summary */}
                    <div style={{ marginTop: 16, fontSize: 13, color: "#666" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span>{t("slideshowImageCount") || "Images"}:</span>
                        <strong>{selectedImages.length}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span>{t("slideshowEstDuration") || "Est. Duration"}:</span>
                        <strong>{estimatedDuration.toFixed(1)}s</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span>{t("slideshowResolution") || "Resolution"}:</span>
                        <strong>{aspectRatio === "4:5" ? "1080×1350" : "1080×1920"}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span>{t("slideshowTransition") || "Transition"}:</span>
                        <strong>{transitions.find((tr) => tr.value === transition)?.label}</strong>
                      </div>
                      {audioUrl && (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>🎵 {t("slideshowBackgroundMusic") || "Music"}:</span>
                          <strong style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {audioFileName}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation */}
              <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between" }}>
                <button onClick={() => setCurrentStep(1)} style={{ ...buttonStyle, background: "#888" }}>
                  ← {t("back")}
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || selectedImages.length === 0}
                  style={{
                    ...buttonStyle,
                    background: isGenerating ? "#aaa" : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    cursor: isGenerating ? "not-allowed" : "pointer",
                    padding: "12px 32px",
                    fontSize: 15,
                  }}
                >
                  {isGenerating ? (
                    <>{t("slideshowGenerating") || "Generating..."} ⏳</>
                  ) : (
                    <>🎬 {t("slideshowGenerate") || "Generate Video"}</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* ===== STEP 3: Result ===== */}
          {currentStep === 3 && (
            <div>
              {generationError && (
                <div style={{
                  background: "#fff5f5",
                  border: "1px solid #fed7d7",
                  borderRadius: 12,
                  padding: "20px",
                  color: "#c53030",
                  marginBottom: 24,
                  textAlign: "center",
                }}>
                  <strong>Error:</strong> {generationError}
                  <br />
                  <button
                    onClick={() => { setCurrentStep(2); setGenerationError(null); }}
                    style={{ ...buttonStyle, background: "#c53030", marginTop: 12 }}
                  >
                    {t("back")} → {t("slideshowStep2") || "Settings"}
                  </button>
                </div>
              )}

              {generatedVideoUrl && (
                <div>
                  <div style={{
                    background: "#f0fff4",
                    border: "1px solid #c6f6d5",
                    borderRadius: 12,
                    padding: "20px",
                    marginBottom: 24,
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
                    <h3 style={{ fontSize: 18, fontWeight: 600, color: "#22543d", marginBottom: 4 }}>
                      {t("slideshowSuccess") || "Video Generated Successfully!"}
                    </h3>
                    <p style={{ fontSize: 13, color: "#276749" }}>
                      {t("slideshowSuccessDesc") || "Your slideshow video is ready to download."}
                    </p>
                  </div>

                  {/* Video Player */}
                  <div style={{
                    maxWidth: aspectRatio === "4:5" ? 400 : 300,
                    margin: "0 auto 24px",
                    borderRadius: 12,
                    overflow: "hidden",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
                  }}>
                    <video
                      src={generatedVideoUrl}
                      controls
                      autoPlay
                      style={{ width: "100%", display: "block" }}
                    />
                  </div>

                  {/* Primary Actions */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                    <a
                      href={generatedVideoUrl}
                      download="slideshow.mp4"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        ...buttonStyle,
                        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "12px 24px",
                      }}
                    >
                      ⬇️ {t("slideshowDownload") || "Download Video"}
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedVideoUrl);
                        alert(t("slideshowUrlCopied") || "URL copied to clipboard!");
                      }}
                      style={{ ...buttonStyle, background: "#38a169" }}
                    >
                      📋 {t("slideshowCopyUrl") || "Copy URL"}
                    </button>
                    <button
                      onClick={() => {
                        setGeneratedVideoUrl(null);
                        setCurrentStep(1);
                        setSelectedImages([]);
                        setDriveUploadResult(null);
                        setCatalogUpdateResult(null);
                        setAudioUrl(null);
                        setAudioFileName(null);
                      }}
                      style={{ ...buttonStyle, background: "#888" }}
                    >
                      🔄 {t("slideshowCreateNew") || "Create New"}
                    </button>
                  </div>

                  {/* ===== Google Drive Upload Section ===== */}
                  <div style={{
                    padding: "20px",
                    background: "#f0f9ff",
                    borderRadius: 12,
                    border: "1px solid #bae6fd",
                    marginBottom: 16,
                  }}>
                    <h4 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#0369a1" }}>
                      📁 {t("slideshowUploadToDrive") || "Upload to Google Drive"}
                    </h4>

                    {driveUploadResult ? (
                      <div style={{
                        background: "#ecfdf5",
                        border: "1px solid #a7f3d0",
                        borderRadius: 8,
                        padding: "12px 16px",
                      }}>
                        <p style={{ margin: "0 0 8px", fontSize: 13, color: "#065f46", fontWeight: 600 }}>
                          ✅ {t("slideshowDriveUploadSuccess") || "Uploaded to Google Drive!"}
                        </p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <a href={driveUploadResult.downloadLink} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 12, color: "#0369a1", textDecoration: "underline" }}>
                            {t("slideshowDriveDownloadLink") || "Download Link"}
                          </a>
                          <a href={driveUploadResult.embedLink} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 12, color: "#0369a1", textDecoration: "underline" }}>
                            {t("slideshowDrivePreviewLink") || "Preview Link"}
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {!googleAccessToken ? (
                          <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
                            {t("slideshowLoginForDrive") || "Please login with Google to upload to Drive."}
                          </p>
                        ) : (
                          <button
                            onClick={handleUploadToDrive}
                            disabled={isUploadingToDrive}
                            style={{
                              ...buttonStyle,
                              background: isUploadingToDrive ? "#aaa" : "#0284c7",
                              cursor: isUploadingToDrive ? "not-allowed" : "pointer",
                              fontSize: 14,
                            }}
                          >
                            {isUploadingToDrive
                              ? (t("slideshowUploadingToDrive") || "Uploading to Drive...")
                              : (t("slideshowUploadToDriveBtn") || "Upload to Google Drive")}
                          </button>
                        )}
                        {driveUploadError && (
                          <p style={{ margin: "8px 0 0", fontSize: 13, color: "#c53030" }}>
                            {driveUploadError}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ===== Catalog Update Section ===== */}
                  {selectedCatalogId && fbAccessToken && selectedProductRetailerIds.length > 0 && (
                    <div style={{
                      padding: "20px",
                      background: "#fffbeb",
                      borderRadius: 12,
                      border: "1px solid #fde68a",
                    }}>
                      <h4 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#92400e" }}>
                        📦 {t("slideshowUpdateCatalog") || "Update Catalog Product Video"}
                      </h4>

                      {catalogUpdateResult ? (
                        <div style={{
                          background: "#ecfdf5",
                          border: "1px solid #a7f3d0",
                          borderRadius: 8,
                          padding: "12px 16px",
                        }}>
                          <p style={{ margin: 0, fontSize: 13, color: "#065f46", fontWeight: 600 }}>
                            ✅ {catalogUpdateResult}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#78716c" }}>
                            {t("slideshowCatalogUpdateDesc") || "Select a product to update its video in the Meta Catalog."}
                          </p>
                          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                            <div style={{ flex: "1 1 200px" }}>
                              <label style={{ ...labelStyle, color: "#92400e" }}>
                                {t("slideshowSelectProduct") || "Select Product (Retailer ID)"}
                              </label>
                              <select
                                value={selectedProductForCatalog}
                                onChange={(e) => setSelectedProductForCatalog(e.target.value)}
                                style={selectStyle}
                              >
                                <option value="">{t("slideshowSelectProductPlaceholder") || "-- Select Product --"}</option>
                                {selectedProductRetailerIds.map((rid) => (
                                  <option key={rid} value={rid}>{rid}</option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={handleUpdateCatalog}
                              disabled={isUpdatingCatalog || !selectedProductForCatalog}
                              style={{
                                ...buttonStyle,
                                background: isUpdatingCatalog || !selectedProductForCatalog ? "#aaa" : "#d97706",
                                cursor: isUpdatingCatalog || !selectedProductForCatalog ? "not-allowed" : "pointer",
                                fontSize: 14,
                              }}
                            >
                              {isUpdatingCatalog
                                ? (t("slideshowUpdatingCatalog") || "Updating...")
                                : (t("slideshowUpdateCatalogBtn") || "Update Catalog")}
                            </button>
                          </div>
                          {catalogUpdateError && (
                            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#c53030" }}>
                              {catalogUpdateError}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isGenerating && (
                <div style={{ padding: "40px 0", textAlign: "center" }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: "#333", marginBottom: 8 }}>
                    {t("slideshowGenerating") || "Generating Video..."}
                  </h3>
                  <p style={{ fontSize: 14, color: "#666" }}>
                    {t("slideshowPleaseWait") || "This may take a minute depending on the number of images."}
                  </p>
                  <div style={{
                    width: 200,
                    height: 4,
                    background: "#e0e0e0",
                    borderRadius: 2,
                    margin: "16px auto",
                    overflow: "hidden",
                  }}>
                    <div style={{
                      width: "60%",
                      height: "100%",
                      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                      borderRadius: 2,
                      animation: "pulse 1.5s ease-in-out infinite",
                    }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <AppFooter />
      </div>
    </main>
  );
};

// ===== Product Image Card Component =====
const ProductImageCard = ({
  product,
  isSelected,
  onToggle,
}: {
  product: CatalogProduct;
  isSelected: (url: string) => boolean;
  onToggle: (product: CatalogProduct, imageUrl: string) => void;
}) => {
  const allImages = [product.imageUrl, ...product.additionalImages].filter(Boolean);

  return (
    <div style={{
      background: "#fff",
      borderRadius: 10,
      border: "1px solid #e8e8e8",
      overflow: "hidden",
      transition: "box-shadow 0.2s",
    }}>
      {/* Main Image */}
      <div
        onClick={() => onToggle(product, product.imageUrl)}
        style={{
          position: "relative",
          cursor: "pointer",
          aspectRatio: "1",
          overflow: "hidden",
        }}
      >
        <img
          src={product.imageUrl}
          alt={product.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: isSelected(product.imageUrl) ? 0.7 : 1,
            transition: "opacity 0.2s",
          }}
        />
        {isSelected(product.imageUrl) && (
          <div style={{
            position: "absolute",
            top: 6,
            right: 6,
            background: "#667eea",
            color: "#fff",
            borderRadius: "50%",
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
          }}>
            ✓
          </div>
        )}
      </div>

      {/* Product Info */}
      <div style={{ padding: "8px 10px" }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#333",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {product.name}
        </div>
        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
          {product.retailerId}
        </div>

        {/* Additional images */}
        {product.additionalImages.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 6, overflowX: "auto" }}>
            {product.additionalImages.slice(0, 4).map((imgUrl, idx) => (
              <div
                key={idx}
                onClick={() => onToggle(product, imgUrl)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 4,
                  overflow: "hidden",
                  cursor: "pointer",
                  border: isSelected(imgUrl) ? "2px solid #667eea" : "1px solid #e0e0e0",
                  flexShrink: 0,
                }}
              >
                <img
                  src={imgUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
  background: "rgba(255,255,255,0.85)",
  border: "none",
  borderRadius: 3,
  width: 20,
  height: 18,
  fontSize: 10,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
