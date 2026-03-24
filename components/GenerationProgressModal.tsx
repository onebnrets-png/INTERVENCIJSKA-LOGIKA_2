// components/GenerationProgressModal.tsx
// v1.2 — 2026-03-22 — EO-140c: Responsive via useResponsive() — modal padding, fonts, spinner size scale with tier.
// v1.1 — 2026-03-20 — EO-137b-FIX4: Render as centered floating modal with frosted backdrop instead of inline full-width banner.
// v1.0 — 2026-03-20 — EO-137: Enhanced generation progress modal with pipeline phases, elapsed time, estimated time remaining

import React from 'react';
import { useResponsive } from '../hooks/useResponsive.ts';

export interface PhaseStatus {
  id: string;
  nameEn: string;
  nameSi: string;
  status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
  durationMs?: number;
  error?: string;
}

export interface GenerationProgressModalProps {
  visible: boolean;
  sectionName: string;
  sectionKey: string;
  phases: PhaseStatus[];
  elapsedMs: number;
  estimatedTotalMs: number | null;
  onCancel: () => void;
  language: 'en' | 'si';
  subProgress?: string;
}

// Phase weights for progress calculation
const PHASE_WEIGHTS: Record<string, number> = {
  sourceRetrieval: 10,
  aiGeneration: 50,
  referenceProcessing: 15,
  mergingValidation: 10,
  saving: 10,
  urlVerification: 5,
};

function formatMs(ms: number): string {
  if (ms < 60000) return Math.round(ms / 1000) + 's';
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function calcProgress(phases: PhaseStatus[]): number {
  let total = 0;
  let done = 0;
  for (const p of phases) {
    if (p.status === 'skipped') continue;
    const w = PHASE_WEIGHTS[p.id] || 10;
    total += w;
    if (p.status === 'completed' || p.status === 'failed') done += w;
    else if (p.status === 'running') done += w * 0.5;
  }
  if (total === 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

function PhaseIcon({ status }: { status: PhaseStatus['status'] }) {
  if (status === 'completed') return <span className="text-emerald-500 text-base flex-shrink-0">✅</span>;
  if (status === 'running') return (
    <span className="text-sky-500 text-base flex-shrink-0 inline-block animate-spin" style={{ animationDuration: '1.5s' }}>🔄</span>
  );
  if (status === 'skipped') return <span className="text-slate-300 text-base flex-shrink-0">⏭</span>;
  if (status === 'failed') return <span className="text-red-500 text-base flex-shrink-0">❌</span>;
  return <span className="text-slate-300 text-base flex-shrink-0">⬜</span>;
}

const GenerationProgressModal: React.FC<GenerationProgressModalProps> = ({
  visible,
  sectionName,
  phases,
  elapsedMs,
  estimatedTotalMs,
  onCancel,
  language,
  subProgress,
}) => {
  if (!visible) return null;

  const isEN = language === 'en';
  const progress = calcProgress(phases);
  const remainingMs = estimatedTotalMs !== null ? Math.max(0, estimatedTotalMs - elapsedMs) : null;

  // EO-140c: Responsive modal sizing
  const { config: rc } = useResponsive();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(4px)' }}
    >
    <div
      style={{ maxWidth: rc.content.modalMaxWidth, padding: rc.content.modalPadding }}
      className="w-full mx-4 rounded-2xl border border-sky-200 bg-white shadow-2xl"
      role="status"
      aria-live="polite"
    >
      {/* Header: spinner + title */}
      <div className="flex items-center gap-3 mb-3">
        <div style={{ width: rc.content.iconSize.section, height: rc.content.iconSize.section }} className="border-2 border-sky-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800 truncate" style={{ fontSize: rc.content.fontSize.label }}>
            {sectionName}{subProgress ? ` ${subProgress}` : ''}
          </div>
          <div className="text-slate-400 mt-0.5" style={{ fontSize: rc.content.fontSize.xs }}>
            {isEN ? 'Elapsed' : 'Pretečen čas'}: <span className="font-medium text-slate-600">{formatMs(elapsedMs)}</span>
            {remainingMs !== null
              ? <> · ~{formatMs(remainingMs)} {isEN ? 'remaining' : 'preostalo'}</>
              : <> · {isEN ? 'estimating...' : 'ocenjujem...'}</>
            }
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-100 rounded-full h-1.5 mb-3 overflow-hidden">
        <div
          className="h-1.5 rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Phase list */}
      <div className="space-y-1.5 mb-3">
        {phases.map((phase) => {
          const name = isEN ? phase.nameEn : phase.nameSi;
          const isRunning = phase.status === 'running';
          const isSkipped = phase.status === 'skipped';
          const isFailed = phase.status === 'failed';
          return (
            <div
              key={phase.id}
              style={{ fontSize: rc.content.fontSize.xs }}
              className={`flex items-center gap-2 px-1 ${
                isRunning ? 'text-sky-700 font-medium' :
                isSkipped ? 'text-slate-300 italic' :
                isFailed ? 'text-red-500' :
                phase.status === 'completed' ? 'text-emerald-600' :
                'text-slate-400'
              }`}
            >
              <PhaseIcon status={phase.status} />
              <span className="flex-1">{name}</span>
              {phase.status === 'completed' && phase.durationMs !== undefined && (
                <span className="text-slate-400 font-normal ml-1">({formatMs(phase.durationMs)})</span>
              )}
              {phase.status === 'skipped' && (
                <span className="ml-1">{isEN ? '(skipped)' : '(preskočeno)'}</span>
              )}
              {phase.status === 'failed' && phase.error && (
                <span className="ml-1 truncate max-w-[120px]" title={phase.error}>{phase.error}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Cancel button */}
      <div className="flex justify-center">
        <button
          onClick={onCancel}
          style={{ padding: rc.content.buttonPadding.primary, fontSize: rc.content.buttonFontSize }}
          className="font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 active:scale-95 transition-all shadow-sm flex items-center gap-1.5"
        >
          ✕ {isEN ? 'Cancel generation' : 'Prekliči generiranje'}
        </button>
      </div>
    </div>
    </div>
  );
};

export default GenerationProgressModal;

// END OF GenerationProgressModal.tsx v1.2
