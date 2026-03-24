// components/ChartRenderer.tsx
// v1.6 — 2026-02-18 — FEAT: Full dark mode support
//   - Container, tooltips, labels, grids all theme-aware
//   - Uses themeService to detect dark mode automatically
//   - No more hardcoded 'white' backgrounds
// v1.5 — 2026-02-18 — FIX: Donut scales proportionally to container height
import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
  LineChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { theme, colors as lightColors, darkColors } from '../design/theme.ts';
import { getThemeMode, onThemeChange } from '../services/themeService.ts';
import type { ExtractedChartData } from '../services/DataExtractionService.ts';

// ─── Dark mode hook ──────────────────────────────────────────

function useThemeColors() {
  const [isDark, setIsDark] = useState(getThemeMode() === 'dark');
  useEffect(() => {
    const unsub = onThemeChange((m) => setIsDark(m === 'dark'));
    return unsub;
  }, []);
  const c = isDark ? darkColors : lightColors;
  return { isDark, c };
}

const CHART_COLORS = [
  theme.colors.primary[500],
  theme.colors.secondary[500],
  theme.colors.success[500],
  theme.colors.warning[500],
  theme.colors.error[500],
  theme.colors.primary[300],
  theme.colors.secondary[300],
  theme.colors.success[300],
];

interface ChartRendererProps {
  data: ExtractedChartData;
  width?: number;
  height?: number;
  showTitle?: boolean;
  showSource?: boolean;
  className?: string;
}

// ─── Tooltip (theme-aware) ───────────────────────────────────

const CustomTooltip = ({ active, payload, label, isDark, c }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
      border: `1px solid ${c.border.light}`,
      borderRadius: theme.radii.md,
      padding: '8px 12px',
      boxShadow: theme.shadows.md,
      fontSize: '13px',
    }}>
      <p style={{ margin: 0, fontWeight: 600, color: c.text.heading }}>{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ margin: '2px 0 0', color: entry.color || c.text.body }}>
          {entry.name || 'Value'}: {entry.value}{entry.payload?.unit || ''}
        </p>
      ))}
    </div>
  );
};

// ─── Wrapper to inject theme into Tooltip ────────────────────

const makeTooltip = (isDark: boolean, c: any) => {
  return (props: any) => <CustomTooltip {...props} isDark={isDark} c={c} />;
};

/* ─── COMPARISON BAR ──────────────────────────────────────── */

const ComparisonBar: React.FC<{ data: ExtractedChartData; height: number; isDark: boolean; c: any }> = ({ data, height, isDark, c }) => {
  const chartData = data.dataPoints.map(dp => ({ name: dp.label, value: dp.value, unit: dp.unit || '' }));
  const TooltipComp = useMemo(() => makeTooltip(isDark, c), [isDark, c]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.border.light} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: c.text.body }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: c.text.body }} tickLine={false} />
        <Tooltip content={<TooltipComp />} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/* ─── DONUT — v1.5: proportional scaling, short labels ───── */

