interface BarChartData {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarChartData[];
  maxValue?: number;
  height?: number;
  unit?: string;
}

export default function BarChart({ data, maxValue, height = 200, unit = '%' }: BarChartProps) {
  const max = maxValue ?? Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(24, Math.min(48, (600 - data.length * 8) / data.length));
  const chartWidth = data.length * (barWidth + 8) + 40;
  const paddingTop = 24;
  const paddingBottom = 40;
  const chartHeight = height - paddingTop - paddingBottom;

  const getColor = (value: number) => {
    if (max === 0) return '#94a3b8'; // gray
    const pct = (value / max) * 100;
    if (pct >= 70) return '#22c55e'; // green
    if (pct >= 40) return '#eab308'; // yellow
    return '#ef4444'; // red
  };

  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(chartWidth, 200)} height={height} className="mx-auto">
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = paddingTop + chartHeight * (1 - pct);
          return (
            <g key={pct}>
              <line x1={36} y1={y} x2={chartWidth - 4} y2={y} stroke="#e5e7eb" strokeDasharray="4 2" />
              <text x={32} y={y + 4} textAnchor="end" className="text-[10px] fill-gray-400">
                {Math.round(max * pct)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const barH = max > 0 ? (d.value / max) * chartHeight : 0;
          const x = 40 + i * (barWidth + 8);
          const y = paddingTop + chartHeight - barH;
          const fill = d.color || getColor(d.value);

          return (
            <g key={d.label}>
              <rect x={x} y={y} width={barWidth} height={barH} rx={4} fill={fill} opacity={0.85}>
                <animate attributeName="height" from="0" to={barH} dur="0.4s" fill="freeze" />
                <animate attributeName="y" from={paddingTop + chartHeight} to={y} dur="0.4s" fill="freeze" />
              </rect>
              {/* Value label */}
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                className="text-[11px] font-medium fill-gray-600"
              >
                {d.value}{unit}
              </text>
              {/* X-axis label */}
              <text
                x={x + barWidth / 2}
                y={paddingTop + chartHeight + 16}
                textAnchor="middle"
                className="text-[11px] fill-gray-500"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
