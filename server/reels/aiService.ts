import { invokeLLM } from "./llm";
import type { MessageContent } from "./llm";
import type { MicroSegmentGenerationData, ReelsFormData, ReelIdea, HookSelectionResponse, ApiResult } from "../../shared/reelsTypes";
import { hookTypesList } from "../../shared/reelsTypes";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

async function callLLM(
  systemInstruction: string,
  userMessage: string,
  jsonSchema?: { name: string; schema: Record<string, unknown> },
  imageUrls?: string[]
): Promise<{ text: string; usage: TokenUsage }> {
  let userContent: MessageContent | MessageContent[];
  if (imageUrls && imageUrls.length > 0) {
    const parts: MessageContent[] = [{ type: "text", text: userMessage }];
    for (const url of imageUrls) {
      parts.push({ type: "image_url", image_url: { url, detail: "auto" } });
    }
    userContent = parts;
  } else {
    userContent = userMessage;
  }

  const params: Parameters<typeof invokeLLM>[0] = {
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: userContent },
    ],
  };

  if (jsonSchema) {
    params.response_format = {
      type: "json_schema",
      json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema },
    };
  }

  const result = await invokeLLM(params);
  const content = result.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("LLM response did not contain expected text content.");
  }

  const usage: TokenUsage = result.usage
    ? { promptTokens: result.usage.prompt_tokens, completionTokens: result.usage.completion_tokens, totalTokens: result.usage.total_tokens }
    : emptyUsage();

  return { text: content, usage };
}

function buildProductContext(productUrl?: string, productImages?: string[]): string {
  const parts: string[] = [];
  if (productUrl) parts.push(`- **產品網址:** ${productUrl}`);
  if (productImages && productImages.length > 0) {
    parts.push(`- **產品圖片:** 已附上 ${productImages.length} 張產品圖片，請仔細觀察產品的外觀、包裝、質感、使用場景等視覺特徵，並將這些視覺資訊融入你的創意中。`);
  }
  return parts.length > 0 ? `\n${parts.join("\n")}` : "";
}

const microSegmentsSchema = {
  name: "MicroSegmentsResponse",
  schema: {
    type: "object" as const,
    properties: {
      segments: { type: "array" as const, items: { type: "string" as const }, description: "An array of 5 creative micro-segment names." },
    },
    required: ["segments"],
    additionalProperties: false,
  },
};

export async function generateMicroSegments(data: MicroSegmentGenerationData): Promise<{ segments: string[]; usage: TokenUsage }> {
  const { brandName, targetAudience, productBenefits, productDescription, industry, productUrl, productImages } = data;
  const productContext = buildProductContext(productUrl, productImages);

  const systemInstruction = `
你是一位頂尖的市場策略師和品牌創意總監，專精於消費者心理學。你的任務是根據提供的品牌和市場資訊，生成 5 個有創意、生動且精準的「微分眾」名稱。你必須以 JSON 格式回應，且僅包含一個 'segments' 陣列。

JSON 格式範例:
{
  "segments": ["冒險卻膽小派", "懶人行動掛", "藝術感但不裝", "爸媽比小孩還野", "質感生活追求者"]
}
`;

  const userPrompt = `
**品牌資訊:**
- **產業類別:** ${industry}
- **目標族群:** ${targetAudience}
- **品牌名稱:** ${brandName}
- **產品效益:** ${productBenefits}
- **產品敘述:** ${productDescription}${productContext}

**生成指南:**
- 每個微分眾名稱都應超越傳統的人口統計學分類。
- 它應捕捉獨特的生活方式、價值觀、特定情境或行為模式。
- 名稱應具有吸引力、易記且能引起共鳴。
`;

  const { text: jsonString, usage } = await callLLM(systemInstruction, userPrompt, microSegmentsSchema, productImages);
  const parsed = JSON.parse(jsonString) as { segments: string[] };
  if (!parsed.segments || parsed.segments.length < 5) throw new Error("API response did not generate enough micro-segments.");
  return { segments: parsed.segments.slice(0, 5), usage };
}

