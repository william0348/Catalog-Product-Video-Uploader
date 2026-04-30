export type MessageContent = string | { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: string } };

export type Message = {
  role: "system" | "user" | "assistant";
  content: MessageContent | MessageContent[];
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

type JsonSchema = { name: string; schema: Record<string, unknown>; strict?: boolean };

export type InvokeParams = {
  messages: Message[];
  response_format?: { type: "json_schema"; json_schema: JsonSchema } | { type: "json_object" };
};

const LLAMA_API_URL = "https://api.llama.com/v1/chat/completions";
const LLAMA_MODEL = "Llama-4-Maverick-17B-128E-Instruct-FP8";

function getApiKey(): string {
  const key = process.env.LLAMA_API_KEY;
  if (!key) throw new Error("LLAMA_API_KEY is not configured");
  return key;
}

function normalizeMessage(msg: Message) {
  const { role, content } = msg;
  if (typeof content === "string") return { role, content };
  if (Array.isArray(content)) {
    const parts = content.map((p) => {
      if (typeof p === "string") return { type: "text", text: p };
      if (p.type === "text") return { type: "text", text: p.text };
      if (p.type === "image_url") return { type: "image", url: p.image_url.url };
      return { type: "text", text: JSON.stringify(p) };
    });
    return { role, content: parts };
  }
  if (content.type === "text") return { role, content: content.text };
  if (content.type === "image_url") return { role, content: [{ type: "image", url: content.image_url.url }] };
  return { role, content: JSON.stringify(content) };
}

interface LlamaNativeResponse {
  id: string;
  completion_message: {
    role: string;
    stop_reason: string;
    content: { type: string; text?: string };
  };
  metrics?: Array<{ metric: string; value: number; unit: string }>;
}

function transformResponse(resp: LlamaNativeResponse): InvokeResult {
  const text = resp.completion_message.content.text || "";
  let promptTokens = 0, completionTokens = 0, totalTokens = 0;
  if (resp.metrics) {
    for (const m of resp.metrics) {
      if (m.metric === "num_prompt_tokens") promptTokens = m.value;
      if (m.metric === "num_completion_tokens") completionTokens = m.value;
      if (m.metric === "num_total_tokens") totalTokens = m.value;
    }
  }
  return {
    id: resp.id,
    created: Math.floor(Date.now() / 1000),
    model: LLAMA_MODEL,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens },
  };
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const apiKey = getApiKey();
  const payload: Record<string, unknown> = {
    model: LLAMA_MODEL,
    messages: params.messages.map(normalizeMessage),
    max_completion_tokens: 32768,
  };
  if (params.response_format) {
    payload.response_format = params.response_format;
  }

  console.log(`[LLM] Calling Llama API (${LLAMA_MODEL})`);
  const response = await fetch(LLAMA_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`);
  }

  const llamaResp = (await response.json()) as LlamaNativeResponse;
  return transformResponse(llamaResp);
}
