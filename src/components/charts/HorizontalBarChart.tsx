import { Check } from 'lucide-react';

const KAHOOT_COLORS = [
  'bg-answer-red',
  'bg-answer-blue',
  'bg-answer-yellow',
  'bg-answer-green',
];

interface DistributionData {
  label: string;
  count: number;
  isCorrect: boolean;
}

interface HorizontalBarChartProps {
  data: DistributionData[];
  total: number;
}

export default function HorizontalBarChart({ data, total }: HorizontalBarChartProps) {
  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const pct = total > 0 ? (d.count / total) * 100 : 0;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-16 text-xs text-gray-500 truncate text-right flex items-center justify-end gap-1">
              {d.isCorrect && <Check className="w-3 h-3 text-success flex-shrink-0" />}
              {d.label}
            </span>
            <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${KAHOOT_COLORS[i % KAHOOT_COLORS.length]} transition-all duration-500 flex items-center justify-end pr-2`}
                style={{ width: `${Math.max(pct, pct > 0 ? 8 : 0)}%` }}
              >
                {pct > 12 && (
                  <span className="text-[10px] font-bold text-white">{d.count}</span>
                )}
              </div>
            </div>
            <span className="w-10 text-xs text-gray-400 tabular-nums">{pct.toFixed(0)}%</span>
          </div>
        );
      })}
    </div>
  );
}
