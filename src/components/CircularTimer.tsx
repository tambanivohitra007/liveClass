interface CircularTimerProps {
  timeLeft: number;
  totalTime: number;
}

export default function CircularTimer({ timeLeft, totalTime }: CircularTimerProps) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = totalTime > 0 ? timeLeft / totalTime : 0;
  const strokeDashoffset = circumference * (1 - progress);
  const isUrgent = timeLeft <= 5;

  return (
    <div className={`relative w-20 h-20 ${isUrgent ? 'animate-timer-pulse' : ''}`}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
        {/* Background circle */}
        <circle
          cx="40" cy="40" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="6"
        />
        {/* Progress circle */}
        <circle
          cx="40" cy="40" r={radius}
          fill="none"
          stroke={isUrgent ? '#E8636B' : '#FF7F11'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-2xl font-black ${isUrgent ? 'text-danger' : 'text-white'}`}>
          {timeLeft}
        </span>
      </div>
    </div>
  );
}
