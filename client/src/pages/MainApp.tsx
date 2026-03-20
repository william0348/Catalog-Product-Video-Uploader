
import React, { useState, useMemo, useCallback, useEffect, useRef, useContext } from "react";
import { LanguageContext } from '@/contexts/LanguageContext';
import { IntroGuide } from '@/components/IntroGuide';
import { ToastContainer } from '@/components/Toast';
import { ImagePreview } from '@/components/ImagePreview';
import { ProductTable } from '@/components/ProductTable';
import { GoogleDriveUploader } from '@/components/GoogleDriveUploader';
import { AppFooter } from '@/components/AppFooter';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { 
    BASE_URL, GOOGLE_CLIENT_ID, GOOGLE_API_SCOPES, GOOGLE_AUTH_TOKEN_KEY,
    MASTER_GOOGLE_SHEET_ID, SHEET_TAB_NAME, GOOGLE_APPS_SCRIPT_URL,
    SESSION_DATA_KEY, INTRO_GUIDE_KEY, SHEET_DATA_HEADER
} from '@/constants';
import { loadSettings, type CatalogConfig } from '@/settingsStore';
import type { Product, ProductSet, Catalog, HoveredImage, ProductVideos, VideoType, ToastMessage, UploadedVideo, VideoFilterType } from '@/types';
import { apiFetch, fetchAllPages } from '@/api';
import { getColumnLetter } from '@/lib/helpers';

declare const gapi: any;
declare const window: any;

