import { useEffect, useRef, useCallback, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import type { ViolationType } from '../types/models';

interface UseAntiCheatOptions {
  sessionId: string | undefined;
  playerId: string | undefined;
  enabled: boolean;
}

const DEBOUNCE_MS = 5000;
const WARNING_DURATION_MS = 3000;

export function useAntiCheat({ sessionId, playerId, enabled }: UseAntiCheatOptions) {
  const [violationCount, setViolationCount] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const violationCountRef = useRef(0);
  const lastReportTimeRef = useRef<Record<string, number>>({});
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportViolation = useCallback(
    (type: ViolationType) => {
      if (!sessionId || !playerId || !enabled) return;

      const now = Date.now();
      const lastTime = lastReportTimeRef.current[type] || 0;
      if (now - lastTime < DEBOUNCE_MS) return;
      lastReportTimeRef.current[type] = now;

      violationCountRef.current += 1;
      setViolationCount(violationCountRef.current);

      setShowWarning(true);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = setTimeout(() => setShowWarning(false), WARNING_DURATION_MS);

      // Fire-and-forget — never block gameplay
      const fn = httpsCallable(functions, 'reportViolation');
      fn({ sessionId, playerId, type }).catch(() => {});
    },
    [sessionId, playerId, enabled]
  );

  const dismissWarning = useCallback(() => {
    setShowWarning(false);
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
  }, []);

  // Page Visibility API
  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      if (document.hidden) reportViolation('tab_hidden');
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [enabled, reportViolation]);

  // Window blur
  useEffect(() => {
    if (!enabled) return;
    const handler = () => reportViolation('window_blur');
    window.addEventListener('blur', handler);
    return () => window.removeEventListener('blur', handler);
  }, [enabled, reportViolation]);

  // Paste prevention + context menu block
  useEffect(() => {
    if (!enabled) return;
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      reportViolation('paste_attempt');
    };
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [enabled, reportViolation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    };
  }, []);

  return { violationCount, showWarning, dismissWarning };
}
