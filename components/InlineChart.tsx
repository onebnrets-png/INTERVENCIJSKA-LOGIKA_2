// components/InlineChart.tsx
// ═══════════════════════════════════════════════════════════════
// v2.1 — 2026-02-25 — Manual trigger + all error types + Settings button
// ═══════════════════════════════════════════════════════════════

import React, { useState, useCallback, useRef } from 'react';
import { extractEmpiricalData, type ExtractedChartData } from '../services/DataExtractionService.ts';
import { resolveAllChartTypes } from '../services/ChartTypeResolver.ts';
import ChartRenderer from './ChartRenderer.tsx';
import { theme } from '../design/theme.ts';

// ─── Module-level cache ──────────────────────────────────────

var extractionCache = new Map<string, ExtractedChartData[]>();

var getTextHash = function (text: string): string {
  return text.substring(0, 100) + '__' + text.length;
};

// ─── Props ───────────────────────────────────────────────────

interface InlineChartProps {
  text: string;
  fieldContext?: string;
  language?: 'en' | 'si';
  minTextLength?: number;
  maxCharts?: number;
  onRateLimitError?: () => void;
}

// ─── Chart icon SVG ──────────────────────────────────────────

var ChartIcon = function (props: { size?: number; color?: string }) {
  var size = props.size || 16;
  var color = props.color;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="8" width="3" height="7" rx="0.5" fill={color || theme.colors.secondary[500]} opacity="0.8" />
      <rect x="5.5" y="4" width="3" height="11" rx="0.5" fill={color || theme.colors.primary[500]} opacity="0.8" />
      <rect x="10" y="1" width="3" height="14" rx="0.5" fill={color || theme.colors.success[500]} opacity="0.8" />
    </svg>
  );
};

// ─── Warning icon SVG ────────────────────────────────────────

var WarningIcon = function () {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
};

// ─── Pill button style helper ────────────────────────────────

var pillButton = function (color: string, bg: string, border: string) {
  return {
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 600 as const,
    color: color,
    backgroundColor: bg,
    border: '1px solid ' + border,
    borderRadius: '9999px',
    cursor: 'pointer' as const,
    marginLeft: '4px',
  };
};

// ─── Component ───────────────────────────────────────────────