export const MainApp = () => {
  const [catalogId, setCatalogId] = useState("");
  const [clientName, setClientName] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [view, setView] = useState("input");
  const [catalogName, setCatalogName] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productSets, setProductSets] = useState<ProductSet[]>([]);
  const [selectedSet, setSelectedSet] = useState("all");
  const [showInStockOnly, setShowInStockOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [hoveredImage, setHoveredImage] = useState<HoveredImage | null>(null);
  const [googleTokenClient, setGoogleTokenClient] = useState<any>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string|null>(null);
  const [userEmail, setUserEmail] = useState<string|null>(null);
  const [isGapiClientReady, setIsGapiClientReady] = useState(false);
  const [uploadedVideos, setUploadedVideos] = useState<Record<string, ProductVideos>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [selectedRetailerIds, setSelectedRetailerIds] = useState<Set<string>>(new Set());
  const [videoFilter, setVideoFilter] = useState<VideoFilterType>('all');
  const [loadingProgress, setLoadingProgress] = useState<{ loaded: number; total: number | null } | null>(null);
  const [showIntroGuide, setShowIntroGuide] = useState(false);
  const [isSetDropdownOpen, setIsSetDropdownOpen] = useState(false);
  const [productSetSearchTerm, setProductSetSearchTerm] = useState("");
  const toastIdRef = useRef(0);
  const productSetRef = useRef(null);
  const googleLoginRef = useRef(null);
  const searchableSetRef = useRef<HTMLDivElement>(null);
  const { t } = useContext(LanguageContext);

  // ===== Settings-based state =====
  const [configuredCatalogs, setConfiguredCatalogs] = useState<CatalogConfig[]>([]);
  const [fbAccessToken, setFbAccessToken] = useState<string>('');

  // Load settings on mount
  useEffect(() => {
    const settings = loadSettings();
    setConfiguredCatalogs(settings.catalogs);
    setFbAccessToken(settings.facebookAccessToken);
  }, []);

  // Refresh settings when returning to input view
  useEffect(() => {
    if (view === 'input') {
      const settings = loadSettings();
      setConfiguredCatalogs(settings.catalogs);
      setFbAccessToken(settings.facebookAccessToken);
    }
  }, [view]);

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'info') => {
    const id = toastIdRef.current++;
    setToasts(currentToasts => [...currentToasts, { id, message, type }]);
    setTimeout(() => {
        removeToast(id);
    }, 5000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(currentToasts => currentToasts.filter(toast => toast.id !== id));
  }, []);
  
    useEffect(() => {
        const hasSeenGuide = localStorage.getItem(INTRO_GUIDE_KEY);
        if (!hasSeenGuide && view === 'data') {
            setTimeout(() => setShowIntroGuide(true), 500);
        }
    }, [view]);

    const handleIntroComplete = () => {
        setShowIntroGuide(false);
        localStorage.setItem(INTRO_GUIDE_KEY, 'true');
    };

  useEffect(() => {
    const savedSession = localStorage.getItem(SESSION_DATA_KEY);
    if (savedSession) {
        try {
            const data = JSON.parse(savedSession);
            if (data.catalogId && data.view === 'data') {
                setCatalogId(data.catalogId);
                setClientName(data.clientName || "");
                setCatalogName(data.catalogName || "");
                setView(data.view);
            }
        } catch (e) {
            console.error("Failed to parse session data", e);
            localStorage.removeItem(SESSION_DATA_KEY);
        }
    }
  }, []);

  const resetAndGoBack = useCallback(() => {
    localStorage.removeItem(SESSION_DATA_KEY);
    sessionStorage.removeItem('google_drive_folder_id');
    setView("input"); setProducts([]); setProductSets([]); setError(null);
    setCatalogId(""); setClientName(""); setAccessKey("");
    setSelectedSet("all"); setShowInStockOnly(false); setUploadedVideos({});
    setSearchTerm("");
    setSelectedRetailerIds(new Set());
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(GOOGLE_AUTH_TOKEN_KEY);
    sessionStorage.removeItem('google_drive_folder_id');
    setGoogleAccessToken(null);
    setUserEmail(null);
    setUploadedVideos({});
  }, []);
  
  useEffect(() => {
      const checkGapi = () => {
          if (window.gapi) {
              gapi.load('client', () => {
                   gapi.client.init({
                       discoveryDocs: [
                           "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
                           "https://www.googleapis.com/discovery/v1/apis/sheets/v4/rest"
                        ]
                   }).then(() => setIsGapiClientReady(true))
                   .catch((err:any) => setError(prev => prev || `Failed to initialize Google APIs. Error: ${err.message}`));
              });
          } else { setTimeout(checkGapi, 100); }
      };
      checkGapi();
  }, []);

  useEffect(() => {
      if (!isGapiClientReady) return;
      
      const checkGis = () => {
          if (window.google) {
              const tokenClient = window.google.accounts.oauth2.initTokenClient({
                  client_id: GOOGLE_CLIENT_ID, scope: GOOGLE_API_SCOPES,
                  callback: (tokenResponse: any) => {
                      if (tokenResponse.error) {
                          setError(`Google login error: ${tokenResponse.error_description || tokenResponse.error}`);
                          setGoogleAccessToken(null); 
                          localStorage.removeItem(GOOGLE_AUTH_TOKEN_KEY);
                          return;
                      }
                      const token = tokenResponse.access_token;
                      setGoogleAccessToken(token);
                      gapi.client.setToken({ access_token: token });
                      localStorage.setItem(GOOGLE_AUTH_TOKEN_KEY, token);
                  },
              });
              setGoogleTokenClient(tokenClient);
          } else { setTimeout(checkGis, 100); }
      };
      checkGis();
  }, [isGapiClientReady]);

    useEffect(() => {
        const storedToken = localStorage.getItem(GOOGLE_AUTH_TOKEN_KEY);
        if (storedToken && isGapiClientReady) {
            setGoogleAccessToken(storedToken);
            gapi.client.setToken({ access_token: storedToken });
        }
    }, [isGapiClientReady]);

  useEffect(() => {
    if (googleAccessToken && isGapiClientReady) {
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        })
        .then(response => {
            if (!response.ok) {
                 if (response.status === 401) {
                    handleLogout();
                    throw new Error('Google session expired. Please log in again.');
                }
                throw new Error('Failed to fetch user info');
            }
            return response.json();
        })
        .then(data => {
            if (data.email) {
                setUserEmail(data.email);
            } else {
                console.error("Email not found in userinfo response:", data);
                setError("Could not retrieve your Google email address.");
            }
        }).catch((err: any) => {
            console.error("Error fetching user profile:", err);
            if (!err.message.includes('session expired')) {
                setError("Could not fetch your Google user profile. Please try logging in again.");
            }
        });
    }
  }, [googleAccessToken, isGapiClientReady, handleLogout]);

  const writeDataToSheet = async (product: Product, video: UploadedVideo, videoType: VideoType) => {
    if (GOOGLE_APPS_SCRIPT_URL.includes("YOUR_APPS_SCRIPT_URL_HERE")) {
        const errorMsg = "Configuration error: Google Apps Script URL is not set in index.tsx. Please ask the administrator to configure it.";
        addToast(errorMsg, 'error');
        setUploadedVideos(prev => ({ ...prev, [product.retailer_id]: { ...prev[product.retailer_id], [videoType]: { ...video, saveError: errorMsg } }}));
        return;
    }
    if (!googleAccessToken) {
        const errorMsg = "Cannot write to sheet: Google user not logged in.";
        addToast(errorMsg, 'error');
        setUploadedVideos(prev => ({ ...prev, [product.retailer_id]: { ...prev[product.retailer_id], [videoType]: { ...video, saveError: errorMsg } }}));
        return;
    }
    
    const currentStateOfThisProduct = uploadedVideos[product.retailer_id] || {};
    const newVideosForProduct = { ...currentStateOfThisProduct, [videoType]: video };
    const masterVideo = newVideosForProduct.master;
    const nineBySixteenVideo = newVideosForProduct.nineBySixteen;

    const rowData = [
        catalogId, product.retailer_id, product.name, product.image_url,
        masterVideo?.downloadLink || '', masterVideo?.embedLink || '',
        nineBySixteenVideo?.downloadLink || '', nineBySixteenVideo?.embedLink || '',
        clientName,
        new Date().toISOString(),
        userEmail || 'N/A',
    ];

    const payload = {
      retailerId: product.retailer_id,
      rowData: rowData,
    };

    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (result.status === 'success') {
            addToast(t('recordSavedSuccess'), 'success');
            setUploadedVideos(prev => ({ ...prev, [product.retailer_id]: { ...prev[product.retailer_id], [videoType]: { ...video, saveError: undefined }}}));
        } else {
            throw new Error(result.message || 'The Apps Script API reported an unknown failure.');
        }
    } catch (err: any) {
        const saveError = `Failed to save record to Sheet. Error: ${err.message}`;
        addToast(saveError, 'error');
        setUploadedVideos(prev => ({ ...prev, [product.retailer_id]: { ...prev[product.retailer_id], [videoType]: { ...video, saveError }}}));
    }
  };

  const handleGoogleLogin = () => {
    if (googleTokenClient) {
        googleTokenClient.requestAccessToken();
    }
  };

  const syncVideosFromSheet = useCallback(async () => {
    if (!googleAccessToken || !isGapiClientReady) {
        setUploadedVideos({});
        return;
    }
    if (MASTER_GOOGLE_SHEET_ID.includes("YOUR_GOOGLE_SHEET_ID_HERE")) {
        setError("Please configure the Master Google Sheet ID in index.tsx.");
        return;
    }
    
    setIsSyncing(true);
    setError(null);
    try {
        gapi.client.setToken({ access_token: googleAccessToken });
        const lastColumn = getColumnLetter(SHEET_DATA_HEADER.length);
        const rangeToFetch = `${SHEET_TAB_NAME}!A:${lastColumn}`;
        
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: MASTER_GOOGLE_SHEET_ID,
            range: rangeToFetch,
        });
        
        const rows = response.result.values;

        if (rows && rows.length > 0) {
            const header = rows[0].map((h: any) => (h || '').trim());
            
            const retailerIdIndex = header.indexOf('Retailer ID');
            const masterDownloadLinkIndex = header.indexOf('4x5 Download');
            const masterEmbedLinkIndex = header.indexOf('4x5 Video Embed URL');
            const nineBySixteenDownloadLinkIndex = header.indexOf('9x16 Download');
            const nineBySixteenEmbedLinkIndex = header.indexOf('9x16 Video Embed URL');
            const productNameIndex = header.indexOf('Product Name');

            const missingRequiredHeaders = [];
            if (retailerIdIndex === -1) missingRequiredHeaders.push('Retailer ID');
            if (masterDownloadLinkIndex === -1) missingRequiredHeaders.push('4x5 Download');
            if (masterEmbedLinkIndex === -1) missingRequiredHeaders.push('4x5 Video Embed URL');

            if (missingRequiredHeaders.length > 0) {
                 const errorMsg = `Could not find required columns in Google Sheet: ${missingRequiredHeaders.join(', ')}. Please check the header's format.`;
                 setError(errorMsg);
                 setUploadedVideos({});
            } else {
                const syncedVideos: Record<string, ProductVideos> = {};
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || row.length <= retailerIdIndex) continue;
                    const retailerIdValue = row[retailerIdIndex];
                    if (retailerIdValue) {
                        const cleanRetailerId = String(retailerIdValue).trim();
                        const productVideos: ProductVideos = {};

                        if (row[masterDownloadLinkIndex] && row[masterEmbedLinkIndex]) {
                            productVideos.master = {
                                productName: productNameIndex > -1 ? (row[productNameIndex] || '') : '',
                                downloadLink: row[masterDownloadLinkIndex] || '',
                                embedLink: row[masterEmbedLinkIndex] || '',
                                saveError: undefined,
                                isProcessing: false,
                            };
                        }

                        if (nineBySixteenDownloadLinkIndex > -1 && nineBySixteenEmbedLinkIndex > -1 && row[nineBySixteenDownloadLinkIndex] && row[nineBySixteenEmbedLinkIndex]) {
                            productVideos.nineBySixteen = {
                                productName: productNameIndex > -1 ? (row[productNameIndex] || '') : '',
                                downloadLink: row[nineBySixteenDownloadLinkIndex] || '',
                                embedLink: row[nineBySixteenEmbedLinkIndex] || '',
                                saveError: undefined,
                                isProcessing: false,
                            };
                        }

                        if (Object.keys(productVideos).length > 0) {
                            syncedVideos[cleanRetailerId] = productVideos;
                        }
                    }
                }
                setUploadedVideos(syncedVideos);
            }
        } else {
            setUploadedVideos({});
        }
    } catch (sheetError: any) {
        const message = sheetError.result?.error?.message || sheetError.message || "An unknown error occurred.";
        if (message.toLowerCase().includes('token')) {
            setError("Your Google session may have expired. Please log in again.");
            handleLogout();
        } else {
            setError(`Could not sync video data via API. Ensure you have at least 'Viewer' access to the sheet. Error: ${message}`);
        }
        setUploadedVideos({});
    } finally {
        setIsSyncing(false);
    }
  }, [googleAccessToken, isGapiClientReady, handleLogout]);

    useEffect(() => {
        const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
        const interval = setInterval(() => {
            setUploadedVideos(currentVideos => {
                let hasChanges = false;
                const newVideos = JSON.parse(JSON.stringify(currentVideos));

                for (const retailerId in newVideos) {
                    const productVideos = newVideos[retailerId];
                    
                    if (productVideos.master?.isProcessing && (Date.now() - (productVideos.master.uploadTimestamp || 0) > PROCESSING_TIMEOUT_MS)) {
                        productVideos.master.isProcessing = false;
                        hasChanges = true;
                    }

                    if (productVideos.nineBySixteen?.isProcessing && (Date.now() - (productVideos.nineBySixteen.uploadTimestamp || 0) > PROCESSING_TIMEOUT_MS)) {
                        productVideos.nineBySixteen.isProcessing = false;
                        hasChanges = true;
                    }
                }
                return hasChanges ? newVideos : currentVideos;
            });
        }, 30000);

        return () => clearInterval(interval);
    }, []);

  const handleFetchData = useCallback(async () => {
    // Use token from settings store
    const currentToken = fbAccessToken;
    
    if (!currentToken) { 
        setError("Facebook Access Token is not configured. Please ask an administrator to set it up in the Admin Panel."); 
        return; 
    }
    if (GOOGLE_CLIENT_ID.includes("YOUR_GOOGLE_CLIENT_ID")) { setError("Please replace the placeholder Google Client ID in index.tsx."); return; }
    if (MASTER_GOOGLE_SHEET_ID.includes("YOUR_GOOGLE_SHEET_ID_HERE")) { setError("Please configure the Master Google Sheet ID in index.tsx."); return; }
    if (!catalogId || !clientName || !accessKey) { 
        setError("Please fill all required fields: Catalog, Client Name, and Access Key."); 
        return; 
    }
    
    // Validate access key from settings
    const settings = loadSettings();
    if (accessKey !== settings.accessKey) {
        setError(t('invalidAccessKey'));
        return;
    }
    
    setIsLoading(true);
    setError(null);
    setProducts([]);
    setProductSets([]);

    try {
      // Use the selected catalog's name from settings
      const selectedCatalog = configuredCatalogs.find(c => c.id === catalogId);
      const newCatalogName = selectedCatalog?.name || catalogId;
      setCatalogName(newCatalogName);

      const setsUrl = `${BASE_URL}/${catalogId}/product_sets?access_token=${currentToken}`;
      const fetchedSets = await apiFetch<ProductSet[]>(setsUrl);
      setProductSets(fetchedSets);

      const sessionData = { catalogId, clientName, catalogName: newCatalogName, view: 'data' };
      localStorage.setItem(SESSION_DATA_KEY, JSON.stringify(sessionData));
      
      setView("data");
    } catch (err: any) {
        const errorMessage = err.message || '';
        if (errorMessage.toLowerCase().includes('unsupported get request') || errorMessage.toLowerCase().includes('does not exist') || errorMessage.toLowerCase().includes('tried accessing nonexisting field')) {
            setError(
              <>
                The Catalog ID (<strong>{catalogId}</strong>) is either incorrect or you do not have permission to access it.
                <br />
                <a href="https://business.facebook.com/settings/product-catalogs/" target="_blank" rel="noopener noreferrer">Please verify the Catalog ID in your Business Manager.</a>
              </>
            );
        } else {
             setError(`Failed to fetch catalog data. Error: ${errorMessage}`);
        }
    } finally {
      setIsLoading(false);
    }
  }, [catalogId, clientName, accessKey, t, fbAccessToken, configuredCatalogs]);
  
  useEffect(() => {
    if (view !== 'data' || !catalogId) return;

    // Get the current token from settings
    const currentToken = fbAccessToken;
    if (!currentToken) return;

    const fetchViewData = async () => {
        setIsLoading(true);
        setError(null);
        setLoadingProgress(null);
        setSelectedRetailerIds(new Set());
        
        const productSetsPromise = productSets.length === 0
            ? fetchAllPages<ProductSet>(`${BASE_URL}/${catalogId}/product_sets?limit=100&summary=true&access_token=${currentToken}`)
            : Promise.resolve(productSets);

        const fields = "id,name,image_url,availability,retailer_id";
        const productsPromise = selectedSet === 'all'
            ? Promise.resolve<Product[]>([])
            : fetchAllPages<Product>(
                `${BASE_URL}/${selectedSet}/products?fields=${fields}&limit=1000&summary=true&access_token=${currentToken}`,
                (progress) => setLoadingProgress(progress)
              );

        const [setsResult, productsResult] = await Promise.allSettled([productSetsPromise, productsPromise]);

        let errors: string[] = [];
        if (setsResult.status === 'fulfilled') {
            if (productSets.length === 0) {
                 setProductSets(setsResult.value);
            }
        } else {
            const reason = setsResult.reason as Error;
            errors.push(`Failed to fetch product sets: ${reason.message}`);
            setProductSets([]);
        }
        
        if (productsResult.status === 'fulfilled') {
            setProducts(productsResult.value);
        } else {
            const reason = productsResult.reason as Error;
            errors.push(`Failed to fetch products: ${reason.message}`);
            setProducts([]);
        }

        if (errors.length > 0) {
            setError(errors.join('\n'));
        }

        setIsLoading(false);
    };

    fetchViewData();
    syncVideosFromSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedSet, catalogId, syncVideosFromSheet, fbAccessToken]);

  const handleUploadSuccess = (product: Product, video: Omit<UploadedVideo, 'saveError' | 'productName' | 'isProcessing' | 'uploadTimestamp'>, videoType: VideoType) => {
    if (!userEmail) {
        addToast("Could not determine your Google email. Please try logging in again.", 'error');
        return;
    }
    const completeVideoData: UploadedVideo = { 
        ...video, 
        productName: product.name,
        isProcessing: true,
        uploadTimestamp: Date.now()
    };
    
    setUploadedVideos(prev => ({
        ...prev,
        [product.retailer_id]: {
            ...prev[product.retailer_id],
            [videoType]: completeVideoData
        }
    }));
    writeDataToSheet(product, completeVideoData, videoType);
  };
  
  const handleRetrySave = (product: Product, video: UploadedVideo, videoType: VideoType) => {
      writeDataToSheet(product, video, videoType);
  };
  
  const handleBulkUploadSuccess = (video: Omit<UploadedVideo, 'saveError' | 'productName' | 'isProcessing' | 'uploadTimestamp'>, videoType: VideoType) => {
    const selectedProducts = products.filter(p => selectedRetailerIds.has(p.retailer_id));
    if (selectedProducts.length === 0) {
        addToast("No products were selected for the bulk upload.", "warning");
        return;
    }

    for (const product of selectedProducts) {
        handleUploadSuccess(product, video, videoType);
    }

    addToast(`Upload initiated for ${selectedProducts.length} selected products.`, 'success');
    setSelectedRetailerIds(new Set());
  };

  const filteredProducts = useMemo(() => {
    const lowercasedSearchTerm = searchTerm.toLowerCase().trim();

    return products.filter((product) => {
      const stockFilterPassed = showInStockOnly ? product.availability === "in stock" : true;
      if (!stockFilterPassed) return false;

      if (lowercasedSearchTerm) {
        const nameMatch = product.name.toLowerCase().includes(lowercasedSearchTerm);
        const retailerIdMatch = product.retailer_id.toString().toLowerCase().includes(lowercasedSearchTerm);
        if (!nameMatch && !retailerIdMatch) return false;
      }
      
      if (videoFilter !== 'all') {
          const hasVideo = uploadedVideos[product.retailer_id] &&
                           (uploadedVideos[product.retailer_id].master || uploadedVideos[product.retailer_id].nineBySixteen);
          if (videoFilter === 'uploaded' && !hasVideo) return false;
          if (videoFilter === 'not_uploaded' && hasVideo) return false;
      }
      
      return true;
    });
  }, [products, showInStockOnly, searchTerm, videoFilter, uploadedVideos]);
  
  useEffect(() => {
      setSelectedRetailerIds(new Set());
  }, [filteredProducts]);

  const handleSelectionChange = (retailerId: string, isSelected: boolean) => {
    setSelectedRetailerIds(prev => {
        const newSet = new Set(prev);
        if (isSelected) {
            newSet.add(retailerId);
        } else {
            newSet.delete(retailerId);
        }
        return newSet;
    });
  };

  const handleSelectAll = (isSelected: boolean) => {
      if (isSelected) {
          const allVisibleIds = new Set(filteredProducts.map(p => p.retailer_id));
          setSelectedRetailerIds(allVisibleIds);
      } else {
          setSelectedRetailerIds(new Set());
      }
  };

  const isAllSelected = useMemo(() => {
    if (filteredProducts.length === 0) return false;
    return selectedRetailerIds.size === filteredProducts.length;
  }, [selectedRetailerIds, filteredProducts]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchableSetRef.current && !searchableSetRef.current.contains(event.target as Node)) {
                setIsSetDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const filteredProductSets = useMemo(() => {
        if (!productSetSearchTerm) {
            return productSets;
        }
        const lowercasedFilter = productSetSearchTerm.toLowerCase();
        return productSets.filter(set =>
            set.name.toLowerCase().includes(lowercasedFilter) ||
            set.id.toLowerCase().includes(lowercasedFilter)
        );
    }, [productSets, productSetSearchTerm]);

    const selectedSetName = useMemo(() => {
        if (selectedSet === 'all') {
            return t('selectSetPlaceholder');
        }
        const set = productSets.find(s => s.id === selectedSet);
        return set ? set.name : t('selectSetPlaceholder');
    }, [selectedSet, productSets, t]);

  const isGoogleReady = isGapiClientReady && !!googleTokenClient;

  // ===== INPUT VIEW — Now uses dropdown for catalog selection =====
  if (view === "input") {
    const allFieldsFilled = catalogId && clientName && accessKey;
    const hasCatalogs = configuredCatalogs.length > 0;
    
    return (
      <main className="container">
        <div className="card">
          <header className="input-view-header">
            <div className="input-header-text">
                <h1>{t('homeHeader')}</h1>
                <p>{t('inputHeader')}</p>
            </div>
            <LanguageSwitcher />
          </header>
          
          {/* Catalog Dropdown (replaces manual Catalog ID input) */}
          <div className="form-group">
              <label htmlFor="catalogSelect">{t('catalogIdLabel')}</label>
              {hasCatalogs ? (
                  <select
                      id="catalogSelect"
                      value={catalogId}
                      onChange={(e) => {
                          const selectedId = e.target.value;
                          setCatalogId(selectedId);
                          // Auto-fill client name from catalog name
                          const selected = configuredCatalogs.find(c => c.id === selectedId);
                          if (selected && !clientName) {
                              setClientName(selected.name);
                          }
                      }}
                      className="catalog-select"
                  >
                      <option value="">{t('catalogIdPlaceholder')}</option>
                      {configuredCatalogs.map(catalog => (
                          <option key={catalog.id} value={catalog.id}>
                              {catalog.name} ({catalog.id})
                          </option>
                      ))}
                  </select>
              ) : (
                  <div className="no-catalogs-notice">
                      <p>{t('noCatalogsAvailable')}</p>
                  </div>
              )}
          </div>
          <div className="form-group">
              <label htmlFor="clientName">{t('clientNameLabel')}</label>
              <input id="clientName" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={t('clientNamePlaceholder')} />
          </div>
          <div className="form-group">
              <label htmlFor="accessKey">{t('accessKeyLabel')}</label>
              <input id="accessKey" type="password" value={accessKey} onChange={(e) => setAccessKey(e.target.value.trim())} placeholder={t('accessKeyPlaceholder')} />
          </div>

          <button onClick={handleFetchData} disabled={isLoading || !allFieldsFilled}>
              {isLoading ? <div className="loader-small"></div> : t('fetchProducts')}
          </button>
          {error && <p className="error-text" role="alert">{error}</p>}
          <AppFooter />
        </div>
      </main>
    );
  }

  return (
    <main className="container data-view">
        <IntroGuide 
            show={showIntroGuide} 
            onComplete={handleIntroComplete} 
            targets={{ productSetRef, googleLoginRef }}
        />
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
        <ImagePreview image={hoveredImage} />
        <header className="data-header">
            <div className="header-left">
                <img src="./lion_logo.png" alt="Lion Logo" className="header-logo" />
                <div className="header-title-group">
                    <h1>{catalogName}</h1>
                    <p className="subtle-text-header">{t('catalogIdHeader')}: {catalogId}</p>
                </div>
            </div>
            <div className="header-actions">
                 {googleAccessToken && userEmail ? (
                    <div className="user-info-header-small">
                        <span>{userEmail}</span>
                        <button onClick={handleLogout} className="logout-button-small" title={t('logout')}>{t('logout')}</button>
                    </div>
                 ) : (
                    <button ref={googleLoginRef} onClick={handleGoogleLogin} disabled={!isGoogleReady} className="google-login-button">
                        {isGapiClientReady ? t('loginWithGoogle') : t('initializing')}
                    </button>
                 )}
                 <LanguageSwitcher />
                <button onClick={resetAndGoBack} className="back-button">{t('changeCatalog')}</button>
            </div>
        </header>
        <div className="filters card">
             <div className="form-group" ref={searchableSetRef}>
                <label htmlFor="productSetButton">{t('filterBySet')}</label>
                <div className="searchable-select-container">
                    <button
                        id="productSetButton"
                        ref={productSetRef}
                        onClick={() => setIsSetDropdownOpen(!isSetDropdownOpen)}
                        className="searchable-select-button"
                        aria-haspopup="listbox"
                        aria-expanded={isSetDropdownOpen}
                    >
                        <span>{selectedSetName}</span>
                        <span className="dropdown-arrow">{isSetDropdownOpen ? '▲' : '▼'}</span>
                    </button>

                    {isSetDropdownOpen && (
                        <div className="searchable-select-dropdown">
                            <input
                                type="text"
                                placeholder="Search by name or ID..."
                                value={productSetSearchTerm}
                                onChange={(e) => setProductSetSearchTerm(e.target.value)}
                                autoFocus
                            />
                            <ul className="searchable-select-options" role="listbox">
                                <li
                                    onClick={() => {
                                        setSelectedSet("all");
                                        setIsSetDropdownOpen(false);
                                        setProductSetSearchTerm("");
                                    }}
                                    role="option"
                                    className={selectedSet === 'all' ? 'selected' : ''}
                                >
                                   <span className="option-name">{t('selectSetPlaceholder')}</span>
                                </li>
                                {filteredProductSets.map(set => (
                                    <li
                                        key={set.id}
                                        onClick={() => {
                                            setSelectedSet(set.id);
                                            setIsSetDropdownOpen(false);
                                            setProductSetSearchTerm("");
                                        }}
                                        role="option"
                                        aria-selected={selectedSet === set.id}
                                        className={selectedSet === set.id ? 'selected' : ''}
                                    >
                                        <span className="option-name">{set.name}</span>
                                        <span className="option-id">ID: {set.id}</span>
                                    </li>
                                ))}
                                {filteredProductSets.length === 0 && productSetSearchTerm && (
                                    <li className="no-results">No sets found.</li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
            <div className="form-group">
                <label htmlFor="videoStatus">{t('filterByVideoStatus')}</label>
                <select id="videoStatus" value={videoFilter} onChange={e => setVideoFilter(e.target.value as VideoFilterType)}>
                    <option value="all">{t('showAll')}</option>
                    <option value="uploaded">{t('showUploaded')}</option>
                    <option value="not_uploaded">{t('showNotUploaded')}</option>
                </select>
            </div>
            <div className="form-group">
                <label htmlFor="productSearch">{t('searchLabel')}</label>
                <input
                    id="productSearch"
                    type="text"
                    placeholder={t('searchPlaceholder')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="form-group checkbox-group">
                <input type="checkbox" id="inStock" checked={showInStockOnly} onChange={e => setShowInStockOnly(e.target.checked)} />
                <label htmlFor="inStock">{t('showInStock')}</label>
            </div>
        </div>

        {selectedRetailerIds.size > 0 && (
            <div className="card bulk-actions-container">
                <h3>Bulk Actions for {selectedRetailerIds.size} Selected Products</h3>
                <p className="info-text-small">Upload a video to apply it to all selected items below.</p>
                <div className="bulk-uploaders">
                    <div className="bulk-uploader-item">
                        <label>Master Video (4:5)</label>
                        <GoogleDriveUploader
                            clientName={clientName}
                            catalogId={catalogId}
                            retailerId="bulk-upload"
                            accessToken={googleAccessToken}
                            isReupload={true}
                            onUploadSuccess={(video) => handleBulkUploadSuccess(video, 'master')}
                            videoType="master"
                            onLoginRequest={handleGoogleLogin}
                        />
                    </div>
                    <div className="bulk-uploader-item">
                        <label>9x16 Video</label>
                         <GoogleDriveUploader
                            clientName={clientName}
                            catalogId={catalogId}
                            retailerId="bulk-upload"
                            accessToken={googleAccessToken}
                            isReupload={true}
                            onUploadSuccess={(video) => handleBulkUploadSuccess(video, 'nineBySixteen')}
                            videoType="nineBySixteen"
                            onLoginRequest={handleGoogleLogin}
                        />
                    </div>
                </div>
                 <button onClick={() => setSelectedRetailerIds(new Set())} className="cancel-upload-button" style={{width: 'auto', margin: '1rem auto 0'}}>
                    Clear Selection ({selectedRetailerIds.size})
                </button>
            </div>
        )}

        <ProductTable 
            products={filteredProducts}
            catalogId={catalogId}
            clientName={clientName}
            isLoading={isLoading || isSyncing}
            loadingProgress={loadingProgress}
            accessToken={googleAccessToken}
            currentUserEmail={userEmail}
            onImageHover={setHoveredImage}
            uploadedVideos={uploadedVideos}
            onUploadSuccess={handleUploadSuccess}
            onRetrySave={handleRetrySave}
            onLoginRequest={handleGoogleLogin}
            selectedRetailerIds={selectedRetailerIds}
            onSelectionChange={handleSelectionChange}
            onSelectAll={handleSelectAll}
            isAllSelected={isAllSelected}
        />
        {error && <p className="error-text" role="alert">{error}</p>}
        <AppFooter />
    </main>
  );
};
