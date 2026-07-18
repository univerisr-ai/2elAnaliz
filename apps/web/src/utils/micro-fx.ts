/**
 * Mikro etkileşim efektleri — kütüphanesiz, kendi kendini temizleyen DOM parçacıkları.
 */

const REDUCED = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Favori yıldızı: butonun etrafına mürekkep noktaları saçılır (proje tarzı). */
export function sparkBurst(element: HTMLElement, color = "#C2410C"): void {
  if (REDUCED()) return;
  const rect = element.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  for (let i = 0; i < 6; i++) {
    const dot = document.createElement("span");
    const angle = (Math.PI * 2 * i) / 6 + 0.35;
    const dist = 16 + (i % 3) * 6;
    const size = 4 + (i % 2) * 2;
    Object.assign(dot.style, {
      position: "fixed",
      left: `${cx - size / 2}px`,
      top: `${cy - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "999px",
      background: color,
      pointerEvents: "none",
      zIndex: "500",
    });
    document.body.appendChild(dot);
    dot
      .animate(
        [
          { transform: "translate(0, 0) scale(1)", opacity: 1 },
          {
            transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.2)`,
            opacity: 0,
          },
        ],
        { duration: 480, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" },
      )
      .addEventListener("finish", () => dot.remove());
  }

  element.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.35)", offset: 0.4 },
      { transform: "scale(1)" },
    ],
    { duration: 360, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  );
}

/** Alarm zili: kulak kabartma — iki kez sallanır. */
export function bellSwing(element: HTMLElement): void {
  if (REDUCED()) return;
  element.animate(
    [
      { transform: "rotate(0deg)" },
      { transform: "rotate(16deg)", offset: 0.2 },
      { transform: "rotate(-12deg)", offset: 0.45 },
      { transform: "rotate(8deg)", offset: 0.7 },
      { transform: "rotate(0deg)" },
    ],
    { duration: 520, easing: "ease-in-out" },
  );
}
