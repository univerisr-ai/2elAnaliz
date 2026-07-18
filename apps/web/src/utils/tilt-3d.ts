/**
 * 3D Kart Eğimi — `.tilt-3d` sınıflı her eleman, imleç üzerindeyken ona doğru
 * hafifçe eğilir; ışık parlaması imleci izler. Tek delegeli pointer dinleyicisi,
 * rAF ile kısıtlanmış; eleman başına stil yazımı yalnız hover sırasında.
 */

let started = false;

export function initTilt3d(): void {
  if (started || typeof window === "undefined") {
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  if (!window.matchMedia("(hover: hover)").matches) {
    return; // dokunmatik cihazlarda kapalı
  }
  started = true;

  let active: HTMLElement | null = null;
  let pending: PointerEvent | null = null;
  let raf = 0;

  function apply() {
    raf = 0;
    if (!active || !pending) {
      return;
    }
    const rect = active.getBoundingClientRect();
    const tx = ((pending.clientX - rect.left) / rect.width - 0.5) * 2;
    const ty = ((pending.clientY - rect.top) / rect.height - 0.5) * 2;
    active.style.setProperty("--tx", tx.toFixed(3));
    active.style.setProperty("--ty", ty.toFixed(3));
  }

  document.addEventListener(
    "pointermove",
    (event) => {
      const target = (event.target as Element | null)?.closest?.(".tilt-3d") as HTMLElement | null;

      if (target !== active) {
        if (active) {
          active.classList.remove("is-tilting");
          active.style.setProperty("--tx", "0");
          active.style.setProperty("--ty", "0");
        }
        active = target;
        active?.classList.add("is-tilting");
      }

      if (active) {
        pending = event;
        if (!raf) {
          raf = requestAnimationFrame(apply);
        }
      }
    },
    { passive: true },
  );

  document.addEventListener(
    "pointerout",
    (event) => {
      if (active && !active.contains(event.relatedTarget as Node | null)) {
        active.classList.remove("is-tilting");
        active.style.setProperty("--tx", "0");
        active.style.setProperty("--ty", "0");
        active = null;
      }
    },
    { passive: true },
  );
}
