import { useEffect, useState } from 'react';
import { useToastStore, type Toast as ToastData } from '../stores/toastStore';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const iconMap = {
  success: <CheckCircle className="w-5 h-5 text-success shrink-0" />,
  error: <XCircle className="w-5 h-5 text-danger shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-warning shrink-0" />,
  info: <Info className="w-5 h-5 text-info shrink-0" />,
};

const bgMap = {
  success: 'bg-success/10 border-success/20',
  error: 'bg-danger/10 border-danger/20',
  warning: 'bg-warning/10 border-warning/20',
  info: 'bg-info/10 border-info/20',
};

const barMap = {
  success: 'bg-success',
  error: 'bg-danger',
  warning: 'bg-warning',
  info: 'bg-info',
};

function ToastItem({ toast }: { toast: ToastData }) {
  const { removeToast } = useToastStore();
  const [progress, setProgress] = useState(100);

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

  return (
    <div className={`relative overflow-hidden rounded-xl border shadow-lg backdrop-blur-sm animate-slide-up ${bgMap[toast.type]}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        {iconMap[toast.type]}
        <p className="text-sm font-medium text-gray-800 flex-1 pt-0.5">{toast.message}</p>
        <button onClick={() => removeToast(toast.id)} className="p-0.5 hover:bg-black/5 rounded-lg transition-colors shrink-0">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      {toast.duration && toast.duration > 0 && (
        <div className="h-0.5 w-full bg-black/5">
          <div
            className={`h-full transition-all duration-100 ease-linear ${barMap[toast.type]}`}
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
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
