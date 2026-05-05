import { WifiOff } from 'lucide-react';

export default function OfflineBanner() {
  return (
    <div className="bg-warning/20 text-warning text-center text-sm py-2 font-medium flex items-center justify-center gap-2 animate-fade-in" role="alert">
      <WifiOff className="w-4 h-4" />
      You're offline — reconnect to continue playing
    </div>
  );
}
