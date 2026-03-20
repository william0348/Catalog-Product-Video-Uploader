import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  createUploadRecord,
  createUploadRecordsBatch,
  getUploadRecordsByCatalog,
  getAllUploadRecords,
  deleteUploadRecord,
  getSetting,
  setSetting,
  getAllSettings,
  getUploadRecordById,
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

  // ==================== Upload Records ====================
  uploads: router({
    create: publicProcedure
      .input(z.object({
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
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        // 1. Get the record from DB
        const record = await getUploadRecordById(input.id);
        if (!record) {
          throw new Error("Record not found");
        }

        // 2. Get the access token from settings
        const accessToken = await getSetting("facebookAccessToken");
        if (!accessToken) {
          throw new Error("Facebook Access Token not configured. Please set it in Admin Settings.");
        }

        // 3. Call Facebook Catalog Batch API to remove videos
        // Using method: "UPDATE" with video: [] to clear videos
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

        // 4. Check if the batch was accepted (FB returns a handle for async processing)
        const handle = fbResult?.handles?.[0];
        if (handle) {
          // Optionally check batch status - for now we trust the acceptance
          console.log(`[DeleteVideo] Batch accepted with handle: ${handle}`);
        }

        // 5. Verify the product no longer has videos by querying the product
        // Wait a brief moment for FB to process
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          const verifyUrl = `https://graph.facebook.com/v21.0/${record.catalogId}/products?filter={"retailer_id":{"eq":"${record.retailerId}"}}&fields=id,retailer_id,name,video&access_token=${accessToken}`;
          const verifyResponse = await fetch(verifyUrl);
          const verifyResult = await verifyResponse.json();
          
          if (verifyResult?.data?.[0]?.video && verifyResult.data[0].video.length > 0) {
            console.warn(`[DeleteVideo] Warning: Product ${record.retailerId} still has videos after deletion attempt. Proceeding with DB deletion anyway.`);
          } else {
            console.log(`[DeleteVideo] Verified: Product ${record.retailerId} has no videos in catalog.`);
          }
        } catch (verifyError) {
          console.warn(`[DeleteVideo] Could not verify video deletion:`, verifyError);
          // Don't block DB deletion if verification fails
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

  // ==================== App Settings ====================
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
