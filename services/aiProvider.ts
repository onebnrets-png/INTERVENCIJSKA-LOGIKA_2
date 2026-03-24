// services/aiProvider.ts
// ═══════════════════════════════════════════════════════════════
// Universal AI Provider Abstraction Layer – v6.21 (2026-03-24)
// ═══════════════════════════════════════════════════════════════ 
// CHANGELOG:
// v6.21 — 2026-03-24 — EO-148: Added forceGoogleSearch?: boolean to AIGenerateOptions.
//         Allows standalone repair calls (repairBrokenReferenceUrls) to force google_search
//         grounding without relying on storageService.getWebSearchEnabled() or sectionKey eligibility.
// v6.20 — 2026-03-20 — EO-138: Extract _usage (token counts) from all provider responses.
//         AIGenerateResult now includes optional _usage field with provider/model/inputTokens/outputTokens/totalTokens.
// v6.19 — 2026-03-20 — EO-135: Universal google_search + JSON mode guard. Auto-disables google_search when
//         responseMimeType:'application/json' or responseSchema is active. Prevents HTTP 400 for ALL sections.
//         WEB_SEARCH_EXCLUDED_SECTIONS remains as manual override; EO-135 catches everything else.
// v6.18 — 2026-03-18 — EO-127: partnerAllocations_wp tokens raised 8192→16384 (WP6 truncation fix).
// v6.17 — 2026-03-18 — EO-121: Raise outputs/outcomes/impacts/kers maxOutputTokens from 4096 to 8192 (prevents truncation).
// v6.16 — 2026-03-18 — EO-120: Add partnerAllocations_wp to WEB_SEARCH_EXCLUDED_SECTIONS (fixes 400 Bad Request from google_search + responseSchema conflict).
//         EO-120b: Fast-fail for 400 Bad Request in handleProviderError — BAD_REQUEST not retryable, saves ~4min of wasted retries.
// v6.14 — 2026-03-17 — EO-114: FIX sanitizeJSONResponse — trim leading whitespace/newlines BEFORE fence detection.
//         Gemini sometimes returns \n```json which bypassed startsWith('```') check.
// v6.13 – EO-108: FIX sanitizeJSONResponse — raw/s variable desync + unclosed markdown fence handling.
//         Previous code modified `raw` for tool_call strip but continued with original `s`.
//         Markdown fence regex required closing ``` which Gemini often omits.
//         Added JSON-start finder for responses with text prefix before JSON.
//         This fixes INVALID_JSON failures for PM, Partners, Risks, Allocations.
// v6.12 – EO-104: FAST model fallback — throw ModelOverloadedError after 3 consecutive 503s (was 6).
//         Reduces wait from 245s to ~15s before user gets fallback dialog.
//         INVALID_JSON still retries 6x (truncation is recoverable). Only MODEL_OVERLOADED/SERVER_ERROR fast-fail.
// v6.11 – EO-099: Intelligent model fallback — when all retries exhausted for MODEL_OVERLOADED/SERVER_ERROR,
//         returns structured fallback signal instead of throwing. Caller (useGeneration) shows dialog
//         with options: wait+retry, switch to fallback model, or cancel.
//         Fallback models: gemini→gemini-2.5-flash, openai→gpt-4.1-mini, openrouter→provider-specific lighter model
// v6.10 – EO-098: risks max_tokens raised from 6144 to 12288 (8+ risks with _references truncate at 6K)
// v6.9 – EO-096: partnerAllocations max_tokens raised from 8192 to 16384 (large consortiums truncate at 8K)
//
// v6.8 – EO-093: Retry 6x with exponential backoff (5s→90s cap) for Gemini 503/MODEL_OVERLOADED,
//         - MAX_RETRIES raised from 3 to 6
//         - BASE_DELAY_MS raised from 2000 to 5000
//         - Delay capped at 90s (was uncapped — 2s, 4s, 8s → now 5s, 10s, 20s, 40s, 80s, 90s)
// v6.7 – EO-081: Dynamic max_tokens fix + Inline citation markers
//         - SECTION_MAX_TOKENS: raised problemAnalysis/projectIdea from 4096→6144
//           (EO-080 _references caused truncation on MiniMax M2.5)
//         - SECTION_MAX_TOKENS: added stateOfTheArt, proposedSolution (6144),
//           sustainability, dissemination, targetGroups (4096)
//         - Gemini adapter: added explicit maxOutputTokens from getMaxTokensForSection()
//         - WEB_SEARCH_ENFORCEMENT_PROMPT: added INLINE CITATION FORMAT block
//           requiring [1], [2], [3] markers in text mapped to _references array
//         - OpenRouter OR_WEB_CONTEXT_PROMPT: added inline citation instructions
//         - Fixes: MiniMax M2.5 finish_reason=length on problemAnalysis,
//           missing inline citations in all generated content
// v6.6 – EO-080: URL Provenance — [VERIFIED_URL] tagging for web-search URLs
//         - Gemini google_search: grounding chunk URLs tagged with [VERIFIED_URL: <url>]
//         - OpenRouter Exa web plugin: [VERIFIED_URL] hint appended to prompt
//         - Tags enable geminiService.ts to set urlVerified on _references post-processing
//         - sanitizeJSONResponse already exported (v6.1)
// v6.5 – EO-078: OpenRouter web search prompt fix for agentic models (MiniMax, DeepSeek)
//         ROOT CAUSE: WEB_SEARCH_ENFORCEMENT_PROMPT told models to "use web search tool"
//         while Exa plugin already injected search results → agentic models generated
//         <minimax:tool_call> XML or {"tool":"google_search"} instead of JSON content.
//         FIX 1: New OR_WEB_CONTEXT_PROMPT replaces WEB_SEARCH_ENFORCEMENT_PROMPT in OpenRouter adapter
//         FIX 2: Added response-healing plugin for JSON mode requests
//         FIX 3: sanitizeJSONResponse strips hallucinated tool_call XML
//         NOTE: Gemini adapter unchanged — uses native google_search tool (works correctly)
// v6.4 – EO-077: OpenRouter model expansion — 46 models total (was 25)
//         ADDED 21 models: Claude Opus/Sonnet 4.6, Haiku 4.5, Grok 4.1 Fast (2M!),
//         Gemini 3 Flash + 3.1 Flash Lite via OR, Qwen3.5 Max/Plus, Qwen3 Coder Next,
//         ByteDance Seed 1.6/Flash, MiniMax M2.5 + Lightning (#1 OpenRouter!),
//         KwaiPilot Kat Coder Pro, GLM 4.7, Devstral Medium,
//         + 5 free models (MiMo, Step 3.5 Flash, Nemotron, Devstral Free, OLMo Think)
//         UPDATED: Previous Claude 4/Opus 4 and M2.1 marked as (Previous)
// v6.3 – EO-076: Removed OpenAI pro models (gpt-5.4-pro, gpt-5.2-pro) — incomplete responses, 
//         not suitable for structured JSON generation. Removed RESPONSES_API_MODELS, 
//         modelUsesResponsesAPI(), generateWithOpenAIResponses(). Chat Completions only.
// v6.2 – EO-069: OpenAI Responses API support for pro models (gpt-5.4-pro, gpt-5.2-pro)
//         - NEW: RESPONSES_API_MODELS set + modelUsesResponsesAPI() detector
//         - NEW: generateWithOpenAIResponses() — /v1/responses endpoint adapter
//         - generateWithOpenAI() auto-routes pro models to Responses API
// v6.1 – EO-068: JSON sanitization + Model refresh March 2026
//         - NEW: sanitizeJSONResponse() — strips markdown fences, BOM, trailing commas before JSON.parse
//         - NEW: MODELS_LAST_UPDATED constant for tracking freshness
//         - UPDATED: Gemini models — gemini-3-pro-preview REMOVED (shut down 2026-03-09),
//           added gemini-3.1-pro-preview, gemini-3.1-flash-lite-preview
//         - UPDATED: OpenAI models — added gpt-5.4 + gpt-5.4-pro (flagship March 2026),
//           removed legacy o3/o3-pro/o3-mini/gpt-5/gpt-5-pro/gpt-5.1
//         - UPDATED: OpenRouter models — added google/gemini-3.1-pro-preview, openai/gpt-5.4
//         - UPDATED: getDefaultModel() — gemini→gemini-3.1-pro-preview, openai→gpt-5.4
//         - UPDATED: RECOMMENDED_LIGHT_MODELS — gemini→gemini-3.1-flash-lite-preview
//         - UPDATED: NO_TEMPERATURE_MODELS — removed legacy o1/o1-pro, kept o3 variants for backward compat
// v6.0 – EO-065: OpenAI robustness fixes
//         - Temperature guard: o1/o3/o1-mini/o3-mini/o3-pro models do NOT support temperature param
//         - Empty response → throw INVALID_JSON (retryable) instead of generic error
//         - OpenRouter empty response → same INVALID_JSON throw
//         - finish_reason: 'length' detection → throw INVALID_JSON for truncated responses
// v5.9 – EO-047: Field web search enforcement
// v5.8 – EO-042: Native Web Search — google_search tool for Gemini, web plugin for OpenRouter
// v5.7 – EO-031: Smart temperature defaults — differentiated per taskType/sectionKey
// v5.6 – FIX: Added INVALID_JSON to RETRYABLE_ERRORS
// v5.5 – NEW: AbortSignal support for generation cancellation
// v5.0 – NEW: Smart AI credit protection system
// v4.0 – NEW: Dual-model support (primary + light model)
// v3.0 – NEW: OpenAI (ChatGPT) provider support
// v2.0 – FIX: Dynamic max_tokens for OpenRouter
// v1.0 – Initial version.
// ═══════════════════════════════════════════════════════════════

