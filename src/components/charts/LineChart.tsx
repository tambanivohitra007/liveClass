interface LineChartData {
  label: string;
  value: number;
}

interface LineChartProps {
  data: LineChartData[];
  height?: number;
  color?: string;
  unit?: string;
}

export default function LineChart({ data, height = 180, color = '#6366f1', unit = 's' }: LineChartProps) {
  if (data.length === 0) return null;

  const paddingTop = 24;
  const paddingBottom = 36;
  const paddingLeft = 40;
  const paddingRight = 16;
  const chartWidth = Math.max(data.length * 60 + paddingLeft + paddingRight, 300);
  const chartHeight = height - paddingTop - paddingBottom;

  const max = Math.max(...data.map((d) => d.value), 1);
  const min = 0;
  const range = max - min || 1;

  const getX = (i: number) =>
    paddingLeft + (i / Math.max(data.length - 1, 1)) * (chartWidth - paddingLeft - paddingRight);
  const getY = (v: number) =>
    paddingTop + chartHeight - ((v - min) / range) * chartHeight;

  // Build path
  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.value)}`)
    .join(' ');

  // Area path (line + close to bottom)
  const areaPath =
    linePath +
    ` L ${getX(data.length - 1)} ${paddingTop + chartHeight}` +
    ` L ${getX(0)} ${paddingTop + chartHeight} Z`;

  return (
    <div className="overflow-x-auto">
      <svg width={chartWidth} height={height} className="mx-auto">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = paddingTop + chartHeight * (1 - pct);
          const val = min + range * pct;
          return (
            <g key={pct}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="4 2"
              />
              <text x={paddingLeft - 4} y={y + 4} textAnchor="end" className="text-[10px] fill-gray-400">
                {val.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill={color} opacity={0.08} />

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots & labels */}
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={getX(i)} cy={getY(d.value)} r={4} fill="white" stroke={color} strokeWidth={2} />
            <text
              x={getX(i)}
              y={getY(d.value) - 10}
              textAnchor="middle"
              className="text-[10px] font-medium fill-gray-600"
            >
              {d.value.toFixed(1)}{unit}
            </text>
            <text
              x={getX(i)}
              y={paddingTop + chartHeight + 16}
              textAnchor="middle"
              className="text-[11px] fill-gray-500"
            >
              {d.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
