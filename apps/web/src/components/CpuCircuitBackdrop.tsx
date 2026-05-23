import type { CSSProperties } from "react";
import cpuReference from "../assets/cpu-real-reference.png";

const BASE_TRACES = [
  "M218 90 V174 L274 230 V420 H407",
  "M282 70 V154 L324 196 V421 H407",
  "M344 42 V136 L370 162 V421 H407",
  "M406 78 V132 L426 152 V421 H407",
  "M462 50 V142 H452 V421 H407",
  "M512 74 V421",
  "M560 44 V142 H572 V421 H617",
  "M612 82 V154 L596 170 V421 H617",
  "M674 64 V158 L628 204 V421 H617",
  "M736 96 V180 L676 240 V421 H617",
  "M218 934 V852 L274 796 V604 H407",
  "M282 954 V870 L324 828 V603 H407",
  "M344 982 V888 L370 862 V603 H407",
  "M406 946 V892 L426 872 V603 H407",
  "M462 974 V882 H452 V603 H407",
  "M512 950 V603",
  "M560 980 V882 H572 V603 H617",
  "M612 942 V870 L596 854 V603 H617",
  "M674 960 V866 L628 820 V603 H617",
  "M736 928 V844 L676 784 V603 H617",
  "M52 418 H126 L168 460 H407",
  "M98 368 H192 L246 422 H407",
  "M38 492 H126 L178 440 H407",
  "M70 544 H160 L202 502 H407",
  "M112 610 H244 L286 568 H407",
  "M46 654 H136 L190 600 H407",
  "M80 708 H190 L252 646 H407",
  "M122 770 H218 L300 688 V603 H407",
  "M80 318 H214 L320 424 H407",
  "M152 280 H244 L346 422 H407",
  "M972 418 H898 L856 460 H617",
  "M926 368 H832 L778 422 H617",
  "M986 492 H898 L846 440 H617",
  "M954 544 H864 L822 502 H617",
  "M912 610 H780 L738 568 H617",
  "M978 654 H888 L834 600 H617",
  "M944 708 H834 L772 646 H617",
  "M902 770 H806 L724 688 V603 H617",
  "M944 318 H810 L704 424 H617",
  "M872 280 H780 L678 422 H617",
] as const;

const PULSE_TRACES = [
  ["M407 420 H274 V230 L218 174 V90", 0],
  ["M407 421 H324 V196 L282 154 V70", 42, true],
  ["M407 421 H370 V162 L344 136 V42", 84],
  ["M407 421 H426 V152 L406 132 V78", 126],
  ["M407 421 H452 V142 H462 V50", 168, true],
  ["M512 421 V74", 210],
  ["M617 421 H572 V142 H560 V44", 252],
  ["M617 421 H596 V170 L612 154 V82", 294, true],
  ["M617 421 H628 V204 L674 158 V64", 336],
  ["M617 421 H676 V240 L736 180 V96", 378],
  ["M407 460 H168 L126 418 H52", 24, true],
  ["M407 422 H246 L192 368 H98", 66],
  ["M407 440 H178 L126 492 H38", 108],
  ["M407 502 H202 L160 544 H70", 150, true],
  ["M407 568 H286 L244 610 H112", 192],
  ["M407 600 H190 L136 654 H46", 234],
  ["M407 646 H252 L190 708 H80", 276, true],
  ["M407 603 H300 V688 L218 770 H122", 318],
  ["M407 424 H320 L214 318 H80", 360],
  ["M407 422 H346 L244 280 H152", 402, true],
  ["M617 460 H856 L898 418 H972", 30],
  ["M617 422 H778 L832 368 H926", 72, true],
  ["M617 440 H846 L898 492 H986", 114],
  ["M617 502 H822 L864 544 H954", 156],
  ["M617 568 H738 L780 610 H912", 198, true],
  ["M617 600 H834 L888 654 H978", 240],
  ["M617 646 H772 L834 708 H944", 282],
  ["M617 603 H724 V688 L806 770 H902", 324, true],
  ["M617 424 H704 L810 318 H944", 366],
  ["M617 422 H678 L780 280 H872", 408, true],
  ["M407 604 H274 V796 L218 852 V934", 48],
  ["M407 603 H324 V828 L282 870 V954", 90, true],
  ["M407 603 H370 V862 L344 888 V982", 132],
  ["M407 603 H426 V872 L406 892 V946", 174],
  ["M407 603 H452 V882 H462 V974", 216, true],
  ["M512 603 V950", 258],
  ["M617 603 H572 V882 H560 V980", 300],
  ["M617 603 H596 V854 L612 870 V942", 342, true],
  ["M617 603 H628 V820 L674 866 V960", 384],
  ["M617 603 H676 V784 L736 844 V928", 426],
] as const;

