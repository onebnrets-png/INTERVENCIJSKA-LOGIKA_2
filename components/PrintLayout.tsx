// components/PrintLayout.tsx
// ═══════════════════════════════════════════════════════════════
// v6.5 — 2026-03-20 — EO-133: Comprehensive defensive rendering — guards for .levels, object-as-child,
//         undefined task/risk/readiness entries, optional chaining throughout.
// v6.4 — 2026-03-18 — EO-123: Defensive partners init — handle {partners:[...]} wrapper to prevent .find() crash
// v6.3 — 2026-03-06 — EO-032: Removed Euro-Office logo from print layout
//   ★ v6.3: Print output no longer shows app logo — clean project-only output
// v6.2 — 2026-02-24 — DEFENSIVE ARRAY HANDLING (safeArray)
//   ★ v6.2: NEW safeArray() utility — handles AI returning objects
//           instead of arrays (e.g. { objectives: [...] } vs [...])
//   ★ v6.2: ResultsList, activities, risks, kers all use safeArray()
//   - v6.1: Partnership & Finance sections in Print
//   - All previous changes preserved.
// ═══════════════════════════════════════════════════════════════

import React from 'react';
import { getSteps, getReadinessLevelsDefinitions, BRAND_ASSETS } from '../constants.tsx';
import { TEXT } from '../locales.ts';
import GanttChart from './GanttChart.tsx';
import PERTChart from './PERTChart.tsx';
import Organigram from './Organigram.tsx';
import {
    PM_HOURS_PER_MONTH,
    CENTRALIZED_DIRECT_COSTS,
    CENTRALIZED_INDIRECT_COSTS,
    DECENTRALIZED_DIRECT_COSTS,
    DECENTRALIZED_INDIRECT_COSTS
} from '../types.ts';

const safeArray = (v: any): any[] => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (Array.isArray(v[k])) return v[k];
    }
  }
  return [];
};

// EO-133: Convert any value to a safe renderable string — prevents "Objects not valid as React child"
const safeStr = (v: any): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // Object (e.g. {phases:[...], summary:'...'}) — try summary field first, then stringify
  if (typeof v === 'object') {
    if (v.summary && typeof v.summary === 'string') return v.summary;
    if (v.description && typeof v.description === 'string') return v.description;
    try { return JSON.stringify(v); } catch { return '[complex object]'; }
  }
  return String(v);
};

interface SectionProps {
    title: string;
    children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
    <section className="mb-8" style={{ pageBreakInside: 'avoid' }}>
        <h2 className="text-2xl font-bold border-b-2 border-gray-300 pb-2 mb-4">{title}</h2>
        {children}
    </section>
);

interface SubSectionProps {
    title: string;
    children: React.ReactNode;
}

const SubSection: React.FC<SubSectionProps> = ({ title, children }) => (
    <div className="mb-6">
        <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
        <div className="pl-4 border-l-2 border-gray-200 mt-2">{children}</div>
    </div>
);

interface ItemProps {
    title?: string;
    description?: string;
    indicator?: string;
    indicatorLabel?: string;
}

const Item: React.FC<ItemProps> = ({ title, description, indicator, indicatorLabel }) => (
    <div className="mb-4">
        <h4 className="text-lg font-bold text-gray-700">{safeStr(title)}</h4>
        {description && <p className="text-gray-600 whitespace-pre-wrap">{safeStr(description)}</p>}
        {indicator && <p className="text-sm text-gray-500 mt-1"><strong>{indicatorLabel || 'Indicator'}:</strong> {safeStr(indicator)}</p>}
    </div>
);

interface ProblemNodeDisplayProps {
    node: { title: string; description: string };
    prefix: string;
}

const ProblemNodeDisplay: React.FC<ProblemNodeDisplayProps> = ({ node, prefix }) => {
    if (!node.title) return null;
    return <Item title={`${prefix}: ${node.title}`} description={node.description} />;
};

interface ResultsListProps {
    items: { title: string; description: string; indicator: string }[];
    prefix: string;
    indicatorLabel: string;
}

