import type { CSSProperties } from "react";
import cpuReference from "../assets/cpu-real-reference.png";

const CPU_CENTER = { x: 1240, y: 300 } as const;

const CIRCUIT_TRACES = [
  ["M1186 254 H1114 L1080 220 H1002", 0, "main", true],
  ["M1186 268 H1078 L1044 302 H956", 70, "main", false],
  ["M1186 282 H1048 L1014 248 H920", 140, "main", true],
  ["M1186 296 H1028 L994 330 H904", 210, "main", false],
  ["M1186 310 H1076 L1040 346 H940", 280, "main", true],
  ["M1186 324 H1048 L1010 362 H902", 350, "main", false],
  ["M1186 338 H1110 L1074 376 H980", 420, "main", true],
  ["M1206 246 V190 L1168 152 V104", 490, "main", false],
  ["M1222 246 V166 L1262 126 V82", 560, "main", true],
  ["M1238 246 V190 L1206 158 V116", 630, "main", false],
  ["M1254 246 V182 L1296 140 V104", 700, "main", true],
  ["M1270 246 V202 L1308 164 H1374", 770, "main", false],
  ["M1294 260 H1352 L1388 224 H1432", 840, "main", true],
  ["M1294 278 H1338 L1376 316 H1436", 910, "main", false],
  ["M1294 296 H1370 L1412 254 H1438", 980, "main", true],
  ["M1294 314 H1358 L1396 352 H1436", 1050, "main", false],
  ["M1294 332 H1338 L1372 366 V430", 1120, "main", true],
  ["M1206 354 V420 L1170 456 V522", 1190, "main", false],
  ["M1222 354 V436 L1258 472 V536", 1260, "main", true],
  ["M1238 354 V444 L1204 478 V548", 1330, "main", false],
  ["M1254 354 V426 L1290 462 V532", 1400, "main", true],
  ["M1270 354 V414 L1308 452 H1372", 1470, "main", false],
  ["M1002 220 V174 H874 L838 138 H716", 110, "branch", false],
  ["M956 302 H866 L830 266 H722", 250, "branch", true],
  ["M904 330 V372 H812 L776 408 H674", 390, "branch", false],
  ["M940 346 H842 L808 382 H702", 530, "branch", true],
  ["M1170 456 H1088 L1052 420 H940", 670, "branch", false],
  ["M1258 472 H1168 L1132 508 H1026", 810, "branch", true],
  ["M1372 366 H1298 V420 H1220", 950, "branch", false],
  ["M1308 164 H1228 L1192 128 H1086", 1090, "branch", true],
] as const;

const LONG_TRACES = [
  ["M1186 268 H1008 L964 224 H772 L732 184 H540 L496 140 H270 L228 98 H24", 40, "long", true],
  ["M1186 324 H986 L946 364 H760 L720 404 H536 L498 444 H318 L278 484 H18", 260, "long", false],
  ["M1206 246 V154 L1166 114 V66 L1128 28 H1010", 480, "long", true],
  ["M1238 354 V458 L1198 498 V612 L1158 652 V846", 700, "long", false],
  ["M1294 296 H1378 L1418 256 H1440", 920, "long", true],
  ["M1254 354 V468 L1292 506 V620 L1334 662 V890", 1140, "long", false],
] as const;

const CONNECTOR_TRACES = [
  ["M1186 260 H1152 V232 H1118", 20, "pin", false],
  ["M1186 276 H1138 L1112 302 H1066", 120, "pin", true],
  ["M1186 292 H1150 V320 H1118", 220, "pin", false],
  ["M1186 308 H1142 L1112 338 H1068", 320, "pin", true],
  ["M1294 264 H1324 V236 H1360", 420, "pin", false],
  ["M1294 284 H1328 L1356 256 H1392", 520, "pin", true],
  ["M1294 304 H1326 V332 H1364", 620, "pin", false],
  ["M1294 324 H1330 L1356 350 H1390", 720, "pin", true],
  ["M1214 246 V214 H1182", 820, "pin", false],
  ["M1238 246 V208 L1270 176", 920, "pin", true],
  ["M1262 246 V218 H1300", 1020, "pin", false],
  ["M1214 354 V386 H1176", 1120, "pin", true],
  ["M1238 354 V394 L1202 430", 1220, "pin", false],
  ["M1262 354 V386 H1304", 1320, "pin", true],
] as const;

