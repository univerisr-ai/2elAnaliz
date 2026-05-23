import { useEffect, useMemo, useState } from "react";
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

export function GpuBackdrop() {
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
    if (!isFanTunerEnabled) {
      return;
    }

    applyFanSettings(fanSettings);
    window.localStorage.setItem(FAN_TUNER_STORAGE_KEY, JSON.stringify(fanSettings));
  }, [fanSettings, isFanTunerEnabled]);

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
