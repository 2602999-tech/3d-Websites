import { useCallback, useEffect, useRef } from 'react';

export interface ScrollState {
  progress: number;
  targetProgress: number;
}

type ProgressListener = (progress: number) => void;

export function useScrollRig(containerRef: React.RefObject<HTMLDivElement | null>) {
  const scrollStateRef = useRef<ScrollState>({ progress: 0, targetProgress: 0 });
  const listenersRef = useRef<Set<ProgressListener>>(new Set());
  const lastUiStepRef = useRef<number>(-1);
  const rafPendingRef = useRef<number>(0);

  const subscribeProgress = useCallback((listener: ProgressListener) => {
    listenersRef.current.add(listener);
    listener(scrollStateRef.current.progress);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const triggerEl = containerRef.current;
    if (!triggerEl) return;

    let maxScroll = Math.max(triggerEl.offsetHeight - window.innerHeight, 1);

    const updateBounds = () => {
      maxScroll = Math.max(triggerEl.offsetHeight - window.innerHeight, 1);
    };

    const notifyListeners = () => {
      rafPendingRef.current = 0;
      const val = scrollStateRef.current.targetProgress;
      listenersRef.current.forEach((cb) => cb(val));
    };

    const onScroll = () => {
      const val = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
      scrollStateRef.current.targetProgress = val;

      const step = Math.round(val * 120);
      if (step !== lastUiStepRef.current) {
        lastUiStepRef.current = step;
        if (!rafPendingRef.current) {
          rafPendingRef.current = requestAnimationFrame(notifyListeners);
        }
      }
    };

    const ro = new ResizeObserver(updateBounds);
    ro.observe(triggerEl);
    window.addEventListener('resize', updateBounds, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      if (rafPendingRef.current) {
        cancelAnimationFrame(rafPendingRef.current);
        rafPendingRef.current = 0;
      }
      ro.disconnect();
      window.removeEventListener('resize', updateBounds);
      window.removeEventListener('scroll', onScroll);
    };
  }, [containerRef]);

  const scrollToProgress = useCallback(
    (targetFraction: number) => {
      const el = containerRef.current;
      if (!el) return;
      const scrollable = Math.max(el.offsetHeight - window.innerHeight, 1);
      const targetY = el.offsetTop + Math.min(Math.max(targetFraction, 0), 1) * scrollable;
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    },
    [containerRef],
  );

  return { scrollStateRef, subscribeProgress, scrollToProgress };
}
