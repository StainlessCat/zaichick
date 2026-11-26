import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  TrendingUp,
} from 'lucide-react';
import type { ProjectLineItem, WeldJoint } from '../../types/welding';
import type { ExecutiveDocStatusLike } from '../../utils/readiness';
import {
  buildControlFunnelData,
  buildWeldingDynamicsSeries,
  type DynamicsBucket,
  type DynamicsGranularity,
  type DynamicsMetric,
} from '../../utils/analyticsCharts';

interface AnalyticsDynamicsPanelProps {
  joints: WeldJoint[];
  lines: ProjectLineItem[];
  docByLineId?: Record<string, ExecutiveDocStatusLike>;
  onClickRepairsShortcut?: () => void;
  onClickExecDocsShortcut?: () => void;
}

const FUNNEL_BAR_COLORS: Record<string, string> = {
  slate: 'bg-slate-400',
  navy: 'bg-[#1e3799]',
  sky: 'bg-sky-600',
  indigo: 'bg-indigo-600',
  emerald: 'bg-emerald-600',
};

const FUNNEL_TEXT_COLORS: Record<string, string> = {
  slate: 'text-slate-700',
  navy: 'text-[#1e3799]',
  sky: 'text-sky-700',
  indigo: 'text-indigo-700',
  emerald: 'text-emerald-700',
};

