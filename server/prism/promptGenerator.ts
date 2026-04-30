import { invokeLLM } from "../reels/llm";
import { getModelById } from "./prismService";

const promptSchema = {
  name: "VideoPromptResponse",
  schema: {
    type: "object" as const,
    properties: {
      prompt: { type: "string" as const, description: "The optimized video generation prompt" },
      storyboard: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            timeRange: { type: "string" as const, description: "Time range e.g. 0-2秒" },
            description: { type: "string" as const, description: "What happens in this time segment" },
          },
          required: ["timeRange", "description"],
          additionalProperties: false,
        },
        description: "Scene-by-scene storyboard with timing",
      },
    },
    required: ["prompt", "storyboard"],
    additionalProperties: false,
  },
};

export async function generateVideoPrompt(
  productType: string,
  modelId: string,
  duration: number,
  productName?: string,
  productDescription?: string,
): Promise<{ prompt: string; storyboard: Array<{ timeRange: string; description: string }> }> {
  const model = getModelById(modelId);
  const modelName = model?.name || modelId;
  const modelStyle = model?.promptStyle || "";

  const systemInstruction = `
你是一位專業的短影音創意總監，擅長為不同的 AI 影片生成模型撰寫最佳化的 prompt。
你的任務是根據商品類型、影片時長、和使用的 AI 模型，生成最適合的影片 prompt 和分鏡腳本。

模型特性（${modelName}）：${modelStyle}

重要規則：
1. Prompt 必須用英文撰寫（AI 影片模型對英文 prompt 效果最好）
2. 分鏡腳本用繁體中文
3. 分鏡秒數加總必須等於影片總時長 ${duration} 秒
4. Prompt 要針對「${modelName}」模型的特性優化
5. 影片風格要適合電商/社群行銷用途
6. 如果是 image-to-video，prompt 要描述圖片中產品應該如何動態展示

回應 JSON 格式。
`;

  const userPrompt = `
**商品資訊：**
- 商品類型：${productType}
${productName ? `- 商品名稱：${productName}` : ''}
${productDescription ? `- 商品描述：${productDescription}` : ''}

**影片規格：**
- AI 模型：${modelName}
- 影片時長：${duration} 秒
- 用途：電商產品展示影片，用於社群媒體廣告

請生成最佳化的影片 prompt（英文）和分鏡腳本（中文）。
`;

  const result = await invokeLLM({
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: promptSchema.name, strict: true, schema: promptSchema.schema },
    },
  });

  const content = result.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("LLM did not return expected content");
  }

  return JSON.parse(content);
}
