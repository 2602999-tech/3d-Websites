import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, Check, X } from 'lucide-react';

interface OverlayHUDProps {
  subscribeProgress: (listener: (progress: number) => void) => () => void;
  onJumpTo: (fraction: number) => void;
}

function smoothstep(x: number, min: number, max: number) {
  const t = Math.min(Math.max((x - min) / (max - min), 0), 1);
  return t * t * (3 - 2 * t);
}

export function OverlayHUD({ subscribeProgress, onJumpTo }: OverlayHUDProps) {
  const [progress, setProgress] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState<'roast' | 'machine' | null>(null);
  const [email, setEmail] = useState('');
  const [roastChoice, setRoastChoice] = useState('Ethiopia Yirgacheffe · Whole Bean');
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [stage5Minimized, setStage5Minimized] = useState(false);

  useEffect(() => {
    return subscribeProgress(setProgress);
  }, [subscribeProgress]);

  const isDarkStage = progress >= 0.18 && progress <= 0.76;

  // Stage opacities
  const stage1Opacity = 1 - smoothstep(progress, 0.08, 0.19);
  const stage2Opacity =
    smoothstep(progress, 0.20, 0.27) * (1 - smoothstep(progress, 0.41, 0.47));
  const stage3Opacity =
    smoothstep(progress, 0.46, 0.53) * (1 - smoothstep(progress, 0.67, 0.73));
  const stage5Opacity = smoothstep(progress, 0.85, 0.93);

  const handleOrderSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    setErrorMsg('');
    setSubmitted(true);
  };

  return (
    <>
      {/* 3-Zone Top Bar */}
      <header
        className={`fixed top-0 left-0 right-0 z-30 border-b transition-colors duration-300 ${
          isDarkStage
            ? 'border-[#2B2621] bg-[#141210]/94 text-[#F5F1EB]'
            : 'border-[#DFD9CE] bg-[#F4F1EA]/94 text-[#1A1816]'
        }`}
      >
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5 md:px-10">
          <button
            type="button"
            onClick={() => onJumpTo(0)}
            className="font-display text-2xl font-semibold tracking-tight whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C87A4B] rounded"
          >
            Valenza
          </button>

          <nav
            aria-label="Coffee journey stages"
            className={`hidden md:flex items-center gap-7 text-sm font-medium ${
              isDarkStage ? 'text-[#B5ABA0]' : 'text-[#635B52]'
            }`}
          >
            <button
              type="button"
              onClick={() => onJumpTo(0.05)}
              className="hover:underline underline-offset-4 decoration-[#C87A4B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Hopper
            </button>
            <button
              type="button"
              onClick={() => onJumpTo(0.32)}
              className="hover:underline underline-offset-4 decoration-[#C87A4B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Grinder
            </button>
            <button
              type="button"
              onClick={() => onJumpTo(0.58)}
              className="hover:underline underline-offset-4 decoration-[#C87A4B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Extraction
            </button>
            <button
              type="button"
              onClick={() => onJumpTo(0.93)}
              className="hover:underline underline-offset-4 decoration-[#C87A4B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Pour
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setDrawerOpen('roast');
              }}
              className="rounded-md bg-[#9F5F37] px-4 py-2 text-xs font-semibold tracking-wide text-[#F9F6F0] transition-colors hover:bg-[#B86F42] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Order Roast
            </button>
          </div>
        </div>
      </header>

      {/* Stage 1 (0% - 20%): Minimalist Hero Headline */}
      {stage1Opacity > 0.02 && (
        <div
          className="pointer-events-none fixed inset-0 z-20 flex items-center"
          style={{ opacity: stage1Opacity }}
        >
          <div className="mx-auto w-full max-w-[1440px] px-6 md:px-12">
            <div className="max-w-md space-y-4">
              <p className="text-xs font-semibold tracking-wider text-[#9F5F37]">
                Valenza Corsa 01
              </p>
              <h1
                className="font-display text-5xl font-semibold leading-[1.03] tracking-tight text-[#1A1816] sm:text-6xl"
                style={{ textWrap: 'balance' }}
              >
                Precision in Every Drop
              </h1>
              <div className="pointer-events-auto pt-2">
                <button
                  type="button"
                  onClick={() => onJumpTo(0.28)}
                  className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-[#9F5F37] hover:text-[#1A1816] transition-colors cursor-pointer"
                >
                  <span>Scroll to begin extraction</span>
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage 2 (20% - 45%): Left Floating Callout */}
      {stage2Opacity > 0.02 && (
        <div
          className="pointer-events-none fixed inset-0 z-20 flex items-center"
          style={{ opacity: stage2Opacity }}
        >
          <div className="mx-auto w-full max-w-[1440px] px-6 md:px-12">
            <div className="max-w-sm rounded-lg border border-[#322C26] bg-[#141210]/94 p-6 shadow-xl">
              <p className="font-mono-tabular text-xs font-medium text-[#D98A4E]">
                01. Conical Burr Grinding
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[#F5F1EB]">
                Uniform micron extraction at zero heat retention.
              </h2>
            </div>
          </div>
        </div>
      )}

      {/* Stage 3 (45% - 70%): Right Floating Callout */}
      {stage3Opacity > 0.02 && (
        <div
          className="pointer-events-none fixed inset-0 z-20 flex items-center justify-end"
          style={{ opacity: stage3Opacity }}
        >
          <div className="mx-auto flex w-full max-w-[1440px] justify-end px-6 md:px-12">
            <div className="max-w-sm rounded-lg border border-[#322C26] bg-[#141210]/94 p-6 shadow-xl">
              <p className="font-mono-tabular text-xs font-medium text-[#D98A4E]">
                02. 9-Bar Thermal Extraction
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-[#F5F1EB]">
                Balanced pressure unlocks sweet, aromatic oils.
              </h2>
            </div>
          </div>
        </div>
      )}

      {/* Stage 5 (85% - 100%): Compact Bottom-Left Brand Reveal — Keeps Cup & Pour Unobstructed */}
      {stage5Opacity > 0.02 && (
        <div
          className="pointer-events-none fixed inset-0 z-20 flex items-end justify-start"
          style={{ opacity: stage5Opacity }}
        >
          <div className="w-full max-w-[1440px] px-5 pb-5 md:px-10 md:pb-8">
            {stage5Minimized ? (
              <button
                type="button"
                onClick={() => setStage5Minimized(false)}
                className="pointer-events-auto rounded-md border border-[#DDD5C7] bg-[#F4F1EA]/95 px-4 py-2 text-xs font-semibold text-[#1A1816] shadow-md hover:border-[#9F5F37] hover:text-[#9F5F37] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Show Tasting Notes
              </button>
            ) : (
              <div className="pointer-events-auto relative max-w-[320px] space-y-3.5 rounded-lg border border-[#DDD5C7] bg-[#F4F1EA]/95 p-5 shadow-lg">
                <button
                  type="button"
                  aria-label="Hide tasting notes card"
                  onClick={() => setStage5Minimized(true)}
                  className="absolute right-3 top-3 rounded p-1 text-[#6E655B] hover:text-[#1A1816] transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>

                <div className="space-y-1.5 pr-6">
                  <p className="text-[11px] font-semibold tracking-wider text-[#9F5F37]">
                    Valenza Roastery · Corsa 01
                  </p>
                  <h2
                    className="font-display text-2xl font-semibold leading-[1.08] tracking-tight text-[#1A1816] sm:text-3xl"
                    style={{ textWrap: 'balance' }}
                  >
                    Velvety Crema, Pure Origin.
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium text-[#61584E]">
                  <span>Dark Cocoa</span>
                  <span aria-hidden="true">·</span>
                  <span>Roasted Hazelnut</span>
                  <span aria-hidden="true">·</span>
                  <span>Molasses</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular text-[#1A1816]">93.0 °C / 9.0 bar</span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setDrawerOpen('roast');
                    }}
                    className="rounded-md bg-[#1A1816] px-4 py-2 text-xs font-semibold tracking-wide text-[#F4F1EA] transition-colors hover:bg-[#332E29] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Order Roast
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setDrawerOpen('machine');
                    }}
                    className="rounded-md border border-[#C6BEB1] bg-transparent px-4 py-2 text-xs font-semibold tracking-wide text-[#1A1816] transition-colors hover:border-[#9F5F37] hover:text-[#9F5F37] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Explore Machine
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compact Vertical Progress Rail */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed right-5 top-1/2 z-20 hidden -translate-y-1/2 md:flex flex-col items-center gap-2"
      >
        <div
          className={`h-28 w-[2px] overflow-hidden rounded-full ${
            isDarkStage ? 'bg-[#322C26]' : 'bg-[#D6CFC2]'
          }`}
        >
          <div
            className="w-full bg-[#C87A4B] transition-[height] duration-75"
            style={{ height: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <span
          className={`font-mono-tabular text-[10px] ${
            isDarkStage ? 'text-[#A69C90]' : 'text-[#6E655B]'
          }`}
        >
          {Math.round(progress * 100)}%
        </span>
      </div>

      {/* Order Roast / Explore Machine Modal */}
      {drawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-6"
        >
          <div className="relative w-full max-w-md rounded-lg border border-[#D8D0C3] bg-[#F4F1EA] p-7 text-[#1A1816] shadow-2xl">
            <button
              type="button"
              aria-label="Close modal"
              onClick={() => setDrawerOpen(null)}
              className="absolute right-4 top-4 rounded-md p-1.5 text-[#6E655B] hover:text-[#1A1816] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            {drawerOpen === 'machine' ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold tracking-wider text-[#9F5F37]">
                  Valenza Corsa 01
                </p>
                <h3 className="font-display text-3xl font-semibold">
                  Architectural Specifications
                </h3>
                <dl className="divide-y divide-[#DDD5C7] border-y border-[#DDD5C7] text-sm">
                  <div className="flex justify-between py-2.5">
                    <dt className="text-[#6E655B]">Conical Burrs</dt>
                    <dd className="font-mono-tabular font-medium">63 mm Steel</dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-[#6E655B]">Boiler Stability</dt>
                    <dd className="font-mono-tabular font-medium">93.0 °C ± 0.2 °C</dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-[#6E655B]">Pump Pressure</dt>
                    <dd className="font-mono-tabular font-medium">9.0 bar Rotary</dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-[#6E655B]">Materials</dt>
                    <dd className="font-medium">Brushed Steel · Walnut</dd>
                  </div>
                </dl>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDrawerOpen(null);
                      onJumpTo(0.32);
                    }}
                    className="rounded-md bg-[#1A1816] px-4 py-2 text-xs font-semibold text-[#F4F1EA] cursor-pointer"
                  >
                    Inspect Internals
                  </button>
                </div>
              </div>
            ) : submitted ? (
              <div className="space-y-4 py-3">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-[#9F5F37]/15 text-[#9F5F37]">
                  <Check className="h-5 w-5" />
                </div>
                <h3 className="font-display text-3xl font-semibold">
                  Roast Allocation Confirmed
                </h3>
                <p className="text-sm text-[#61584E]">
                  {roastChoice} dispatch details sent to {email}.
                </p>
              </div>
            ) : (
              <form onSubmit={handleOrderSubmit} noValidate className="space-y-4">
                <p className="text-xs font-semibold tracking-wider text-[#9F5F37]">
                  Single-Origin Dispatch
                </p>
                <h3 className="font-display text-3xl font-semibold">
                  Order Fresh Roast
                </h3>

                <div className="space-y-1.5">
                  <label htmlFor="roast-select" className="block text-xs font-medium text-[#5E554B]">
                    Roast Lot
                  </label>
                  <select
                    id="roast-select"
                    value={roastChoice}
                    onChange={(e) => setRoastChoice(e.target.value)}
                    className="w-full rounded-md border border-[#CEC5B6] bg-white px-3 py-2 text-sm text-[#1A1816] focus:border-[#9F5F37] focus:outline-none"
                  >
                    <option value="Ethiopia Yirgacheffe · Whole Bean">
                      Ethiopia Yirgacheffe · Whole Bean (320 g)
                    </option>
                    <option value="Colombia Huila Reserve · Whole Bean">
                      Colombia Huila Reserve · Whole Bean (320 g)
                    </option>
                    <option value="Valenza House Espresso · Whole Bean">
                      Valenza House Espresso · Whole Bean (500 g)
                    </option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="order-email" className="block text-xs font-medium text-[#5E554B]">
                    Email Address
                  </label>
                  <input
                    id="order-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full rounded-md border border-[#CEC5B6] bg-white px-3 py-2 text-sm text-[#1A1816] focus:border-[#9F5F37] focus:outline-none"
                  />
                </div>

                {errorMsg && (
                  <p role="alert" className="text-xs font-medium text-[#B34329]">
                    {errorMsg}
                  </p>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="rounded-md bg-[#9F5F37] px-5 py-2.5 text-xs font-semibold text-[#F9F6F0] hover:bg-[#B86F42] cursor-pointer"
                  >
                    Confirm Allocation
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
