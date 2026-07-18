/**
 * "Banttan Yakala" — Fırsat Bandı'ndaki bir parçanın söküldüğü, fırsat biletine
 * dönüşüp kavisli bir uçuşla Emir Fişi'nin açılacağı noktaya süzüldüğü
 * paylaşılan-eleman geçişi. Saf DOM + Web Animations API; kütüphane yok.
 *
 * Aşamalar:
 *  1. KOPUŞ   (0-160ms)  : parça bandın içinden hafif dönerek "sökülür"
 *  2. UÇUŞ    (160-620ms): kavisli yörüngeyle sağ üstteki panel ağzına süzülür,
 *                          uçarken bilet formuna genişler
 *  3. TESLİM  (620-900ms): panel kayarken bilet panelin başlığına "emilir"
 */

interface TicketData {
  readonly model: string;
  readonly priceText: string;
  readonly deltaText: string;
}

const REDUCED = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface TargetRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Emir Fişi'nin açılacağı ağız (sağ kenar; mobilde tam genişlik). */
export function panelTarget(): TargetRect {
  const panelWidth = Math.min(480, window.innerWidth);
  return {
    left: window.innerWidth - panelWidth + 18,
    top: 14,
    width: Math.min(300, panelWidth - 96),
    height: 44,
  };
}

/** Defter başlığı — eşleşme yoksa bilet "deftere dosyalanır". */
export function defterTarget(): TargetRect {
  const topline = document.querySelector(".ledger__topline");
  if (topline) {
    const r = topline.getBoundingClientRect();
    return { left: r.left, top: Math.max(8, r.top), width: Math.min(280, r.width * 0.6), height: 40 };
  }
  return { left: Math.min(420, window.innerWidth * 0.3), top: 240, width: 280, height: 40 };
}

export function flyTicketToPanel(
  sourceEl: HTMLElement,
  data: TicketData,
  onArrive: () => void,
  target?: TargetRect,
): void {
  if (REDUCED() || typeof document === "undefined") {
    onArrive();
    return;
  }

  const from = sourceEl.getBoundingClientRect();
  const to = target ?? panelTarget();

  // Bandın içindeki asıl parça "yakalandı" durumuna geçer
  sourceEl.classList.add("is-caught");

  // Uçan bilet klonu
  const ticket = document.createElement("div");
  ticket.className = "catch-ticket";
  ticket.setAttribute("aria-hidden", "true");
  ticket.innerHTML = `
    <span class="catch-ticket__notch"></span>
    <strong>${escapeHtml(data.model)}</strong>
    <span class="catch-ticket__price">${escapeHtml(data.priceText)}</span>
    <span class="catch-ticket__delta">${escapeHtml(data.deltaText)}</span>
  `;
  Object.assign(ticket.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
  });
  document.body.appendChild(ticket);

  const dx = to.left - from.left;
  const dy = to.top - from.top;
  const arcLift = Math.min(90, Math.abs(dx) * 0.12 + 34); // kavis yüksekliği

  const flight = ticket.animate(
    [
      // 1) KOPUŞ: hafif geri çekilip dönerek sökülür
      {
        transform: "translate(0, 0) rotate(0deg) scale(1)",
        width: `${from.width}px`,
        height: `${from.height}px`,
        boxShadow: "0 2px 8px rgba(20, 22, 26, 0.10)",
        offset: 0,
      },
      {
        transform: "translate(-6px, 10px) rotate(-3deg) scale(1.06)",
        width: `${from.width}px`,
        height: `${from.height}px`,
        boxShadow: "0 14px 30px rgba(20, 22, 26, 0.18)",
        offset: 0.18,
        easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      // 2) UÇUŞ: kavisin tepesi — bilet formuna genişlemeye başlar
      {
        transform: `translate(${dx * 0.45}px, ${dy * 0.5 - arcLift}px) rotate(4deg) scale(1.02)`,
        width: `${from.width * 0.7 + to.width * 0.3}px`,
        height: `${to.height}px`,
        boxShadow: "0 22px 44px rgba(20, 22, 26, 0.2)",
        offset: 0.55,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      // 3) TESLİM: panel ağzına oturur
      {
        transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(1)`,
        width: `${to.width}px`,
        height: `${to.height}px`,
        boxShadow: "0 10px 26px rgba(20, 22, 26, 0.14)",
        offset: 1,
      },
    ],
    { duration: 640, easing: "linear", fill: "forwards" },
  );

  // Panel, bilet hedefe varmadan hemen önce açılmaya başlar → devir hissi
  const openTimer = window.setTimeout(onArrive, 430);

  flight.addEventListener("finish", () => {
    // TESLİM: bilet panelin içine emilir
    ticket
      .animate(
        [
          { opacity: 1, transform: `translate(${dx}px, ${dy}px) scale(1)` },
          { opacity: 0, transform: `translate(${dx + 14}px, ${dy}px) scale(0.94)` },
        ],
        { duration: 260, easing: "ease-out", fill: "forwards" },
      )
      .addEventListener("finish", () => {
        ticket.remove();
      });
    window.setTimeout(() => sourceEl.classList.remove("is-caught"), 1400);
  });

  // Emniyet: her durumda temizlik
  window.setTimeout(() => {
    ticket.remove();
    sourceEl.classList.remove("is-caught");
    window.clearTimeout(openTimer);
  }, 2400);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
