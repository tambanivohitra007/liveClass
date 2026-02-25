import { useEffect, useState } from 'react';
import { useToastStore, type Toast as ToastData } from '../stores/toastStore';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const iconMap = {
  success: <CheckCircle className="w-5 h-5 text-success shrink-0" />,
  error: <XCircle className="w-5 h-5 text-danger shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-warning shrink-0" />,
  info: <Info className="w-5 h-5 text-info shrink-0" />,
};

const borderMap = {
  success: 'border-success/30',
  error: 'border-danger/30',
  warning: 'border-warning/30',
  info: 'border-info/30',
};

const accentMap = {
  success: 'bg-success',
  error: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
};

function ToastItem({ toast }: { toast: ToastData }) {
  const { removeToast } = useToastStore();
  const [progress, setProgress] = useState(100);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!toast.duration || toast.duration <= 0) return;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / toast.duration!) * 100);
      setProgress(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [toast.duration]);

  const handleDismiss = () => {
    setExiting(true);
    setTimeout(() => removeToast(toast.id), 300);
  };

  return (
    <div
      className={`relative overflow-hidden bg-surface-card rounded-xl border ${borderMap[toast.type]} shadow-lg ${exiting ? 'animate-toast-exit' : 'animate-toast-enter'}`}
    >
      {/* Color accent stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accentMap[toast.type]}`} />

      <div className="flex items-start gap-3 pl-5 pr-3 py-3.5">
        {iconMap[toast.type]}
        <p className="text-sm font-bold text-gray-900 dark:text-white flex-1 pt-0.5">{toast.message}</p>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-lg border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5 text-gray-400 dark:text-white/50" />
        </button>
      </div>

      {toast.duration && toast.duration > 0 && (
        <div className="h-1 w-full bg-gray-100 dark:bg-white/5">
          <div
            className={`h-full transition-all duration-100 ease-linear ${accentMap[toast.type]}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