var InlineChart = function (props: InlineChartProps) {
  var text = props.text;
  var fieldContext = props.fieldContext;
  var language = props.language || 'en';
  var minTextLength = props.minTextLength || 50;
  var maxCharts = props.maxCharts || 3;
  var onRateLimitError = props.onRateLimitError;

  var chartsState = useState<ExtractedChartData[]>([]);
  var charts = chartsState[0];
  var setCharts = chartsState[1];

  var expandedState = useState(false);
  var isExpanded = expandedState[0];
  var setIsExpanded = expandedState[1];

  var loadingState = useState(false);
  var isLoading = loadingState[0];
  var setIsLoading = loadingState[1];

  var statusState = useState<'idle' | 'done' | 'rate_limit' | 'no_credits' | 'no_key' | 'error'>('idle');
  var status = statusState[0];
  var setStatus = statusState[1];

  var lastExtractedTextRef = useRef<string>('');

  // ─── Check cache on mount ─────────────────────────────────

  var initialCache = (function () {
    if (text.length < minTextLength) return null;
    var cacheKey = getTextHash(text);
    var cached = extractionCache.get(cacheKey);
    if (cached && cached.length > 0) return cached;
    return null;
  })();

  if (initialCache && charts.length === 0 && status === 'idle') {
    if (lastExtractedTextRef.current !== text) {
      lastExtractedTextRef.current = text;
      setTimeout(function () {
        setCharts(initialCache);
        setStatus('done');
        setIsExpanded(false);
      }, 0);
    }
  }

  // ─── Manual extraction trigger ────────────────────────────

  var handleGenerateCharts = useCallback(async function () {
    if (text.length < minTextLength) return;

    var cacheKey = getTextHash(text);
    var cached = extractionCache.get(cacheKey);
    if (cached && cached.length > 0) {
      console.log('[InlineChart] Cache HIT for "' + (fieldContext || '') + '" (' + cached.length + ' charts)');
      setCharts(cached);
      setStatus('done');
      setIsExpanded(true);
      return;
    }

    setIsLoading(true);
    setStatus('idle');

    try {
      console.log('[InlineChart] Extracting for "' + (fieldContext || '') + '"...');
      var extracted = await extractEmpiricalData(text, fieldContext);
      var resolved = resolveAllChartTypes(extracted);
      var limited = resolved.slice(0, maxCharts);

      if (limited.length > 0) {
        extractionCache.set(cacheKey, limited);
        console.log('[InlineChart] Cache SET for "' + (fieldContext || '') + '" (' + limited.length + ' charts)');
        setCharts(limited);
        setStatus('done');
        setIsExpanded(true);
        lastExtractedTextRef.current = text;
      } else {
        console.log('[InlineChart] No visualizable data in "' + (fieldContext || '') + '"');
        setCharts([]);
        setStatus('done');
      }
    } catch (err: any) {
      var errMsg = (err && err.message) ? err.message : String(err);
      console.warn('[InlineChart] Extraction failed for "' + (fieldContext || '') + '":', errMsg);

      if (errMsg.indexOf('RATE_LIMIT') >= 0 || errMsg.indexOf('429') >= 0 || errMsg.indexOf('Quota') >= 0) {
        setStatus('rate_limit');
      } else if (errMsg.indexOf('INSUFFICIENT_CREDITS') >= 0 || errMsg.indexOf('402') >= 0 || errMsg.indexOf('afford') >= 0) {
        setStatus('no_credits');
      } else if (errMsg.indexOf('MISSING_API_KEY') >= 0) {
        setStatus('no_key');
      } else {
        setStatus('error');
      }
      setCharts([]);
    } finally {
      setIsLoading(false);
    }
  }, [text, fieldContext, minTextLength, maxCharts]);

  // ─── Don't render if text too short ───────────────────────

  if (text.length < minTextLength) return null;

  // ─── Don't render if idle and no loading ──────────────────

  var hasError = status === 'rate_limit' || status === 'no_credits' || status === 'no_key' || status === 'error';
  if (status === 'idle' && !isLoading) {
    // Show generate button
  } else if (status === 'done' && charts.length === 0 && !isLoading) {
    return null;
  }

  // ─── Render ───────────────────────────────────────────────

  var si = language === 'si';

  return (
    <div style={{ marginTop: '8px' }}>

      {status === 'rate_limit' && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 12px',
          fontSize: '11px',
          fontWeight: 600,
          color: '#b45309',
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '9999px',
          flexWrap: 'wrap' as const,
        }}>
          <WarningIcon />
          <span>{si ? 'API kvota izcrpana.' : 'API quota exceeded.'}</span>
          <button onClick={function () { setStatus('idle'); }} style={pillButton('#0369a1', '#e0f2fe', '#7dd3fc')}>
            {si ? 'Poskusi ponovno' : 'Retry'}
          </button>
          {onRateLimitError && (
            <button onClick={onRateLimitError} style={pillButton('#7c3aed', '#ede9fe', '#c4b5fd')}>
              {si ? 'Nastavitve' : 'Settings'}
            </button>
          )}
        </div>
      )}

      {status === 'no_credits' && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 12px',
          fontSize: '11px',
          fontWeight: 600,
          color: '#b45309',
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '9999px',
          flexWrap: 'wrap' as const,
        }}>
          <WarningIcon />
          <span>{si ? 'Premalo kreditov pri AI ponudniku.' : 'Insufficient AI credits.'}</span>
          <button onClick={function () { setStatus('idle'); }} style={pillButton('#0369a1', '#e0f2fe', '#7dd3fc')}>
            {si ? 'Poskusi ponovno' : 'Retry'}
          </button>
          {onRateLimitError && (
            <button onClick={onRateLimitError} style={pillButton('#7c3aed', '#ede9fe', '#c4b5fd')}>
              {si ? 'Nastavitve' : 'Settings'}
            </button>
          )}
        </div>
      )}

      {status === 'no_key' && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 12px',
          fontSize: '11px',
          fontWeight: 600,
          color: '#dc2626',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '9999px',
          flexWrap: 'wrap' as const,
        }}>
          <span>{si ? 'API kljuc ni nastavljen.' : 'API key not configured.'}</span>
          {onRateLimitError && (
            <button onClick={onRateLimitError} style={pillButton('#7c3aed', '#ede9fe', '#c4b5fd')}>
              {si ? 'Nastavitve' : 'Settings'}
            </button>
          )}
        </div>
      )}

      {status === 'error' && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 12px',
          fontSize: '11px',
          fontWeight: 600,
          color: '#dc2626',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '9999px',
          flexWrap: 'wrap' as const,
        }}>
          <span>{si ? 'Napaka pri analizi. ' : 'Analysis error. '}</span>
          <button onClick={function () { setStatus('idle'); }} style={pillButton('#0369a1', '#e0f2fe', '#7dd3fc')}>
            {si ? 'Poskusi ponovno' : 'Retry'}
          </button>
        </div>
      )}

      {isLoading && (
        <button
          disabled={true}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            fontSize: '12px',
            fontWeight: 500,
            color: theme.colors.text.muted,
            backgroundColor: theme.colors.surface.background,
            border: '1px solid ' + theme.colors.border.light,
            borderRadius: theme.radii.full,
            cursor: 'wait' as const,
          }}
        >
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>&#x27F3;</span>
          {si ? 'Analiziram podatke...' : 'Analyzing data...'}
        </button>
      )}

      {!isLoading && !hasError && charts.length === 0 && (
        <button
          onClick={handleGenerateCharts}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            fontSize: '12px',
            fontWeight: 500,
            color: theme.colors.secondary[600],
            backgroundColor: theme.colors.secondary[50],
            border: '1px solid ' + theme.colors.secondary[200],
            borderRadius: theme.radii.full,
            cursor: 'pointer' as const,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={function (e) {
            (e.target as HTMLButtonElement).style.backgroundColor = theme.colors.secondary[100];
          }}
          onMouseLeave={function (e) {
            (e.target as HTMLButtonElement).style.backgroundColor = theme.colors.secondary[50];
          }}
        >
          <ChartIcon size={14} />
          {si ? 'Generiraj vizualizacije' : 'Generate visualizations'}
        </button>
      )}

      {!isLoading && charts.length > 0 && (
        <button
          onClick={function () { setIsExpanded(!isExpanded); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            fontSize: '12px',
            fontWeight: 500,
            color: theme.colors.secondary[600],
            backgroundColor: theme.colors.secondary[50],
            border: '1px solid ' + theme.colors.secondary[200],
            borderRadius: theme.radii.full,
            cursor: 'pointer' as const,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={function (e) {
            (e.target as HTMLButtonElement).style.backgroundColor = theme.colors.secondary[100];
          }}
          onMouseLeave={function (e) {
            (e.target as HTMLButtonElement).style.backgroundColor = theme.colors.secondary[50];
          }}
        >
          <ChartIcon size={14} />
          {si
            ? (isExpanded ? 'Skrij' : 'Prikazi') + ' vizualizacije (' + charts.length + ')'
            : (isExpanded ? 'Hide' : 'Show') + ' visualizations (' + charts.length + ')'}
        </button>
      )}

      {isExpanded && charts.length > 0 && (
        <div style={{
          marginTop: '10px',
          display: 'flex',
          flexDirection: 'column' as const,
          gap: '12px',
          animation: 'fadeIn 0.3s ease-out',
        }}>
          {charts.map(function (chart) {
            return (
              <ChartRenderer
                key={chart.id}
                data={chart}
                height={220}
                showTitle={true}
                showSource={true}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InlineChart;
