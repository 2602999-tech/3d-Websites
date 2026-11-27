import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export interface ScrollState {
  progress: number;
}

export function useScrollRig(containerRef: React.RefObject<HTMLDivElement | null>) {
  const scrollStateRef = useRef<ScrollState>({ progress: 0 });
  const lenisRef = useRef<Lenis | null>(null);
  const lastUiStepRef = useRef<number>(-1);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const triggerEl = containerRef.current;
    if (!triggerEl) return;

    const lenis = new Lenis({
      duration: 0.72,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
      wheelMultiplier: 1.15,
    });
    lenisRef.current = lenis;

    lenis.on('scroll', ScrollTrigger.update);

    const tick = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const proxy = { p: 0 };
    const tween = gsap.to(proxy, {
      p: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: triggerEl,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.35,
        onUpdate: (self) => {
          const val = Math.min(Math.max(self.progress, 0), 1);
          scrollStateRef.current.progress = val;

          // Quantize UI updates to 0.5% steps to prevent 60fps React re-renders
          const step = Math.round(val * 200);
          if (step !== lastUiStepRef.current) {
            lastUiStepRef.current = step;
            setProgress(val);
          }
        },
      },
    });

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
      gsap.ticker.remove(tick);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [containerRef]);

  const scrollToProgress = useCallback(
    (targetFraction: number) => {
      const el = containerRef.current;
      if (!el) return;
      const scrollable = Math.max(el.offsetHeight - window.innerHeight, 1);
      const targetY = el.offsetTop + Math.min(Math.max(targetFraction, 0), 1) * scrollable;
      if (lenisRef.current) {
        lenisRef.current.scrollTo(targetY, { duration: 0.9 });
      } else {
        window.scrollTo({ top: targetY, behavior: 'smooth' });
      }
    },
    [containerRef],
  );

  return { scrollStateRef, progress, scrollToProgress };
}
