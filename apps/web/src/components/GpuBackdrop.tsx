import { useEffect, useMemo, useState } from "react";
import type { ProductType } from "../types/listing";
import backdropBody from "../assets/gpu-backdrop-body.png";
import backdropFan from "../assets/gpu-backdrop-fan.png";

const FAN_POSITIONS = ["left", "center", "right"] as const;
const FAN_TUNER_STORAGE_KEY = "gpupusula-gpu-fan-settings";

type FanPosition = (typeof FAN_POSITIONS)[number];
type FanSettings = Record<FanPosition, { x: number; y: number; size: number }>;

const FAN_LABELS: Record<FanPosition, string> = {
  left: "Sol",
  center: "Orta",
  right: "Sag",
};

const DEFAULT_FAN_SETTINGS: FanSettings = {
  left: { x: 27.8, y: 36.9, size: 32.2 },
  center: { x: 53.1, y: 49.1, size: 31.4 },
  right: { x: 79.1, y: 57.8, size: 30.4 },
};

const TRACE_PATHS = [
  "M180 130 V62 H154 V22",
  "M158 130 V84 H112 V42",
  "M202 130 V84 H248 V42",
  "M226 144 L262 108 V72 H304",
  "M230 168 H286 V146 H336",
  "M230 190 H304 V214 H340",
  "M218 218 L262 262 V306 H310",
  "M196 230 V282 H222 V338",
  "M166 230 V286 H138 V338",
  "M142 218 L100 260 V308 H52",
  "M130 190 H72 V216 H22",
  "M130 166 H74 V142 H24",
  "M142 144 L100 106 V70 H54",
  "M180 230 V292 H180 V340",
] as const;

const NODE_POINTS = [
  [154, 22],
  [112, 42],
  [248, 42],
  [304, 72],
  [336, 146],
  [340, 214],
  [310, 306],
  [222, 338],
  [138, 338],
  [52, 308],
  [22, 216],
  [24, 142],
  [54, 70],
  [180, 340],
] as const;

function applyFanSettings(settings: FanSettings) {
  const root = document.documentElement;

  FAN_POSITIONS.forEach((position) => {
    root.style.setProperty(`--gpu-fan-${position}-x`, `${settings[position].x}%`);
    root.style.setProperty(`--gpu-fan-${position}-y`, `${settings[position].y}%`);
    root.style.setProperty(`--gpu-fan-${position}-size`, `${settings[position].size}%`);
  });
}

function readStoredFanSettings() {
  const stored = window.localStorage.getItem(FAN_TUNER_STORAGE_KEY);

  if (!stored) {
    return DEFAULT_FAN_SETTINGS;
  }

  try {
    return { ...DEFAULT_FAN_SETTINGS, ...JSON.parse(stored) } as FanSettings;
  } catch {
    return DEFAULT_FAN_SETTINGS;
  }
}

function CpuBackdrop() {
  return (
    <div className="cpu-backdrop" aria-hidden="true">
      <div className="cpu-backdrop__field" />
      <svg className="cpu-backdrop__chip" viewBox="0 0 360 360" role="img" focusable="false">
        <defs>
          <filter id="cpu-neon-glow" x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="0 0 0 0 0.05 0 0 0 0 0.72 0 0 0 0 0.82 0 0 0 0.8 0"
              result="cyan"
            />
            <feMerge>
              <feMergeNode in="cyan" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="cpu-backdrop__traces" filter="url(#cpu-neon-glow)">
          {TRACE_PATHS.map((path, index) => (
            <path key={path} className="cpu-backdrop__trace" d={path} style={{ animationDelay: `${index * 90}ms` }} />
          ))}
        </g>

        <g className="cpu-backdrop__nodes">
          {NODE_POINTS.map(([cx, cy], index) => (
            <circle key={`${cx}-${cy}`} className="cpu-backdrop__node" cx={cx} cy={cy} r="8" style={{ animationDelay: `${index * 95}ms` }} />
          ))}
        </g>

        <rect className="cpu-backdrop__core-glow" x="116" y="116" width="128" height="128" rx="28" />
        <rect className="cpu-backdrop__core" x="126" y="126" width="108" height="108" rx="22" />
        <rect className="cpu-backdrop__core-inner" x="150" y="150" width="60" height="60" rx="10" />
      </svg>
    </div>
  );
}

