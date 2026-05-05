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
    <div
      className={`relative w-16 h-16 sm:w-20 sm:h-20 ${isUrgent ? 'animate-timer-pulse' : ''}`}
      role="timer"
      aria-label={`${timeLeft} seconds remaining`}
      aria-live={isUrgent ? 'assertive' : 'off'}
    >
      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
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
          stroke={isUrgent ? '#EF4444' : '#009EE2'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-xl sm:text-2xl font-black ${isUrgent ? 'text-danger' : 'text-white'}`} aria-hidden="true">
          {timeLeft}
        </span>
      </div>
    </div>
  );
}