import { GoogleGenAI, Type } from "@google/genai";
import { storageService } from './storageService.ts';
import { OPENROUTER_SYSTEM_PROMPT } from './Instructions.ts';

// ═══════════════════════════════════════════════════════════════
// ★ v6.1 EO-068: MODEL LIST FRESHNESS TRACKING
// ═══════════════════════════════════════════════════════════════

export const MODELS_LAST_UPDATED = '2026-03-11';

// ═══════════════════════════════════════════════════════════════
// ★ v5.0: SMART AI CREDIT PROTECTION SYSTEM
// ═══════════════════════════════════════════════════════════════

// ─── Rate Limiter — sliding window per-minute cap ────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 14;
const MIN_COOLDOWN_MS = 1_500;

const requestTimestamps: number[] = [];
let lastRequestTime = 0;

function checkClientRateLimit(): { allowed: boolean; waitMs: number; reason: string } {
  const now = Date.now();

  const sinceLast = now - lastRequestTime;
  if (sinceLast < MIN_COOLDOWN_MS) {
    return { allowed: false, waitMs: MIN_COOLDOWN_MS - sinceLast, reason: 'cooldown' };
  }

  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }

  if (requestTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldestInWindow = requestTimestamps[0];
    const waitMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - now + 500;
    return { allowed: false, waitMs: Math.max(waitMs, 1000), reason: 'window_full' };
  }

  return { allowed: true, waitMs: 0, reason: '' };
}

function recordRequest(): void {
  const now = Date.now();
  requestTimestamps.push(now);
  lastRequestTime = now;
}

// ─── Retry with exponential backoff ──────────────────────────────

const RETRYABLE_ERRORS = new Set(['RATE_LIMIT', 'SERVER_ERROR', 'TIMEOUT', 'MODEL_OVERLOADED', 'INVALID_JSON']);
// ★ EO-093: 6 retries with aggressive exponential backoff (5s→90s cap) for Gemini 503/MODEL_OVERLOADED
const MAX_RETRIES = 6;
const BASE_DELAY_MS = 5_000;

async function withRetry<T>(
  fn: () => Promise<T>,
  context: string = '',
  signal?: AbortSignal
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

    try {
      const rateCheck = checkClientRateLimit();
      if (!rateCheck.allowed) {
        console.log('[aiProvider] Rate limit (' + rateCheck.reason + '): waiting ' + rateCheck.waitMs + 'ms before ' + (context || 'request'));
        await sleep(rateCheck.waitMs);
      }

      if (signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

      recordRequest();
      return await fn();
        } catch (e: any) {
      lastError = e;

      if (e.name === 'AbortError') throw e;

      const errorCode = (e.message || '').split('|')[0];

      if (!RETRYABLE_ERRORS.has(errorCode)) {
        throw e;
      }

      // ★ EO-104: FAST fallback — after 3 consecutive MODEL_OVERLOADED (503), throw immediately
      // Don't waste 245s on 6 retries when model is clearly down
      var _FAST_FAIL_THRESHOLD = 3;
      if (attempt >= _FAST_FAIL_THRESHOLD && (errorCode === 'MODEL_OVERLOADED' || errorCode === 'SERVER_ERROR')) {
        var _fastTotalWait = 0;
        for (var _fwi = 0; _fwi <= attempt; _fwi++) _fastTotalWait += Math.min(BASE_DELAY_MS * Math.pow(2, _fwi), 90000);
        var _fastProvider = (e.message || '').split('|')[1] || 'unknown';
        var _fastModel = '';
        try { _fastModel = getProviderConfig().model; } catch (_) {}
        console.warn('[aiProvider] EO-104: FAST FAIL after ' + (attempt + 1) + ' retries for ' + context + ' (' + errorCode + ') — total wait: ' + Math.round(_fastTotalWait / 1000) + 's');
        throw new ModelOverloadedError(_fastProvider, _fastModel, attempt + 1, _fastTotalWait);
      }

      if (attempt >= MAX_RETRIES) {
        console.warn('[aiProvider] EO-093: All ' + MAX_RETRIES + ' retries exhausted for ' + context + ': ' + errorCode);
        if (errorCode === 'MODEL_OVERLOADED' || errorCode === 'SERVER_ERROR' || errorCode === 'INVALID_JSON') {
          var _totalWait = 0;
          for (var _wi = 0; _wi < MAX_RETRIES; _wi++) _totalWait += Math.min(BASE_DELAY_MS * Math.pow(2, _wi), 90000);
          var _provider = (e.message || '').split('|')[1] || 'unknown';
          var _model = '';
          try { _model = getProviderConfig().model; } catch (_) {}
          throw new ModelOverloadedError(_provider, _model, MAX_RETRIES, _totalWait);
        }
        throw e;
      }

      // ★ EO-093: Exponential backoff capped at 90s
      const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), 90_000);
      console.log('[aiProvider] EO-093 Retry ' + (attempt + 1) + '/' + MAX_RETRIES + ' for ' + context + ' (' + errorCode + ') — waiting ' + delay + 'ms');
      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Global concurrency queue ────────────────────────────────────

const MAX_CONCURRENT = 2;
let activeRequests = 0;
const pendingQueue: Array<{ resolve: () => void }> = [];

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return;
  }
  return new Promise<void>((resolve) => {
    pendingQueue.push({ resolve });
  });
}

function releaseSlot(): void {
  activeRequests--;
  if (pendingQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    const next = pendingQueue.shift()!;
    next.resolve();
  }
}

// ─── Usage event emitter ─────────────────────────────────────────

export interface AIUsageEvent {
  timestamp: number;
  provider: string;
  model: string;
  taskType: string;
  sectionKey: string;
  success: boolean;
  durationMs: number;
  errorCode?: string;
}

type AIUsageListener = (event: AIUsageEvent) => void;
const usageListeners: AIUsageListener[] = [];

export function onAIUsage(listener: AIUsageListener): () => void {
  usageListeners.push(listener);
  return () => {
    const idx = usageListeners.indexOf(listener);
    if (idx >= 0) usageListeners.splice(idx, 1);
  };
}

function emitUsageEvent(event: AIUsageEvent): void {
  for (const listener of usageListeners) {
    try {
      listener(event);
    } catch (e) {
      console.warn('[aiProvider] Usage listener error:', e);
    }
  }
}

// ─── Public: get current rate limit status ───────────────────────

export function getRateLimitStatus(): {
  requestsInWindow: number;
  maxRequests: number;
  windowMs: number;
  cooldownMs: number;
  cooldownRemaining: number;
  activeRequests: number;
  queuedRequests: number;
} {
  const now = Date.now();
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
    requestTimestamps.shift();
  }
  return {
    requestsInWindow: requestTimestamps.length,
    maxRequests: RATE_LIMIT_MAX_REQUESTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
    cooldownMs: MIN_COOLDOWN_MS,
    cooldownRemaining: Math.max(0, MIN_COOLDOWN_MS - (now - lastRequestTime)),
    activeRequests,
    queuedRequests: pendingQueue.length,
  };
}

