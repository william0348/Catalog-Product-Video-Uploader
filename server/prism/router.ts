import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getAvailableModels, createGeneration, getGeneration } from "./prismService";
import { generateVideoPrompt } from "./promptGenerator";

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
      prismApiKey: z.string(),
      model: z.string(),
      prompt: z.string(),
      imageUrl: z.string(),
      aspectRatio: z.string().default("1:1"),
      duration: z.number().default(5),
    }))
    .mutation(async ({ input }) => {
      return await createGeneration(
        input.prismApiKey, input.model, input.prompt,
        input.imageUrl, input.aspectRatio, input.duration
      );
    }),

  status: publicProcedure
    .input(z.object({
      prismApiKey: z.string(),
      generationId: z.string(),
    }))
    .query(async ({ input }) => {
      return await getGeneration(input.prismApiKey, input.generationId);
    }),
});
