import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { generateSlideshow, fetchCatalogProducts, updateCatalogProductVideo, fetchProductSets, fetchProductSetProducts, fetchAllProductSetProducts, type SlideshowOptions } from "./slideshow";
import { storagePut } from "./storage";
import {
  createUploadRecord,
  createUploadRecordsBatch,
  getUploadRecordsByCatalog,
  getUploadRecordsByCompany,
  getAllUploadRecords,
  deleteUploadRecord,
  getSetting,
  setSetting,
  getAllSettings,
  getUploadRecordById,
  getUploadersByCompany,
  getAllUploaders,
  createCompany,
  getCompanyById,
  updateCompany,
  deleteCompany,
  getCompaniesByEmail,
  addCompanyMember,
  getCompanyMembers,
  removeCompanyMember,
  activateMemberByEmail,
  isCompanyMember,
  createSlideshowTemplate,
  getSlideshowTemplates,
  getSlideshowTemplateById,
  updateSlideshowTemplate,
  deleteSlideshowTemplate,
} from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ==================== Company Management ====================
  company: router({
    // Create a new company (user becomes owner)
    create: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        facebookAccessToken: z.string().optional(),
        accessKey: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        // Create the company
        const company = await createCompany({
          name: input.name,
          facebookAccessToken: input.facebookAccessToken ?? null,
          catalogs: "[]",
          accessKey: input.accessKey ?? null,
          createdBy: 0, // Will be updated when we have user context
        });
        if (!company) throw new Error("Failed to create company");

        // Add the creator as owner
        await addCompanyMember({
          companyId: company.id,
          email: input.email.toLowerCase(),
          memberRole: "owner",
          status: "active",
          userId: null,
        });

        return company;
      }),

    // Get company by ID (requires email verification)
    get: publicProcedure
      .input(z.object({ id: z.number(), email: z.string().email().optional() }))
      .query(async ({ input }) => {
        const company = await getCompanyById(input.id);
        if (!company) throw new Error("Company not found");
        
        // If email is provided, verify membership
        if (input.email) {
          const isMember = await isCompanyMember(input.id, input.email);
          if (!isMember) {
            throw new Error("您的 Email 不是此公司的成員，無法存取公司設定。");
          }
        }
        
        // Mask the access token for security
        return {
          ...company,
          facebookAccessToken: company.facebookAccessToken
            ? `${company.facebookAccessToken.slice(0, 10)}...${company.facebookAccessToken.slice(-6)}`
            : null,
          facebookAccessTokenFull: company.facebookAccessToken,
        };
      }),

    // Get companies by user email
    getByEmail: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .query(async ({ input }) => {
        const companiesResult = await getCompaniesByEmail(input.email);
        return companiesResult.map(c => ({
          ...c,
          // Mask token
          facebookAccessToken: c.facebookAccessToken
            ? `${c.facebookAccessToken.slice(0, 10)}...${c.facebookAccessToken.slice(-6)}`
            : null,
        }));
      }),

    // Update company settings (token, access key, etc.) - requires email verification
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        email: z.string().email().optional(),
        name: z.string().optional(),
        facebookAccessToken: z.string().optional(),
        accessKey: z.string().optional(),
        catalogs: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, email, ...data } = input;
        
        // Verify membership if email is provided
        if (email) {
          const isMember = await isCompanyMember(id, email);
          if (!isMember) {
            throw new Error("您的 Email 不是此公司的成員，無法修改公司設定。");
          }
        }
        const updateData: Record<string, unknown> = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.facebookAccessToken !== undefined) updateData.facebookAccessToken = data.facebookAccessToken;
        if (data.accessKey !== undefined) updateData.accessKey = data.accessKey;
        if (data.catalogs !== undefined) updateData.catalogs = data.catalogs;

        // Auto-check token expiration when token is updated
        if (data.facebookAccessToken) {
          try {
            const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${data.facebookAccessToken}&access_token=${data.facebookAccessToken}`;
            const debugResp = await fetch(debugUrl);
            const debugData = await debugResp.json();
            if (debugData?.data?.expires_at) {
              updateData.tokenExpiresAt = new Date(debugData.data.expires_at * 1000);
            }
          } catch (e) {
            console.warn('Failed to check token expiration:', e);
          }
        }
        
        await updateCompany(id, updateData as any);
        return { success: true };
      }),

    // Check token expiration for a company
    getTokenExpiration: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const company = await getCompanyById(input.id);
        if (!company) throw new Error("Company not found");
        return {
          tokenExpiresAt: company.tokenExpiresAt ? company.tokenExpiresAt.toISOString() : null,
          hasToken: !!company.facebookAccessToken,
        };
      }),

    // Manually refresh token expiration info
    refreshTokenExpiration: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const company = await getCompanyById(input.id);
        if (!company || !company.facebookAccessToken) {
          return { tokenExpiresAt: null, error: '未設定 Access Token，請先在管理面板設定 Token。' };
        }
        try {
          const debugUrl = `https://graph.facebook.com/v21.0/debug_token?input_token=${company.facebookAccessToken}&access_token=${company.facebookAccessToken}`;
          const debugResp = await fetch(debugUrl);
          const debugData = await debugResp.json();
          
          // Check if token is invalid
          if (debugData?.data?.is_valid === false) {
            const fbError = debugData?.data?.error;
            const code = fbError?.code;
            const subcode = fbError?.subcode;
            let reason = '';
            if (code === 190) {
              if (subcode === 463) {
                reason = 'Token 已過期，請重新產生一組新的 Access Token。';
              } else if (subcode === 467) {
                reason = 'Token 已失效，可能是因為使用者已變更密碼或撤銷授權。';
              } else if (subcode === 460) {
                reason = 'Token 已失效，因為使用者已登出所有裝置。';
              } else {
                reason = fbError?.message ? `Token 已失效：${fbError.message}` : 'Token 已失效，請重新產生。';
              }
            } else {
              reason = fbError?.message ? `Token 無效：${fbError.message}` : 'Token 無效，請重新產生。';
            }
            return { tokenExpiresAt: null, error: reason, isInvalid: true };
          }
          
          if (debugData?.data?.expires_at) {
            const expiresAt = new Date(debugData.data.expires_at * 1000);
            await updateCompany(input.id, { tokenExpiresAt: expiresAt } as any);
            return { tokenExpiresAt: expiresAt.toISOString() };
          } else if (debugData?.data?.expires_at === 0) {
            // Token never expires (e.g., system user token)
            return { tokenExpiresAt: null, neverExpires: true };
          }
          return { tokenExpiresAt: null, error: debugData?.data?.error?.message || '無法判斷 Token 到期日' };
        } catch (e: any) {
          return { tokenExpiresAt: null, error: `檢查失敗：${e.message || '網路連線錯誤'}` };
        }
      }),

    // Get full access token (for use in API calls) - requires email verification
    getAccessToken: publicProcedure
      .input(z.object({ id: z.number(), email: z.string().email().optional() }))
      .query(async ({ input }) => {
        const company = await getCompanyById(input.id);
        if (!company) throw new Error("Company not found");
        
        // Verify membership if email is provided
        if (input.email) {
          const isMember = await isCompanyMember(input.id, input.email);
          if (!isMember) {
            throw new Error("您的 Email 不是此公司的成員，無法取得 Access Token。");
          }
        }
        
        return { accessToken: company.facebookAccessToken };
      }),

    // Delete a company (only owner can delete)
    delete: publicProcedure
      .input(z.object({
        id: z.number(),
        email: z.string().email(),
      }))
      .mutation(async ({ input }) => {
        // Verify the requester is an owner of this company
        const members = await getCompanyMembers(input.id);
        const requester = members.find(m => m.email === input.email.toLowerCase());
        if (!requester || requester.memberRole !== "owner") {
          throw new Error("只有公司擁有者才能刪除公司。");
        }
        await deleteCompany(input.id);
        return { success: true };
      }),
  }),

  // ==================== Company Members ====================
  members: router({
    // List members of a company (requires requester email verification)
    list: publicProcedure
      .input(z.object({ companyId: z.number(), requesterEmail: z.string().email().optional() }))
      .query(async ({ input }) => {
        // Verify requester is a member
        if (input.requesterEmail) {
          const isMember = await isCompanyMember(input.companyId, input.requesterEmail);
          if (!isMember) {
            throw new Error("您的 Email 不是此公司的成員，無法查看成員列表。");
          }
        }
        return getCompanyMembers(input.companyId);
      }),

    // Invite a member by email (requires requester email verification)
    invite: publicProcedure
      .input(z.object({
        companyId: z.number(),
        email: z.string().email(),
        requesterEmail: z.string().email().optional(),
      }))
      .mutation(async ({ input }) => {
        // Verify requester is a member
        if (input.requesterEmail) {
          const isMember = await isCompanyMember(input.companyId, input.requesterEmail);
          if (!isMember) {
            throw new Error("您的 Email 不是此公司的成員，無法邀請新成員。");
          }
        }
        const member = await addCompanyMember({
          companyId: input.companyId,
          email: input.email.toLowerCase(),
          memberRole: "member",
          status: "pending",
          userId: null,
        });
        return member;
      }),

    // Remove a member from company (requires requester email verification)
    remove: publicProcedure
      .input(z.object({
        companyId: z.number(),
        email: z.string().email(),
        requesterEmail: z.string().email().optional(),
      }))
      .mutation(async ({ input }) => {
        // Verify requester is a member
        if (input.requesterEmail) {
          const isMember = await isCompanyMember(input.companyId, input.requesterEmail);
          if (!isMember) {
            throw new Error("您的 Email 不是此公司的成員，無法移除成員。");
          }
        }
        await removeCompanyMember(input.companyId, input.email);
        return { success: true };
      }),

    // Activate pending memberships when user logs in with email
    activate: publicProcedure
      .input(z.object({
        email: z.string().email(),
        userId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        await activateMemberByEmail(input.email, input.userId ?? null);
        return { success: true };
      }),
  }),

  // ==================== Upload Records ====================
  uploads: router({
    create: publicProcedure
      .input(z.object({
        companyId: z.number().optional(),
        catalogId: z.string(),
        retailerId: z.string(),
        productName: z.string(),
        productImageUrl: z.string().optional(),
        video4x5Download: z.string().optional(),
        video4x5Embed: z.string().optional(),
        video9x16Download: z.string().optional(),
        video9x16Embed: z.string().optional(),
        clientName: z.string(),
        uploadedBy: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return createUploadRecord({
          ...input,
          companyId: input.companyId ?? null,
          productImageUrl: input.productImageUrl ?? null,
          video4x5Download: input.video4x5Download ?? null,
          video4x5Embed: input.video4x5Embed ?? null,
          video9x16Download: input.video9x16Download ?? null,
          video9x16Embed: input.video9x16Embed ?? null,
          uploadedBy: input.uploadedBy ?? null,
        });
      }),

    createBatch: publicProcedure
      .input(z.array(z.object({
        companyId: z.number().optional(),
        catalogId: z.string(),
        retailerId: z.string(),
        productName: z.string(),
        productImageUrl: z.string().optional(),
        video4x5Download: z.string().optional(),
        video4x5Embed: z.string().optional(),
        video9x16Download: z.string().optional(),
        video9x16Embed: z.string().optional(),
        clientName: z.string(),
        uploadedBy: z.string().optional(),
      })))
      .mutation(async ({ input }) => {
        await createUploadRecordsBatch(input.map(r => ({
          ...r,
          companyId: r.companyId ?? null,
          productImageUrl: r.productImageUrl ?? null,
          video4x5Download: r.video4x5Download ?? null,
          video4x5Embed: r.video4x5Embed ?? null,
          video9x16Download: r.video9x16Download ?? null,
          video9x16Embed: r.video9x16Embed ?? null,
          uploadedBy: r.uploadedBy ?? null,
        })));
        return { success: true };
      }),

    listByCatalog: publicProcedure
      .input(z.object({ catalogId: z.string() }))
      .query(async ({ input }) => {
        return getUploadRecordsByCatalog(input.catalogId);
      }),

    listByCompany: publicProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        return getUploadRecordsByCompany(input.companyId);
      }),

    listAll: publicProcedure.query(async () => {
      return getAllUploadRecords();
    }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteUploadRecord(input.id);
        return { success: true };
      }),

    // Get uploaders (people who uploaded videos) by company
    uploadersByCompany: publicProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        return getUploadersByCompany(input.companyId);
      }),

    // Get all uploaders across all companies
    allUploaders: publicProcedure.query(async () => {
      return getAllUploaders();
    }),

    // Delete video from Facebook Catalog via Batch API, then delete DB record
    // ALWAYS deletes the DB record, even if Facebook API fails
    deleteVideoFromCatalog: publicProcedure
      .input(z.object({
        id: z.number(),
        companyId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        // 1. Get the record from DB
        const record = await getUploadRecordById(input.id);
        if (!record) {
          throw new Error("Record not found");
        }

        let fbSuccess = false;
        let fbWarning: string | null = null;
        let handle: string | null = null;

        // 2. Get the access token from company settings only (no legacy global fallback)
        let accessToken: string | null = null;
        const companyId = input.companyId ?? record.companyId;
        if (companyId) {
          const company = await getCompanyById(companyId);
          accessToken = company?.facebookAccessToken ?? null;
        }

        if (accessToken) {
          // 3. Try to call Facebook Catalog Batch API to remove videos
          try {
            const batchUrl = `https://graph.facebook.com/v21.0/${record.catalogId}/items_batch`;
            const batchPayload = {
              access_token: accessToken,
              item_type: "PRODUCT_ITEM",
              requests: [
                {
                  method: "UPDATE",
                  data: {
                    id: record.retailerId,
                    video: [],
                  },
                },
              ],
            };

            console.log(`[DeleteVideo] Sending batch API request for retailer ${record.retailerId} in catalog ${record.catalogId}`);

            const fbResponse = await fetch(batchUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(batchPayload),
            });

            const fbResult = await fbResponse.json();
            console.log(`[DeleteVideo] Facebook API response:`, JSON.stringify(fbResult));

            if (!fbResponse.ok) {
              const errorMsg = fbResult?.error?.message || "Unknown Facebook API error";
              fbWarning = `Facebook API warning: ${errorMsg}. Record will still be deleted from database.`;
              console.warn(`[DeleteVideo] ${fbWarning}`);
            } else {
              fbSuccess = true;
              handle = fbResult?.handles?.[0] || null;
              if (handle) {
                console.log(`[DeleteVideo] Batch accepted with handle: ${handle}`);
              }

              // 4. Verify the product no longer has videos
              await new Promise(resolve => setTimeout(resolve, 2000));
              try {
                const verifyUrl = `https://graph.facebook.com/v21.0/${record.catalogId}/products?filter={"retailer_id":{"eq":"${record.retailerId}"}}&fields=id,retailer_id,name,video&access_token=${accessToken}`;
                const verifyResponse = await fetch(verifyUrl);
                const verifyResult = await verifyResponse.json();
                
                if (verifyResult?.data?.[0]?.video && verifyResult.data[0].video.length > 0) {
                  console.warn(`[DeleteVideo] Warning: Product ${record.retailerId} still has videos after deletion attempt.`);
                } else {
                  console.log(`[DeleteVideo] Verified: Product ${record.retailerId} has no videos in catalog.`);
                }
              } catch (verifyError) {
                console.warn(`[DeleteVideo] Could not verify video deletion:`, verifyError);
              }
            }
          } catch (fbError: any) {
            fbWarning = `Facebook API error: ${fbError.message}. Record will still be deleted from database.`;
            console.warn(`[DeleteVideo] ${fbWarning}`);
          }
        } else {
          fbWarning = "No Facebook Access Token configured. Video was not removed from catalog, but record will be deleted from database.";
          console.warn(`[DeleteVideo] ${fbWarning}`);
        }

        // 5. ALWAYS delete from our database regardless of Facebook API result
        await deleteUploadRecord(input.id);
        console.log(`[DeleteVideo] Deleted record ${input.id} from database.`);

        return {
          success: true,
          fbSuccess,
          message: fbSuccess
            ? "Video removed from catalog and record deleted."
            : `Record deleted from database. ${fbWarning || ''}`,
          warning: fbWarning,
          handle,
        };
      }),
  }),

  // ==================== Facebook API Proxy ====================
  facebook: router({
    validateToken: publicProcedure
      .input(z.object({ accessToken: z.string() }))
      .mutation(async ({ input }) => {
        try {
          const url = `https://graph.facebook.com/v21.0/me?access_token=${input.accessToken}`;
          const response = await fetch(url);
          const data = await response.json();
          if (!response.ok) {
            const fbError = data?.error;
            const code = fbError?.code;
            const subcode = fbError?.error_subcode;
            const fbMsg = fbError?.message || '';
            let reason = '';
            // Map Facebook error codes to Chinese reasons
            if (code === 190) {
              if (subcode === 463) {
                reason = 'Token 已過期，請重新產生一組新的 Access Token。';
              } else if (subcode === 467) {
                reason = 'Token 已失效，可能是因為使用者已變更密碼或撤銷授權。';
              } else if (subcode === 460) {
                reason = 'Token 已失效，因為使用者已登出所有裝置。';
              } else {
                reason = `Token 無效或已過期（錯誤碼: ${code}${subcode ? '/' + subcode : ''}）。請重新產生 Token。`;
              }
            } else if (code === 4) {
              reason = 'API 呼叫次數過多，請稍後再試。';
            } else if (code === 17) {
              reason = '已達到 API 速率限制，請稍後再試。';
            } else if (code === 10) {
              reason = '權限不足，請確認 Token 擁有必要的存取權限。';
            } else if (code === 200) {
              reason = '權限不足，請確認應用程式已獲得必要的授權。';
            } else {
              reason = fbMsg ? `驗證失敗：${fbMsg}` : 'Token 無效，請檢查後重試。';
            }
            return { valid: false, message: reason, errorCode: code, errorSubcode: subcode, originalMessage: fbMsg };
          }
          return { valid: true, message: `Token 有效。使用者：${data.name || data.id}` };
        } catch (e: any) {
          return { valid: false, message: `驗證失敗：${e.message || '網路連線錯誤，請檢查網路後重試'}` };
        }
      }),

    fetchCatalogName: publicProcedure
      .input(z.object({ catalogId: z.string(), accessToken: z.string() }))
      .mutation(async ({ input }) => {
        const url = `https://graph.facebook.com/v21.0/${input.catalogId}?fields=name&access_token=${input.accessToken}`;
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok) {
          const errorMsg = data?.error?.message || 'Unknown error fetching catalog name';
          throw new Error(errorMsg);
        }
        return { name: data.name || `Catalog ${input.catalogId}` };
      }),
  }),

  // ==================== Slideshow Video Generator ====================
  slideshow: router({
    // Fetch products from a Facebook Catalog for slideshow creation
    fetchProducts: publicProcedure
      .input(z.object({
        catalogId: z.string(),
        accessToken: z.string(),
        limit: z.number().min(1).max(500).default(50),
      }))
      .query(async ({ input }) => {
        return fetchCatalogProducts(input.catalogId, input.accessToken, input.limit);
      }),

    // Fetch product sets from a Facebook Catalog
    fetchProductSets: publicProcedure
      .input(z.object({
        catalogId: z.string(),
        accessToken: z.string(),
      }))
      .query(async ({ input }) => {
        return fetchProductSets(input.catalogId, input.accessToken);
      }),

    // Fetch products from a specific product set (with pagination)
    fetchProductSetProducts: publicProcedure
      .input(z.object({
        productSetId: z.string(),
        accessToken: z.string(),
        limit: z.number().min(1).max(10000).default(1000),
      }))
      .query(async ({ input }) => {
        return fetchProductSetProducts(input.productSetId, input.accessToken, input.limit);
      }),

    // Fetch ALL products from a product set (no limit)
    fetchAllProductSetProducts: publicProcedure
      .input(z.object({
        productSetId: z.string(),
        accessToken: z.string(),
      }))
      .query(async ({ input }) => {
        return fetchAllProductSetProducts(input.productSetId, input.accessToken);
      }),

    // Get available fonts for text overlay
    fonts: publicProcedure.query(() => {
      const { AVAILABLE_FONTS } = require("./slideshow");
      return AVAILABLE_FONTS;
    }),

    // Generate a slideshow video from selected images
    generate: publicProcedure
      .input(z.object({
        images: z.array(z.object({
          url: z.string().url(),
          label: z.string().optional(),
        })).min(1).max(50),
        aspectRatio: z.enum(["4:5", "9:16"]),
        durationPerImage: z.number().min(1).max(30).default(3),
        transition: z.enum(["fade", "slideleft", "slideright", "slideup", "slidedown", "wipeleft", "wiperight", "none"]).default("fade"),
        transitionDuration: z.number().min(0.1).max(5).default(0.5),
        overlayText: z.string().optional(),
        textPosition: z.enum(["top", "center", "bottom"]).default("bottom"),
        fontSize: z.number().min(12).max(120).optional(),
        fontColor: z.string().optional(),
        fontFamily: z.string().optional(),
        backgroundColor: z.string().optional(),
        imageScale: z.number().min(0.1).max(2.0).optional(),
        imageOffsetX: z.number().min(-50).max(50).optional(),
        imageOffsetY: z.number().min(-50).max(50).optional(),
        overlayImageUrl: z.string().url().optional(),
        overlayImageScale: z.number().min(0.05).max(1.0).optional(),
        overlayImageX: z.number().min(-50).max(50).optional(),
        overlayImageY: z.number().min(-50).max(50).optional(),
        audioUrl: z.string().url().optional(),
        audioVolume: z.number().min(0).max(1).optional(),
      }))
      .mutation(async ({ input }) => {
        console.log(`[Slideshow API] Generating slideshow: ${input.images.length} images, ${input.aspectRatio}, ${input.transition}, audio: ${input.audioUrl ? 'yes' : 'no'}`);
        
        const videoBuffer = await generateSlideshow(input as SlideshowOptions);
        
        // Upload to S3
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const suffix = Math.random().toString(36).substring(2, 8);
        const fileKey = `slideshow-videos/${timestamp}-${suffix}.mp4`;
        
        const { url } = await storagePut(fileKey, videoBuffer, "video/mp4");
        
        console.log(`[Slideshow API] Video uploaded to S3: ${url}`);
        
        return {
          success: true,
          videoUrl: url,
          fileSize: videoBuffer.length,
          duration: input.images.length * input.durationPerImage - (input.images.length - 1) * Math.min(input.transitionDuration, input.durationPerImage * 0.4),
        };
      }),

    // Proxy-download an image from URL and upload to S3 (solves Facebook CDN URL expiration)
    proxyUploadImage: publicProcedure
      .input(z.object({
        imageUrl: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        console.log(`[Slideshow API] Proxy uploading image: ${input.imageUrl.substring(0, 80)}...`);
        
        // Download the image with retries
        let buffer: Buffer | null = null;
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(input.imageUrl, {
              redirect: "follow",
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              },
            });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            buffer = Buffer.from(await response.arrayBuffer());
            break;
          } catch (e: any) {
            lastError = e;
            console.warn(`[Slideshow API] Proxy download attempt ${attempt + 1} failed: ${e.message}`);
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
        
        if (!buffer) {
          throw new Error(`Failed to download image after 3 attempts: ${lastError?.message || 'Unknown error'}`);
        }
        
        if (buffer.length > 10 * 1024 * 1024) {
          throw new Error("Image file too large. Maximum 10MB.");
        }
        
        // Detect content type from URL or default to jpeg
        let contentType = "image/jpeg";
        const urlLower = input.imageUrl.toLowerCase();
        if (urlLower.includes(".png")) contentType = "image/png";
        else if (urlLower.includes(".webp")) contentType = "image/webp";
        else if (urlLower.includes(".gif")) contentType = "image/gif";
        
        const suffix = Math.random().toString(36).substring(2, 8);
        const ext = contentType.split("/")[1] || "jpg";
        const fileKey = `slideshow-proxy-images/${Date.now()}-${suffix}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, contentType);
        
        console.log(`[Slideshow API] Proxy uploaded ${buffer.length} bytes -> ${url}`);
        return { success: true, url };
      }),

    // Batch proxy-upload multiple images from URLs to S3
    proxyUploadImages: publicProcedure
      .input(z.object({
        imageUrls: z.array(z.string().url()).min(1).max(50),
      }))
      .mutation(async ({ input }) => {
        console.log(`[Slideshow API] Batch proxy uploading ${input.imageUrls.length} images...`);
        
        const results: { originalUrl: string; s3Url: string | null; error: string | null }[] = [];
        
        for (const imageUrl of input.imageUrls) {
          try {
            let buffer: Buffer | null = null;
            let lastError: Error | null = null;
            
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const response = await fetch(imageUrl, {
                  redirect: "follow",
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                  },
                });
                if (!response.ok) {
                  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                buffer = Buffer.from(await response.arrayBuffer());
                break;
              } catch (e: any) {
                lastError = e;
                if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
              }
            }
            
            if (!buffer) {
              results.push({ originalUrl: imageUrl, s3Url: null, error: lastError?.message || 'Download failed' });
              continue;
            }
            
            let contentType = "image/jpeg";
            const urlLower = imageUrl.toLowerCase();
            if (urlLower.includes(".png")) contentType = "image/png";
            else if (urlLower.includes(".webp")) contentType = "image/webp";
            else if (urlLower.includes(".gif")) contentType = "image/gif";
            
            const suffix = Math.random().toString(36).substring(2, 8);
            const ext = contentType.split("/")[1] || "jpg";
            const fileKey = `slideshow-proxy-images/${Date.now()}-${suffix}.${ext}`;
            const { url } = await storagePut(fileKey, buffer, contentType);
            
            results.push({ originalUrl: imageUrl, s3Url: url, error: null });
          } catch (e: any) {
            results.push({ originalUrl: imageUrl, s3Url: null, error: e.message });
          }
        }
        
        const successCount = results.filter(r => r.s3Url).length;
        console.log(`[Slideshow API] Batch proxy upload: ${successCount}/${input.imageUrls.length} succeeded`);
        
        return { results };
      }),

    // Upload a custom image (base64) to S3 for use in slideshow
    uploadImage: publicProcedure
      .input(z.object({
        base64Data: z.string(),
        fileName: z.string(),
        mimeType: z.string().default("image/png"),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64Data, "base64");
        if (buffer.length > 10 * 1024 * 1024) {
          throw new Error("Image file too large. Maximum 10MB.");
        }
        const suffix = Math.random().toString(36).substring(2, 8);
        const ext = input.fileName.split(".").pop() || "png";
        const fileKey = `slideshow-uploads/${Date.now()}-${suffix}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        return { success: true, url };
      }),



    // Upload a browser-generated slideshow video to S3
    uploadGeneratedVideo: publicProcedure
      .input(z.object({
        base64Data: z.string(),
        fileName: z.string(),
        mimeType: z.string().default("video/mp4"),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64Data, "base64");
        if (buffer.length > 100 * 1024 * 1024) {
          throw new Error("Video file too large. Maximum 100MB.");
        }
        const suffix = Math.random().toString(36).substring(2, 8);
        const ext = input.fileName.split(".").pop() || "mp4";
        const fileKey = `slideshow-videos/${Date.now()}-${suffix}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        return { success: true, url };
      }),
    // Upload a custom audio file (base64) to S3 for background music
    uploadAudio: publicProcedure
      .input(z.object({
        base64Data: z.string(),
        fileName: z.string(),
        mimeType: z.string().default("audio/mpeg"),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64Data, "base64");
        if (buffer.length > 16 * 1024 * 1024) {
          throw new Error("Audio file too large. Maximum 16MB.");
        }
        const suffix = Math.random().toString(36).substring(2, 8);
        const ext = input.fileName.split(".").pop() || "mp3";
        const fileKey = `slideshow-audio/${Date.now()}-${suffix}.${ext}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        return { success: true, url };
      }),

    // Update a product's video in a Facebook Catalog
    updateCatalogVideo: publicProcedure
      .input(z.object({
        catalogId: z.string(),
        accessToken: z.string(),
        retailerId: z.string(),
        videoUrl: z.string().url(),
      }))
      .mutation(async ({ input }) => {
        return updateCatalogProductVideo(input.catalogId, input.accessToken, input.retailerId, input.videoUrl);
      }),
  }),

  // ==================== Slideshow Templates ====================
  slideshowTemplate: router({
    list: publicProcedure.query(async () => {
      return getSlideshowTemplates();
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getSlideshowTemplateById(input.id);
      }),

    create: publicProcedure
      .input(z.object({
        name: z.string().min(1).max(255),
        aspectRatio: z.string().default("4:5"),
        durationPerImage: z.number().min(1).max(15).default(3),
        transition: z.string().default("fade"),
        transitionDuration: z.number().min(0).max(200).default(50),
        showProductName: z.number().min(0).max(1).default(0),
        textPosition: z.string().default("bottom"),
        fontSize: z.number().min(12).max(120).default(40),
        fontFamily: z.string().default("noto-sans-cjk"),
        fontColor: z.string().default("#FFFFFF"),
        backgroundColor: z.string().default("#FFFFFF"),
        imageScale: z.number().min(10).max(200).default(100),
        imageOffsetX: z.number().min(-50).max(50).default(0),
        imageOffsetY: z.number().min(-50).max(50).default(0),
        overlayText: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createSlideshowTemplate({
          ...input,
          createdBy: 0, // public access, no auth required
        });
        return { success: true, id };
      }),

    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        aspectRatio: z.string().optional(),
        durationPerImage: z.number().min(1).max(15).optional(),
        transition: z.string().optional(),
        transitionDuration: z.number().min(0).max(200).optional(),
        showProductName: z.number().min(0).max(1).optional(),
        textPosition: z.string().optional(),
        fontSize: z.number().min(12).max(120).optional(),
        fontFamily: z.string().optional(),
        fontColor: z.string().optional(),
        backgroundColor: z.string().optional(),
        imageScale: z.number().min(10).max(200).optional(),
        imageOffsetX: z.number().min(-50).max(50).optional(),
        imageOffsetY: z.number().min(-50).max(50).optional(),
        overlayText: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateSlideshowTemplate(id, data);
        return { success: true };
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSlideshowTemplate(input.id);
        return { success: true };
      }),
  }),

  // ==================== App Settings (legacy, kept for backward compatibility) ====================
  settings: router({
    get: publicProcedure
      .input(z.object({ key: z.string() }))
      .query(async ({ input }) => {
        return getSetting(input.key);
      }),

    set: publicProcedure
      .input(z.object({ key: z.string(), value: z.string() }))
      .mutation(async ({ input }) => {
        await setSetting(input.key, input.value);
        return { success: true };
      }),

    getAll: publicProcedure.query(async () => {
      return getAllSettings();
    }),
  }),
});

export type AppRouter = typeof appRouter;
