import { useEffect, useRef, useState } from "react";

/**
 * Sayı töreni: değer ekrana damgalanmak yerine hızla sayarak gelir
 * (Emir Fişi skor sayacının genelleştirilmiş hali). Değer değişince
 * eski değerden yenisine sayar; hareket-azaltmada anında oturur.
 */

interface CountUpProps {
  readonly value: number;
  readonly durationMs?: number;
  readonly delayMs?: number;
  readonly format?: (value: number) => string;
}

export function CountUp({
  value,
  durationMs = 640,
  delayMs = 0,
  format = (current) => current.toLocaleString("tr-TR"),
}: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const previousRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      previousRef.current = value;
      setDisplay(value);
      return;
    }

    const from = previousRef.current;
    if (from === value) {
      setDisplay(value);
      return;
    }

    let raf = 0;
    const start = performance.now() + delayMs;

    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / durationMs));
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        previousRef.current = value;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs, delayMs]);

  return <>{format(display)}</>;
}