const NODES = [
  [218, 90, 7, "solid", 0],
  [282, 70, 13, "ring", 80],
  [344, 42, 10, "", 160],
  [406, 78, 12, "ring", 240],
  [462, 50, 8, "", 320],
  [512, 74, 13, "ring", 400],
  [560, 44, 10, "", 480],
  [612, 82, 8, "", 560],
  [674, 64, 13, "ring", 640],
  [736, 96, 7, "solid", 720],
  [52, 418, 13, "ring", 90],
  [98, 368, 8, "", 170],
  [38, 492, 13, "ring", 250],
  [70, 544, 8, "", 330],
  [112, 610, 7, "solid", 410],
  [46, 654, 13, "ring", 490],
  [80, 708, 8, "", 570],
  [122, 770, 7, "solid", 650],
  [80, 318, 7, "solid", 730],
  [152, 280, 8, "", 810],
  [972, 418, 13, "ring", 130],
  [926, 368, 8, "", 210],
  [986, 492, 13, "ring", 290],
  [954, 544, 8, "", 370],
  [912, 610, 7, "solid", 450],
  [978, 654, 13, "ring", 530],
  [944, 708, 8, "", 610],
  [902, 770, 7, "solid", 690],
  [944, 318, 8, "", 770],
  [872, 280, 7, "solid", 850],
  [218, 934, 7, "solid", 120],
  [282, 954, 13, "ring", 200],
  [344, 982, 10, "", 280],
  [406, 946, 12, "ring", 360],
  [462, 974, 8, "", 440],
  [512, 950, 13, "ring", 520],
  [560, 980, 10, "", 600],
  [612, 942, 8, "", 680],
  [674, 960, 13, "ring", 760],
  [736, 928, 7, "solid", 840],
] as const;

function delayStyle(delay: number): CSSProperties {
  return { "--delay": `${delay}ms` } as CSSProperties;
}

export function CpuCircuitBackdrop() {
  return (
    <div className="cpu-circuit-backdrop" aria-hidden="true">
      <svg className="cpu-circuit-backdrop__board" viewBox="0 0 1024 1024" focusable="false">
        <defs>
          <radialGradient id="cpuCircuitGlow" cx="50%" cy="50%" r="62%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="44%" stopColor="#cfffff" stopOpacity="0.58" />
            <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
          </radialGradient>
          <filter id="cpuCircuitNeon" x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="4" result="soft" />
            <feColorMatrix
              in="soft"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0.85 0 0 0 0 1 0 0 0 0.9 0"
              result="cyan"
            />
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="edge" />
            <feMerge>
              <feMergeNode in="cyan" />
              <feMergeNode in="edge" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="cpu-circuit-backdrop__traces">
          {BASE_TRACES.map((path, index) => (
            <path key={`${path}-${index}`} className={`cpu-circuit-backdrop__trace ${index % 5 === 3 ? "is-thin" : ""}`} d={path} />
          ))}
        </g>

        <g className="cpu-circuit-backdrop__pulses">
          {PULSE_TRACES.map(([path, delay, isWarm], index) => (
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
          {NODES.map(([cx, cy, r, variant, delay], index) => (
            <circle
              key={`${cx}-${cy}-${index}`}
              className={`cpu-circuit-backdrop__node ${variant ? `is-${variant}` : ""}`}
              cx={cx}
              cy={cy}
              r={r}
              style={delayStyle(delay)}
            />
          ))}
        </g>

        <g className="cpu-circuit-backdrop__cpu">
          <circle className="cpu-circuit-backdrop__halo" cx="512" cy="512" r="170" />
          <image
            className="cpu-circuit-backdrop__image"
            href={cpuReference}
            x="334"
            y="334"
            width="356"
            height="356"
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      </svg>
    </div>
  );
}
