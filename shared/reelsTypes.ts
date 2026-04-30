export interface ReelsFormData {
  campaignType: 'performance' | 'branding';
  brandName: string;
  targetAudience: string;
  productBenefits: string;
  productDescription: string;
  industry: string;
  microSegments: string[];
  productUrl?: string;
  productImages?: string[];
}

export interface MicroSegmentGenerationData {
  brandName: string;
  targetAudience: string;
  productBenefits: string;
  productDescription: string;
  industry: string;
  productUrl?: string;
  productImages?: string[];
}

export interface ReelIdea {
  microSegment: string;
  title: string;
  concept: string;
}

export interface HookSelectionResponse {
  hookType: string;
  isCommon: boolean;
}

export interface RowData {
  hookType: string;
  isCommon: boolean;
  ideas: ReelIdea[];
}

export interface ApiResult {
  headers: {
    rows: string;
    columns: string;
  };
  rowsData: RowData[];
}

/** A single scene section parsed from the concept text */
export interface SceneSection {
  label: string;
  content: string;
}

/** Image generation result for a single scene */
export interface SceneImage {
  label: string;
  imageUrl: string;
}

/** Token usage tracking for displaying credit consumption */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export const hookTypesList = [
  "理由型 (Reasons Why)",
  "前後對比 (Before & After)",
  "有趣冷知識 (Fun Facts)",
  "迷思與真相 (Myth vs. Truth)",
  "負面引子 (Negative Hook)",
  "徵兆型 (Signs)",
  "視角型 (POV)",
  "提問型 (Question)",
  "小故事 (Anecdote)",
  "數據衝擊 (Statistic)",
  "名言開場 (Quote)",
  "挑戰型 (Challenge)",
  "類比型 (Analogy)",
  "大膽預測 (Prediction)",
  "矛盾開場 (Contradiction)",
  "行動呼籲 (Call to Action)",
  "反問型 (Rhetorical Question)",
  "情感訴求 (Emotional Appeal)",
  "歷史脈絡 (Historical Context)",
  "視覺描繪 (Visual Description)",
  "清單型 (List)",
  "問題解法 (Problem-Solution)",
  "好奇缺口 (Curiosity Gap)",
  "預告型 (Teaser)",
  "倒數型 (Countdown)",
  "轉變型 (Transformation)",
  "幕後花絮 (Behind the Scenes)",
  "快招/幫你做好了 (Quick Tips/Did it for you)",
  "開箱型 (Unboxing)",
  "反應型 (Reaction)",
];
