import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getAvailableModels } from "./prismService";
import { generateVideoPrompt } from "./promptGenerator";
import { createVeoGeneration, getVeoStatus } from "./veoService";

export const prismRouter = router({
  models: publicProcedure.query(() => {
    return getAvailableModels();
  }),

  generatePrompt: publicProcedure
    .input(z.object({
      productType: z.string(),
      modelId: z.string(),
      duration: z.number(),
      productName: z.string().optional(),
      productDescription: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await generateVideoPrompt(
        input.productType, input.modelId, input.duration,
        input.productName, input.productDescription
      );
    }),

  generate: publicProcedure
    .input(z.object({
      geminiApiKey: z.string(),
      prompt: z.string(),
      imageUrl: z.string().optional(),
      duration: z.number().default(8),
      aspectRatio: z.string().default("9:16"),
    }))
    .mutation(async ({ input }) => {
      return await createVeoGeneration(
        input.geminiApiKey, input.prompt, input.imageUrl,
        input.duration, input.aspectRatio
      );
    }),

  status: publicProcedure
    .input(z.object({
      geminiApiKey: z.string(),
      operationName: z.string(),
    }))
    .query(async ({ input }) => {
      return await getVeoStatus(input.geminiApiKey, input.operationName);
    }),
});
