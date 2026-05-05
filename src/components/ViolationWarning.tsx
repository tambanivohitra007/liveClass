import { ShieldAlert } from 'lucide-react';

interface ViolationWarningProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function ViolationWarning({ visible, onDismiss }: ViolationWarningProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onDismiss}
    >
      <div className="text-center px-8 py-10 animate-bounce-in">
        <ShieldAlert className="w-16 h-16 text-danger mx-auto mb-4" />
        <h2 className="text-2xl font-black text-white mb-2">Warning!</h2>
        <p className="text-white/70 text-sm max-w-xs mx-auto">
          You left the quiz tab. This activity has been recorded and reported to your teacher.
        </p>
        <p className="text-white/40 text-xs mt-4">Tap anywhere to dismiss</p>
      </div>
    </div>
  );
}
