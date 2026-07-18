import { useEffect } from "react";
import "./Mascot.css";

/**
 * Pusula maskotları — proje1/proje2'deki blob karakter stilinin site uyarlaması.
 * İmleci yumuşakça takip eden gözler (lerp'li tek rAF döngüsü, :root --mx/--my),
 * göz kırpma ve nefes alma animasyonları CSS tarafında.
 */

const LERP = 0.08;
let tracking = false;

function initEyeTracking() {
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

  window.addEventListener(
    "mousemove",
    (event) => {
      mouse.x = (event.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (event.clientY / window.innerHeight - 0.5) * 2;
    },
    { passive: true },
  );

  const root = document.documentElement.style;
  function loop() {
    currentX += (mouse.x - currentX) * LERP;
    currentY += (mouse.y - currentY) * LERP;
    root.setProperty("--mx", currentX.toFixed(4));
    root.setProperty("--my", currentY.toFixed(4));
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

interface MascotProps {
  readonly size?: number;
  readonly mood?: "happy" | "calm";
}

export function Mascot({ size = 150, mood = "happy" }: MascotProps) {
  useEffect(() => {
    initEyeTracking();
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
          <span className="mascot__eye mascot__eye--dot" />
          <span className="mascot__eye mascot__eye--dot" />
        </span>
        <span className="mascot__smile" />
      </div>
      <div className="mascot__char mascot__char--yellow">
        <span className="mascot__eyes">
          <span className="mascot__eye mascot__eye--dot" />
          <span className="mascot__eye mascot__eye--dot" />
        </span>
        <span className="mascot__smile" />
      </div>
    </div>
  );
}
