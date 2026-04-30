import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { generateMicroSegments, generateReelsIdeas, generateReelsIdeasWithHooks } from "./aiService";
import { generateSceneImages } from "./imageService";

export const reelsRouter = router({
  generateSegments: publicProcedure
    .input(z.object({
      brandName: z.string(),
      targetAudience: z.string(),
      productBenefits: z.string(),
      productDescription: z.string(),
      industry: z.string(),
      productUrl: z.string().optional(),
      productImages: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await generateMicroSegments(input);
      return result;
    }),

  generateIdeas: publicProcedure
    .input(z.object({
      campaignType: z.enum(["performance", "branding"]),
      brandName: z.string(),
      targetAudience: z.string(),
      productBenefits: z.string(),
      productDescription: z.string(),
      industry: z.string(),
      microSegments: z.array(z.string()),
      productUrl: z.string().optional(),
      productImages: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await generateReelsIdeas(input);
      return result;
    }),

  generateIdeasWithHooks: publicProcedure
    .input(z.object({
      formData: z.object({
        campaignType: z.enum(["performance", "branding"]),
        brandName: z.string(),
        targetAudience: z.string(),
        productBenefits: z.string(),
        productDescription: z.string(),
        industry: z.string(),
        microSegments: z.array(z.string()),
        productUrl: z.string().optional(),
        productImages: z.array(z.string()).optional(),
      }),
      hooks: z.array(z.string()),
    }))
    .mutation(async ({ input }) => {
      const result = await generateReelsIdeasWithHooks(input.formData, input.hooks);
      return result;
    }),

  generateSceneImages: publicProcedure
    .input(z.object({
      geminiApiKey: z.string(),
      concept: z.string(),
      brandName: z.string(),
      industry: z.string(),
      title: z.string(),
      imageStyle: z.enum(["pencil_sketch", "realistic"]).default("pencil_sketch"),
    }))
    .mutation(async ({ input }) => {
      const result = await generateSceneImages(
        input.geminiApiKey, input.concept, input.brandName, input.industry, input.title, input.imageStyle
      );
      return result;
    }),
});
