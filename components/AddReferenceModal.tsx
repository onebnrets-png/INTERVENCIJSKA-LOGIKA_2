// components/AddReferenceModal.tsx
// ═══════════════════════════════════════════════════════════════
// EO-069: Modal dialog for manually adding a reference.
// Follows ConfirmationModal design patterns (design system theme).
// v1.1 — 2026-03-22 — EO-140c: Responsive via useResponsive().
// v1.0 — 2026-03-10
// ═══════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import { lightColors, darkColors, shadows, radii, spacing, animation, typography } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import { useResponsive } from '../hooks/useResponsive.ts';
import { TEXT } from '../locales.ts';
import type { Reference } from '../types.ts';

interface AddReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (ref: Omit<Reference, 'id'>) => void;
  language: 'en' | 'si';
  defaultSectionKey?: string;
  sectionLabels: Record<string, string>;
}

const SECTION_KEYS_WITH_REFS = [
  'problemAnalysis',
  'stateOfTheArt',
  'proposedSolution',
  'methodology',
  'impact',
  'dissemination',
  'risks',
  'mainAim',
  'generalObjectives',
  'specificObjectives',
  'activities',
  'expectedResults',
  'outputs',
  'outcomes',
  'impacts',
  'kers',
  'projectManagement',
];

const AddReferenceModal: React.FC<AddReferenceModalProps> = ({
  isOpen,
  onClose,
  onSave,
  language,
  defaultSectionKey = '',
  sectionLabels,
}) => {
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  useEffect(() => {
    const unsub = onThemeChange((m) => setIsDark(m === 'dark'));
    return unsub;
  }, []);
  const colors = isDark ? darkColors : lightColors;
  const { config: rc } = useResponsive(); // EO-140c
  const t = (TEXT[language] || TEXT['en']) as any;
  const tr = t.references || {};

  const [sectionKey, setSectionKey] = useState(defaultSectionKey);
  const [authors, setAuthors] = useState('');
  const [year, setYear] = useState('');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [url, setUrl] = useState('');
  const [doi, setDoi] = useState('');
  const [note, setNote] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSectionKey(defaultSectionKey);
      setAuthors('');
      setYear('');
      setTitle('');
      setSource('');
      setUrl('');
      setDoi('');
      setNote('');
    }
  }, [isOpen, defaultSectionKey]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  const canSave = authors.trim() && title.trim() && year.trim();

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      sectionKey: sectionKey || 'general',
      fieldKey: 'description',
      inlineMarker: `(${authors.split(',')[0].trim()}, ${year.trim()})`,
      authors: authors.trim(),
      year: year.trim(),
      title: title.trim(),
      source: source.trim(),
      url: url.trim(),
      doi: doi.trim(),
      note: note.trim(),
      accessedDate: new Date().toISOString().split('T')[0],
      addedBy: 'manual',
    });
    onClose();
  };

  if (!isOpen) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: rc.content.inputPadding,
    borderRadius: radii.lg,
    border: `1px solid ${colors.border.light}`,
    background: colors.surface.primary,
    color: colors.text.body,
    fontSize: rc.content.inputFontSize,
    fontFamily: typography.fontFamily.sans,
    outline: 'none',
    transition: `border-color ${animation.duration.fast}`,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: rc.content.fontSize.xs,
    fontWeight: typography.fontWeight.semibold as any,
    color: colors.text.muted,
    marginBottom: '4px',
    display: 'block',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: spacing.lg, background: colors.surface.overlayBlur, backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: colors.surface.card, borderRadius: radii['2xl'], boxShadow: shadows['2xl'],
        maxWidth: rc.content.modalMaxWidth, width: '100%', overflow: 'hidden',
        maxHeight: 'calc(100dvh - 48px)', display: 'flex', flexDirection: 'column' as const,
        border: `1px solid ${colors.border.light}`, animation: 'scaleIn 0.2s ease-out',
        fontFamily: typography.fontFamily.sans,
      }}>
        {/* Header */}
        <div style={{
          padding: rc.content.headerPadding,
          borderBottom: `1px solid ${colors.border.light}`,
          background: colors.surface.sidebar,
        }}>
          <h3 style={{
            fontSize: rc.content.fontSize.heading, fontWeight: typography.fontWeight.bold as any,
            color: colors.text.heading, margin: 0,
          }}>
            {tr.add || 'Add Reference'}
          </h3>
        </div>

        {/* Body */}
        <div style={{ padding: rc.content.modalPadding, overflow: 'auto', flex: 1, minHeight: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            {/* Section */}
            <div>
              <label style={labelStyle}>{tr.section || 'Section'}</label>
              <select
                value={sectionKey}
                onChange={(e) => setSectionKey(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">{tr.allSections || 'All Sections'}</option>
                {SECTION_KEYS_WITH_REFS.filter((k) => sectionLabels[k]).map((k) => (
                  <option key={k} value={k}>{sectionLabels[k]}</option>
                ))}
              </select>
            </div>

            {/* Authors + Year */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: spacing.md }}>
              <div>
                <label style={labelStyle}>{tr.authors || 'Authors'} *</label>
                <input style={inputStyle} value={authors} onChange={(e) => setAuthors(e.target.value)} placeholder="Smith, J., Novak, A." />
              </div>
              <div>
                <label style={labelStyle}>{tr.year || 'Year'} *</label>
                <input style={inputStyle} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2024" />
              </div>
            </div>

            {/* Title */}
            <div>
              <label style={labelStyle}>{tr.refTitle || 'Title'} *</label>
              <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Horizon Europe Work Programme 2023-2024" />
            </div>

            {/* Source */}
            <div>
              <label style={labelStyle}>{tr.source || 'Source'}</label>
              <input style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)} placeholder="European Commission / Journal Name" />
            </div>

            {/* URL + DOI */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
              <div>
                <label style={labelStyle}>{tr.url || 'URL'}</label>
                <input style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <label style={labelStyle}>{tr.doi || 'DOI'}</label>
                <input style={inputStyle} value={doi} onChange={(e) => setDoi(e.target.value)} placeholder="10.1000/xyz123" />
              </div>
            </div>

            {/* Note */}
            <div>
              <label style={labelStyle}>{tr.note || 'Note'}</label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical' as const, minHeight: 48 }}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={language === 'si' ? 'Opcijska opomba...' : 'Optional note...'}
                rows={2}
              />
            </div>

            {/* Required note */}
            <p style={{ fontSize: rc.content.fontSize.xs, color: colors.text.muted, margin: 0 }}>
              * {language === 'si' ? 'Obvezna polja' : 'Required fields'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: rc.content.headerPadding,
          borderTop: `1px solid ${colors.border.light}`,
          background: colors.surface.sidebar,
          display: 'flex', justifyContent: 'flex-end', gap: spacing.md,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: rc.content.buttonPadding.secondary, fontSize: rc.content.buttonFontSize,
              fontWeight: typography.fontWeight.medium as any, color: colors.text.muted,
              background: 'transparent', border: 'none', borderRadius: radii.lg,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {t.modals?.cancel || 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              padding: rc.content.buttonPadding.primary, fontSize: rc.content.buttonFontSize,
              fontWeight: typography.fontWeight.semibold as any, color: '#FFFFFF',
              background: canSave ? colors.primary.gradient : colors.border.medium,
              border: 'none', borderRadius: radii.lg,
              cursor: canSave ? 'pointer' : 'not-allowed',
              boxShadow: canSave ? shadows.sm : 'none', fontFamily: 'inherit',
              opacity: canSave ? 1 : 0.6,
            }}
          >
            {tr.add || 'Add Reference'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddReferenceModal;
