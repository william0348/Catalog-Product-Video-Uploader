interface SceneSection {
  label: string;
  content: string;
}

interface SceneImage {
  label: string;
  imageUrl: string;
}

function parseSections(concept: string): SceneSection[] {
  const patterns = [/\*\*([^*]+?)[：:]\*\*\s*/g, /\*\*([^*]+?)\*\*[：:]\s*/g];
  let best: SceneSection[] = [];
  for (const pattern of patterns) {
    const sections: SceneSection[] = [];
    const matches: { label: string; index: number; len: number }[] = [];
    let m;
    while ((m = pattern.exec(concept)) !== null) matches.push({ label: m[1].trim(), index: m.index, len: m[0].length });
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i].len;
      const end = i + 1 < matches.length ? matches[i + 1].index : concept.length;
      const content = concept.slice(start, end).trim();
      if (matches[i].label && content) sections.push({ label: matches[i].label, content });
    }
    if (sections.length > best.length) best = sections;
  }
  if (best.length === 0) best.push({ label: '腳本內容', content: concept });
  return best;
}

function buildImagePrompt(section: SceneSection, brandName: string, industry: string, title: string, style: string): string {
  const styleDesc = style === 'pencil_sketch'
    ? 'pencil sketch illustration style, hand-drawn, black and white with subtle shading, storyboard feel'
    : 'realistic photography style, professional lighting, high quality commercial look';

  return `${styleDesc}. Scene for a short-form video ad storyboard. Brand: ${brandName}, Industry: ${industry}. Script title: "${title}". Scene section "${section.label}": ${section.content.substring(0, 300)}. Create a single clear scene image suitable for a video storyboard.`;
}

async function generateImageWithGemini(geminiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: `Generate an image: ${prompt}` }]
      }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      }
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error('Gemini did not return an image');
}

export async function generateSceneImages(
  geminiKey: string,
  concept: string,
  brandName: string,
  industry: string,
  title: string,
  imageStyle: string
): Promise<{ images: SceneImage[] }> {
  const sections = parseSections(concept);
  const images: SceneImage[] = [];

  for (const section of sections) {
    try {
      const prompt = buildImagePrompt(section, brandName, industry, title, imageStyle);
      const imageUrl = await generateImageWithGemini(geminiKey, prompt);
      images.push({ label: section.label, imageUrl });
    } catch (e: any) {
      console.error(`[ImageService] Failed to generate image for "${section.label}":`, e.message);
      images.push({ label: section.label, imageUrl: '' });
    }
  }

  return { images };
}
