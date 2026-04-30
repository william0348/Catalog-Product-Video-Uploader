const PRISM_API_BASE = "https://api.prismvideos.com/v1";

export interface PrismModel {
  id: string;
  name: string;
  provider: string;
  maxDuration: number;
  supportedDurations: number[];
  supportedAspectRatios: string[];
  estimatedCostUsd: number;
  promptStyle: string;
}

export interface PrismGeneration {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  model: string;
  createdAt: string;
  completedAt?: string;
}

export const PRISM_MODELS: PrismModel[] = [
  {
    id: "veo-3.1",
    name: "Veo 3.1",
    provider: "Google",
    maxDuration: 8,
    supportedDurations: [5, 8],
    supportedAspectRatios: ["9:16", "1:1"],
    estimatedCostUsd: 0.80,
    promptStyle: "Focus on cinematic quality, detailed lighting, high-fidelity visuals, smooth camera movements",
  },
  {
    id: "kling-v2",
    name: "Kling v2",
    provider: "Kuaishou",
    maxDuration: 10,
    supportedDurations: [5, 10],
    supportedAspectRatios: ["9:16", "1:1"],
    estimatedCostUsd: 0.20,
    promptStyle: "Focus on dynamic product showcase, camera rotation, zoom effects, motion-rich transitions",
  },
  {
    id: "seedance-2.0",
    name: "Seedance 2.0",
    provider: "ByteDance",
    maxDuration: 10,
    supportedDurations: [5, 10],
    supportedAspectRatios: ["9:16", "1:1"],
    estimatedCostUsd: 0.15,
    promptStyle: "Focus on human interaction, lifestyle scenes, natural product usage, storytelling",
  },
  {
    id: "sora",
    name: "Sora",
    provider: "OpenAI",
    maxDuration: 20,
    supportedDurations: [5, 10, 20],
    supportedAspectRatios: ["9:16", "1:1"],
    estimatedCostUsd: 1.00,
    promptStyle: "Detailed scene descriptions, complex camera movements, multiple scene transitions, creative visual storytelling",
  },
];

export function getAvailableModels(): PrismModel[] {
  return PRISM_MODELS;
}

export function getModelById(modelId: string): PrismModel | undefined {
  return PRISM_MODELS.find(m => m.id === modelId);
}

export async function createGeneration(
  prismKey: string,
  model: string,
  prompt: string,
  imageUrl: string,
  aspectRatio: string,
  duration: number
): Promise<PrismGeneration> {
  const res = await fetch(`${PRISM_API_BASE}/generations`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${prismKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt, image_url: imageUrl, duration, aspect_ratio: aspectRatio }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Prism API error (${res.status}): ${err}`);
  }

  return await res.json();
}

export async function getGeneration(prismKey: string, generationId: string): Promise<PrismGeneration> {
  const res = await fetch(`${PRISM_API_BASE}/generations/${generationId}`, {
    headers: { "Authorization": `Bearer ${prismKey}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Prism API error (${res.status}): ${err}`);
  }

  return await res.json();
}
