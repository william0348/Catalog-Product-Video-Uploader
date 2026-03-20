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