// ─── TYPES ───────────────────────────────────────────────────────

export type AIProviderType = 'gemini' | 'openrouter' | 'openai';

export type AITaskType = 'generation' | 'translation' | 'chatbot' | 'field' | 'allocation' | 'summary';

export interface AIProviderConfig {
  provider: AIProviderType;
  apiKey: string;
  model: string;
}

export interface AIGenerateOptions {
  prompt: string;
  jsonSchema?: any;
  jsonMode?: boolean;
  temperature?: number;
  sectionKey?: string;
  taskType?: AITaskType;
  signal?: AbortSignal;
  forceGoogleSearch?: boolean;  // EO-148: force google_search grounding regardless of sectionKey/user setting
}

export interface AIGenerateResult {
  text: string;
  // EO-138: Token usage from provider — optional, only present when provider returns metadata
  _usage?: {
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

// ─── ★ v4.0 + v6.1: RECOMMENDED LIGHT MODELS PER PROVIDER ──────
// ★ EO-099: Fallback models when primary model is overloaded (503/MODEL_OVERLOADED)
// These are stable, fast models on separate infrastructure that rarely return 503
export const FALLBACK_MODELS: Record<string, { id: string; name: string }> = {
  // Gemini direct
  'gemini-2.5-pro':                'gemini-2.5-flash',
  'gemini-3.1-pro-preview':       'gemini-2.5-flash',
  'gemini-3-flash-preview':       'gemini-2.5-flash-lite',
  // OpenAI direct
  'gpt-5.4':                      'gpt-4.1-mini',
  'gpt-5.2':                      'gpt-4.1-mini',
  'gpt-5-mini':                   'gpt-4.1-nano',
  // OpenRouter models
  'openai/gpt-5.4':               'openai/gpt-4.1-mini',
  'openai/gpt-5.2':               'openai/gpt-4.1-mini',
  'google/gemini-3.1-pro-preview': 'google/gemini-2.5-flash',
  'google/gemini-2.5-pro':        'google/gemini-2.5-flash',
  'anthropic/claude-opus-4.6':    'anthropic/claude-sonnet-4.6',
  'anthropic/claude-sonnet-4.6':  'anthropic/claude-haiku-4.5',
  'deepseek/deepseek-v3.2':       'deepseek/deepseek-r1',
  'minimax/minimax-m2.5':         'minimax/minimax-m2.5-lightning',
  'qwen/qwen3.5-max':             'qwen/qwen3.5-plus-02-15',
  'x-ai/grok-4.1-fast':           'x-ai/grok-4.1-fast', // already fast, no fallback
};

export function getFallbackModel(currentModel: string): { id: string; name: string } | null {
  var fallbackId = (FALLBACK_MODELS as any)[currentModel];
  if (!fallbackId || fallbackId === currentModel) return null;
  // Find display name from model lists
  var allModels = [...GEMINI_MODELS, ...OPENAI_MODELS, ...OPENROUTER_MODELS];
  var found = allModels.find(function(m) { return m.id === fallbackId; });
  return found ? { id: found.id, name: found.name } : { id: fallbackId, name: fallbackId };
}

// ★ EO-099: Structured error for fallback signal (not a crash — caller handles gracefully)
export class ModelOverloadedError extends Error {
  public provider: string;
  public model: string;
  public fallbackModel: { id: string; name: string } | null;
  public retriesExhausted: number;
  public totalWaitMs: number;

  constructor(provider: string, model: string, retriesExhausted: number, totalWaitMs: number) {
    super('MODEL_OVERLOADED_FALLBACK|' + provider + '|All ' + retriesExhausted + ' retries exhausted for ' + model);
    this.name = 'ModelOverloadedError';
    this.provider = provider;
    this.model = model;
    this.fallbackModel = getFallbackModel(model);
    this.retriesExhausted = retriesExhausted;
    this.totalWaitMs = totalWaitMs;
  }
}

export const RECOMMENDED_LIGHT_MODELS: Record<AIProviderType, { id: string; name: string }> = {
  gemini:     { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite (Preview)' },
  openai:     { id: 'gpt-4.1-nano',                  name: 'GPT-4.1 Nano ($0.10/1M)' },
  openrouter: { id: 'deepseek/deepseek-v3.2',        name: 'DeepSeek V3.2 (~$0.14/1M)' },
};

const LIGHT_MODEL_TASKS: Set<AITaskType> = new Set([
  'translation', 'chatbot', 'field', 'allocation', 'summary'
]);

// ─── DYNAMIC MAX_TOKENS PER SECTION ──────────────────────────────

const SECTION_MAX_TOKENS: Record<string, number> = {
  activities:          16384,
  expectedResults:     8192,
  projectManagement:   8192,
  risks:               16384,  // ★ EO-098b: raised from 6144 — 8+ risks with 25 _references truncate
  objectives:          6144,
  problemAnalysis:     10000,   // EO-082: raised from 6144 — MiniMax M2.5 still truncating
  projectIdea:         10000,   // EO-082: raised from 6144 — references + inline citations
  stateOfTheArt:       8192,    // EO-082: raised from 6144 — heavy references section
  proposedSolution:    8192,    // EO-082: raised from 6144 — references section
  outputs:             8192,    // ★ EO-121: raised from 4096 — 5-8 outputs × 5 sentences + indicators truncate at 4K
  outcomes:            8192,    // ★ EO-121: raised from 4096 — 4-6 outcomes × 5 sentences + indicators truncate at 4K
  impacts:             8192,    // ★ EO-121: raised from 4096 — 3-5 impacts × 5 sentences + KIP labels + indicators truncate at 4K
  kers:                8192,    // ★ EO-121: raised from 4096 — 4-6 KERs × 5 sentences + exploitationStrategy truncate at 4K
  sustainability:      4096,    // EO-081: NEW
  dissemination:       4096,    // EO-081: NEW
  targetGroups:        4096,    // EO-081: NEW
  field:               2048,
  summary:             4096,
  translation:         8192,
  partnerAllocations:  16384,  // ★ EO-096: raised from 8192 — large consortiums with 5+ partners × 6+ WPs truncate at 8K
  partnerAllocations_wp: 16384, // ★ EO-127: raised from 8192 — WP6 with 5 tasks × 8 partners truncates at 8K; 16384 gives safe margin
  chartExtraction:     1024,
};

const DEFAULT_MAX_TOKENS = 4096;

function getMaxTokensForSection(sectionKey?: string): number {
  if (!sectionKey) return DEFAULT_MAX_TOKENS;
  return SECTION_MAX_TOKENS[sectionKey] || DEFAULT_MAX_TOKENS;
}

// ─── ★ v5.7 EO-031: SMART TEMPERATURE DEFAULTS ─────────────────

function getDefaultTemperature(taskType?: AITaskType, sectionKey?: string): number {
  if (sectionKey === 'chartExtraction') return 0.0;
  if (taskType === 'allocation') return 0.1;
  if (taskType === 'translation') return 0.2;
  if (taskType === 'chatbot') return 0.3;
  if (taskType === 'summary') return 0.3;

  if (taskType === 'field') {
    if (sectionKey && (sectionKey.indexOf('likelihood') >= 0 || sectionKey.indexOf('impact') >= 0)) return 0.0;
    return 0.4;
  }

  if (sectionKey === 'projectTitleAcronym') return 0.7;
  if (taskType === 'generation') return 0.5;

  return 0.4;
}

// ═══════════════════════════════════════════════════════════════
// ★ v6.1 EO-068: UPDATED MODEL LISTS — March 10, 2026
// ═══════════════════════════════════════════════════════════════

// ─── GEMINI MODELS ───────────────────────────────────────────────
// NOTE: gemini-3-pro-preview SHUT DOWN on 2026-03-09 — REMOVED
// NOTE: gemini-3.1-pro-preview is the new flagship preview
// NOTE: gemini-3.1-flash-lite-preview released 2026-03-03

export const GEMINI_MODELS = [
  { id: 'gemini-3.1-pro-preview',        name: 'Gemini 3.1 Pro (Preview) ★ Primary', description: 'Frontier reasoning — replaces 3.0 Pro (shut down Mar 9)' },
  { id: 'gemini-3-flash-preview',         name: 'Gemini 3 Flash (Preview)',            description: 'Next-gen speed — agentic workflows, balanced quality' },
  { id: 'gemini-3.1-flash-lite-preview',  name: 'Gemini 3.1 Flash-Lite (Preview) ★ Light', description: 'Fastest & cheapest Gemini 3 — 2.5x faster than 2.5 Flash-Lite' },
  { id: 'gemini-2.5-pro',                 name: 'Gemini 2.5 Pro (Stable)',            description: 'Deep reasoning, coding — 1M context, stable production' },
  { id: 'gemini-2.5-flash',               name: 'Gemini 2.5 Flash (Stable)',           description: 'Best price-performance — fast, high volume, thinking' },
  { id: 'gemini-2.5-flash-lite',          name: 'Gemini 2.5 Flash-Lite (Stable)',      description: 'Cheapest stable — ideal for chatbot, translations' },
];

// ─── OPENAI MODELS ───────────────────────────────────────────────
// NOTE: gpt-5.4 released 2026-03-05 — new flagship
// NOTE: o3/o3-pro/o3-mini/o1/o1-pro/o4-mini are LEGACY — removed
// NOTE: gpt-5/gpt-5-pro/gpt-5.1 superseded — removed

export const OPENAI_MODELS = [
  { id: 'gpt-5.4',       name: 'GPT-5.4 ★ Primary',       description: 'Flagship — best reasoning, coding, 1M context (Mar 2026)' },
  { id: 'gpt-5.2',       name: 'GPT-5.2',                  description: 'Previous flagship — still in API, superseded by 5.4' },
  { id: 'gpt-5-mini',    name: 'GPT-5 Mini',               description: 'Fast, cost-efficient reasoning ($0.25/1M in)' },
  { id: 'gpt-5-nano',    name: 'GPT-5 Nano',               description: 'Cheapest reasoning — summaries, classification ($0.05/1M in)' },
  { id: 'gpt-4.1',       name: 'GPT-4.1',                  description: 'Smartest non-reasoning — 1M context, versatile' },
  { id: 'gpt-4.1-mini',  name: 'GPT-4.1 Mini',             description: 'Balanced power/price — great starting point ($0.40/1M in)' },
  { id: 'gpt-4.1-nano',  name: 'GPT-4.1 Nano ★ Light',    description: 'Cheapest — chatbot, translations, field fills ($0.10/1M in)' },
];

// ─── OPENROUTER POPULAR MODELS ───────────────────────────────────
// NOTE: Updated to include gpt-5.4 and gemini-3.1-pro-preview
// NOTE: Removed superseded openai/gpt-5.2 ★ label

export const OPENROUTER_MODELS = [
  // ══════ OpenAI ══════
  { id: 'openai/gpt-5.4',                       name: 'OpenAI GPT-5.4 ★',              description: 'Latest OpenAI flagship (Mar 2026) — 1M context, computer use ($2.50/$15)' },
  { id: 'openai/gpt-5.2',                       name: 'OpenAI GPT-5.2',                description: 'Previous flagship — still available' },
  { id: 'openai/gpt-5-mini',                    name: 'OpenAI GPT-5 Mini',             description: 'Fast, cost-efficient reasoning ($0.25/1M in)' },
  { id: 'openai/gpt-4.1',                       name: 'OpenAI GPT-4.1',                description: 'Smartest non-reasoning model — 1M context' },
  { id: 'openai/gpt-4.1-nano',                  name: 'OpenAI GPT-4.1 Nano',           description: 'Ultra cheap OpenAI ($0.10/1M in)' },

  // ══════ Google ══════
  { id: 'google/gemini-3.1-pro-preview',         name: 'Gemini 3.1 Pro (via OR) ★',    description: 'Google frontier reasoning — 1M context ($2/$12)' },
  { id: 'google/gemini-3-flash-preview',         name: 'Gemini 3 Flash (via OR)',       description: 'High-speed thinking — agentic, Ranking #5 ($0.50/$3)' },
  { id: 'google/gemini-3.1-flash-lite-preview',  name: 'Gemini 3.1 Flash Lite (via OR)', description: 'Budget king — 2.5x faster, 1M context ($0.25/$1.50)' },
  { id: 'google/gemini-2.5-pro',                 name: 'Gemini 2.5 Pro (via OR)',       description: 'Google stable flagship via OpenRouter' },
  { id: 'google/gemini-2.5-flash',               name: 'Gemini 2.5 Flash (via OR)',     description: 'Google fast stable model via OpenRouter' },

  // ══════ Anthropic ══════
  { id: 'anthropic/claude-opus-4.6',             name: 'Claude Opus 4.6 ★',            description: 'Anthropic strongest — 1M context, agentic ($5/$25)' },
  { id: 'anthropic/claude-sonnet-4.6',           name: 'Claude Sonnet 4.6',            description: 'Anthropic balanced — Ranking #4 programming ($3/$15)' },
  { id: 'anthropic/claude-haiku-4.5',            name: 'Claude Haiku 4.5',             description: 'Anthropic fast — near Sonnet 4 quality, 200K ($1/$5)' },
  { id: 'anthropic/claude-sonnet-4',             name: 'Claude Sonnet 4 (Previous)',    description: 'Previous balanced — superseded by 4.6' },
  { id: 'anthropic/claude-opus-4',               name: 'Claude Opus 4 (Previous)',      description: 'Previous strongest — superseded by 4.6' },

  // ══════ xAI ══════
  { id: 'x-ai/grok-4.1-fast',                   name: 'Grok 4.1 Fast (xAI)',          description: '2M context (!), ultra-fast frontier ($0.20/$0.50)' },

  // ══════ DeepSeek ══════
  { id: 'deepseek/deepseek-v3.2',               name: 'DeepSeek V3.2 ★',              description: '#3 Programming — MoE 671B, top quality ($0.25/$0.38)' },
  { id: 'deepseek/deepseek-r1',                 name: 'DeepSeek R1',                   description: 'Reasoning model — rivals OpenAI o-series' },
  { id: 'deepseek/deepseek-r1-0528',            name: 'DeepSeek R1 0528',              description: 'Latest R1 — enhanced reasoning' },

  // ══════ MiniMax ══════
  { id: 'minimax/minimax-m2.5',                 name: 'MiniMax M2.5 ★ #1 OpenRouter',  description: '#1 by usage! 80.2% SWE-bench, open-weight ($0.27/$0.95)' },
  { id: 'minimax/minimax-m2.5-lightning',        name: 'MiniMax M2.5 Lightning',        description: '2x faster M2.5 — 100 TPS, real-time ($0.30/$2.40)' },
  { id: 'minimax/minimax-m2.1',                 name: 'MiniMax M2.1 (Previous)',       description: 'Previous flagship — superseded by M2.5' },

  // ══════ Moonshot / Kimi ══════
  { id: 'moonshotai/kimi-k2.5',                 name: 'Kimi K2.5 (Moonshot)',          description: '#1 open-source — 100 sub-agents, 1,500 tools ($0.50/$2)' },
  { id: 'moonshotai/kimi-k2',                   name: 'Kimi K2 (Moonshot)',            description: '1T param MoE — coding & agentic tasks' },

  // ══════ Alibaba / Qwen ══════
  { id: 'qwen/qwen3.5-max',                     name: 'Qwen3.5 Max (Alibaba) ★',      description: 'Alibaba flagship — Top 5 global ranking ($0.50/$2)' },
  { id: 'qwen/qwen3.5-plus-02-15',              name: 'Qwen3.5 Plus (Alibaba)',        description: '1M context, vision, ultra-low cost ($0.40/$2)' },
  { id: 'qwen/qwen3-235b-a22b',                 name: 'Qwen3 235B (Alibaba)',          description: 'MoE 235B — top reasoning & coding' },
  { id: 'qwen/qwen3-max',                       name: 'Qwen3 Max (Alibaba)',           description: 'Previous Alibaba flagship' },
  { id: 'qwen/qwen3-coder',                     name: 'Qwen3 Coder (Alibaba)',         description: 'Coding specialist — 480B MoE' },
  { id: 'qwen/qwen3-coder-next',                name: 'Qwen3 Coder Next (Alibaba)',    description: 'Budget coding specialist ($0.12/$0.75)' },

  // ══════ ByteDance ══════
  { id: 'bytedance-seed/seed-1.6',              name: 'ByteDance Seed 1.6',            description: 'Multimodal, adaptive deep thinking, 256K ($0.25/$2)' },
  { id: 'bytedance-seed/seed-1.6-flash',        name: 'ByteDance Seed 1.6 Flash',      description: 'Ultra-fast multimodal ($0.07/$0.30)' },

  // ══════ KwaiPilot ══════
  { id: 'kwaipilot/kat-coder-pro',              name: 'KwaiPilot Kat Coder Pro',       description: '73.4% SWE-bench, budget agentic coding ($0.21/$0.83)' },

  // ══════ Z.AI / Zhipu ══════
  { id: 'z-ai/glm-5',                           name: 'GLM-5 (Zhipu)',                description: 'Zhipu frontier — upgraded reasoning ($0.80/$3)' },
  { id: 'z-ai/glm-4.7',                         name: 'GLM 4.7 (Zhipu)',              description: 'Strong coding, 200K context ($0.38/$1.70)' },

  // ══════ Meta ══════
  { id: 'meta-llama/llama-4-maverick',           name: 'Llama 4 Maverick',             description: 'Meta MoE 128 experts — top Llama' },
  { id: 'meta-llama/llama-4-scout',              name: 'Llama 4 Scout',                description: 'Meta MoE 16 experts — fast & efficient' },

  // ══════ Mistral ══════
  { id: 'mistralai/mistral-large-2512',          name: 'Mistral Large 3',              description: 'Mistral flagship — MoE 675B, 262K context' },
  { id: 'mistralai/devstral-medium',             name: 'Devstral Medium (Mistral)',     description: 'High-perf code gen — Mistral + All Hands AI ($0.40/$2)' },
  { id: 'mistralai/devstral-2512',               name: 'Devstral 2 (Mistral)',         description: 'Agentic coding — 123B MoE, 256K' },
  { id: 'mistralai/mistral-small-2503',          name: 'Mistral Small',                description: 'Lightweight — fast responses' },

  // ══════ FREE MODELS ══════
  { id: 'xiaomi/mimo-v2-flash:free',             name: '🆓 MiMo-V2-Flash (Xiaomi)',    description: 'FREE — #1 open-source SWE-bench, 309B MoE, 256K' },
  { id: 'stepfun/step-3.5-flash:free',           name: '🆓 Step 3.5 Flash (StepFun)',  description: 'FREE — Ranking #2 programming! 256K context' },
  { id: 'nvidia/nemotron-3-nano-30b-a3b:free',   name: '🆓 Nemotron 3 Nano (NVIDIA)',  description: 'FREE — 30B MoE, open weights, 256K' },
  { id: 'mistralai/devstral-2512:free',          name: '🆓 Devstral 2 Free (Mistral)', description: 'FREE — 123B agentic coder, MIT license' },
  { id: 'allenai/olmo-3-32b-think',              name: '🆓 OLMo 3.1 Think (AllenAI)', description: 'FREE — open reasoning, Apache 2.0, 65K' },
];


// ─── PROVIDER DETECTION ──────────────────────────────────────────

export function getProviderConfig(): AIProviderConfig {
  const provider = storageService.getAIProvider() || 'gemini';
  const model = storageService.getCustomModel() || getDefaultModel(provider);

  let apiKey = '';
  if (provider === 'gemini') {
    apiKey = storageService.getApiKey() || '';
    if (!apiKey && typeof process !== 'undefined' && process.env?.API_KEY) {
      apiKey = process.env.API_KEY;
    }
  } else if (provider === 'openrouter') {
    apiKey = storageService.getOpenRouterKey() || '';
  } else if (provider === 'openai') {
    apiKey = storageService.getOpenAIKey() || '';
  }

  return { provider, apiKey, model };
}

export function getProviderConfigForTask(taskType?: AITaskType): AIProviderConfig {
  const baseConfig = getProviderConfig();

  if (!taskType || !LIGHT_MODEL_TASKS.has(taskType)) {
    return baseConfig;
  }

  const secondaryModel = storageService.getSecondaryModel();
  if (secondaryModel && secondaryModel.trim() !== '') {
    return { ...baseConfig, model: secondaryModel };
  }

  return baseConfig;
}

// ★ v6.1 EO-068: Updated default models
export function getDefaultModel(provider: AIProviderType): string {
  if (provider === 'openrouter') return 'deepseek/deepseek-v3.2';
  if (provider === 'openai') return 'gpt-5.4';
  return 'gemini-3.1-pro-preview';
}

export function getModelsForProvider(provider: AIProviderType): { id: string; name: string; description: string }[] {
  if (provider === 'gemini') return GEMINI_MODELS;
  if (provider === 'openai') return OPENAI_MODELS;
  if (provider === 'openrouter') return OPENROUTER_MODELS;
  return [];
}

// ─── VALIDATION ──────────────────────────────────────────────────

export async function validateProviderKey(provider: AIProviderType, apiKey: string): Promise<boolean> {
  if (!apiKey || apiKey.trim().length < 10) return false;

  try {
    if (provider === 'gemini') {
      if (!apiKey.startsWith('AIza') || apiKey.length < 35) return false;
      const client = new GoogleGenAI({ apiKey });
      await client.models.countTokens({
        model: 'gemini-2.5-flash',
        contents: [{ parts: [{ text: "test" }] }]
      });
      return true;
    }

    if (provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': 'Bearer ' + apiKey }
      });
      return response.ok;
    }

    if (provider === 'openai') {
      if (!apiKey.startsWith('sk-') || apiKey.length < 20) return false;
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': 'Bearer ' + apiKey }
      });
      return response.ok;
    }