const initialHookSelectionSchema = {
  name: "InitialHookSelection",
  schema: {
    type: "object" as const,
    properties: {
      chosenHooks: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: { hookType: { type: "string" as const }, isCommon: { type: "boolean" as const } },
          required: ["hookType", "isCommon"],
          additionalProperties: false,
        },
      },
    },
    required: ["chosenHooks"],
    additionalProperties: false,
  },
};

async function selectInitialHooks(data: ReelsFormData): Promise<{ hooks: HookSelectionResponse[]; usage: TokenUsage }> {
  const { campaignType, industry, productUrl, productImages } = data;
  const productContext = buildProductContext(productUrl, productImages);

  const systemInstruction = `
你是一位社群媒體策略師和創意總監，專精於病毒式短影音內容。你的任務是根據提供的產業和活動類型，從提供的 Hook 列表中，專業地選擇 5 個最適合的 Hook 類型。
你的選擇必須包含：3 個該產業常用且有效的類型 (isCommon: true)，以及 2 個新穎、差異化的類型 (isCommon: false)。
以 JSON 格式回應。

可用 Hook 列表: ${hookTypesList.join(", ")}
`;

  const userPrompt = `
**行銷活動背景:**
- **活動類型:** ${campaignType === "performance" ? "成效導向" : "品牌形象"}
- **產業類別:** ${industry}${productContext}

請選擇 5 個 Hook 類型並標註其常用性。
`;

  const { text: jsonString, usage } = await callLLM(systemInstruction, userPrompt, initialHookSelectionSchema, productImages);
  const parsed = JSON.parse(jsonString) as { chosenHooks: HookSelectionResponse[] };
  if (!parsed.chosenHooks || parsed.chosenHooks.length !== 5) throw new Error("API response did not select 5 hooks.");
  return { hooks: parsed.chosenHooks, usage };
}

const singleHookIdeasSchema = {
  name: "SingleHookReelsIdeas",
  schema: {
    type: "object" as const,
    properties: {
      ideas: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            microSegment: { type: "string" as const },
            title: { type: "string" as const },
            concept: { type: "string" as const },
          },
          required: ["microSegment", "title", "concept"],
          additionalProperties: false,
        },
      },
    },
    required: ["ideas"],
    additionalProperties: false,
  },
};

async function generateIdeasForSingleHook(
  formData: ReelsFormData, hookType: string, isCommon: boolean
): Promise<{ hookType: string; isCommon: boolean; ideas: ReelIdea[]; usage: TokenUsage }> {
  const { campaignType, brandName, targetAudience, productBenefits, productDescription, industry, microSegments, productUrl, productImages } = formData;
  const productContext = buildProductContext(productUrl, productImages);

  const systemInstruction = `
你是一位社群媒體策略師和創意總監，專精於病毒式短影音內容。你的任務是根據提供的行銷活動背景、特定 Hook 類型，以及我提供的 5 個創意微分眾，生成 5 個 Reels 短影音點子。
你必須以 JSON 格式回應，僅包含一個 'ideas' 陣列。

每個 'concept' 必須是詳細且可直接用於製作的分鏡腳本，包含 5 個獨立的部分：
    - "**3秒開頭 (3-Second Hook):** 具體描述開頭吸睛的視覺和聽覺內容。"
    - "**場景 (Scenes):** 用連續的段落文字詳細描述 2-3 個不同的場景。"
    - "**產品植入 (Product Integration):** 清晰解釋產品如何在故事中自然地展示和使用。"
    - "**音效/音樂 (Sound/Music):** 建議背景音樂或特定音效以增強氛圍。"
    - "**行動呼籲 (CTA):** 清晰且引人入勝的行動呼籲。"
`;

  const userPrompt = `
**行銷活動背景:**
- **活動類型:** ${campaignType === "performance" ? "成效導向" : "品牌形象"}
- **品牌名稱:** ${brandName}
- **目標族群:** ${targetAudience}
- **產品效益:** ${productBenefits}
- **產品敘述:** ${productDescription}
- **產業類別:** ${industry}
- **核心策略:** 避免「羞恥行銷」。採用正向行銷，強調產品如何自然融入日常生活。${productContext}

**指定 Hook 類型:** ${hookType}
**創意微分眾:** ${microSegments.join(", ")}

現在，根據上述資訊為每個微分眾生成一個針對「${hookType}」的 Reels 點子。
`;

  const { text: jsonString, usage } = await callLLM(systemInstruction, userPrompt, singleHookIdeasSchema, productImages);
  const parsed = JSON.parse(jsonString) as { ideas: ReelIdea[] };
  if (!parsed.ideas || parsed.ideas.length < microSegments.length) {
    throw new Error(`API response did not generate enough ideas for hook '${hookType}'.`);
  }

  const reelsIdeas = parsed.ideas.slice(0, microSegments.length);
  reelsIdeas.sort((a, b) => microSegments.indexOf(a.microSegment) - microSegments.indexOf(b.microSegment));
  return { hookType, isCommon, ideas: reelsIdeas, usage };
}

