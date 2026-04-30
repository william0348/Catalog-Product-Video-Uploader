const PRISM_API_BASE = "https://api.prismvideos.com/v1";

export interface PrismModel {
  id: string;
  name: string;
  provider: string;
  supportsImageToVideo: boolean;
  supportedAspectRatios: string[];
  supportedDurations: number[];
  estimatedCostUsd: number;
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

const KNOWN_MODELS: PrismModel[] = [
  { id: "seedance-2.0", name: "Seedance 2.0", provider: "ByteDance", supportsImageToVideo: true, supportedAspectRatios: ["9:16", "1:1", "16:9"], supportedDurations: [5, 10], estimatedCostUsd: 0.15 },
  { id: "veo-3.1", name: "Veo 3.1", provider: "Google", supportsImageToVideo: true, supportedAspectRatios: ["9:16", "1:1", "16:9"], supportedDurations: [5, 8], estimatedCostUsd: 0.80 },
  { id: "kling-v2", name: "Kling v2", provider: "Kuaishou", supportsImageToVideo: true, supportedAspectRatios: ["9:16", "1:1", "16:9"], supportedDurations: [5, 10], estimatedCostUsd: 0.20 },
  { id: "hailuo", name: "Hailuo", provider: "MiniMax", supportsImageToVideo: true, supportedAspectRatios: ["9:16", "1:1", "16:9"], supportedDurations: [5], estimatedCostUsd: 0.10 },
  { id: "sora", name: "Sora", provider: "OpenAI", supportsImageToVideo: true, supportedAspectRatios: ["9:16", "1:1", "16:9"], supportedDurations: [5, 10, 20], estimatedCostUsd: 1.00 },
  { id: "runway-gen4", name: "Runway Gen4", provider: "Runway", supportsImageToVideo: true, supportedAspectRatios: ["9:16", "1:1", "16:9"], supportedDurations: [5, 10], estimatedCostUsd: 0.50 },
];

export function getAvailableModels(): PrismModel[] {
  return KNOWN_MODELS;
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

export async function batchCreateGenerations(
  prismKey: string,
  items: Array<{ model: string; prompt: string; imageUrl: string; aspectRatio: string; duration: number }>
): Promise<PrismGeneration[]> {
  const results: PrismGeneration[] = [];
  for (const item of items) {
    const gen = await createGeneration(prismKey, item.model, item.prompt, item.imageUrl, item.aspectRatio, item.duration);
    results.push(gen);
  }
  return results;
}