interface GpuBackdropProps {
  readonly variant?: ProductType;
}

export function GpuBackdrop({ variant = "gpu" }: GpuBackdropProps) {
  const isFanTunerEnabled = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return new URLSearchParams(window.location.search).has("fanAyar");
  }, []);
  const [fanSettings, setFanSettings] = useState<FanSettings>(() => {
    if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("fanAyar")) {
      return DEFAULT_FAN_SETTINGS;
    }

    return readStoredFanSettings();
  });

  useEffect(() => {
    if (!isFanTunerEnabled || variant !== "gpu") {
      return;
    }

    applyFanSettings(fanSettings);
    window.localStorage.setItem(FAN_TUNER_STORAGE_KEY, JSON.stringify(fanSettings));
  }, [fanSettings, isFanTunerEnabled, variant]);

  const updateFanSetting = (position: FanPosition, key: keyof FanSettings[FanPosition], value: string) => {
    setFanSettings((current) => ({
      ...current,
      [position]: {
        ...current[position],
        [key]: Number(value),
      },
    }));
  };

  const resetFanSettings = () => {
    setFanSettings(DEFAULT_FAN_SETTINGS);
  };

  const copyFanSettings = async () => {
    const css = FAN_POSITIONS.map(
      (position) =>
        `${position}: left ${fanSettings[position].x}%, top ${fanSettings[position].y}%, width ${fanSettings[position].size}%`,
    ).join("\n");

    await window.navigator.clipboard?.writeText(css);
  };

  if (variant === "cpu") {
    return <CpuBackdrop />;
  }

  return (
    <>
      <div className="gpu-backdrop" aria-hidden="true">
        <div className="gpu-backdrop__glow" />
        <div className="gpu-backdrop__panel">
          <img src={backdropBody} alt="" className="gpu-backdrop__image" />
          <div className="gpu-backdrop__fans">
            {FAN_POSITIONS.map((position) => (
              <span key={position} className={`gpu-backdrop__fan-slot gpu-backdrop__fan-slot--${position}`}>
                <img src={backdropFan} alt="" className="gpu-backdrop__fan" />
              </span>
            ))}
          </div>
        </div>
      </div>

      {isFanTunerEnabled ? (
        <section className="gpu-tuner" aria-label="Fan ayar paneli">
          <div className="gpu-tuner__header">
            <strong>Fan Ayari</strong>
            <div>
              <button type="button" onClick={copyFanSettings}>
                Kopyala
              </button>
              <button type="button" onClick={resetFanSettings}>
                Sifirla
              </button>
            </div>
          </div>

          {FAN_POSITIONS.map((position) => (
            <div className="gpu-tuner__group" key={position}>
              <strong>{FAN_LABELS[position]}</strong>
              <label>
                X <span>{fanSettings[position].x.toFixed(1)}%</span>
                <input
                  type="range"
                  min="20"
                  max="86"
                  step="0.1"
                  value={fanSettings[position].x}
                  onChange={(event) => updateFanSetting(position, "x", event.target.value)}
                />
              </label>
              <label>
                Y <span>{fanSettings[position].y.toFixed(1)}%</span>
                <input
                  type="range"
                  min="25"
                  max="68"
                  step="0.1"
                  value={fanSettings[position].y}
                  onChange={(event) => updateFanSetting(position, "y", event.target.value)}
                />
              </label>
              <label>
                Boy <span>{fanSettings[position].size.toFixed(1)}%</span>
                <input
                  type="range"
                  min="24"
                  max="42"
                  step="0.1"
                  value={fanSettings[position].size}
                  onChange={(event) => updateFanSetting(position, "size", event.target.value)}
                />
              </label>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}
