const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface VeoGeneration {
  operationName: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}

export async function createVeoGeneration(
  geminiKey: string,
  prompt: string,
  imageUrl?: string,
  duration?: number,
  aspectRatio?: string,
): Promise<{ operationName: string }> {
  const model = "veo-2.0-generate-001";
  const url = `${GEMINI_API_BASE}/models/${model}:predictLongRunning?key=${geminiKey}`;

  const instances: any = { prompt };
  if (imageUrl) {
    instances.image = { imageUrl };
  }

  const parameters: any = {};
  if (duration) parameters.durationSeconds = duration;
  if (aspectRatio) parameters.aspectRatio = aspectRatio;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instances: [instances], parameters }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Veo API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return { operationName: data.name };
}

export async function getVeoStatus(
  geminiKey: string,
  operationName: string,
): Promise<VeoGeneration> {
  const url = `${GEMINI_API_BASE}/${operationName}?key=${geminiKey}`;

  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Veo status error (${res.status}): ${err}`);
  }

  const data = await res.json();

  if (data.done) {
    if (data.error) {
      return { operationName, status: "failed", error: data.error.message || "Generation failed" };
    }

    const videos = data.response?.predictions || data.response?.generatedVideos || [];
    if (videos.length > 0) {
      const video = videos[0];
      const videoUrl = video.videoUrl || video.uri || "";
      return { operationName, status: "completed", videoUrl };
    }

    return { operationName, status: "failed", error: "No video generated" };
  }

  return { operationName, status: "processing" };
}
