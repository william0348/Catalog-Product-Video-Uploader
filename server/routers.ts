import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { generateSlideshow, fetchCatalogProducts, type SlideshowOptions } from "./slideshow";
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
  createCompany,
  getCompanyById,
  updateCompany,
  getCompaniesByEmail,
  addCompanyMember,
  getCompanyMembers,
  removeCompanyMember,
  activateMemberByEmail,
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

    // Get company by ID
    get: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const company = await getCompanyById(input.id);
        if (!company) throw new Error("Company not found");
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

    // Update company settings (token, access key, etc.)
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        facebookAccessToken: z.string().optional(),
        accessKey: z.string().optional(),
        catalogs: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const updateData: Record<string, unknown> = {};
        if (data.name !== undefined) updateData.name = data.name;
        if (data.facebookAccessToken !== undefined) updateData.facebookAccessToken = data.facebookAccessToken;
        if (data.accessKey !== undefined) updateData.accessKey = data.accessKey;
        if (data.catalogs !== undefined) updateData.catalogs = data.catalogs;
        
        await updateCompany(id, updateData as any);
        return { success: true };
      }),

    // Get full access token (for use in API calls)
    getAccessToken: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const company = await getCompanyById(input.id);
        if (!company) throw new Error("Company not found");
        return { accessToken: company.facebookAccessToken };
      }),
  }),

  // ==================== Company Members ====================
  members: router({
    // List members of a company
    list: publicProcedure
      .input(z.object({ companyId: z.number() }))
      .query(async ({ input }) => {
        return getCompanyMembers(input.companyId);
      }),

    // Invite a member by email
    invite: publicProcedure
      .input(z.object({
        companyId: z.number(),
        email: z.string().email(),
      }))
      .mutation(async ({ input }) => {
        const member = await addCompanyMember({
          companyId: input.companyId,
          email: input.email.toLowerCase(),
          memberRole: "member",
          status: "pending",
          userId: null,
        });
        return member;
      }),

    // Remove a member from company
    remove: publicProcedure
      .input(z.object({
        companyId: z.number(),
        email: z.string().email(),
      }))
      .mutation(async ({ input }) => {
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
        if (input.userId) {
          await activateMemberByEmail(input.email, input.userId);
        }
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

    // Delete video from Facebook Catalog via Batch API, then delete DB record
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

        // 2. Get the access token - try company first, then global settings
        let accessToken: string | null = null;
        if (input.companyId) {
          const company = await getCompanyById(input.companyId);
          accessToken = company?.facebookAccessToken ?? null;
        }
        if (!accessToken) {
          accessToken = await getSetting("facebookAccessToken");
        }
        if (!accessToken) {
          throw new Error("Facebook Access Token not configured. Please set it in company settings or Admin Settings.");
        }

        // 3. Call Facebook Catalog Batch API to remove videos
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
          throw new Error(`Facebook API error: ${errorMsg}`);
        }

        // 4. Check if the batch was accepted
        const handle = fbResult?.handles?.[0];
        if (handle) {
          console.log(`[DeleteVideo] Batch accepted with handle: ${handle}`);
        }

        // 5. Verify the product no longer has videos
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

        // 6. Delete from our database
        await deleteUploadRecord(input.id);
        console.log(`[DeleteVideo] Deleted record ${input.id} from database.`);

        return {
          success: true,
          message: `Video removed from catalog and record deleted.`,
          handle: handle || null,
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
            return { valid: false, message: data?.error?.message || 'Invalid access token' };
          }
          return { valid: true, message: `Token valid. User: ${data.name || data.id}` };
        } catch (e: any) {
          return { valid: false, message: e.message || 'Failed to validate token' };
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

    // Generate a slideshow video from selected images
    generate: publicProcedure
      .input(z.object({
        images: z.array(z.object({
          url: z.string().url(),
          label: z.string().optional(),
        })).min(1).max(30),
        aspectRatio: z.enum(["4:5", "9:16"]),
        durationPerImage: z.number().min(1).max(30).default(3),
        transition: z.enum(["fade", "slideleft", "slideright", "slideup", "slidedown", "wipeleft", "wiperight", "none"]).default("fade"),
        transitionDuration: z.number().min(0.1).max(5).default(0.5),
        overlayText: z.string().optional(),
        showProductName: z.boolean().default(false),
        textPosition: z.enum(["top", "center", "bottom"]).default("bottom"),
        fontSize: z.number().min(12).max(120).optional(),
        backgroundColor: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        console.log(`[Slideshow API] Generating slideshow: ${input.images.length} images, ${input.aspectRatio}, ${input.transition}`);
        
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
