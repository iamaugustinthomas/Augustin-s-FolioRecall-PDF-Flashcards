import React, { useMemo, useState } from 'react';
import type { Deck, Flashcard, ForgettingCurvePoint } from '../types/flashcard';
import {
  addDays,
  buildReverseEngineeredSchedule,
  diffDays,
  formatShortDate,
  formatWeekdayShortDate,
  getLocalDateString,
} from '../lib/spacedRepetition';
import { MetricTooltip } from './MetricTooltip';

interface ExamPlannerViewProps {
  decks: Deck[];
  cards: Flashcard[];
  selectedDeckId: string | null;
  onSelectDeck: (deckId: string) => void;
  onUpdateDeckExamSettings: (
    deckId: string,
    examDate: string | null,
    targetRetention: number
  ) => Promise<void>;
  onStartStudy: (deckId: string, mode: 'due' | 'cram') => void;
}

export const ExamPlannerView: React.FC<ExamPlannerViewProps> = ({
  decks,
  cards,
  selectedDeckId,
  onSelectDeck,
  onUpdateDeckExamSettings,
  onStartStudy,
}) => {
  const activeDeck = useMemo(
    () => decks.find((d) => d.id === selectedDeckId) ?? decks[0] ?? null,
    [decks, selectedDeckId]
  );

  const todayStr = getLocalDateString();
  const defaultFutureDate = addDays(todayStr, 14);
  const [hoveredDay, setHoveredDay] = useState<ForgettingCurvePoint | null>(null);
  const targetPct = Math.round((activeDeck?.targetRetention ?? 0.9) * 100);

  const deckCards = useMemo(
    () => (activeDeck ? cards.filter((c) => c.deckId === activeDeck.id) : []),
    [cards, activeDeck]
  );

  const effectiveExamDate = activeDeck?.examDate || defaultFutureDate;
  const effectiveRetention = activeDeck?.targetRetention ?? 0.9;

  const plan = useMemo(() => {
    if (!activeDeck || deckCards.length === 0) return null;
    return buildReverseEngineeredSchedule(
      deckCards,
      effectiveExamDate,
      effectiveRetention,
      todayStr
    );
  }, [activeDeck, deckCards, effectiveExamDate, effectiveRetention, todayStr]);

  if (!activeDeck) {
    return (
      <div className="max-w-md mx-auto paper-sheet rounded-lg p-10 text-center space-y-3">
        <h1 className="font-serif-display text-2xl font-semibold text-[#1F1A14]">No decks yet</h1>
        <p className="text-sm text-[#564D40]">
          Add a PDF first to plan your spaced repetition schedule.
        </p>
      </div>
    );
  }

  const daysRemaining = diffDays(effectiveExamDate, todayStr);

  const chartW = 760;
  const chartH = 240;
  const padL = 44;
  const padR = 20;
  const padT = 18;
  const padB = 30;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const points = plan?.curve ?? [];
  const maxIdx = Math.max(1, points.length - 1);

  const toX = (idx: number) => padL + (idx / maxIdx) * plotW;
  const toY = (pct: number) => padT + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;

  const scheduledPath = points
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${toX(pt.dayIndex).toFixed(1)} ${toY(pt.scheduledRetention).toFixed(1)}`
    )
    .join(' ');

  const areaPath =
    points.length > 1
      ? `${scheduledPath} L ${toX(points[points.length - 1].dayIndex).toFixed(1)} ${(
          padT + plotH
        ).toFixed(1)} L ${toX(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
      : '';

  const unreviewedPath = points
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${toX(pt.dayIndex).toFixed(1)} ${toY(pt.unreviewedRetention).toFixed(1)}`
    )
    .join(' ');

  return (
    <div className="space-y-8">
      {/* Header & Tactile Controls */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="font-serif-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#1F1A14] drop-shadow-[0_1px_0_rgba(255,255,255,0.85)]">
            Exam Schedule
          </h1>
          <p className="text-sm text-[#564D40]">
            Reverse-engineered daily spaced repetition leading to your exam date.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Select deck"
            value={activeDeck.id}
            onChange={(e) => onSelectDeck(e.target.value)}
            className="px-3.5 py-2 text-sm font-semibold rounded-md btn-ivory-tactile focus:outline-none cursor-pointer"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>

          <input
            aria-label="Target exam date"
            type="date"
            min={todayStr}
            value={activeDeck.examDate ?? effectiveExamDate}
            onChange={(e) =>
              void onUpdateDeckExamSettings(
                activeDeck.id,
                e.target.value || null,
                effectiveRetention
              )
            }
            className="px-3.5 py-2 text-sm rounded-md recessed-input tabular-nums text-[#1F1A14] focus:outline-none cursor-pointer"
          />

          <select
            aria-label="Target retention"
            value={String(effectiveRetention)}
            onChange={(e) =>
              void onUpdateDeckExamSettings(
                activeDeck.id,
                activeDeck.examDate ?? effectiveExamDate,
                Number(e.target.value)
              )
            }
            className="px-3.5 py-2 text-sm font-semibold rounded-md btn-ivory-tactile tabular-nums focus:outline-none cursor-pointer"
          >
            <option value="0.85">85% Goal</option>
            <option value="0.9">90% Goal</option>
            <option value="0.95">95% Goal</option>
          </select>
        </div>
      </section>

      {!activeDeck.examDate && (
        <div className="paper-sheet rounded-lg px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-[#564D40]">
            Previewing a 14-day schedule for {formatShortDate(defaultFutureDate)}.
          </p>
          <button
            type="button"
            onClick={() =>
              void onUpdateDeckExamSettings(
                activeDeck.id,
                defaultFutureDate,
                effectiveRetention
              )
            }
            className="px-4 py-1.5 text-xs font-semibold rounded-md btn-primary-tactile whitespace-nowrap cursor-pointer"
          >
            Lock {formatShortDate(defaultFutureDate)}
          </button>
        </div>
      )}

      {deckCards.length === 0 || !plan ? (
        <div className="paper-sheet rounded-lg p-8 text-center text-sm text-[#564D40]">
          Add cards to <strong>{activeDeck.title}</strong> to compute its exam schedule.
        </div>
      ) : (
        <>
          {/* Framed Engineering Graph Paper Retention Chart */}
          <section className="paper-sheet rounded-lg p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-[#E3DDD0]">
              <div className="space-y-1">
                <p className="font-mono text-xs font-medium text-[#6B6153] tabular-nums">
                  {daysRemaining >= 0
                    ? `${daysRemaining} days until ${formatShortDate(effectiveExamDate)}`
                    : formatShortDate(effectiveExamDate)}
                </p>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <MetricTooltip
                    align="left"
                    placement="bottom"
                    title="Projected Exam-Day Recall"
                    meaning={`Estimated share of cards in this deck you will still recall on ${formatShortDate(
                      effectiveExamDate
                    )} if you follow the daily review schedule below.`}
                    detail={`Modeled via Ebbinghaus decay R(t) = 0.9^(t/S) · Goal: ${targetPct}%`}
                  >
                    <span className="font-mono text-4xl font-semibold text-[#166534] tabular-nums">
                      {plan.examDayProjectedRetention}%
                    </span>
                  </MetricTooltip>
                  <span className="text-sm text-[#564D40] tabular-nums">
                    projected recall · vs.{' '}
                    <MetricTooltip
                      align="left"
                      placement="bottom"
                      title="Unreviewed Decay Baseline"
                      meaning={`Estimated share of cards you would still remember on ${formatShortDate(
                        effectiveExamDate
                      )} if you stopped doing spaced reviews after today.`}
                      detail={`+${Math.max(
                        0,
                        plan.examDayProjectedRetention - plan.unreviewedExamRetention
                      )}% recall saved by spaced reviews`}
                    >
                      <span className="text-[#B91C1C] font-medium">
                        {plan.unreviewedExamRetention}%
                      </span>
                    </MetricTooltip>{' '}
                    unreviewed
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onStartStudy(activeDeck.id, 'due')}
                className="px-5 py-2 text-xs font-semibold rounded-md btn-primary-tactile transition-all self-start sm:self-auto cursor-pointer tabular-nums"
              >
                Study Today&apos;s {plan.schedule[0]?.totalCards ?? 0} Cards
              </button>
            </div>

            <div className="recessed-well rounded-md p-3 bg-[#F6F3EA] space-y-2.5">
              {/* Chart Legend with Hover Meaning */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-[#564D40]">
                <div className="flex flex-wrap items-center gap-4">
                  <MetricTooltip
                    align="left"
                    placement="bottom"
                    title="With Review Schedule (Blue Line)"
                    meaning="Percentage of the deck expected to stay in memory at the end of each day when you complete the scheduled reviews."
                    detail={`Target threshold: ${targetPct}% retention`}
                  >
                    <span className="inline-flex items-center gap-2 font-medium text-[#1F1A14]">
                      <span className="w-3.5 h-0.5 bg-[#194BB8] inline-block rounded-full" />
                      Scheduled Recall %
                    </span>
                  </MetricTooltip>

                  <MetricTooltip
                    align="left"
                    placement="bottom"
                    title="Without Further Reviews (Dashed Red Line)"
                    meaning="Natural Ebbinghaus forgetting curve showing what percentage of cards you would recall if you stopped reviewing today."
                    detail="Calculated from each card's current stability S"
                  >
                    <span className="inline-flex items-center gap-2 font-medium text-[#1F1A14]">
                      <span className="w-3.5 border-t-2 border-dashed border-[#B91C1C] inline-block" />
                      Unreviewed Decay %
                    </span>
                  </MetricTooltip>
                </div>

                <span className="font-mono text-[11px] text-[#6B6153]">
                  Hover any day on the chart to inspect exact recall %
                </span>
              </div>

              <div className="relative bg-[#FFFCF4] border border-[#C6BEB0] rounded-sm p-2">
                {hoveredDay &&
                  (() => {
                    const hoveredRow = plan.schedule[hoveredDay.dayIndex];
                    const xPct = (toX(hoveredDay.dayIndex) / chartW) * 100;
                    const clampedLeft = Math.max(16, Math.min(84, xPct));
                    const delta =
                      hoveredDay.scheduledRetention - hoveredDay.unreviewedRetention;

                    return (
                      <div
                        style={{ left: `${clampedLeft}%` }}
                        className="pointer-events-none hidden sm:block absolute top-3 -translate-x-1/2 z-30 w-64 rounded-lg bg-[#2B221A] text-[#FAF7EE] border border-[#4E4135] px-3.5 py-2.5 shadow-[0_12px_28px_-6px_rgba(20,14,8,0.5)]"
                      >
                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#45392E]">
                          <span className="font-sans text-xs font-semibold text-[#FFFDF8]">
                            {hoveredDay.dayIndex === 0
                              ? 'Today'
                              : formatWeekdayShortDate(hoveredDay.date)}
                          </span>
                          <span className="font-mono text-[10px] text-[#BFB4A2] tabular-nums">
                            {hoveredRow?.isExamDay
                              ? 'Exam Day'
                              : `${hoveredRow?.totalCards ?? 0} ${
                                  hoveredRow?.totalCards === 1 ? 'card' : 'cards'
                                } due`}
                          </span>
                        </div>

                        <div className="mt-2 space-y-1.5 text-[11px] tabular-nums">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[#E3DACB]">With schedule:</span>
                            <span className="font-mono font-semibold text-[#93C5FD]">
                              {hoveredDay.scheduledRetention}% recalled
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[#E3DACB]">Without reviews:</span>
                            <span className="font-mono font-semibold text-[#FCA5A5]">
                              {hoveredDay.unreviewedRetention}% recalled
                            </span>
                          </div>
                          <p className="font-sans text-[10px] leading-snug text-[#BFB4A2] pt-1 border-t border-[#45392E]">
                            {delta >= 0
                              ? `Spaced reviews preserve +${delta}% more of this deck by this date.`
                              : 'Projected average recall across all cards on this date.'}
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                <div className="w-full overflow-x-auto">
                  <svg
                    viewBox={`0 0 ${chartW} ${chartH}`}
                    className="w-full min-w-[520px] h-auto select-none"
                    role="img"
                    aria-label="Forgetting curve and scheduled retention chart"
                  >
                    <defs>
                      <linearGradient id="retentionArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#194BB8" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#194BB8" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>

                    {/* Vintage engineering graph grid */}
                    {[0, 25, 50, 75, 100].map((tick) => {
                      const y = toY(tick);
                      return (
                        <g key={tick}>
                          <line
                            x1={padL}
                            y1={y}
                            x2={chartW - padR}
                            y2={y}
                            stroke={tick === 0 ? '#7A6F5E' : '#DCE7E5'}
                            strokeWidth={tick === 0 ? 1.2 : 1}
                          />
                          <text
                            x={padL - 8}
                            y={y + 4}
                            textAnchor="end"
                            className="fill-[#6B6153] text-[10px] font-mono"
                          >
                            {tick}%
                          </text>
                        </g>
                      );
                    })}

                    {/* Target Retention Goal Reference Line */}
                    <line
                      x1={padL}
                      y1={toY(targetPct)}
                      x2={chartW - padR}
                      y2={toY(targetPct)}
                      stroke="#166534"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      opacity={0.45}
                    />

                    <line
                      x1={padL}
                      y1={padT}
                      x2={padL}
                      y2={padT + plotH}
                      stroke="#7A6F5E"
                      strokeWidth={1.2}
                    />

                    {areaPath && <path d={areaPath} fill="url(#retentionArea)" />}

                    {unreviewedPath && (
                      <path
                        d={unreviewedPath}
                        fill="none"
                        stroke="#B91C1C"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        opacity={0.7}
                      />
                    )}

                    {scheduledPath && (
                      <path
                        d={scheduledPath}
                        fill="none"
                        stroke="#194BB8"
                        strokeWidth={2.5}
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Vertical Hover Crosshair */}
                    {hoveredDay && (
                      <line
                        x1={toX(hoveredDay.dayIndex)}
                        y1={padT}
                        x2={toX(hoveredDay.dayIndex)}
                        y2={padT + plotH}
                        stroke="#5B5245"
                        strokeWidth={1}
                        strokeDasharray="2 2"
                      />
                    )}

                    {points.map((pt) => {
                      const cx = toX(pt.dayIndex);
                      const cy = toY(pt.scheduledRetention);
                      const uCy = toY(pt.unreviewedRetention);
                      const isHovered = hoveredDay?.dayIndex === pt.dayIndex;
                      return (
                        <g
                          key={pt.dayIndex}
                          onMouseEnter={() => setHoveredDay(pt)}
                          onMouseLeave={() => setHoveredDay(null)}
                          className="cursor-pointer"
                        >
                          <rect
                            x={cx - Math.max(8, plotW / (points.length * 2))}
                            y={padT}
                            width={Math.max(16, plotW / points.length)}
                            height={plotH}
                            fill="transparent"
                          />
                          {(pt.hasReviewEvent || isHovered) && (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isHovered ? 5.5 : 3.5}
                              fill="#194BB8"
                              stroke="#fffcf4"
                              strokeWidth={1.5}
                            />
                          )}
                          {isHovered && (
                            <circle
                              cx={cx}
                              cy={uCy}
                              r={4.5}
                              fill="#B91C1C"
                              stroke="#fffcf4"
                              strokeWidth={1.5}
                            />
                          )}
                          {pt.dayIndex === points.length - 1 && (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={isHovered ? 6 : 5}
                              fill="#166534"
                              stroke="#fffcf4"
                              strokeWidth={1.5}
                            />
                          )}
                        </g>
                      );
                    })}

                    {points.length > 0 && (
                      <>
                        <text
                          x={toX(0)}
                          y={chartH - 8}
                          textAnchor="start"
                          className="fill-[#5B5245] text-[10px] font-mono"
                        >
                          Today
                        </text>
                        <text
                          x={toX(points.length - 1)}
                          y={chartH - 8}
                          textAnchor="end"
                          className="fill-[#166534] text-[10px] font-mono font-semibold"
                        >
                          Exam ({formatShortDate(points[points.length - 1].date)})
                        </text>
                      </>
                    )}
                  </svg>
                </div>
              </div>
            </div>

            {hoveredDay && (
              <div className="sm:hidden rounded-md bg-[#2B221A] text-[#FAF7EE] px-3.5 py-2.5 text-xs space-y-1 tabular-nums">
                <p className="font-semibold">
                  {hoveredDay.dayIndex === 0 ? 'Today' : formatWeekdayShortDate(hoveredDay.date)}
                </p>
                <p className="text-[#E3DACB]">
                  Scheduled Recall:{' '}
                  <span className="font-mono font-semibold text-[#93C5FD]">
                    {hoveredDay.scheduledRetention}%
                  </span>{' '}
                  · Without Reviews:{' '}
                  <span className="font-mono font-semibold text-[#FCA5A5]">
                    {hoveredDay.unreviewedRetention}%
                  </span>
                </p>
              </div>
            )}
          </section>

          {/* Bound Daily Schedule Ledger */}
          <section className="space-y-3">
            <h2 className="font-serif-display text-xl font-semibold text-[#1F1A14]">
              Daily Review Ledger
            </h2>
            <div className="paper-sheet rounded-lg divide-y divide-[#E4DFD2]">
              {plan.schedule.map((row) => (
                <div
                  key={row.date}
                  className={`px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-sm ${
                    row.isToday ? 'bg-[#194BB8]/[0.06]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-[180px]">
                    <span className="font-semibold text-[#1F1A14] tabular-nums">
                      {row.isToday ? 'Today' : formatWeekdayShortDate(row.date)}
                    </span>
                    <span className="text-xs text-[#6B6153]">{row.phaseLabel}</span>
                  </div>

                  <div className="flex items-center gap-6 font-mono text-xs tabular-nums">
                    <span className="text-[#5B5245]">
                      {row.isExamDay
                        ? 'Exam'
                        : `${row.totalCards} ${row.totalCards === 1 ? 'card' : 'cards'}`}
                    </span>
                    <MetricTooltip
                      align="right"
                      placement="top"
                      title={
                        row.isExamDay
                          ? 'Exam-Day Projected Recall'
                          : 'Projected End-of-Day Recall'
                      }
                      meaning={
                        row.isExamDay
                          ? `Estimated share of all cards you will recall on Exam Day (${formatShortDate(
                              row.date
                            )}) after completing this schedule.`
                          : `Estimated share of the deck retained in memory at the end of ${formatShortDate(
                              row.date
                            )} after reviewing ${row.totalCards} ${
                              row.totalCards === 1 ? 'card' : 'cards'
                            }.`
                      }
                      detail={`Projected: ${row.projectedRetention}% · Goal: ${targetPct}% (${
                        row.projectedRetention >= targetPct ? 'Meets target' : 'Building up'
                      })`}
                    >
                      <span
                        className={`font-semibold min-w-[2.75rem] text-right ${
                          row.projectedRetention >= targetPct
                            ? 'text-[#166534]'
                            : 'text-[#174BB8]'
                        }`}
                      >
                        {row.projectedRetention}%
                      </span>
                    </MetricTooltip>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};