export const AnalyticsDynamicsPanel: React.FC<AnalyticsDynamicsPanelProps> = ({
  joints,
  lines,
  docByLineId,
  onClickRepairsShortcut,
  onClickExecDocsShortcut,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [granularity, setGranularity] = useState<DynamicsGranularity>('day');
  const [metric, setMetric] = useState<DynamicsMetric>('joints');
  const [showSCurve, setShowSCurve] = useState<boolean>(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const dynamics = useMemo(
    () => buildWeldingDynamicsSeries(joints, granularity),
    [joints, granularity]
  );

  const funnel = useMemo(
    () => buildControlFunnelData(joints, lines, docByLineId),
    [joints, lines, docByLineId]
  );

  // Ограничиваем видимое окно до 42 последних периодов для читаемости столбцов
  const visibleBuckets: DynamicsBucket[] = useMemo(() => {
    if (dynamics.buckets.length <= 42) return dynamics.buckets;
    return dynamics.buckets.slice(-42);
  }, [dynamics.buckets]);

  const chartStats = useMemo(() => {
    const maxBar = visibleBuckets.reduce((m, b) => {
      const v = metric === 'joints' ? b.weldedJoints : b.weldedEdi;
      return v > m ? v : m;
    }, 0);
    const maxCum = visibleBuckets.reduce((m, b) => {
      const v = metric === 'joints' ? b.cumWeldedJoints : b.cumWeldedEdi;
      return v > m ? v : m;
    }, 0);
    return {
      maxBar: maxBar > 0 ? maxBar : 1,
      maxCum: maxCum > 0 ? maxCum : 1,
    };
  }, [visibleBuckets, metric]);

  const hoveredBucket =
    hoveredIdx !== null && hoveredIdx >= 0 && hoveredIdx < visibleBuckets.length
      ? visibleBuckets[hoveredIdx]
      : null;

  // Геометрия SVG-графика
  const svgWidth = 640;
  const svgHeight = 200;
  const padLeft = 40;
  const padRight = showSCurve ? 46 : 16;
  const padTop = 14;
  const padBottom = 30;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const stepX = visibleBuckets.length > 0 ? plotW / visibleBuckets.length : plotW;
  const barWidth = Math.max(4, Math.min(28, stepX * 0.62));

  const cumWeldedPoints = useMemo(() => {
    if (visibleBuckets.length === 0) return '';
    return visibleBuckets
      .map((b, i) => {
        const cx = padLeft + i * stepX + stepX / 2;
        const val = metric === 'joints' ? b.cumWeldedJoints : b.cumWeldedEdi;
        const cy = padTop + plotH - (val / chartStats.maxCum) * plotH;
        return `${cx.toFixed(1)},${cy.toFixed(1)}`;
      })
      .join(' ');
  }, [visibleBuckets, stepX, metric, chartStats.maxCum, padLeft, padTop, plotH]);

  const cumAcceptedPoints = useMemo(() => {
    if (visibleBuckets.length === 0) return '';
    return visibleBuckets
      .map((b, i) => {
        const cx = padLeft + i * stepX + stepX / 2;
        const val = metric === 'joints' ? b.cumAcceptedJoints : b.cumAcceptedEdi;
        const cy = padTop + plotH - (val / chartStats.maxCum) * plotH;
        return `${cx.toFixed(1)},${cy.toFixed(1)}`;
      })
      .join(' ');
  }, [visibleBuckets, stepX, metric, chartStats.maxCum, padLeft, padTop, plotH]);

  const labelStep = Math.max(1, Math.ceil(visibleBuckets.length / 8));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
      <div className="px-3.5 py-2 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 hover:text-[#1e3799] transition-colors cursor-pointer"
        >
          <TrendingUp className="w-4 h-4 text-[#1e3799]" />
          <span>Динамика сварки и воронка контроля</span>
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {!collapsed && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center p-0.5 bg-slate-100 rounded border border-slate-200">
              <button
                type="button"
                onClick={() => setGranularity('day')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  granularity === 'day'
                    ? 'bg-white text-[#1e3799] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                По дням
              </button>
              <button
                type="button"
                onClick={() => setGranularity('week')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  granularity === 'week'
                    ? 'bg-white text-[#1e3799] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                По неделям
              </button>
            </div>

            <div className="flex items-center p-0.5 bg-slate-100 rounded border border-slate-200">
              <button
                type="button"
                onClick={() => setMetric('joints')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  metric === 'joints'
                    ? 'bg-white text-[#1e3799] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Стыки
              </button>
              <button
                type="button"
                onClick={() => setMetric('edi')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                  metric === 'edi'
                    ? 'bg-white text-[#1e3799] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Эквив. дюймы EDI
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowSCurve((v) => !v)}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
                showSCurve
                  ? 'bg-sky-50 border-sky-300 text-[#1e3799]'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              S-кривая
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="p-3.5 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Левая колонка: Темпы сварки и S-кривая */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#1e3799]/80 inline-block" />
                  Сварено за период
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                  Принято
                </span>
                {showSCurve && (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className="w-3 h-0.5 bg-sky-600 inline-block" />
                      Накоп. сварка
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      <span className="w-3 h-0.5 bg-emerald-600 border-b border-dashed border-emerald-700 inline-block" />
                      Накоп. принято
                    </span>
                  </>
                )}
              </div>

              <div className="text-[11px] text-slate-500 font-medium">
                {dynamics.activePeriodsCount > 0 ? (
                  <span>
                    Средний темп:{' '}
                    <strong className="text-slate-800">
                      {metric === 'joints'
                        ? `${dynamics.avgJointsPerPeriod} шт.`
                        : `${dynamics.avgEdiPerPeriod} EDI`}
                    </strong>{' '}
                    / {granularity === 'day' ? 'день' : 'нед.'}
                    {dynamics.peakJointsCount > 0 && (
                      <>
                        {' · '}Пик:{' '}
                        <strong className="text-[#1e3799]">
                          {metric === 'joints'
                            ? `${dynamics.peakJointsCount} шт.`
                            : `${dynamics.peakEdiValue} EDI`}
                        </strong>
                      </>
                    )}
                  </span>
                ) : (
                  <span>Нет сваренных стыков с датой сварки</span>
                )}
              </div>
            </div>

            {visibleBuckets.length === 0 ? (
              <div className="h-[200px] rounded-lg border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center text-slate-400 text-xs gap-1.5">
                <BarChart3 className="w-6 h-6 text-slate-300" />
                <span>Недостаточно данных с заполненной датой сварки и клеймом</span>
              </div>
            ) : (
              <div className="relative rounded-lg border border-slate-100 bg-slate-50/40 p-1.5">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-[200px] select-none overflow-visible"
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {/* Горизонтальные линии сетки */}
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                    const y = padTop + plotH - ratio * plotH;
                    const leftVal = Math.round(chartStats.maxBar * ratio * 10) / 10;
                    const rightVal = Math.round(chartStats.maxCum * ratio * 10) / 10;
                    return (
                      <g key={ratio}>
                        <line
                          x1={padLeft}
                          y1={y}
                          x2={padLeft + plotW}
                          y2={y}
                          stroke="#e2e8f0"
                          strokeDasharray={ratio === 0 ? undefined : '2 3'}
                          strokeWidth="1"
                        />
                        <text
                          x={padLeft - 6}
                          y={y + 3}
                          textAnchor="end"
                          className="fill-slate-400 text-[9px] font-medium"
                        >
                          {metric === 'joints' ? Math.round(leftVal) : leftVal}
                        </text>
                        {showSCurve && (
                          <text
                            x={padLeft + plotW + 6}
                            y={y + 3}
                            textAnchor="start"
                            className="fill-sky-600/80 text-[9px] font-medium"
                          >
                            {metric === 'joints' ? Math.round(rightVal) : rightVal}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Столбцы выработки */}
                  {visibleBuckets.map((b, i) => {
                    const valWelded = metric === 'joints' ? b.weldedJoints : b.weldedEdi;
                    const valAccepted = metric === 'joints' ? b.acceptedJoints : b.acceptedEdi;
                    const hWelded = (valWelded / chartStats.maxBar) * plotH;
                    const hAccepted = (valAccepted / chartStats.maxBar) * plotH;
                    const cx = padLeft + i * stepX + stepX / 2;
                    const x = cx - barWidth / 2;
                    const isHovered = hoveredIdx === i;

                    return (
                      <g
                        key={b.periodKey}
                        onMouseEnter={() => setHoveredIdx(i)}
                        className="cursor-pointer"
                      >
                        {/* Невидимая зона наведения на всю ширину шага */}
                        <rect
                          x={padLeft + i * stepX}
                          y={padTop}
                          width={stepX}
                          height={plotH}
                          fill={isHovered ? 'rgba(30,55,153,0.06)' : 'transparent'}
                        />
                        {/* Сварено */}
                        <rect
                          x={x}
                          y={padTop + plotH - hWelded}
                          width={barWidth}
                          height={Math.max(1, hWelded)}
                          rx="2"
                          fill={isHovered ? '#15276e' : '#1e3799'}
                          fillOpacity={isHovered ? 0.95 : 0.78}
                        />
                        {/* Принято поверх столбика */}
                        {hAccepted > 0 && (
                          <rect
                            x={x}
                            y={padTop + plotH - hAccepted}
                            width={barWidth}
                            height={Math.max(1, hAccepted)}
                            rx="2"
                            fill="#10b981"
                            fillOpacity={isHovered ? 0.98 : 0.85}
                          />
                        )}
                        {/* Подпись оси X */}
                        {(i % labelStep === 0 || i === visibleBuckets.length - 1) && (
                          <text
                            x={cx}
                            y={svgHeight - 8}
                            textAnchor="middle"
                            className="fill-slate-500 text-[9px] font-medium"
                          >
                            {b.label}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Накопительные S-кривые */}
                  {showSCurve && visibleBuckets.length > 1 && (
                    <>
                      <polyline
                        fill="none"
                        stroke="#0284c7"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        points={cumWeldedPoints}
                        className="pointer-events-none"
                      />
                      <polyline
                        fill="none"
                        stroke="#059669"
                        strokeWidth="1.75"
                        strokeDasharray="4 2"
                        strokeLinejoin="round"
                        points={cumAcceptedPoints}
                        className="pointer-events-none"
                      />
                    </>
                  )}

                  {/* Активная точка S-кривой при наведении */}
                  {showSCurve && hoveredBucket && hoveredIdx !== null && (
                    <>
                      <circle
                        cx={padLeft + hoveredIdx * stepX + stepX / 2}
                        cy={
                          padTop +
                          plotH -
                          ((metric === 'joints'
                            ? hoveredBucket.cumWeldedJoints
                            : hoveredBucket.cumWeldedEdi) /
                            chartStats.maxCum) *
                            plotH
                        }
                        r="3.5"
                        fill="#0284c7"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                        className="pointer-events-none"
                      />
                      <circle
                        cx={padLeft + hoveredIdx * stepX + stepX / 2}
                        cy={
                          padTop +
                          plotH -
                          ((metric === 'joints'
                            ? hoveredBucket.cumAcceptedJoints
                            : hoveredBucket.cumAcceptedEdi) /
                            chartStats.maxCum) *
                            plotH
                        }
                        r="3.5"
                        fill="#059669"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                        className="pointer-events-none"
                      />
                    </>
                  )}
                </svg>

                {/* Информационная строка под графиком для выбранного столбца */}
                <div className="mt-1 px-2 py-1 rounded bg-white border border-slate-200/80 text-[11px] flex flex-wrap items-center justify-between gap-2 min-h-[26px]">
                  {hoveredBucket ? (
                    <>
                      <span className="font-bold text-slate-800">{hoveredBucket.fullLabel}</span>
                      <div className="flex flex-wrap items-center gap-3 text-slate-600">
                        <span>
                          Сварено:{' '}
                          <strong className="text-[#1e3799]">
                            {hoveredBucket.weldedJoints} шт.
                          </strong>{' '}
                          / {hoveredBucket.weldedEdi} EDI
                        </span>
                        <span>
                          Принято:{' '}
                          <strong className="text-emerald-700">
                            {hoveredBucket.acceptedJoints} шт.
                          </strong>
                        </span>
                        {hoveredBucket.repairJoints > 0 && (
                          <span className="text-rose-700 font-semibold">
                            Ремонт: {hoveredBucket.repairJoints}
                          </span>
                        )}
                        <span className="text-sky-700 font-semibold">
                          Накоп.: {hoveredBucket.cumWeldedJoints} шт. / {hoveredBucket.cumWeldedEdi} EDI
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-500">
                      Наведите курсор на столбец для детализации по {granularity === 'day' ? 'дню' : 'неделе'}.
                      {dynamics.buckets.length > 42 &&
                        ` Показаны последние 42 из ${dynamics.buckets.length} периодов.`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Правая колонка: Воронка этапов и узкие места */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-3 lg:border-l lg:border-slate-100 lg:pl-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#1e3799]" />
                  Воронка готовности стыков
                </span>
                {funnel.ndtNotRequiredCount > 0 && (
                  <span className="text-[10px] text-slate-500">
                    Без НК по проекту: {funnel.ndtNotRequiredCount}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                {funnel.stages.map((st) => (
                  <div key={st.id} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-700">{st.label}</span>
                      <span className={`font-bold tabular-nums ${FUNNEL_TEXT_COLORS[st.tone]}`}>
                        {st.count} · {st.pct}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${FUNNEL_BAR_COLORS[st.tone]}`}
                        style={{ width: `${Math.min(100, st.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Прогресс ИД по линиям */}
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={onClickExecDocsShortcut}
                  className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-[#1e3799] transition-colors cursor-pointer"
                >
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Подписанная ИД по линиям</span>
                </button>
                <span className="font-bold text-emerald-700 tabular-nums">
                  {funnel.signedIdLinesCount} / {funnel.totalLinesCount} · {funnel.idReadinessPct}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                  style={{ width: `${Math.min(100, funnel.idReadinessPct)}%` }}
                />
              </div>
            </div>

            {/* Сводка «узких мест» */}
            <div className="pt-2 border-t border-slate-100">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Узкие места и незакрытые этапы
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-1.5 text-[11px]">
                <div className="px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <span className="text-slate-600">Ждут сварки</span>
                  <strong className="text-slate-900 tabular-nums">{funnel.unweldedCount}</strong>
                </div>
                <div className="px-2 py-1.5 rounded-lg bg-sky-50/70 border border-sky-200/80 flex items-center justify-between">
                  <span className="text-sky-800">Ждут НК</span>
                  <strong className="text-sky-900 tabular-nums">{funnel.awaitingNdtCount}</strong>
                </div>
                <button
                  type="button"
                  disabled={funnel.inRepairCount === 0}
                  onClick={onClickRepairsShortcut}
                  className={`px-2 py-1.5 rounded-lg border flex items-center justify-between text-left transition-colors ${
                    funnel.inRepairCount > 0
                      ? 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100 cursor-pointer'
                      : 'bg-slate-50 border-slate-200 text-slate-400 cursor-default'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {funnel.inRepairCount > 0 && <AlertTriangle className="w-3 h-3" />}
                    В ремонте
                  </span>
                  <strong className="tabular-nums">{funnel.inRepairCount}</strong>
                </button>
                <button
                  type="button"
                  disabled={funnel.pendingIdLinesCount === 0}
                  onClick={onClickExecDocsShortcut}
                  className={`px-2 py-1.5 rounded-lg border flex items-center justify-between text-left transition-colors ${
                    funnel.pendingIdLinesCount > 0
                      ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100 cursor-pointer'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800 cursor-default'
                  }`}
                >
                  <span>ИД в работе</span>
                  <strong className="tabular-nums">{funnel.pendingIdLinesCount} л.</strong>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
