import React, { useState } from 'react';

export function MonthlyTrendChart({
  labels,
  rates,
  absences,
}: {
  labels: string[];
  rates: number[];
  absences: number[];
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!labels.length) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-gray-500">
        No attendance data yet.
      </div>
    );
  }

  const width = 760;
  const height = 210;
  const pad = { top: 18, right: 44, bottom: 30, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const rawMaxAbs = Math.max(5, ...absences);
  const maxAbs = Math.max(10, Math.ceil((rawMaxAbs * 1.35) / 5) * 5);
  const stepX = labels.length > 1 ? plotW / labels.length : plotW;

  const points = labels.map((_, i) => {
    const x = pad.left + stepX * i + stepX / 2;
    const yRate = pad.top + plotH * (1 - Math.min(100, Math.max(0, rates[i])) / 100);
    const barH = (absences[i] / maxAbs) * plotH;
    const yBar = pad.top + plotH - barH;
    return { x, yRate, yBar, barH };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yRate.toFixed(1)}`)
    .join(' ');

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Monthly attendance rate and absence count chart"
      >
        {yTicks.map((t) => {
          const y = pad.top + plotH * (1 - t / 100);
          return (
            <g key={t}>
              <line
                x1={pad.left}
                y1={y}
                x2={width - pad.right}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="#6b7280"
              >
                {t}%
              </text>
            </g>
          );
        })}

        <text
          x={width - pad.right + 8}
          y={pad.top + 4}
          fontSize="11"
          fill="#6b7280"
        >
          {maxAbs}
        </text>
        <text
          x={width - pad.right + 8}
          y={pad.top + plotH + 4}
          fontSize="11"
          fill="#6b7280"
        >
          0
        </text>

        {points.map((p, i) => {
          const barW = Math.min(44, Math.max(16, stepX * 0.4));
          return (
            <g
              key={labels[i]}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={p.x - barW / 2}
                y={p.yBar}
                width={barW}
                height={Math.max(1, p.barH)}
                rx="2"
                fill={hoverIdx === i ? '#fca5a5' : '#fecaca'}
              />
              <text
                x={p.x}
                y={height - 8}
                textAnchor="middle"
                fontSize="11"
                fill="#4b5563"
              >
                {labels[i]}
              </text>
            </g>
          );
        })}

        <path
          d={linePath}
          fill="none"
          stroke="#1d4ed8"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={labels[i]}
            cx={p.x}
            cy={p.yRate}
            r={hoverIdx === i ? 5 : 3.5}
            fill="#1d4ed8"
            stroke="#ffffff"
            strokeWidth="1.5"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          />
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-700" />
            Attendance rate (%)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-200" />
            Absences
          </span>
        </div>
        {hoverIdx !== null && (
          <div className="font-medium text-gray-900 tabular-nums">
            {labels[hoverIdx]}: {rates[hoverIdx].toFixed(2)}% rate · {absences[hoverIdx]} absences
          </div>
        )}
      </div>
    </div>
  );
}

export function DonutBreakdownChart({ values }: { values: number[] }) {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-gray-500">
        No attendance data yet.
      </div>
    );
  }

  const slices = [
    { label: 'Present', value: values[0] || 0, color: '#15803d' },
    { label: 'Late', value: values[1] || 0, color: '#d97706' },
    { label: 'Absent (unexcused)', value: values[2] || 0, color: '#dc2626' },
    { label: 'Excused', value: values[3] || 0, color: '#4f46e5' },
  ];

  const r = 56;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center justify-between gap-4">
      <div className="relative flex items-center justify-center">
        <svg viewBox="0 0 150 150" className="h-40 w-40" role="img" aria-label="Present vs Absent breakdown">
          {slices.map((s) => {
            const len = (s.value / total) * c;
            const dashArray = `${len} ${c - len}`;
            const curOffset = -offset;
            offset += len;
            if (s.value <= 0) return null;
            return (
              <circle
                key={s.label}
                cx="75"
                cy="75"
                r={r}
                fill="transparent"
                stroke={s.color}
                strokeWidth="22"
                strokeDasharray={dashArray}
                strokeDashoffset={curOffset}
                transform="rotate(-90 75 75)"
              />
            );
          })}
          <text
            x="75"
            y="73"
            textAnchor="middle"
            fontSize="16"
            fontWeight="600"
            fill="#111827"
            className="tabular-nums"
          >
            {total}
          </text>
          <text x="75" y="89" textAnchor="middle" fontSize="11" fill="#6b7280">
            Entries
          </text>
        </svg>
      </div>
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-gray-600 truncate">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="font-medium text-gray-900 tabular-nums">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SimpleBarChart({
  labels,
  values,
  color,
  unit = '',
  maxOverride,
}: {
  labels: string[];
  values: number[];
  color: string;
  unit?: string;
  maxOverride?: number;
}) {
  if (!labels.length) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-gray-500">
        No attendance data yet.
      </div>
    );
  }

  const maxVal = maxOverride ?? Math.max(1, ...values);

  return (
    <div className="space-y-3 pt-1">
      {labels.map((label, i) => {
        const val = values[i] ?? 0;
        const pct = Math.min(100, Math.max(0, (val / maxVal) * 100));
        return (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-gray-700">{label}</span>
              <span className="font-medium text-gray-900 tabular-nums">
                {unit === '%' ? `${val.toFixed(1)}%` : val}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-sm bg-gray-100">
              <div
                className="h-full rounded-sm transition-all"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