const DonutChart: React.FC<{ data: ExtractedChartData; height: number; isDark: boolean; c: any }> = ({ data, height, isDark, c }) => {
  const chartData = data.dataPoints.map(dp => ({ name: dp.label, value: dp.value, unit: dp.unit || '' }));

  const innerRadius = Math.round(Math.min(Math.max(height * 0.19, 24), 70));
  const outerRadius = Math.round(Math.min(Math.max(height * 0.30, 40), 110));

  const isSmall = height <= 180;
  const labelFontSize = isSmall ? 9 : 11;

  const renderLabel = ({ percent, midAngle, outerRadius: oR, cx, cy }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = oR + (isSmall ? 8 : 10);
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const textAnchor = x > cx ? 'start' : 'end';
    return (
      <text
        x={x} y={y}
        fill={c.text.body}
        textAnchor={textAnchor}
        dominantBaseline="central"
        fontSize={labelFontSize}
        fontWeight={600}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const TooltipComp = useMemo(() => makeTooltip(isDark, c), [isDark, c]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart margin={{ top: 4, right: 4, bottom: 2, left: 4 }}>
        <Pie
          data={chartData}
          cx="50%"
          cy={isSmall ? '42%' : '45%'}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          dataKey="value"
          label={renderLabel}
          labelLine={{ strokeWidth: 1, stroke: c.border.medium }}
        >
          {chartData.map((_, index) => (
            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<TooltipComp />} />
        <Legend
          wrapperStyle={{
            fontSize: isSmall ? '9px' : '11px',
            lineHeight: isSmall ? '14px' : '18px',
            color: c.text.body,
          }}
          iconType="circle"
          iconSize={isSmall ? 6 : 8}
          formatter={(value: string) => <span style={{ color: c.text.body }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

/* ─── LINE CHART ──────────────────────────────────────────── */

const LineChartComponent: React.FC<{ data: ExtractedChartData; height: number; isDark: boolean; c: any }> = ({ data, height, isDark, c }) => {
  const chartData = data.dataPoints.sort((a, b) => (a.year || 0) - (b.year || 0)).map(dp => ({ name: dp.year ? String(dp.year) : dp.label, value: dp.value, unit: dp.unit || '' }));
  const TooltipComp = useMemo(() => makeTooltip(isDark, c), [isDark, c]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.border.light} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: c.text.body }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: c.text.body }} tickLine={false} />
        <Tooltip content={<TooltipComp />} />
        <Line type="monotone" dataKey="value" stroke={theme.colors.primary[500]} strokeWidth={2} dot={{ fill: theme.colors.primary[500], r: 4 }} activeDot={{ r: 6, fill: theme.colors.primary[600] }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

/* ─── RADAR CHART ─────────────────────────────────────────── */

const RadarChartComponent: React.FC<{ data: ExtractedChartData; height: number; isDark: boolean; c: any }> = ({ data, height, isDark, c }) => {
  const chartData = data.dataPoints.map(dp => ({ subject: dp.label, value: dp.value, fullMark: 9 }));
  const TooltipComp = useMemo(() => makeTooltip(isDark, c), [isDark, c]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid stroke={c.border.light} />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: c.text.body, fontWeight: 600 }} />
        <PolarRadiusAxis angle={90} domain={[0, 9]} tick={{ fontSize: 10, fill: c.text.muted }} />
        <Radar name="Level" dataKey="value" stroke={theme.colors.primary[500]} fill={theme.colors.primary[500]} fillOpacity={isDark ? 0.35 : 0.25} strokeWidth={2} />
        <Tooltip content={<TooltipComp />} />
      </RadarChart>
    </ResponsiveContainer>
  );
};

/* ─── GAUGE CHART ─────────────────────────────────────────── */

const GaugeChart: React.FC<{ data: ExtractedChartData; height: number; isDark: boolean; c: any }> = ({ data, height, isDark, c }) => {
  const value = data.dataPoints[0]?.value || 0;
  const maxVal = data.dataPoints[0]?.unit === '%' ? 100 : Math.max(value * 1.5, 10);
  const percentage = Math.min((value / maxVal) * 100, 100);
  const gaugeData = [{ name: 'value', value: percentage }, { name: 'remaining', value: 100 - percentage }];
  const emptyColor = isDark ? '#334155' : theme.colors.surface.sidebar;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={gaugeData} startAngle={180} endAngle={0} cx="50%" cy="75%" innerRadius={height * 0.3} outerRadius={height * 0.45} dataKey="value" stroke="none">
          <Cell fill={theme.colors.primary[500]} />
          <Cell fill={emptyColor} />
        </Pie>
        <text x="50%" y="65%" textAnchor="middle" style={{ fontSize: '24px', fontWeight: 700, fill: c.text.heading }}>
          {value}{data.dataPoints[0]?.unit || ''}
        </text>
        <text x="50%" y="80%" textAnchor="middle" style={{ fontSize: '12px', fill: c.text.muted }}>
          {data.dataPoints[0]?.label || ''}
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
};

/* ─── STACKED BAR ─────────────────────────────────────────── */

const StackedBarChart: React.FC<{ data: ExtractedChartData; height: number; isDark: boolean; c: any }> = ({ data, height, isDark, c }) => {
  const categories: string[] = Array.from(new Set(data.dataPoints.map(dp => dp.category || 'default')));
  const labels: string[] = Array.from(new Set(data.dataPoints.map(dp => dp.label)));
  const chartData = labels.map(label => {
    const row: any = { name: label };
    categories.forEach(cat => {
      const dp = data.dataPoints.find(d => d.label === label && (d.category || 'default') === cat);
      row[cat] = dp?.value || 0;
    });
    return row;
  });
  const TooltipComp = useMemo(() => makeTooltip(isDark, c), [isDark, c]);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.border.light} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: c.text.body }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: c.text.body }} tickLine={false} />
        <Tooltip content={<TooltipComp />} />
        <Legend
          wrapperStyle={{ fontSize: '11px' }}
          formatter={(value: string) => <span style={{ color: c.text.body }}>{value}</span>}
        />
        {categories.map((cat, i) => (
          <Bar key={cat} dataKey={cat} stackId="stack" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === categories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

/* ─── PROGRESS ────────────────────────────────────────────── */

const ProgressChart: React.FC<{ data: ExtractedChartData; height: number; isDark: boolean; c: any }> = ({ data, height, isDark, c }) => {
  const trackColor = isDark ? '#334155' : theme.colors.surface.sidebar;
  return (
    <div style={{ height, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', padding: '8px 0' }}>
      {data.dataPoints.map((dp, i) => {
        const pct = dp.unit === '%' ? dp.value : Math.min((dp.value / 9) * 100, 100);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ minWidth: '100px', fontSize: '12px', fontWeight: 500, color: c.text.body, textAlign: 'right' }}>{dp.label}</span>
            <div style={{ flex: 1, height: '16px', backgroundColor: trackColor, borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}, ${CHART_COLORS[(i + 1) % CHART_COLORS.length]})`, borderRadius: '8px', transition: 'width 0.8s ease-out' }} />
            </div>
            <span style={{ minWidth: '45px', fontSize: '12px', fontWeight: 600, color: c.text.heading }}>{dp.value}{dp.unit || ''}</span>
          </div>
        );
      })}
    </div>
  );
};

/* ─── UNSUPPORTED ─────────────────────────────────────────── */

const UnsupportedChart: React.FC<{ data: ExtractedChartData; height: number; isDark: boolean; c: any }> = ({ data, height, isDark, c }) => (
  <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#1E293B' : theme.colors.surface.background, borderRadius: theme.radii.md, border: `1px dashed ${c.border.medium}`, color: c.text.muted, fontSize: '13px' }}>
    Chart type &quot;{data.chartType}&quot; — coming soon
  </div>
);

/* ─── COMPONENT MAP ───────────────────────────────────────── */

const CHART_COMPONENTS: Record<string, React.FC<{ data: ExtractedChartData; height: number; isDark: boolean; c: any }>> = {
  comparison_bar: ComparisonBar,
  donut: DonutChart,
  line: LineChartComponent,
  radar: RadarChartComponent,
  gauge: GaugeChart,
  stacked_bar: StackedBarChart,
  progress: ProgressChart,
};

/* ─── MAIN RENDERER ───────────────────────────────────────── */

const ChartRenderer: React.FC<ChartRendererProps> = ({ data, width, height = 250, showTitle = true, showSource = true, className = '' }) => {
  const { isDark, c } = useThemeColors();
  const ChartComponent = useMemo(() => CHART_COMPONENTS[data.chartType] || UnsupportedChart, [data.chartType]);

  const containerBg = isDark ? '#1E293B' : '#FFFFFF';
  const containerBorder = c.border.light;

  return (
    <div className={className} style={{
      width: width || '100%',
      backgroundColor: containerBg,
      borderRadius: theme.radii.lg,
      border: `1px solid ${containerBorder}`,
      padding: '16px',
      boxShadow: theme.shadows.sm,
    }}>
      {showTitle && (
        <div style={{ marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: c.text.heading }}>{data.title}</h4>
          {data.subtitle && (<p style={{ margin: '2px 0 0', fontSize: '12px', color: c.text.muted }}>{data.subtitle}</p>)}
        </div>
      )}
      <ChartComponent data={data} height={height} isDark={isDark} c={c} />
      {showSource && data.source && (<p style={{ margin: '8px 0 0', fontSize: '10px', color: c.text.muted, fontStyle: 'italic' }}>Source: {data.source}</p>)}
    </div>
  );
};

export default ChartRenderer;