    return false;
  } catch (error) {
    console.error(provider + ' API Key Validation Failed:', error);
    return false;
  }
}

export function hasValidProviderKey(): boolean {
  const config = getProviderConfig();
  if (config.provider === 'gemini') {
    return config.apiKey.startsWith('AIza') && config.apiKey.length >= 35;
  }
  if (config.provider === 'openrouter') {
    return config.apiKey.length > 10;
  }
  if (config.provider === 'openai') {
    return config.apiKey.startsWith('sk-') && config.apiKey.length >= 20;
  }
  return false;
}

// ─── GENERATION ──────────────────────────────────────────────────

export async function generateContent(options: AIGenerateOptions): Promise<AIGenerateResult> {
  if (options.signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  if (options.temperature === undefined) {
    options.temperature = getDefaultTemperature(options.taskType, options.sectionKey);
  }

  const config = options.taskType
    ? getProviderConfigForTask(options.taskType)
    : getProviderConfig();

  if (!config.apiKey) {
    throw new Error('MISSING_API_KEY');
  }

  const context = (options.taskType || 'default') + ':' + (options.sectionKey || 'unknown');
  console.log('[aiProvider] ' + context + ' → model: ' + config.model);

  await acquireSlot();
  const startTime = Date.now();

  try {
    const result = await withRetry(async () => {
      if (options.signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

      if (config.provider === 'gemini') {
        return generateWithGemini(config, options);
      }
      if (config.provider === 'openrouter') {
        return generateWithOpenRouter(config, options);
      }
      if (config.provider === 'openai') {
        return generateWithOpenAI(config, options);
      }
      throw new Error('Unknown AI provider: ' + config.provider);
    }, context, options.signal);

    emitUsageEvent({
      timestamp: Date.now(),
      provider: config.provider,
      model: config.model,
      taskType: options.taskType || 'default',
      sectionKey: options.sectionKey || 'unknown',
      success: true,
      durationMs: Date.now() - startTime,
    });

    return result;
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;

    const errorCode = (e.message || '').split('|')[0];
    emitUsageEvent({
      timestamp: Date.now(),
      provider: config.provider,
      model: config.model,
      taskType: options.taskType || 'default',
      sectionKey: options.sectionKey || 'unknown',
      success: false,
      durationMs: Date.now() - startTime,
      errorCode,
    });
    throw e;
  } finally {
    releaseSlot();
  }
}

// ─── ★ v5.8 EO-042: Web Search — eligibility + enforcement prompt ──

const WEB_SEARCH_EXCLUDED_SECTIONS = new Set([
  'partnerAllocations', 'partnerAllocations_wp', // EO-120: allocations are budget calculations — no web search needed; also prevents 400 (google_search + responseSchema conflict)
  'allocation', 'summary', 'translation', 'chartExtraction',
]);

function isWebSearchEligible(sectionKey?: string): boolean {
  if (!sectionKey) return false;
  return !WEB_SEARCH_EXCLUDED_SECTIONS.has(sectionKey);
}

var WEB_SEARCH_ENFORCEMENT_PROMPT = 'MANDATORY WEB SEARCH INSTRUCTIONS:\n'
  + 'You have access to a web search tool. You MUST use it for EVERY factual claim, statistic, date, policy reference, or data point.\n'
  + 'DO NOT rely on your training data for any factual information — your training data may be outdated.\n'
  + 'ALWAYS search the web FIRST, then use the search results as your PRIMARY source.\n'
  + 'If the web search returns relevant results, you MUST cite them.\n'
  + 'If the web search returns no results for a specific claim, clearly state the data could not be verified.\n'
  + 'NEVER fabricate sources, URLs, authors, or statistics.\n'
  + 'Every paragraph in analytical sections MUST contain at least one web-sourced data point or citation.\n'
  + 'Even for SHORT text fields (single descriptions, aims, summaries), you MUST search the web to verify and enrich the content with current data.\n'
  + '\nINLINE CITATION FORMAT (MANDATORY):\n'
  + 'When citing a reference in text, use numbered markers like [1], [2], [3] etc.\n'
  + 'Each number MUST correspond to an entry in your _references array (by array index + 1).\n'
  + 'Example: "According to OECD data, Slovenia spends 4.8% of GDP on education [1], which is below the EU average of 5.0% [2]."\n'
  + 'Every _references entry MUST be cited at least once in the text with its [N] marker.\n'
  + 'Do NOT include references that are not cited in the text.\n';

// ─── GEMINI ADAPTER ──────────────────────────────────────────────

async function generateWithGemini(config: AIProviderConfig, options: AIGenerateOptions): Promise<AIGenerateResult> {
  if (options.signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  const client = new GoogleGenAI({ apiKey: config.apiKey });

  const generateConfig: any = {};
if (options.jsonSchema) {
  generateConfig.responseMimeType = "application/json";
  generateConfig.responseSchema = options.jsonSchema;
}
if (options.temperature !== undefined) {
  generateConfig.temperature = options.temperature;
}
// EO-081: Explicit maxOutputTokens for Gemini — matches OpenRouter/OpenAI dynamic limits
generateConfig.maxOutputTokens = getMaxTokensForSection(options.sectionKey);

  var geminiPrompt = options.prompt;
  // EO-148: forceGoogleSearch bypasses storageService/sectionKey eligibility for repair calls
  const googleSearchRequested = options.forceGoogleSearch || (storageService.getWebSearchEnabled() && isWebSearchEligible(options.sectionKey));
  if (googleSearchRequested) {
    // EO-135: Universal guard — google_search is incompatible with responseMimeType:'application/json' or responseSchema.
    // Gemini returns HTTP 400 if both are set. Auto-disable google_search when JSON mode is active.
    if (generateConfig.responseMimeType === 'application/json' || generateConfig.responseSchema) {
      console.warn('[EO-135] Disabled google_search for "' + (options.sectionKey || 'unknown') + '" — incompatible with JSON mode (responseMimeType + responseSchema cannot coexist with google_search tool)');
    } else {
      generateConfig.tools = [{ googleSearch: {} }];
      geminiPrompt = WEB_SEARCH_ENFORCEMENT_PROMPT + '\n\n' + options.prompt;
      if (options.forceGoogleSearch) {
        console.log('[EO-148] aiProvider: google_search grounding FORCED for reference repair');
      } else {
        console.log('[aiProvider] v5.8 Gemini google_search ENABLED for section: ' + (options.sectionKey || 'unknown'));
      }
    }
  }

  try {
    const response = await client.models.generateContent({
      model: config.model,
      contents: geminiPrompt,
      config: Object.keys(generateConfig).length > 0 ? generateConfig : undefined,
    });

    if (generateConfig.tools && response.candidates && response.candidates[0]) {
      var candidate = response.candidates[0];
      var grounding = candidate.groundingMetadata;
      if (grounding && grounding.groundingChunks && grounding.groundingChunks.length > 0) {
        console.log('[aiProvider] v5.8 Gemini GROUNDING CONFIRMED — ' + grounding.groundingChunks.length + ' web sources used:');
        // ★ v6.6 EO-080: Tag grounding URLs with [VERIFIED_URL] for downstream reference processing
        var verifiedUrlTags: string[] = [];
        grounding.groundingChunks.forEach(function(chunk: any, i: number) {
          if (chunk.web) {
            console.log('  [' + i + '] ' + (chunk.web.title || 'untitled') + ' — ' + (chunk.web.uri || 'no URL'));
            if (chunk.web.uri) {
              verifiedUrlTags.push('[VERIFIED_URL: ' + chunk.web.uri + ']');
            }
          }
        });
        if (verifiedUrlTags.length > 0) {
          console.log('[aiProvider] v6.6 EO-080 Tagged ' + verifiedUrlTags.length + ' verified URLs from Gemini grounding');
        // ★ v6.7 EO-083: [VERIFIED_URL] tags are kept for AI prompt context; actual URL verification is done server-side by Edge Function
        // ★ EO-084: [VERIFIED_URL] tags complement the approved source pool — pool sources take priority, web search URLs are secondary
        }
      } else {
        console.warn('[aiProvider] v5.8 Gemini google_search was ENABLED but NO grounding metadata returned');
      }
    }

    // [EO-138] Extract token usage from Gemini usageMetadata
    const _geminiUsage = (response as any).usageMetadata;
    const _geminiIn: number = _geminiUsage?.promptTokenCount ?? 0;
    const _geminiOut: number = _geminiUsage?.candidatesTokenCount ?? 0;
    const _geminiTotal: number = _geminiUsage?.totalTokenCount ?? (_geminiIn + _geminiOut);
    console.log('[EO-138] API usage: gemini', config.model, 'in:', _geminiIn, 'out:', _geminiOut);
    return {
      text: response.text.trim(),
      _usage: { provider: 'gemini', model: config.model, inputTokens: _geminiIn, outputTokens: _geminiOut, totalTokens: _geminiTotal },
    };
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    handleProviderError(e, 'gemini');
    throw e;
  }
}

// ─── OPENROUTER ADAPTER ─────────────────────────────────────────

async function generateWithOpenRouter(config: AIProviderConfig, options: AIGenerateOptions): Promise<AIGenerateResult> {
  if (options.signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  const messages: any[] = [
    { role: 'user', content: options.prompt }
  ];

  if (options.jsonSchema || options.jsonMode) {
    messages.unshift({ role: 'system', content: OPENROUTER_SYSTEM_PROMPT });
  }

  const maxTokens = getMaxTokensForSection(options.sectionKey);

  const body: any = {
    model: config.model,
    messages: messages,
    max_tokens: maxTokens,
  };

  if (options.jsonSchema || options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  // ★ v6.0 EO-065: Temperature guard for reasoning models (also via OpenRouter)
  var orModelId = config.model.replace(/^openai\//, '');
  if (options.temperature !== undefined && modelSupportsTemperature(orModelId)) {
    body.temperature = options.temperature;
  }

    // ★ v5.8 EO-042 + v6.5 EO-078: Web Search plugin (fixed for agentic models)
  if (storageService.getWebSearchEnabled() && isWebSearchEligible(options.sectionKey)) {
    // EO-078: Use response-healing plugin alongside web search for JSON safety
    body.plugins = [{ id: 'web', max_results: 5 }];
    if (options.jsonSchema || options.jsonMode) {
      body.plugins.push({ id: 'response-healing' });
    }
    // EO-078: Do NOT use WEB_SEARCH_ENFORCEMENT_PROMPT for OpenRouter!
    // Exa plugin already injects search results as system message BEFORE model call.
    // Old prompt said "You have access to a web search tool" — agentic models
    // (MiniMax M2.5, DeepSeek) interpreted this literally and generated tool_call
    // XML (<minimax:tool_call>) instead of JSON content.
    // New prompt tells model the search is ALREADY DONE — just use the results.
    if (body.messages && body.messages.length > 0) {
      var lastMsg = body.messages[body.messages.length - 1];
      if (lastMsg.role === 'user') {
        lastMsg.content = 'IMPORTANT: Real-time web search results have been provided to you as context above by the system. '
      + 'Use these search results as your PRIMARY source for all factual claims, statistics, dates, policy references, and data points. '
      + 'Do NOT attempt to call any search tools or generate tool calls — the web search has already been performed for you. '
      + 'If the provided search results are relevant, you MUST cite them. '
      + 'If the provided results are insufficient for a specific claim, clearly state the data could not be verified. '
      + 'NEVER fabricate sources, URLs, authors, or statistics.\n'
      + 'INLINE CITATIONS: Use [1], [2], [3] markers in text corresponding to _references array index+1. '
      + 'Every reference MUST be cited at least once in text. Do NOT include uncited references.\n\n'
      + lastMsg.content;
      }
    }
    console.log('[aiProvider] v6.7 EO-081 OpenRouter web plugin + response-healing ENABLED for section: ' + (options.sectionKey || 'unknown'));
    // ★ v6.6 EO-080: Tag Exa web plugin search result URLs with [VERIFIED_URL]
    // Note: Exa injects results as system message BEFORE the user prompt.
    // We add a hint to the user prompt so the AI knows to look for [VERIFIED_URL] tags.
    if (body.messages && body.messages.length > 0) {
      var lastMsgForTag = body.messages[body.messages.length - 1];
      if (lastMsgForTag.role === 'user' && typeof lastMsgForTag.content === 'string') {
        lastMsgForTag.content += '\n\nNOTE: Any URLs provided in the web search context above are verified ([VERIFIED_URL]). Use them in _references when relevant. NEVER invent URLs.';
      }
    }
    console.log('[aiProvider] v6.6 EO-080 OpenRouter [VERIFIED_URL] hint appended to prompt');
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'EU Intervention Logic AI Assistant'
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || ('HTTP ' + response.status);

      if (response.status === 401 || response.status === 403) throw new Error('MISSING_API_KEY');
      if (response.status === 429) throw new Error('RATE_LIMIT|openrouter|Rate limit reached for model ' + config.model + '. ' + errorMsg);
      if (response.status === 402) throw new Error('INSUFFICIENT_CREDITS|openrouter|Requested ' + maxTokens + ' tokens for "' + (options.sectionKey || 'unknown') + '". ' + errorMsg);
      if (response.status === 503) throw new Error('MODEL_OVERLOADED|openrouter|Model ' + config.model + ' is temporarily unavailable. ' + errorMsg);
      if (response.status === 500 || response.status === 502) throw new Error('SERVER_ERROR|openrouter|' + errorMsg);
      if (response.status === 408) throw new Error('TIMEOUT|openrouter|Request timed out. ' + errorMsg);
      throw new Error('UNKNOWN_ERROR|openrouter|HTTP ' + response.status + ': ' + errorMsg);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const finishReason = data.choices?.[0]?.finish_reason || '';

    if (finishReason === 'length') {
      console.warn('[aiProvider] v6.0 OpenRouter response TRUNCATED (finish_reason=length) for model ' + config.model);
      throw new Error('INVALID_JSON|openrouter|Response truncated (finish_reason=length). Model ' + config.model + ' ran out of max_tokens=' + maxTokens + '.');
    }

    if (!text) {
      console.warn('[aiProvider] v6.0 OpenRouter returned EMPTY response for model ' + config.model + ', finish_reason=' + finishReason);
      throw new Error('INVALID_JSON|openrouter|Empty response from model ' + config.model + ' (finish_reason=' + finishReason + ').');
    }

    // [EO-138] Extract token usage from OpenRouter response
    const _orIn: number = data.usage?.prompt_tokens ?? 0;
    const _orOut: number = data.usage?.completion_tokens ?? 0;
    const _orTotal: number = data.usage?.total_tokens ?? (_orIn + _orOut);
    console.log('[EO-138] API usage: openrouter', config.model, 'in:', _orIn, 'out:', _orOut);
    return {
      text,
      _usage: { provider: 'openrouter', model: config.model, inputTokens: _orIn, outputTokens: _orOut, totalTokens: _orTotal },
    };
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;

    if (e.message === 'MISSING_API_KEY'
      || e.message?.startsWith('RATE_LIMIT|')
      || e.message?.startsWith('INSUFFICIENT_CREDITS|')
      || e.message?.startsWith('MODEL_OVERLOADED|')
      || e.message?.startsWith('SERVER_ERROR|')
      || e.message?.startsWith('TIMEOUT|')
      || e.message?.startsWith('NETWORK_ERROR|')
      || e.message?.startsWith('CONTENT_BLOCKED|')
      || e.message?.startsWith('CONTEXT_TOO_LONG|')
      || e.message?.startsWith('INVALID_JSON|')
      || e.message?.startsWith('UNKNOWN_ERROR|')) {
      throw e;
    }
    handleProviderError(e, 'openrouter');
    throw e;
  }
}

// ─── OPENAI ADAPTER ──────────────────────────────────────────────

// ★ v6.1 EO-068: Updated NO_TEMPERATURE_MODELS
// Legacy o1/o1-pro removed from list (deprecated by OpenAI)
// o3/o3-mini/o3-pro kept for backward compat if anyone still uses via custom model
// GPT-5.x family supports temperature normally

const NO_TEMPERATURE_MODELS = new Set(['o1', 'o1-mini', 'o1-pro', 'o3', 'o3-mini', 'o3-pro', 'o4-mini']);

function modelSupportsTemperature(model: string): boolean {
  if (NO_TEMPERATURE_MODELS.has(model)) return false;
  for (const noTempModel of NO_TEMPERATURE_MODELS) {
    if (model.startsWith(noTempModel + '-') && !model.startsWith('gpt-')) return false;
  }
  return true;
}

async function generateWithOpenAI(config: AIProviderConfig, options: AIGenerateOptions): Promise<AIGenerateResult> {
  if (options.signal?.aborted) throw new DOMException('Generation cancelled', 'AbortError');

  const messages: any[] = [];

  if (options.jsonSchema || options.jsonMode) {
    messages.push({ role: 'system', content: OPENROUTER_SYSTEM_PROMPT });
  }

  messages.push({ role: 'user', content: options.prompt });

  const maxTokens = getMaxTokensForSection(options.sectionKey);

  const body: any = {
    model: config.model,
    messages: messages,
    max_completion_tokens: maxTokens,
  };

  if (options.jsonSchema || options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  if (options.temperature !== undefined && modelSupportsTemperature(config.model)) {
    body.temperature = options.temperature;
  } else if (options.temperature !== undefined && !modelSupportsTemperature(config.model)) {
    console.log('[aiProvider] v6.0 Skipping temperature=' + options.temperature + ' for reasoning model ' + config.model);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData?.error?.message || ('HTTP ' + response.status);

      if (response.status === 401 || response.status === 403) throw new Error('MISSING_API_KEY');
      if (response.status === 429) throw new Error('RATE_LIMIT|openai|Rate limit reached for model ' + config.model + '. ' + errorMsg);
      if (response.status === 402) throw new Error('INSUFFICIENT_CREDITS|openai|' + errorMsg);
      if (response.status === 503) throw new Error('MODEL_OVERLOADED|openai|Model ' + config.model + ' is temporarily unavailable. ' + errorMsg);
      if (response.status === 500 || response.status === 502) throw new Error('SERVER_ERROR|openai|' + errorMsg);
      if (response.status === 408) throw new Error('TIMEOUT|openai|Request timed out. ' + errorMsg);
      throw new Error('UNKNOWN_ERROR|openai|HTTP ' + response.status + ': ' + errorMsg);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const finishReason = data.choices?.[0]?.finish_reason || '';

    if (finishReason === 'length') {
      console.warn('[aiProvider] v6.0 OpenAI response TRUNCATED (finish_reason=length) for model ' + config.model + ', sectionKey=' + options.sectionKey);
      throw new Error('INVALID_JSON|openai|Response truncated (finish_reason=length). Model ' + config.model + ' ran out of max_completion_tokens=' + maxTokens + '.');
    }

    if (!text) {
      console.warn('[aiProvider] v6.0 OpenAI returned EMPTY response for model ' + config.model + ', finish_reason=' + finishReason);
      throw new Error('INVALID_JSON|openai|Empty response from model ' + config.model + ' (finish_reason=' + finishReason + ').');
    }

    // [EO-138] Extract token usage from OpenAI response
    const _oaiIn: number = data.usage?.prompt_tokens ?? 0;
    const _oaiOut: number = data.usage?.completion_tokens ?? 0;
    const _oaiTotal: number = data.usage?.total_tokens ?? (_oaiIn + _oaiOut);
    console.log('[EO-138] API usage: openai', config.model, 'in:', _oaiIn, 'out:', _oaiOut);
    return {
      text,
      _usage: { provider: 'openai', model: config.model, inputTokens: _oaiIn, outputTokens: _oaiOut, totalTokens: _oaiTotal },
    };
  } catch (e: any) {
    if (e.name === 'AbortError') throw e;
    if (e.message === 'MISSING_API_KEY'
      || e.message?.startsWith('RATE_LIMIT|')
      || e.message?.startsWith('INSUFFICIENT_CREDITS|')
      || e.message?.startsWith('MODEL_OVERLOADED|')
      || e.message?.startsWith('SERVER_ERROR|')
      || e.message?.startsWith('TIMEOUT|')
      || e.message?.startsWith('NETWORK_ERROR|')
      || e.message?.startsWith('CONTENT_BLOCKED|')
      || e.message?.startsWith('CONTEXT_TOO_LONG|')
      || e.message?.startsWith('INVALID_JSON|')
      || e.message?.startsWith('UNKNOWN_ERROR|')) {
      throw e;
    }
    handleProviderError(e, 'openai');
    throw e;
  }
}

// ─── ERROR HANDLING ──────────────────────────────────────────────

function handleProviderError(e: any, provider: string): never {
  const msg = e.message || e.toString();
  const msgLower = msg.toLowerCase();

  if (e.name === 'AbortError' || msgLower.includes('abort') || msgLower.includes('cancelled') || msgLower.includes('generation cancelled')) {
    throw new DOMException('Generation cancelled', 'AbortError');
  }

  if (msg === 'MISSING_API_KEY' || msgLower.includes('api key not valid') || msg.includes('401') || msg.includes('403') || (msg.includes('400') && (msgLower.includes('key') || msgLower.includes('auth')))) {
    throw new Error('MISSING_API_KEY');
  }
  // EO-120b: 400 Bad Request is a DETERMINISTIC client error — retrying the same request NEVER helps.
  // Must be caught BEFORE the INVALID_JSON check (400 responses often contain "invalid" in message).
  if (msg.includes('400') || msgLower.includes('bad request') || msgLower.includes('invalid argument') || msgLower.includes('invalid_argument')) {
    throw new Error('BAD_REQUEST|' + provider + '|' + msg.substring(0, 200));
  }
  if (msg.includes('429') || msgLower.includes('quota') || msgLower.includes('resource_exhausted') || msgLower.includes('rate limit') || msgLower.includes('too many requests')) {
    throw new Error('RATE_LIMIT|' + provider + '|' + msg.substring(0, 200));
  }
  if (msg.includes('402') || msgLower.includes('credits') || msgLower.includes('insufficient') || msgLower.includes('afford') || msgLower.includes('payment required') || msgLower.includes('billing')) {
    throw new Error('INSUFFICIENT_CREDITS|' + provider + '|' + msg.substring(0, 200));
  }
  if (msg.includes('503') || msgLower.includes('unavailable') || msgLower.includes('overloaded') || msgLower.includes('high demand') || msgLower.includes('capacity') || msgLower.includes('temporarily')) {
    throw new Error('MODEL_OVERLOADED|' + provider + '|' + msg.substring(0, 200));
  }
  if (msg.includes('500') || msg.includes('502') || msgLower.includes('internal server error') || msgLower.includes('bad gateway')) {
    throw new Error('SERVER_ERROR|' + provider + '|' + msg.substring(0, 200));
  }
  if (msg.includes('408') || msgLower.includes('timeout') || msgLower.includes('etimedout') || msgLower.includes('econnaborted') || msgLower.includes('deadline exceeded')) {
    throw new Error('TIMEOUT|' + provider + '|' + msg.substring(0, 200));
  }
  if (msgLower.includes('fetch') || msgLower.includes('network') || msgLower.includes('failed to fetch') || msgLower.includes('err_') || msgLower.includes('enotfound') || msgLower.includes('econnrefused') || msgLower.includes('cors')) {
    throw new Error('NETWORK_ERROR|' + provider + '|' + msg.substring(0, 200));
  }
  if (msgLower.includes('safety') || msgLower.includes('blocked') || msgLower.includes('content filter') || msgLower.includes('harmful') || msgLower.includes('recitation')) {
    throw new Error('CONTENT_BLOCKED|' + provider + '|' + msg.substring(0, 200));
  }
  if (msgLower.includes('context length') || msgLower.includes('too long') || msgLower.includes('token limit') || msgLower.includes('max.*token')) {
    throw new Error('CONTEXT_TOO_LONG|' + provider + '|' + msg.substring(0, 200));
  }
  if (msgLower.includes('json') || msgLower.includes('unexpected token') || msgLower.includes('parse error') || msgLower.includes('invalid json')) {
    throw new Error('INVALID_JSON|' + provider + '|' + msg.substring(0, 200));
  }

  console.error('[' + provider + '] Unclassified API Error:', e);
  throw new Error('UNKNOWN_ERROR|' + provider + '|' + msg.substring(0, 200));
}

// ═══════════════════════════════════════════════════════════════
// ★ v6.1 EO-068: JSON SANITIZATION LAYER
// ═══════════════════════════════════════════════════════════════
// Strips markdown fences, BOM, trailing commas, and other common
// AI response artifacts that break JSON.parse.
// USAGE: import { sanitizeJSONResponse } from './aiProvider.ts';
//        const parsed = JSON.parse(sanitizeJSONResponse(result.text));

export function sanitizeJSONResponse(raw: string): string {
  // ★ EO-108: Work on single variable — previous code had raw/s desync bug
  let s = raw.trim();

  // EO-078: Strip hallucinated tool_call XML from agentic models (MiniMax, DeepSeek)
  s = s.replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/g, '').trim();
  s = s.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();

  // Log warning if after stripping tool calls, response doesn't look like JSON
  if (s.length > 0 && !s.startsWith('{') && !s.startsWith('[')) {
    console.warn('[aiProvider] EO-108 sanitizeJSONResponse: response does not start with JSON. First 200 chars:', s.substring(0, 200));
  }

  // Strip UTF-8 BOM
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);

  // ★ EO-114: Trim leading/trailing whitespace BEFORE fence detection
  // Gemini sometimes returns \n```json which bypassed startsWith('```') check
  s = s.trim();

  // ★ EO-108: Strip markdown code fences — handles BOTH complete and unclosed fences
  // Pattern 1: Complete fence ```json ... ```
  var fenceMatch = s.match(/^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }
  // Pattern 2: Opening fence without closing (Gemini often omits closing ```)
  else if (s.startsWith('```')) {
    s = s.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?\s*```$/, '').trim();
  }

  // ★ EO-108: If still not starting with { or [, try to find first JSON start
  if (s.length > 0 && !s.startsWith('{') && !s.startsWith('[')) {
    var jsonStart = -1;
    var braceIdx = s.indexOf('{');
    var bracketIdx = s.indexOf('[');
    if (braceIdx >= 0 && bracketIdx >= 0) {
      jsonStart = Math.min(braceIdx, bracketIdx);
    } else if (braceIdx >= 0) {
      jsonStart = braceIdx;
    } else if (bracketIdx >= 0) {
      jsonStart = bracketIdx;
    }
    if (jsonStart >= 0 && jsonStart < 100) {
      // Only strip prefix if JSON start is within first 100 chars (not buried in text)
      console.log('[aiProvider] EO-108: Stripped ' + jsonStart + ' chars of non-JSON prefix');
      s = s.substring(jsonStart);
    }
  }

  // Strip trailing commas before } or ] (common AI mistake)
  s = s.replace(/,\s*([\]}])/g, '$1');

  return s;
}

// END OF aiProvider.ts v6.19
