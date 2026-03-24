// components/FieldAIAssistant.tsx
// ═══════════════════════════════════════════════════════════════
// v1.6 — 2026-03-10 — EO-064: Resizable + draggable popup — user can resize from any edge/corner and drag by header
// v1.5 — 2026-03-10 — EO-064: Viewport-clamped popup (REPLACED by v1.6 — added resize+drag)
// v1.2 — 2026-03-06 — EO-043: Portal-based rendering — popup always on top, positioned via anchorRect
// v1.1 — 2026-03-06 — EO-043: z-index stacking context fix (REPLACED by v1.2 — did not work)
// v1.0 — 2026-03-06 — EO-039: AI Assistant per-field popup
// ═══════════════════════════════════════════════════════════════

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface FieldAIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (newValue: string) => void;
  onGenerate: (userInstructions: string) => Promise<string>;
  currentValue: string;
  fieldLabel: string;
  language: 'en' | 'si';
  anchorRect?: { top: number; right: number; bottom: number; left: number; width: number; height: number } | null;
}

var FieldAIAssistant = function(props: FieldAIAssistantProps) {
  var isOpen = props.isOpen;
  var onClose = props.onClose;
  var onAccept = props.onAccept;
  var onGenerate = props.onGenerate;
  var currentValue = props.currentValue;
  var fieldLabel = props.fieldLabel;
  var language = props.language;
  var anchorRect = props.anchorRect || null;

  var textareaRef = useRef<HTMLTextAreaElement>(null);
  var popupRef = useRef<HTMLDivElement>(null);

  var instructionsState = useState('');
  var instructions = instructionsState[0];
  var setInstructions = instructionsState[1];

  var previewState = useState('');
  var preview = previewState[0];
  var setPreview = previewState[1];

  var isGeneratingState = useState(false);
  var isGenerating = isGeneratingState[0];
  var setIsGenerating = isGeneratingState[1];

  var errorState = useState('');
  var error = errorState[0];
  var setError = errorState[1];

  var hasPreviewState = useState(false);
  var hasPreview = hasPreviewState[0];
  var setHasPreview = hasPreviewState[1];

  // --- Popup dimensions and position state ---
  var MIN_W = 360;
  var MIN_H = 300;
  var DEFAULT_W = 460;

  var boundsState = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  var bounds = boundsState[0];
  var setBounds = boundsState[1];

  // Drag state
  var isDraggingRef = useRef(false);
  var dragOffsetRef = useRef({ x: 0, y: 0 });

  // Resize state
  var isResizingRef = useRef(false);
  var resizeEdgeRef = useRef('');
  var resizeStartRef = useRef({ x: 0, y: 0, top: 0, left: 0, width: 0, height: 0 });

  // Calculate initial position
  useEffect(function() {
    if (!isOpen) {
      setBounds(null);
      return;
    }

    var viewportH = window.innerHeight;
    var viewportW = window.innerWidth;
    var margin = 16;
    var popupW = DEFAULT_W;
    if (popupW > viewportW - margin * 2) popupW = viewportW - margin * 2;

    var leftPos = 0;
    var topVal = margin;

    if (anchorRect) {
      // Horizontal
      leftPos = anchorRect.right - popupW;
      if (leftPos < margin) leftPos = margin;
      if (leftPos + popupW > viewportW - margin) leftPos = viewportW - margin - popupW;

      // Vertical
      var spaceBelow = viewportH - anchorRect.bottom - margin;
      var spaceAbove = anchorRect.top - margin;
      var maxH = 0;

      if (spaceBelow >= 320 || spaceBelow >= spaceAbove) {
        topVal = anchorRect.bottom + 4;
        maxH = viewportH - topVal - margin;
      } else {
        maxH = spaceAbove - 4;
        topVal = anchorRect.top - 4 - maxH;
      }

      if (topVal < margin) {
        maxH = maxH - (margin - topVal);
        topVal = margin;
      }
      if (maxH < MIN_H) maxH = MIN_H;
      if (topVal + maxH > viewportH - margin) {
        topVal = margin;
        maxH = viewportH - margin * 2;
      }

      setBounds({ top: topVal, left: leftPos, width: popupW, height: Math.min(maxH, 600) });
    } else {
      var h = Math.min(600, viewportH - margin * 2);
      topVal = (viewportH - h) / 2;
      leftPos = (viewportW - popupW) / 2;
      setBounds({ top: topVal, left: leftPos, width: popupW, height: h });
    }
  }, [isOpen, anchorRect]);

  // --- Drag handler (on header) ---
  var handleDragStart = useCallback(function(e: React.MouseEvent) {
    if (!bounds) return;
    // Only left button
    if (e.button !== 0) return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragOffsetRef.current = { x: e.clientX - bounds.left, y: e.clientY - bounds.top };

    var handleDragMove = function(ev: MouseEvent) {
      if (!isDraggingRef.current) return;
      var newLeft = ev.clientX - dragOffsetRef.current.x;
      var newTop = ev.clientY - dragOffsetRef.current.y;
      // Clamp to viewport
      var margin = 8;
      if (newLeft < margin) newLeft = margin;
      if (newTop < margin) newTop = margin;
      if (newLeft + (bounds ? bounds.width : DEFAULT_W) > window.innerWidth - margin) {
        newLeft = window.innerWidth - margin - (bounds ? bounds.width : DEFAULT_W);
      }
      if (newTop + 50 > window.innerHeight) {
        newTop = window.innerHeight - 50;
      }
      setBounds(function(prev) {
        if (!prev) return prev;
        return { top: newTop, left: newLeft, width: prev.width, height: prev.height };
      });
    };

    var handleDragEnd = function() {
      isDraggingRef.current = false;
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  }, [bounds]);

  // --- Resize handler ---
  var handleResizeStart = useCallback(function(edge: string, e: React.MouseEvent) {
    if (!bounds) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    isResizingRef.current = true;
    resizeEdgeRef.current = edge;
    resizeStartRef.current = { x: e.clientX, y: e.clientY, top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height };

    var handleResizeMove = function(ev: MouseEvent) {
      if (!isResizingRef.current) return;
      var dx = ev.clientX - resizeStartRef.current.x;
      var dy = ev.clientY - resizeStartRef.current.y;
      var start = resizeStartRef.current;
      var edg = resizeEdgeRef.current;
      var margin = 8;

      var newTop = start.top;
      var newLeft = start.left;
      var newW = start.width;
      var newH = start.height;

      // Right edge
      if (edg.indexOf('e') >= 0) {
        newW = start.width + dx;
      }
      // Left edge
      if (edg.indexOf('w') >= 0) {
        newW = start.width - dx;
        newLeft = start.left + dx;
      }
      // Bottom edge
      if (edg.indexOf('s') >= 0) {
        newH = start.height + dy;
      }
      // Top edge
      if (edg.indexOf('n') >= 0) {
        newH = start.height - dy;
        newTop = start.top + dy;
      }

      // Enforce minimums
      if (newW < MIN_W) {
        if (edg.indexOf('w') >= 0) newLeft = start.left + start.width - MIN_W;
        newW = MIN_W;
      }
      if (newH < MIN_H) {
        if (edg.indexOf('n') >= 0) newTop = start.top + start.height - MIN_H;
        newH = MIN_H;
      }

      // Clamp to viewport
      if (newLeft < margin) { newW = newW - (margin - newLeft); newLeft = margin; }
      if (newTop < margin) { newH = newH - (margin - newTop); newTop = margin; }
      if (newLeft + newW > window.innerWidth - margin) newW = window.innerWidth - margin - newLeft;
      if (newTop + newH > window.innerHeight - margin) newH = window.innerHeight - margin - newTop;

      // Re-enforce minimums after clamping
      if (newW < MIN_W) newW = MIN_W;
      if (newH < MIN_H) newH = MIN_H;

      setBounds({ top: newTop, left: newLeft, width: newW, height: newH });
    };

    var handleResizeEnd = function() {
      isResizingRef.current = false;
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [bounds]);

  // Focus textarea on open
  useEffect(function() {
    if (isOpen && textareaRef.current) {
      setTimeout(function() {
        if (textareaRef.current) textareaRef.current.focus();
      }, 100);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(function() {
    if (!isOpen) return;
    var handler = function(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return function() { window.removeEventListener('keydown', handler); };
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(function() {
    if (!isOpen) return;
    var handler = function(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    var timer = setTimeout(function() {
      document.addEventListener('mousedown', handler);
    }, 200);
    return function() {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [isOpen, onClose]);

  var handleGenerate = useCallback(async function() {
    setIsGenerating(true);
    setError('');
    try {
      var result = await onGenerate(instructions);
      setPreview(result);
      setHasPreview(true);
    } catch (e: any) {
      setError(e.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [instructions, onGenerate]);

  var handleAccept = useCallback(function() {
    onAccept(preview);
    setInstructions('');
    setPreview('');
    setHasPreview(false);
    setError('');
    onClose();
  }, [preview, onAccept, onClose]);

  var handleCancel = useCallback(function() {
    setInstructions('');
    setPreview('');
    setHasPreview(false);
    setError('');
    onClose();
  }, [onClose]);

  if (!isOpen || !bounds) return null;

  var t = {
    title: language === 'si' ? 'AI Asistent' : 'AI Assistant',
    instructionsLabel: language === 'si' ? 'Vaša navodila (neobvezno):' : 'Your instructions (optional):',
    instructionsPlaceholder: language === 'si'
      ? 'Npr.: uporabi ISO standarde, dodaj reference na študije, napiši bolj formalno, razširi z konkretnimi primeri...'
      : 'E.g.: use ISO standards, add references to studies, write more formally, expand with concrete examples...',
    currentValueLabel: language === 'si' ? 'Trenutna vsebina:' : 'Current content:',
    emptyField: language === 'si' ? '(prazno polje — AI bo generiral novo vsebino)' : '(empty field — AI will generate new content)',
    generate: language === 'si' ? 'Generiraj' : 'Generate',
    regenerate: language === 'si' ? 'Regeneriraj' : 'Regenerate',
    accept: language === 'si' ? 'Sprejmi' : 'Accept',
    cancel: language === 'si' ? 'Prekliči' : 'Cancel',
    generating: language === 'si' ? 'Generiram...' : 'Generating...',
    previewLabel: language === 'si' ? 'Predogled rezultata:' : 'Result preview:',
    fieldLabel: language === 'si' ? 'Polje:' : 'Field:',
  };

  // Resize edge style helper
  var edgeStyle = function(cursor: string, pos: React.CSSProperties): React.CSSProperties {
    return Object.assign({
      position: 'absolute' as const,
      zIndex: 10,
      cursor: cursor,
    }, pos);
  };

  var popupStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 99999,
    top: bounds.top + 'px',
    left: bounds.left + 'px',
    width: bounds.width + 'px',
    height: bounds.height + 'px',
    background: '#ffffff',
    borderRadius: '16px',
    border: '1px solid #e2e8f0',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)',
    fontFamily: 'inherit',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  };

  return createPortal(
    <div
      ref={popupRef}
      style={popupStyle}
    >
      {/* Resize handles — 4 edges + 4 corners */}
      {/* Top edge */}
      <div style={edgeStyle('ns-resize', { top: 0, left: 8, right: 8, height: 6 })} onMouseDown={function(e) { handleResizeStart('n', e); }} />
      {/* Bottom edge */}
      <div style={edgeStyle('ns-resize', { bottom: 0, left: 8, right: 8, height: 6 })} onMouseDown={function(e) { handleResizeStart('s', e); }} />
      {/* Left edge */}
      <div style={edgeStyle('ew-resize', { top: 8, bottom: 8, left: 0, width: 6 })} onMouseDown={function(e) { handleResizeStart('w', e); }} />
      {/* Right edge */}
      <div style={edgeStyle('ew-resize', { top: 8, bottom: 8, right: 0, width: 6 })} onMouseDown={function(e) { handleResizeStart('e', e); }} />
      {/* Top-left corner */}
      <div style={edgeStyle('nwse-resize', { top: 0, left: 0, width: 12, height: 12 })} onMouseDown={function(e) { handleResizeStart('nw', e); }} />
      {/* Top-right corner */}
      <div style={edgeStyle('nesw-resize', { top: 0, right: 0, width: 12, height: 12 })} onMouseDown={function(e) { handleResizeStart('ne', e); }} />
      {/* Bottom-left corner */}
      <div style={edgeStyle('nesw-resize', { bottom: 0, left: 0, width: 12, height: 12 })} onMouseDown={function(e) { handleResizeStart('sw', e); }} />
      {/* Bottom-right corner */}
      <div style={edgeStyle('nwse-resize', { bottom: 0, right: 0, width: 12, height: 12 })} onMouseDown={function(e) { handleResizeStart('se', e); }} />

      {/* Header — draggable */}
      <div
        onMouseDown={handleDragStart}
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e2e8f0',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Drag indicator dots */}
          <svg style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} fill="currentColor" viewBox="0 0 16 16">
            <circle cx="4" cy="3" r="1.5" /><circle cx="4" cy="8" r="1.5" /><circle cx="4" cy="13" r="1.5" />
            <circle cx="10" cy="3" r="1.5" /><circle cx="10" cy="8" r="1.5" /><circle cx="10" cy="13" r="1.5" />
          </svg>
          <svg style={{ width: 18, height: 18, color: '#ffffff' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
          <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: 700 }}>{t.title}</span>
        </div>
        <button
          onClick={handleCancel}
          onMouseDown={function(e) { e.stopPropagation(); }}
          style={{
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: '8px',
            color: '#ffffff',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            transition: 'background 0.15s',
          }}
          onMouseEnter={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.35)'; }}
          onMouseLeave={function(e) { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
        >
          <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable middle — body + preview scroll together */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

        {/* Body — field info, current content, instructions */}
        <div style={{ padding: '16px' }}>
          {/* Field name */}
          <div style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t.fieldLabel}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginLeft: '6px' }}>
              {fieldLabel}
            </span>
          </div>

          {/* Current value indicator */}
          <div style={{ marginBottom: '12px', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>
              {t.currentValueLabel}
            </span>
            {currentValue && currentValue.trim() ? (
              <p style={{ fontSize: '12px', color: '#475569', margin: 0, lineHeight: 1.5, maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {currentValue.length > 500 ? currentValue.substring(0, 500) + '...' : currentValue}
              </p>
            ) : (
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, fontStyle: 'italic' }}>{t.emptyField}</p>
            )}
          </div>

          {/* Instructions textarea */}
          <div style={{ marginBottom: '4px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '6px' }}>
              {t.instructionsLabel}
            </label>
            <textarea
              ref={textareaRef}
              value={instructions}
              onChange={function(e) { setInstructions(e.target.value); }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder={t.instructionsPlaceholder}
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1.5px solid #e2e8f0',
                borderRadius: '10px',
                fontSize: '13px',
                lineHeight: 1.5,
                resize: 'vertical',
                minHeight: '70px',
                maxHeight: '150px',
                fontFamily: 'inherit',
                color: '#334155',
                outline: 'none',
                transition: 'border-color 0.15s',
                boxSizing: 'border-box',
              }}
              onFocus={function(e) { e.target.style.borderColor = '#6366f1'; }}
              onBlur={function(e) { e.target.style.borderColor = '#e2e8f0'; }}
            />
            <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
              Ctrl+Enter = {t.generate}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div style={{ marginTop: '8px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '12px', color: '#dc2626' }}>
              {error}
            </div>
          )}
        </div>

        {/* Preview — full width, inside scrollable area */}
        {hasPreview && (
          <div style={{ padding: '0 16px 12px 16px', borderTop: '1px solid #e2e8f0' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#059669', display: 'block', padding: '12px 0 6px 0' }}>
              {t.previewLabel}
            </label>
            <div style={{
              padding: '12px 14px',
              background: '#f0fdf4',
              border: '1.5px solid #bbf7d0',
              borderRadius: '10px',
              fontSize: '13px',
              lineHeight: 1.6,
              color: '#166534',
              minHeight: '80px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {preview}
            </div>
          </div>
        )}

      </div>

      {/* Footer — fixed at bottom, never scrolls */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #e2e8f0',
        background: '#f8fafc',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}>
        <button
          onClick={handleCancel}
          style={{
            padding: '7px 14px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#64748b',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={function(e) { e.currentTarget.style.background = '#f1f5f9'; }}
          onMouseLeave={function(e) { e.currentTarget.style.background = '#ffffff'; }}
        >
          {t.cancel}
        </button>

        <div style={{ display: 'flex', gap: '8px' }}>
          {hasPreview && (
            <button
              onClick={handleAccept}
              style={{
                padding: '7px 16px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#ffffff',
                background: '#059669',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={function(e) { e.currentTarget.style.background = '#047857'; }}
              onMouseLeave={function(e) { e.currentTarget.style.background = '#059669'; }}
            >
              {t.accept}
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            style={{
              padding: '7px 16px',
              fontSize: '12px',
              fontWeight: 700,
              color: '#ffffff',
              background: isGenerating ? '#a5b4fc' : '#6366f1',
              border: 'none',
              borderRadius: '8px',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            onMouseEnter={function(e) { if (!isGenerating) e.currentTarget.style.background = '#4f46e5'; }}
            onMouseLeave={function(e) { if (!isGenerating) e.currentTarget.style.background = '#6366f1'; }}
          >
            {isGenerating && (
              <div style={{
                width: 12, height: 12,
                border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: '#ffffff',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            )}
            {isGenerating ? t.generating : (hasPreview ? t.regenerate : t.generate)}
          </button>
        </div>
      </div>

      {/* Resize indicator — bottom right corner visual hint */}
      <div style={{
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 12,
        height: 12,
        opacity: 0.3,
        pointerEvents: 'none',
      }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M11 1L1 11M11 5L5 11M11 9L9 11" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>,
    document.body
  );
};

export default FieldAIAssistant;
