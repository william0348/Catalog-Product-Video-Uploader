
import React, { useState, useContext } from 'react';
import { LanguageContext } from '@/contexts/LanguageContext';
import '@/reels.css';
import type { ReelsFormData, ApiResult, ReelIdea } from '../../../shared/reelsTypes';
import { hookTypesList } from '../../../shared/reelsTypes';

const trpcMutate = async (path: string, input: any): Promise<any> => {
  const response = await fetch(`/api/trpc/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ json: input }),
  });
  const data = await response.json();
  if (data?.error) throw new Error(data.error?.json?.message || data.error?.message || 'Request failed');
  return data?.result?.data?.json;
};

const initialFormData: ReelsFormData = {
  campaignType: 'performance',
  brandName: '',
  targetAudience: '',
  productBenefits: '',
  productDescription: '',
  industry: '',
  microSegments: [],
  productUrl: '',
};

interface SceneSection { label: string; content: string; }

function parseConceptToSections(concept: string): SceneSection[] {
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

const sectionIcons: Record<string, string> = {
  '3秒開頭': '🎬', '3-Second Hook': '🎬', '3秒Hook': '🎬',
  '場景': '🎥', 'Scenes': '🎥',
  '產品植入': '📦', 'Product Integration': '📦',
  '音效/音樂': '🎵', 'Sound/Music': '🎵', '音效': '🎵', '音樂': '🎵',
  '行動呼籲': '📢', 'CTA': '📢',
};

function getIcon(label: string): string {
  for (const [key, icon] of Object.entries(sectionIcons)) {
    if (label.includes(key)) return icon;
  }
  return '🎞️';
}

export const ReelsGenerator = () => {
  const { t } = useContext(LanguageContext);
  const [formData, setFormData] = useState<ReelsFormData>(initialFormData);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingSegments, setIsGeneratingSegments] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<{ idea: ReelIdea; hookType: string } | null>(null);
  const [showHookSelector, setShowHookSelector] = useState(false);
  const [selectedHooks, setSelectedHooks] = useState<string[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSegmentChange = (index: number, value: string) => {
    const newSegments = [...formData.microSegments];
    newSegments[index] = value;
    setFormData(prev => ({ ...prev, microSegments: newSegments }));
  };

  const handleGenerateSegments = async () => {
    setIsGeneratingSegments(true);
    setError(null);
    try {
      const data = await trpcMutate('reels.generateSegments', {
        brandName: formData.brandName, targetAudience: formData.targetAudience,
        productBenefits: formData.productBenefits, productDescription: formData.productDescription,
        industry: formData.industry,
      });
      setFormData(prev => ({ ...prev, microSegments: data.segments }));
    } catch (e: any) {
      setError(e.message || '生成微分眾失敗');
    } finally {
      setIsGeneratingSegments(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await trpcMutate('reels.generateIdeas', formData);
      setResult(data);
    } catch (e: any) {
      setError(e.message || '生成失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateWithHooks = async () => {
    if (selectedHooks.length !== 5) { setError('請選擇 5 個 Hook 類型'); return; }
    setIsLoading(true);
    setError(null);
    try {
      const data = await trpcMutate('reels.generateIdeasWithHooks', { formData, hooks: selectedHooks });
      setResult(data);
      setShowHookSelector(false);
    } catch (e: any) {
      setError(e.message || '重新生成失敗');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleHook = (hook: string) => {
    setSelectedHooks(prev => {
      if (prev.includes(hook)) return prev.filter(h => h !== hook);
      if (prev.length >= 5) return prev;
      return [...prev, hook];
    });
  };

  const toggleSection = (i: number) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const canGenerateSegments = formData.industry && formData.targetAudience && formData.brandName && formData.productBenefits && formData.productDescription;

  return (
    <div className="reels-page">
      {/* Hero */}
      <div className="reels-hero">
        <h1>🎬 Reels 創意點子生成器</h1>
        <p>為您的品牌活動注入病毒式傳播的能量，生成專為微分眾設計的短影音腳本。</p>
      </div>

      {error && <div className="reels-error">{error}</div>}

      {/* Form */}
      {!result && (
        <div className="reels-card">
          <form onSubmit={handleSubmit}>
            <div className="reels-grid">
              <div>
                <label className="reels-label">活動類型</label>
                <select name="campaignType" value={formData.campaignType} onChange={handleChange} className="reels-select">
                  <option value="performance">效能導向 (Performance)</option>
                  <option value="branding">品牌形象 (Branding)</option>
                </select>
              </div>
              <div>
                <label className="reels-label">品牌名稱</label>
                <input type="text" name="brandName" value={formData.brandName} onChange={handleChange} placeholder="例如：Aura Living" className="reels-input" />
              </div>
              <div>
                <label className="reels-label">產業類別</label>
                <input type="text" name="industry" value={formData.industry} onChange={handleChange} placeholder="例如：美妝保養" className="reels-input" />
              </div>
              <div>
                <label className="reels-label">目標族群</label>
                <input type="text" name="targetAudience" value={formData.targetAudience} onChange={handleChange} placeholder="例如：18-24歲Z世代" className="reels-input" />
              </div>
              <div className="full-width">
                <label className="reels-label">產品效益</label>
                <input type="text" name="productBenefits" value={formData.productBenefits} onChange={handleChange} placeholder="例如：快速上妝、持久不脫妝" className="reels-input" />
              </div>
              <div className="full-width">
                <label className="reels-label">產品敘述</label>
                <textarea name="productDescription" value={formData.productDescription} onChange={handleChange} rows={3} placeholder="詳細描述您的產品特色、功能與使用情境..." className="reels-textarea" />
              </div>
            </div>

            {/* Product Info */}
            <hr className="reels-divider" />
            <div className="reels-section-header">
              <span className="icon">🔗</span>
              <span>產品資訊（選填，可幫助 AI 更了解商品）</span>
            </div>
            <div style={{ marginTop: '12px' }}>
              <label className="reels-label">產品網址</label>
              <input type="text" name="productUrl" value={formData.productUrl || ''} onChange={handleChange} placeholder="https://www.example.com/product" className="reels-input" />
            </div>

            {/* Micro Segments */}
            <hr className="reels-divider" />
            <div className="reels-segment-row">
              <label className="reels-label" style={{ margin: 0 }}>創意微分眾 (5個)</label>
              <button type="button" onClick={handleGenerateSegments} disabled={isGeneratingSegments || !canGenerateSegments} className="reels-btn-secondary">
                {isGeneratingSegments ? <><span className="reels-spinner"></span> 生成中...</> : '✨ 幫我生成微分眾'}
              </button>
            </div>

            {formData.microSegments.length > 0 ? (
              <div className="reels-segment-grid">
                {formData.microSegments.map((seg, i) => (
                  <input type="text" key={i} value={seg} onChange={(e) => handleSegmentChange(i, e.target.value)} placeholder={`分眾 ${i + 1}`} className="reels-input" />
                ))}
              </div>
            ) : (
              <div className="reels-segment-empty">
                <div className="sparkle">✨</div>
                <p>點擊按鈕，讓 AI 為您生成專屬的創意微分眾！</p>
              </div>
            )}

            {/* Submit */}
            <div className="reels-submit-row">
              <button type="submit" disabled={isLoading || formData.microSegments.length < 5} className="reels-btn-primary">
                {isLoading ? <><span className="reels-spinner" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }}></span> 生成中（約30-60秒）...</> : '✨ 生成創意點子'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          <div className="reels-results-header">
            <button onClick={() => { setResult(null); setShowHookSelector(false); }} className="reels-btn-outline">← 返回表單</button>
            <button onClick={() => setShowHookSelector(!showHookSelector)} className="reels-btn-secondary">🔄 重新選擇 Hook 類型</button>
          </div>

          {/* Hook Selector */}
          {showHookSelector && (
            <div className="reels-card">
              <h3 style={{ marginBottom: '14px', fontSize: '15px', fontWeight: 700 }}>選擇 5 個 Hook 類型（已選 {selectedHooks.length}/5）</h3>
              <div className="reels-hook-pills">
                {hookTypesList.map(hook => (
                  <button key={hook} type="button" onClick={() => toggleHook(hook)} className={`reels-hook-pill ${selectedHooks.includes(hook) ? 'selected' : ''}`}>
                    {selectedHooks.includes(hook) ? '✓ ' : ''}{hook}
                  </button>
                ))}
              </div>
              <button onClick={handleRegenerateWithHooks} className="reels-btn-primary" disabled={isLoading || selectedHooks.length !== 5}>
                {isLoading ? <><span className="reels-spinner" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }}></span> 重新生成中...</> : '重新生成'}
              </button>
            </div>
          )}

          {/* Results Table */}
          <div className="reels-table-wrap">
            <table className="reels-table">
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>{result.headers.rows}</th>
                  {result.rowsData[0]?.ideas.map((idea, i) => (
                    <th key={i}>{idea.microSegment}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rowsData.map((row, ri) => (
                  <tr key={ri}>
                    <td className="reels-hook-cell">
                      <span>{row.hookType}</span>
                      <span className={`reels-badge ${row.isCommon ? 'reels-badge-common' : 'reels-badge-diff'}`}>
                        {row.isCommon ? '✓ 常用' : '★ 差異化'}
                      </span>
                    </td>
                    {row.ideas.map((idea, ci) => (
                      <td key={ci}>
                        <div className="reels-idea-title">{idea.title}</div>
                        <button onClick={() => setSelectedIdea({ idea, hookType: row.hookType })} className="reels-view-btn">
                          📄 查看腳本
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Script Modal */}
      {selectedIdea && (
        <div className="reels-modal-overlay" onClick={() => setSelectedIdea(null)}>
          <div className="reels-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reels-modal-header">
              <div>
                <div className="reels-modal-title">{selectedIdea.idea.title}</div>
                <div className="reels-modal-subtitle">Hook: {selectedIdea.hookType} · 微分眾: {selectedIdea.idea.microSegment}</div>
              </div>
              <button className="reels-modal-close" onClick={() => setSelectedIdea(null)}>✕</button>
            </div>
            <div className="reels-modal-body">
              {parseConceptToSections(selectedIdea.idea.concept).map((section, i) => {
                const isExpanded = expandedSections.has(i);
                return (
                  <div key={i} className="reels-scene">
                    <div className="reels-scene-header" onClick={() => toggleSection(i)}>
                      <span className="reels-scene-label">
                        <span>{getIcon(section.label)}</span>
                        {section.label}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '14px' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                    {isExpanded ? (
                      <div className="reels-scene-content">{section.content}</div>
                    ) : (
                      <div style={{ padding: '10px 18px', fontSize: '12px', color: '#94a3b8' }}>
                        {section.content.substring(0, 100)}...
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                <button onClick={() => setExpandedSections(new Set(parseConceptToSections(selectedIdea.idea.concept).map((_, i) => i)))} className="reels-btn-secondary">
                  全部展開
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
