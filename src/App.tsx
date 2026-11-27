import { useRef } from 'react';
import { EspressoScene } from './components/canvas/EspressoScene';
import { OverlayHUD } from './components/ui/OverlayHUD';
import { useScrollRig } from './hooks/useScrollRig';

export default function App() {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { scrollStateRef, subscribeProgress, scrollToProgress } = useScrollRig(scrollContainerRef);

  return (
    <main className="relative w-full bg-[#F4F1EA]">
      {/* 500vh Multi-Stage Scroll Scrub Container */}
      <div ref={scrollContainerRef} className="relative h-[500vh] w-full">
        {/* Pinned Full-Screen 100vh R3F Canvas */}
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          <EspressoScene scrollStateRef={scrollStateRef} />
        </div>
      </div>

      <OverlayHUD subscribeProgress={subscribeProgress} onJumpTo={scrollToProgress} />
    </main>
  );
}