const ResultsList: React.FC<ResultsListProps> = ({ items, prefix, indicatorLabel }) => (
    <>
        {safeArray(items).map((item, index) => item.title && (
            <Item key={index} title={`${prefix}${index + 1}: ${item.title}`} description={item.description} indicator={item.indicator} indicatorLabel={indicatorLabel} />
        ))}
    </>
);

const PrintLayout = ({ projectData, language = 'en', logo }) => {
    const { problemAnalysis, projectIdea, generalObjectives, specificObjectives, activities, outputs, outcomes, impacts, risks, kers, projectManagement } = projectData;
    const STEPS = getSteps(language);
    const t = TEXT[language];
    const tp = t.partners || {};
    const tf = t.finance || {};
    const READINESS_LEVELS_DEFINITIONS = getReadinessLevelsDefinitions(language);
    // EO-123: Defensive partners — unwrap {partners:[...]} wrapper if AI stored it incorrectly
    const _rawPartners = projectData.partners;
    const partners: any[] = Array.isArray(_rawPartners)
      ? _rawPartners
      : (Array.isArray((_rawPartners as any)?.partners) ? (_rawPartners as any).partners : []);
    const fundingModel = projectData.fundingModel || 'centralized';
    const lang = language === 'si' ? 'si' : 'en';

    const displayLogo = logo || BRAND_ASSETS.logoText;

    const safeCategory = (cat: string | undefined): string => {
        if (!cat) return '';
        const key = cat.toLowerCase();
        return t.risks.categories[key] || cat;
    };

    const safeLevel = (level: string | undefined): string => {
        if (!level) return '';
        const key = level.toLowerCase();
        return t.risks.levels[key] || level;
    };

    // ★ v6.1: Collect all allocations for finance tables
    const allAllocations: any[] = [];
    (Array.isArray(activities) ? activities : []).forEach((wp: any) => {
        (wp.tasks || []).forEach((task: any) => {
            (task.partnerAllocations || []).forEach((alloc: any) => {
                const partner = partners.find((p: any) => p.id === alloc.partnerId);
                const directTotal = (alloc.directCosts || []).reduce((sum: number, dc: any) => sum + (dc.amount || 0), 0);
                const indirectTotal = (alloc.indirectCosts || []).reduce((sum: number, ic: any) => {
                    return sum + Math.round(directTotal * ((ic.percentage || 0) / 100));
                }, 0);
                allAllocations.push({
                    wpId: wp.id, taskId: task.id,
                    partnerCode: partner?.code || '?',
                    hours: alloc.hours || 0, pm: alloc.pm || 0,
                    directTotal, indirectTotal, total: directTotal + indirectTotal,
                });
            });
        });
    });

    const grandDirect = allAllocations.reduce((s, a) => s + a.directTotal, 0);
    const grandIndirect = allAllocations.reduce((s, a) => s + a.indirectTotal, 0);
    const grandTotal = grandDirect + grandIndirect;
    const grandHours = allAllocations.reduce((s, a) => s + a.hours, 0);
    const grandPM = allAllocations.reduce((s, a) => s + a.pm, 0);

    // Group by WP
    const wpGroups: Record<string, any[]> = {};
    allAllocations.forEach(a => { if (!wpGroups[a.wpId]) wpGroups[a.wpId] = []; wpGroups[a.wpId].push(a); });

    // Group by Partner
    const partnerGroups: Record<string, any[]> = {};
    allAllocations.forEach(a => { if (!partnerGroups[a.partnerCode]) partnerGroups[a.partnerCode] = []; partnerGroups[a.partnerCode].push(a); });

    return (
        <div className="p-8 bg-white text-black font-sans relative">
            <header className="text-center mb-12">
    <h1 className="text-4xl font-bold mb-2">{projectIdea.projectTitle || 'Project Proposal'}</h1>
    {projectIdea.projectAcronym && <p className="text-2xl font-semibold text-gray-600">({projectIdea.projectAcronym})</p>}
    </header>


            <main>
                {/* 1. Problem Analysis */}
                <Section title={STEPS[0].title}>
                    {problemAnalysis?.coreProblem && (
                    <SubSection title={t.coreProblem} children={
                        <Item title={safeStr(problemAnalysis.coreProblem.title)} description={safeStr(problemAnalysis.coreProblem.description)} />
                    } />
                    )}
                    <SubSection title={t.causes} children={
                        safeArray(problemAnalysis?.causes).map((cause, i) => <ProblemNodeDisplay key={i} node={cause} prefix={`${t.causeTitle} #${i + 1}`} />)
                    } />
                    <SubSection title={t.consequences} children={
                        safeArray(problemAnalysis?.consequences).map((con, i) => <ProblemNodeDisplay key={i} node={con} prefix={`${t.consequenceTitle} #${i + 1}`} />)
                    } />
                </Section>

                {/* 2. Project Idea */}
                <Section title={STEPS[1].title}>
                    <SubSection title={t.mainAim} children={<p className="whitespace-pre-wrap">{safeStr(projectIdea?.mainAim)}</p>} />
                    <SubSection title={t.stateOfTheArt} children={<p className="whitespace-pre-wrap">{safeStr(projectIdea?.stateOfTheArt)}</p>} />
                    <SubSection title={t.proposedSolution} children={
                        <>
                            <p className="whitespace-pre-wrap">{typeof projectIdea.proposedSolution === 'object' && projectIdea.proposedSolution !== null ? (projectIdea.proposedSolution as any).summary : projectIdea.proposedSolution}</p>
                            {typeof projectIdea.proposedSolution === 'object' && projectIdea.proposedSolution !== null && (projectIdea.proposedSolution as any).dnshCompliance && (
                                <p className="mt-2 text-sm text-gray-600"><strong>DNSH Compliance:</strong> {(projectIdea.proposedSolution as any).dnshCompliance}</p>
                            )}
                        </>
                    } />
                    <SubSection title={t.readinessLevels} children={
                        (Object.keys(projectIdea?.readinessLevels || {})).map((key) => {
                            const value = projectIdea.readinessLevels[key];
                            const def = READINESS_LEVELS_DEFINITIONS[key];
                            if (!def) return null;
                            if (!value || value.level === null || value.level === undefined) return null;
                            const levelInfo = Array.isArray(def.levels) ? def.levels.find((l: any) => l.level === value.level) : null;
                            return <Item key={key} title={safeStr(def.name)} description={safeStr(value.justification)} indicator={levelInfo ? `Level ${value.level}: ${safeStr(levelInfo.title)}` : `Level ${value.level}`} indicatorLabel={t.indicator} />;
                        })
                    } />
                    <SubSection title={t.euPolicies} children={
                        safeArray(projectIdea?.policies).map((policy, i) => policy.name && <Item key={i} title={safeStr(policy.name)} description={safeStr(policy.description)} />)
                    } />
                </Section>
                
                {/* 3. General Objectives */}
                <Section title={STEPS[2].title}><ResultsList items={generalObjectives} prefix="GO" indicatorLabel={t.indicator} /></Section>
                
                {/* 4. Specific Objectives */}
                <Section title={STEPS[3].title}><ResultsList items={specificObjectives} prefix="SO" indicatorLabel={t.indicator} /></Section>

                {/* 5. Activities */}
                <Section title={STEPS[4].title}>
                    
                    {/* Management Section */}
                    {projectManagement?.description && (
                        <SubSection title={t.management.title}>
                            <p className="whitespace-pre-wrap mb-4">{projectManagement.description}</p>
                            <h4 className="font-bold mb-2">{t.management.organigram}</h4>
                            <div style={{ width: '100%', overflow: 'visible', background: 'white' }}>
                                <Organigram structure={projectManagement.structure} activities={activities} language={language} id="organigram-print" printMode={true} containerWidth={960} />
                            </div>
                        </SubSection>
                    )}

                    {/* ★ v6.1: Partnership (Consortium) */}
                    {partners.length > 0 && (
                        <SubSection title={tp.title || 'Partnership (Consortium)'}>
                            <p className="text-sm text-gray-600 mb-3">
                                <strong>{tp.fundingModel || 'Funding Model'}:</strong>{' '}
                                {fundingModel === 'centralized' ? (tp.centralized || 'Centralized') : (tp.decentralized || 'Decentralized')}
                                {projectData.maxPartners && (<> | <strong>{tp.maxPartners || 'Max Partners'}:</strong> {projectData.maxPartners}</>)}
                            </p>
                            <table className="w-full border-collapse border border-gray-300 text-sm mb-4">
                                <thead>
                                    <tr className="bg-blue-50">
                                        <th className="border border-gray-300 p-2 text-left">{tp.code || 'Code'}</th>
                                        <th className="border border-gray-300 p-2 text-left">{tp.partnerName || 'Name'}</th>
                                        <th className="border border-gray-300 p-2 text-left">{tp.expertise || 'Expertise'}</th>
                                        <th className="border border-gray-300 p-2 text-left">{tp.partnerType || 'Type'}</th>
                                        <th className="border border-gray-300 p-2 text-right">{tp.pmRate || 'PM Rate'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {partners.map((p, i) => (
                                        <tr key={i} className={i === 0 ? 'bg-amber-50' : ''}>
                                            <td className="border border-gray-300 p-2 font-bold">{p.code || (i === 0 ? 'CO' : `P${i + 1}`)}</td>
                                            <td className="border border-gray-300 p-2">{p.name || '—'}</td>
                                            <td className="border border-gray-300 p-2 text-xs">{p.expertise || '—'}</td>
                                            <td className="border border-gray-300 p-2">{(tp.partnerTypes || {})[p.partnerType] || '—'}</td>
                                            <td className="border border-gray-300 p-2 text-right font-mono">{p.pmRate ? `€${p.pmRate.toLocaleString()}` : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </SubSection>
                    )}

                    {/* Workplan */}
                    <SubSection title={t.subSteps.workplan}>
                        {safeArray(activities).map((wp) => wp.title && (
                            <div key={wp.id} className="mb-6">
                                <h4 className="text-lg font-bold text-gray-800">{wp.id}: {wp.title}</h4>
                                <h5 className="font-bold text-gray-700 mt-2 mb-1">{t.tasks}</h5>
                                <table className="w-full border-collapse border border-gray-300 text-sm mb-2">
                                    <thead>
                                        <tr className="bg-gray-100">
                                            <th className="border border-gray-300 p-2 text-left w-16">{t.id}</th>
                                            <th className="border border-gray-300 p-2 text-left">{t.title}</th>
                                            <th className="border border-gray-300 p-2 text-left">{t.description}</th>
                                            <th className="border border-gray-300 p-2 text-left w-32">{t.dates}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(wp.tasks || []).map(task => (
                                            <tr key={task.id}>
                                                <td className="border border-gray-300 p-2">{task.id}</td>
                                                <td className="border border-gray-300 p-2">{safeStr(task.title)}</td>
                                                <td className="border border-gray-300 p-2 whitespace-pre-wrap">{safeStr(task.description)}</td>
                                                <td className="border border-gray-300 p-2">{task.startDate}<br/>{task.endDate}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* ★ v6.1: Task-level Partner Allocations */}
                                {(wp.tasks || []).map(task => {
                                    const taskAllocs = task.partnerAllocations || [];
                                    if (taskAllocs.length === 0) return null;
                                    return (
                                        <div key={`alloc-${task.id}`} className="mb-3 ml-4">
                                            <h6 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                                                {task.id} — {tp.partnerAllocation || 'Partner Allocations'}
                                            </h6>
                                            <table className="w-full border-collapse border border-gray-200 text-xs mb-2">
                                                <thead>
                                                    <tr className="bg-emerald-50">
                                                        <th className="border border-gray-200 p-1.5 text-left">{tp.code || 'Partner'}</th>
                                                        <th className="border border-gray-200 p-1.5 text-right">{tp.hours || 'Hours'}</th>
                                                        <th className="border border-gray-200 p-1.5 text-right">{tp.pm || 'PM'}</th>
                                                        <th className="border border-gray-200 p-1.5 text-right">{tf.directCosts || 'Direct'}</th>
                                                        <th className="border border-gray-200 p-1.5 text-right">{tf.indirectCosts || 'Indirect'}</th>
                                                        <th className="border border-gray-200 p-1.5 text-right">{tf.grandTotal || 'Total'}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {taskAllocs.map((alloc, ai) => {
                                                        const partner = partners.find(p => p.id === alloc.partnerId);
                                                        const dTotal = (alloc.directCosts || []).reduce((s, dc) => s + (dc.amount || 0), 0);
                                                        const iTotal = (alloc.indirectCosts || []).reduce((s, ic) => s + Math.round(dTotal * ((ic.percentage || 0) / 100)), 0);
                                                        return (
                                                            <tr key={ai}>
                                                                <td className="border border-gray-200 p-1.5 font-bold">{partner?.code || '?'}</td>
                                                                <td className="border border-gray-200 p-1.5 text-right font-mono">{alloc.hours || 0}</td>
                                                                <td className="border border-gray-200 p-1.5 text-right font-mono">{(alloc.pm || 0).toFixed(1)}</td>
                                                                <td className="border border-gray-200 p-1.5 text-right font-mono">€{dTotal.toLocaleString()}</td>
                                                                <td className="border border-gray-200 p-1.5 text-right font-mono">€{iTotal.toLocaleString()}</td>
                                                                <td className="border border-gray-200 p-1.5 text-right font-mono font-bold">€{(dTotal + iTotal).toLocaleString()}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                })}

                                {(wp.milestones?.length > 0) && wp.milestones.some((m: any) => m.description) && (
                                    <div className="mb-2">
                                        <h5 className="font-bold text-gray-700">{t.milestones}</h5>
                                        <ul className="list-disc pl-5 text-sm">
                                            {wp.milestones.map((m: any) => m.description && <li key={m.id}><strong>{m.id}:</strong> {safeStr(m.description)}</li>)}
                                        </ul>
                                    </div>
                                )}
                                {(wp.deliverables?.length > 0) && wp.deliverables.some((d: any) => d.description) && (
                                    <div>
                                        <h5 className="font-bold text-gray-700">{t.deliverables}</h5>
                                        <ul className="list-disc pl-5 text-sm">
                                            {wp.deliverables.map((d: any) => d.description && <li key={d.id}><strong>{d.id}:</strong> {safeStr(d.description)} ({t.indicator}: {safeStr(d.indicator)})</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ))}
                    </SubSection>

                    {/* Gantt Chart — print-optimized with fixed dimensions */}
                    <div style={{ pageBreakBefore: 'always', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                         <h3 className="text-xl font-semibold text-gray-800 mb-2">{t.subSteps.ganttChart}</h3>
                         <div style={{ width: '100%', overflow: 'visible', border: '1px solid #d1d5db', borderRadius: '4px', background: 'white' }}>
                             <GanttChart activities={activities} language={language} id="gantt-chart-print" forceViewMode="project" containerWidth={960} printMode={true} />
                         </div>
                    </div>

                    {/* PERT Chart — print-optimized with fixed dimensions */}
                    <div style={{ pageBreakBefore: 'always', marginTop: '1.5rem', marginBottom: '1.5rem' }}>
                         <h3 className="text-xl font-semibold text-gray-800 mb-2">{t.subSteps.pertChart}</h3>
                         <div style={{ width: '100%', overflow: 'visible', border: '1px solid #d1d5db', borderRadius: '4px', background: 'white' }}>
                             <PERTChart activities={activities} language={language} printMode={true} containerWidth={960} />
                         </div>
                    </div>

                    {/* ★ v6.1: Finance (Budget) Overview */}
                    {allAllocations.length > 0 && (
                        <SubSection title={tf.title || 'Finance (Budget)'}>
                            <p className="text-sm text-gray-600 mb-3">
                                <strong>{tf.costModel || 'Model'}:</strong>{' '}
                                {fundingModel === 'centralized' ? (tf.centralizedModel || 'Centralized') : (tf.decentralizedModel || 'Decentralized')}
                            </p>

                            {/* Grand Totals */}
                            <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                                <div className="bg-green-50 border border-green-200 rounded p-3">
                                    <p className="text-xs font-bold text-green-700 uppercase">{tf.totalDirectCosts || 'Total Direct'}</p>
                                    <p className="text-lg font-bold text-green-800">€{grandDirect.toLocaleString()}</p>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                                    <p className="text-xs font-bold text-amber-700 uppercase">{tf.totalIndirectCosts || 'Total Indirect'}</p>
                                    <p className="text-lg font-bold text-amber-800">€{grandIndirect.toLocaleString()}</p>
                                </div>
                                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                                    <p className="text-xs font-bold text-blue-700 uppercase">{tf.grandTotal || 'Grand Total'}</p>
                                    <p className="text-lg font-bold text-blue-800">€{grandTotal.toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Per WP Table */}
                            <h4 className="font-bold text-gray-700 mb-2">{tf.perWP || 'Per Work Package'}</h4>
                            <table className="w-full border-collapse border border-gray-300 text-sm mb-4">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="border border-gray-300 p-2 text-left">WP</th>
                                        <th className="border border-gray-300 p-2 text-right">{tf.directCosts || 'Direct'}</th>
                                        <th className="border border-gray-300 p-2 text-right">{tf.indirectCosts || 'Indirect'}</th>
                                        <th className="border border-gray-300 p-2 text-right">{tf.grandTotal || 'Total'}</th>
                                        <th className="border border-gray-300 p-2 text-right">{tp.totalHours || 'Hours'}</th>
                                        <th className="border border-gray-300 p-2 text-right">{tp.totalPM || 'PM'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(wpGroups).map(([wpId, items]) => {
                                        const d = items.reduce((s, a) => s + a.directTotal, 0);
                                        const ind = items.reduce((s, a) => s + a.indirectTotal, 0);
                                        const h = items.reduce((s, a) => s + a.hours, 0);
                                        const pm = items.reduce((s, a) => s + a.pm, 0);
                                        return (
                                            <tr key={wpId}>
                                                <td className="border border-gray-300 p-2 font-bold">{wpId}</td>
                                                <td className="border border-gray-300 p-2 text-right font-mono">€{d.toLocaleString()}</td>
                                                <td className="border border-gray-300 p-2 text-right font-mono">€{ind.toLocaleString()}</td>
                                                <td className="border border-gray-300 p-2 text-right font-mono font-bold">€{(d + ind).toLocaleString()}</td>
                                                <td className="border border-gray-300 p-2 text-right font-mono">{h.toLocaleString()}</td>
                                                <td className="border border-gray-300 p-2 text-right font-mono">{pm.toFixed(1)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-100 font-bold">
                                        <td className="border border-gray-300 p-2">{tf.grandTotal || 'TOTAL'}</td>
                                        <td className="border border-gray-300 p-2 text-right font-mono">€{grandDirect.toLocaleString()}</td>
                                        <td className="border border-gray-300 p-2 text-right font-mono">€{grandIndirect.toLocaleString()}</td>
                                        <td className="border border-gray-300 p-2 text-right font-mono">€{grandTotal.toLocaleString()}</td>
                                        <td className="border border-gray-300 p-2 text-right font-mono">{grandHours.toLocaleString()}</td>
                                        <td className="border border-gray-300 p-2 text-right font-mono">{grandPM.toFixed(1)}</td>
                                    </tr>
                                </tfoot>
                            </table>

                            {/* Per Partner Table */}
                            <h4 className="font-bold text-gray-700 mb-2">{tf.perPartner || 'Per Partner'}</h4>
                            <table className="w-full border-collapse border border-gray-300 text-sm">
                                <thead>
                                    <tr className="bg-gray-100">
                                        <th className="border border-gray-300 p-2 text-left">{tp.code || 'Partner'}</th>
                                        <th className="border border-gray-300 p-2 text-right">{tf.directCosts || 'Direct'}</th>
                                        <th className="border border-gray-300 p-2 text-right">{tf.indirectCosts || 'Indirect'}</th>
                                        <th className="border border-gray-300 p-2 text-right">{tf.grandTotal || 'Total'}</th>
                                        <th className="border border-gray-300 p-2 text-right">{tp.totalHours || 'Hours'}</th>
                                        <th className="border border-gray-300 p-2 text-right">{tp.totalPM || 'PM'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(partnerGroups).map(([code, items]) => {
                                        const d = items.reduce((s, a) => s + a.directTotal, 0);
                                        const ind = items.reduce((s, a) => s + a.indirectTotal, 0);
                                        const h = items.reduce((s, a) => s + a.hours, 0);
                                        const pm = items.reduce((s, a) => s + a.pm, 0);
                                        return (
                                            <tr key={code}>
                                                <td className="border border-gray-300 p-2 font-bold">{code}</td>
                                                <td className="border border-gray-300 p-2 text-right font-mono">€{d.toLocaleString()}</td>
                                                <td className="border border-gray-300 p-2 text-right font-mono">€{ind.toLocaleString()}</td>
                                                <td className="border border-gray-300 p-2 text-right font-mono font-bold">€{(d + ind).toLocaleString()}</td>
                                                <td className="border border-gray-300 p-2 text-right font-mono">{h.toLocaleString()}</td>
                                                <td className="border border-gray-300 p-2 text-right font-mono">{pm.toFixed(1)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-gray-100 font-bold">
                                        <td className="border border-gray-300 p-2">{tf.grandTotal || 'TOTAL'}</td>
                                        <td className="border border-gray-300 p-2 text-right font-mono">€{grandDirect.toLocaleString()}</td>
                                        <td className="border border-gray-300 p-2 text-right font-mono">€{grandIndirect.toLocaleString()}</td>
                                        <td className="border border-gray-300 p-2 text-right font-mono">€{grandTotal.toLocaleString()}</td>
                                        <td className="border border-gray-300 p-2 text-right font-mono">{grandHours.toLocaleString()}</td>
                                        <td className="border border-gray-300 p-2 text-right font-mono">{grandPM.toFixed(1)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </SubSection>
                    )}

                    {/* Risks */}
                    <SubSection title={t.subSteps.riskMitigation}>
                        {safeArray(risks).map((risk, i) => risk.description && (
                            <div key={i} className="mb-4 border-b border-gray-100 pb-2">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                         <h4 className="font-bold text-gray-800">{risk.id || `Risk ${i+1}`}: {risk.title}</h4>
                                         <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600 border border-gray-300">
                                             {safeCategory(risk.category)}
                                         </span>
                                    </div>
                                </div>
                                <p className="text-gray-700 mb-1">{risk.description}</p>
                                <div className="flex gap-4 text-sm mb-1">
                                    <span><strong>{t.risks.likelihood}:</strong> {safeLevel(risk.likelihood)}</span>
                                    <span><strong>{t.risks.impact}:</strong> {safeLevel(risk.impact)}</span>
                                </div>
                                <p className="text-sm"><strong>{t.risks.mitigation}:</strong> {risk.mitigation}</p>
                            </div>
                        ))}
                    </SubSection>
                </Section>

                {/* 6. Expected Results */}
                <Section title={STEPS[5].title}>
                    <SubSection title={t.outputs}>
                        <ResultsList items={outputs} prefix="D" indicatorLabel={t.indicator} />
                    </SubSection>
                    <SubSection title={t.outcomes}>
                        <ResultsList items={outcomes} prefix="R" indicatorLabel={t.indicator} />
                    </SubSection>
                    <SubSection title={t.impacts}>
                        <ResultsList items={impacts} prefix="I" indicatorLabel={t.indicator} />
                    </SubSection>
                    <SubSection title={t.kers.kerTitle}>
                        {safeArray(kers).map((ker, i) => ker.title && (
                            <Item 
                                key={i} 
                                title={`${ker.id || `KER${i+1}`}: ${ker.title}`} 
                                description={ker.description} 
                                indicator={ker.exploitationStrategy} 
                                indicatorLabel={t.kers.exploitationStrategy} 
                            />
                        ))}
                    </SubSection>
                </Section>
            </main>
        </div>
    );
};

export default PrintLayout;

// END OF PrintLayout.tsx v6.5