export async function generateReelsIdeas(formData: ReelsFormData): Promise<ApiResult & { usage: TokenUsage }> {
  const { microSegments } = formData;
  let totalUsage = emptyUsage();

  const { hooks: chosenHooks, usage: hookUsage } = await selectInitialHooks(formData);
  totalUsage = addUsage(totalUsage, hookUsage);

  const allHookResults = await Promise.all(
    chosenHooks.map((hook) => generateIdeasForSingleHook(formData, hook.hookType, hook.isCommon))
  );

  for (const result of allHookResults) totalUsage = addUsage(totalUsage, result.usage);

  const rowsData = allHookResults.map((r) => ({ hookType: r.hookType, isCommon: r.isCommon, ideas: r.ideas }));
  rowsData.sort((a, b) => {
    const iA = hookTypesList.indexOf(a.hookType), iB = hookTypesList.indexOf(b.hookType);
    if (iA !== -1 && iB !== -1) return iA - iB;
    return a.hookType.localeCompare(b.hookType);
  });

  return { headers: { rows: "Hook 類型", columns: "創意微分眾" }, rowsData, usage: totalUsage };
}

export async function generateReelsIdeasWithHooks(
  formData: ReelsFormData, hooks: string[]
): Promise<ApiResult & { usage: TokenUsage }> {
  const { microSegments } = formData;
  let totalUsage = emptyUsage();

  const hookCommonalitySchema = {
    name: "HookCommonality",
    schema: { type: "object" as const, properties: { isCommon: { type: "boolean" as const } }, required: ["isCommon"], additionalProperties: false },
  };

  const allHookResults = await Promise.all(
    hooks.map(async (hookType) => {
      const { text, usage: cUsage } = await callLLM(
        `你是一位資深的市場分析師。根據提供的產業類型和Hook類型，判斷此Hook類型是否為該產業「常用且有效」。以 JSON 格式回應。`,
        `**產業類別:** ${formData.industry}\n**Hook 類型:** ${hookType}`,
        hookCommonalitySchema
      );
      const { isCommon } = JSON.parse(text) as { isCommon: boolean };
      const result = await generateIdeasForSingleHook(formData, hookType, isCommon);
      return { ...result, extraUsage: cUsage };
    })
  );

  for (const r of allHookResults) {
    totalUsage = addUsage(totalUsage, r.usage);
    totalUsage = addUsage(totalUsage, r.extraUsage);
  }

  const rowsData = allHookResults.map((r) => ({ hookType: r.hookType, isCommon: r.isCommon, ideas: r.ideas }));
  rowsData.sort((a, b) => {
    const iA = hookTypesList.indexOf(a.hookType), iB = hookTypesList.indexOf(b.hookType);
    if (iA !== -1 && iB !== -1) return iA - iB;
    return a.hookType.localeCompare(b.hookType);
  });

  return { headers: { rows: "Hook 類型", columns: "創意微分眾" }, rowsData, usage: totalUsage };
}
