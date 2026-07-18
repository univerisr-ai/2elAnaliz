import { useEffect } from "react";
import "./Mascot.css";

/**
 * Pusula maskotları — proje1/proje2'deki blob karakter stilinin site uyarlaması.
 *
 * Tepki motoru:
 * - Gözler imleci yumuşakça takip eder (lerp'li tek rAF döngüsü, :root --mx/--my)
 * - Bir form alanına odaklanınca gözler O ALANA kilitlenir
 * - Şifre alanında gözler kapanır; şifre görünür yapılırsa mor karakter tek gözle dikizler
 * - mascotCheer(): favori gibi sevinçli anlarda zıplama
 */

const LERP = 0.08;
let tracking = false;

function isFormField(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

function focusKindOf(el: HTMLInputElement | HTMLTextAreaElement): string {
  if (el instanceof HTMLInputElement && el.type === "password") {
    return "password";
  }
  return "field";
}

function initMascotEngine() {
  if (tracking || typeof window === "undefined") {
    return;
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  tracking = true;

  const mouse = { x: 0, y: 0 };
  let currentX = 0;
  let currentY = 0;
  let focusedEl: HTMLElement | null = null;
  let typeObserver: MutationObserver | null = null;

  window.addEventListener(
    "mousemove",
    (event) => {
      mouse.x = (event.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (event.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true },
  );

  // Odak farkındalığı: gözler odaklanılan alana bakar; şifrede kapanır.
  document.addEventListener("focusin", (event) => {
    if (!isFormField(event.target)) {
      return;
    }
    focusedEl = event.target;
    const kind = focusKindOf(event.target);
    document.body.dataset.mascotFocus = kind;

    typeObserver?.disconnect();
    if (kind === "password") {
      // Şifre görünür yapılırsa (type=password -> text) dikiz moduna geç
      typeObserver = new MutationObserver(() => {
        if (focusedEl instanceof HTMLInputElement) {
          document.body.dataset.mascotFocus = focusedEl.type === "password" ? "password" : "peek";
        }
      });
      typeObserver.observe(event.target, { attributes: true, attributeFilter: ["type"] });
    }
  });

  document.addEventListener("focusout", () => {
    focusedEl = null;
    typeObserver?.disconnect();
    typeObserver = null;
    delete document.body.dataset.mascotFocus;
  });

  const root = document.documentElement.style;
  function loop() {
    let targetX = mouse.x;
    let targetY = mouse.y;

    if (focusedEl && focusedEl.isConnected) {
      const rect = focusedEl.getBoundingClientRect();
      targetX = ((rect.left + rect.width / 2) / window.innerWidth - 0.5) * 2;
      targetY = ((rect.top + rect.height / 2) / window.innerHeight - 0.5) * 2;
    }

    currentX += (targetX - currentX) * LERP;
    currentY += (targetY - currentY) * LERP;
    root.setProperty("--mx", currentX.toFixed(4));
    root.setProperty("--my", currentY.toFixed(4));

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

/** Sevinç: ekrandaki maskotlar kısa bir zıplama yapar. */
export function mascotCheer(): void {
  if (typeof document === "undefined") {
    return;
  }
  document.body.dataset.mascotCheer = "1";
  window.setTimeout(() => {
    delete document.body.dataset.mascotCheer;
  }, 700);
}

interface MascotProps {
  readonly size?: number;
  readonly mood?: "happy" | "calm";
}

export function Mascot({ size = 150, mood = "happy" }: MascotProps) {
  useEffect(() => {
    initMascotEngine();
  }, []);

  return (
    <div className={`mascot mascot--${mood}`} style={{ width: size, height: size * 0.72 }} aria-hidden="true">
      <div className="mascot__char mascot__char--purple">
        <span className="mascot__eyes">
          <span className="mascot__eye">
            <span className="mascot__pupil" />
          </span>
          <span className="mascot__eye">
            <span className="mascot__pupil" />
          </span>
        </span>
        <span className="mascot__smile" />
      </div>
      <div className="mascot__char mascot__char--orange">
        <span className="mascot__eyes">
          <span className="mascot__eye">
            <span className="mascot__pupil" />
          </span>
          <span className="mascot__eye">
            <span className="mascot__pupil" />
          </span>
        </span>
        <span className="mascot__smile" />
      </div>
      <div className="mascot__char mascot__char--yellow">
        <span className="mascot__eyes">
          <span className="mascot__eye">
            <span className="mascot__pupil" />
          </span>
          <span className="mascot__eye">
            <span className="mascot__pupil" />
          </span>
        </span>
        <span className="mascot__smile" />
      </div>
    </div>
  );
}
