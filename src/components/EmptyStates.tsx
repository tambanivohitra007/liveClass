export function EmptyQuizzes() {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto">
      {/* Stack of papers */}
      <rect x="35" y="50" width="90" height="70" rx="8" fill="#F3F4F6" stroke="#D1D5DB" strokeWidth="2" />
      <rect x="40" y="45" width="90" height="70" rx="8" fill="#F9FAFB" stroke="#D1D5DB" strokeWidth="2" />
      <rect x="45" y="40" width="90" height="70" rx="8" fill="white" stroke="#D1D5DB" strokeWidth="2" />
      {/* Lines on top paper */}
      <rect x="55" y="52" width="50" height="4" rx="2" fill="#E5E7EB" />
      <rect x="55" y="62" width="65" height="4" rx="2" fill="#E5E7EB" />
      <rect x="55" y="72" width="40" height="4" rx="2" fill="#E5E7EB" />
      {/* Plus icon */}
      <circle cx="115" cy="35" r="18" fill="#D4566B" fillOpacity="0.1" />
      <path d="M115 27v16M107 35h16" stroke="#D4566B" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyCollection() {
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto">
      {/* Folder shape */}
      <path d="M20 45h35l10-12h55a8 8 0 018 8v54a8 8 0 01-8 8H20a8 8 0 01-8-8V53a8 8 0 018-8z" fill="#F3F4F6" stroke="#D1D5DB" strokeWidth="2" />
      {/* Folder tab */}
      <path d="M20 45h35l10-12" stroke="#D1D5DB" strokeWidth="2" fill="none" />
      {/* Dashed outline inside */}
      <rect x="35" y="60" width="70" height="28" rx="4" stroke="#D1D5DB" strokeWidth="1.5" strokeDasharray="4 3" fill="none" />
      {/* Arrow pointing in */}
      <path d="M70 78v-12M64 72l6-6 6 6" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EmptySearch() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto">
      {/* Magnifying glass */}
      <circle cx="52" cy="52" r="28" stroke="#D1D5DB" strokeWidth="3" fill="#F9FAFB" />
      <line x1="72" y1="72" x2="95" y2="95" stroke="#D1D5DB" strokeWidth="4" strokeLinecap="round" />
      {/* Question mark */}
      <path d="M46 44c0-4 3-7 7-7s7 3 7 7c0 3-2 5-4 6-1 .5-2 1.5-2 3" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="54" cy="60" r="1.5" fill="#9CA3AF" />
    </svg>
  );
}
