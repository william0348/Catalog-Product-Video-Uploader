import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { getAvailableModels, createGeneration, getGeneration, batchCreateGenerations } from "./prismService";

export const prismRouter = router({
  models: publicProcedure.query(() => {
    return getAvailableModels();
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
      return await createGeneration(input.prismApiKey, input.model, input.prompt, input.imageUrl, input.aspectRatio, input.duration);
    }),

  status: publicProcedure
    .input(z.object({
      prismApiKey: z.string(),
      generationId: z.string(),
    }))
    .query(async ({ input }) => {
      return await getGeneration(input.prismApiKey, input.generationId);
    }),

  batchGenerate: publicProcedure
    .input(z.object({
      prismApiKey: z.string(),
      items: z.array(z.object({
        model: z.string(),
        prompt: z.string(),
        imageUrl: z.string(),
        aspectRatio: z.string().default("1:1"),
        duration: z.number().default(5),
      })),
    }))
    .mutation(async ({ input }) => {
      return await batchCreateGenerations(input.prismApiKey, input.items);
    }),
});