const END_NODES = [
  [24, 48, 7, "ring", 0],
  [120, 148, 6, "solid", 80],
  [22, 402, 7, "ring", 160],
  [44, 480, 6, "solid", 240],
  [160, 498, 7, "ring", 320],
  [18, 522, 6, "solid", 400],
  [280, 530, 7, "ring", 480],
  [1130, 8, 6, "solid", 560],
  [1304, 8, 7, "ring", 640],
  [900, 58, 6, "solid", 720],
  [1374, 104, 7, "ring", 800],
  [1432, 224, 6, "solid", 880],
  [1436, 316, 7, "ring", 960],
  [1440, 254, 6, "solid", 1040],
  [1440, 352, 7, "ring", 1120],
  [1440, 464, 6, "solid", 1200],
  [842, 694, 7, "ring", 1280],
  [1340, 820, 6, "solid", 1360],
  [1128, 890, 7, "ring", 1440],
  [1402, 640, 6, "solid", 1520],
  [596, 174, 7, "ring", 1600],
  [406, 324, 6, "solid", 1680],
  [338, 346, 7, "ring", 1760],
  [934, 420, 6, "solid", 1840],
  [1106, 610, 7, "ring", 1920],
  [1220, 420, 6, "solid", 2000],
  [24, 98, 8, "ring", 2080],
  [18, 484, 7, "ring", 2160],
  [1010, 28, 7, "solid", 2240],
  [1158, 846, 8, "ring", 2320],
  [1440, 256, 6, "solid", 2400],
  [1334, 890, 7, "ring", 2480],
] as const;

const CONNECTOR_NODES = [
  [1118, 232, 4, "connector", 80],
  [1066, 302, 4, "connector", 180],
  [1118, 320, 4, "connector", 280],
  [1068, 338, 4, "connector", 380],
  [1360, 236, 4, "connector", 480],
  [1392, 256, 4, "connector", 580],
  [1364, 332, 4, "connector", 680],
  [1390, 350, 4, "connector", 780],
  [1182, 214, 4, "connector", 880],
  [1270, 176, 4, "connector", 980],
  [1300, 218, 4, "connector", 1080],
  [1176, 386, 4, "connector", 1180],
  [1202, 430, 4, "connector", 1280],
  [1304, 386, 4, "connector", 1380],
] as const;

function delayStyle(delay: number): CSSProperties {
  return { "--delay": `${delay}ms` } as CSSProperties;
}

export function CpuCircuitBackdrop() {
  return (
    <div className="cpu-circuit-backdrop" aria-hidden="true">
      <svg className="cpu-circuit-backdrop__board" viewBox="0 0 1440 900" preserveAspectRatio="none" focusable="false">
        <defs>
          <radialGradient id="cpuCircuitGlow" cx="50%" cy="50%" r="62%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="45%" stopColor="#cfffff" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
          </radialGradient>
          <filter id="cpuCircuitNeon" x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="3" result="soft" />
            <feColorMatrix
              in="soft"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0.85 0 0 0 0 1 0 0 0 0.85 0"
              result="cyan"
            />
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.7" result="edge" />
            <feMerge>
              <feMergeNode in="cyan" />
              <feMergeNode in="edge" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="cpu-circuit-backdrop__traces">
          {[...CIRCUIT_TRACES, ...LONG_TRACES, ...CONNECTOR_TRACES].map(([path, , variant], index) => (
            <path key={`${path}-${index}`} className={`cpu-circuit-backdrop__trace is-${variant}`} d={path} />
          ))}
        </g>

        <g className="cpu-circuit-backdrop__pulses">
          {[...CIRCUIT_TRACES, ...LONG_TRACES, ...CONNECTOR_TRACES].map(([path, delay, , isWarm], index) => (
            <path
              key={`${path}-${index}`}
              className={`cpu-circuit-backdrop__pulse ${isWarm ? "is-warm" : ""}`}
              d={path}
              pathLength={100}
              style={delayStyle(delay)}
            />
          ))}
        </g>

        <g className="cpu-circuit-backdrop__nodes">
          {[...END_NODES, ...CONNECTOR_NODES].map(([cx, cy, r, variant, delay], index) => (
            <circle
              key={`${cx}-${cy}-${index}`}
              className={`cpu-circuit-backdrop__node is-${variant}`}
              cx={cx}
              cy={cy}
              r={r}
              style={delayStyle(delay)}
            />
          ))}
        </g>

        <g className="cpu-circuit-backdrop__cpu">
          <circle className="cpu-circuit-backdrop__halo" cx={CPU_CENTER.x} cy={CPU_CENTER.y} r="96" />
          <image
            className="cpu-circuit-backdrop__image"
            href={cpuReference}
            x={CPU_CENTER.x - 54}
            y={CPU_CENTER.y - 54}
            width="108"
            height="108"
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      </svg>
    </div>
  );
}
