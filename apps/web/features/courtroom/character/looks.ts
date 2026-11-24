// Appearance of the characters: every member gets a stable look from their ID; the judge, the police and the clerk have their own.
import { Color } from "three";

const skinTones = [
  {
    skin: "#ffd1a1",
    shade: "#edac7d",
  },
  {
    skin: "#efb88d",
    shade: "#d68d65",
  },
  {
    skin: "#d6986a",
    shade: "#b9714e",
  },
  {
    skin: "#b97953",
    shade: "#93533b",
  },
  {
    skin: "#8d563f",
    shade: "#703b32",
  },
  {
    skin: "#6e4538",
    shade: "#533128",
  },
] as const;
const hairColors = ["#2b1d1a", "#4a2c26", "#85512e", "#d8a254", "#b75f38", "#3a3547", "#b2a6a6", "#ece4d8", "#7a3fb0", "#2f6f8f"] as const;
const mainColors = ["#4f1a80", "#7e1f3a", "#1f3a5f", "#24533a", "#2e2b36", "#b8771a", "#1f6f73", "#6b4226", "#5b2a5e"] as const;
const pantsColors = ["#2a2633", "#232c45", "#4a3326", "#5b5866", "#a8916b"] as const;
const shirtColors = ["#fff9ee", "#dfe9f5", "#f5e2e8"] as const;
const accentColors = ["#f2bd3c", "#cf3934", "#3fb5a8", "#e0679a", "#9b55e0", "#e8812a"] as const;
const shoeColors = ["#1c1420", "#4a2a1a", "#6b3a22"] as const;
const outfits = ["robe", "suit", "vest", "sweater"] as const;
const builds = [0.94, 1, 1.08, 1.16] as const;
const facials = ["mustache", "beard", "goatee"] as const;

type Outfit = (typeof outfits)[number] | "judge";
type Facial = (typeof facials)[number] | "none" | "handlebar";

export type Look = {
  skin: string;
  shade: string;
  hair: string;
  hairStyle: number;
  /** Eyebrow thickness factor and tilt (positive frowns) */
  brow: number;
  browTilt: number;
  nose: number;
  mouth: number;
  facial: Facial;
  glasses: boolean;
  /** Half-closed eyelids */
  sleepy: boolean;
  outfit: Outfit;
  main: string;
  trim: string;
  pants: string;
  shirt: string;
  accent: string;
  shoes: string;
  /** Shoulder width factor */
  build: number;
  belly: boolean;
  headWidth: number;
  pack: number;
};

type HairPart = {
  position: [number, number, number];
  scale: [number, number, number];
  tilt?: number;
  cone?: boolean;
};
type HairStyle = {
  cap: boolean;
  parts: HairPart[];
};

// Swept quiff, curls, long bob, receding crown, bun, spikes, buzz cut and a big round cut, all around the same head.
export const hairStyles: HairStyle[] = [
  {
    cap: true,
    parts: [
      {
        position: [-0.055, 0.22, 0.14],
        scale: [0.27, 0.14, 0.18],
        tilt: -0.28,
      },
      {
        position: [0.19, 0.16, 0.055],
        scale: [0.12, 0.19, 0.17],
        tilt: 0.35,
      },
      {
        position: [0, 0.035, -0.18],
        scale: [0.28, 0.26, 0.15],
      },
    ],
  },
  {
    cap: true,
    parts: [-2, -1, 0, 1, 2].map((curl) => ({
      position: [curl * 0.105, 0.31 - Math.abs(curl) * 0.045, 0.12],
      scale: [0.115, 0.115, 0.14],
    })),
  },
  {
    cap: true,
    parts: [
      {
        position: [-0.25, -0.04, -0.045],
        scale: [0.1, 0.31, 0.2],
      },
      {
        position: [0.25, -0.04, -0.045],
        scale: [0.1, 0.31, 0.2],
      },
      {
        position: [0, -0.05, -0.14],
        scale: [0.29, 0.32, 0.1],
      },
      {
        position: [0, 0.03, -0.175],
        scale: [0.285, 0.22, 0.133],
      },
      {
        position: [0, 0.17, 0.19],
        scale: [0.25, 0.08, 0.1],
      },
    ],
  },
  {
    cap: false,
    parts: [
      {
        position: [-0.25, 0.025, -0.06],
        scale: [0.07, 0.15, 0.19],
      },
      {
        position: [0.25, 0.025, -0.06],
        scale: [0.07, 0.15, 0.19],
      },
      {
        position: [0, 0.08, -0.2],
        scale: [0.25, 0.17, 0.12],
      },
    ],
  },
  {
    cap: true,
    parts: [
      {
        position: [0, 0.33, -0.12],
        scale: [0.13, 0.12, 0.13],
      },
      {
        position: [0, 0.17, 0.2],
        scale: [0.24, 0.07, 0.09],
      },
    ],
  },
  {
    cap: true,
    parts: [-0.14, 0, 0.14].flatMap((x) => [0.06, -0.1].map((z) => ({
      position: [x, 0.36 - Math.abs(x) * 0.4, z],
      scale: [0.07, 0.16, 0.07],
      tilt: -x * 1.6,
      cone: true,
    })),
    ),
  },
  {
    cap: true,
    parts: [],
  },
  {
    cap: false,
    parts: [
      {
        position: [0, 0.14, -0.12],
        scale: [0.4, 0.36, 0.32],
      },
    ],
  },
];

export const JUDGE_LOOK: Look = {
  skin: "#f6b58c",
  shade: "#e48c66",
  hair: "#f3ecf2",
  hairStyle: -1,
  brow: 2.4,
  browTilt: 0,
  nose: 2,
  mouth: 1,
  facial: "handlebar",
  glasses: false,
  sleepy: true,
  outfit: "judge",
  main: "#3b2252",
  trim: "#56327a",
  pants: "#2a2633",
  shirt: "#fff9ee",
  accent: "#f2bd3c",
  shoes: "#1c1420",
  build: 1.16,
  belly: true,
  headWidth: 1.06,
  pack: 0,
};
export const POLICE_LOOK: Look = {
  ...JUDGE_LOOK,
  skin: "#e9a77f",
  shade: "#c98462",
  hair: "#2b1d1a",
  hairStyle: 0,
  brow: 1.8,
  facial: "mustache",
  sleepy: false,
  outfit: "suit",
  main: "#1f3a5f",
  trim: "#2c4d78",
  pants: "#1b2638",
  shirt: "#dfe9f5",
  accent: "#f2bd3c",
  belly: false,
  build: 1.16,
  pack: 2,
};

export const CLERK_LOOK: Look = {
  ...JUDGE_LOOK,
  skin: "#f1c6a4",
  shade: "#d9a382",
  hair: "#b2a6a6",
  hairStyle: 1,
  brow: 1.2,
  facial: "none",
  glasses: true,
  sleepy: true,
  outfit: "robe",
  main: "#2e2b36",
  trim: "#45414f",
  accent: "#3fb5a8",
  belly: false,
  build: 0.94,
  headWidth: 0.97,
  pack: 1,
};

export const WIG_SHADE = "#cdbfcc";
export const JUDGE_BROWS = "#3d2633";

// Stable member IDs keep appearances identical across clients and display-name changes.
const randomFor = (id: string) => {
  let seed = 2_166_136_261;

  for (let index = 0; index < id.length; index += 1) seed = Math.imul(seed ^ id.charCodeAt(index), 16_777_619);
  // Mulberry32: every trait gets its own draw instead of sharing bits of one hash.
  return () => {
    seed = (seed + 0x6d_2b_79_f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const pick = <L extends readonly [unknown, ...unknown[]]>(random: () => number, list: L): L[number] => list[Math.floor(random() * list.length)] ?? list[0];

const lighten = (hex: string, amount: number) => `#${new Color(hex).offsetHSL(0, 0, amount).getHexString()}`;

export const memberLook = (id: string): Look => {
  const random = randomFor(id);
  const tone = pick(random, skinTones);
  const main = pick(random, mainColors);
  const build = pick(random, builds);
  return {
    skin: tone.skin,
    shade: tone.shade,
    hair: pick(random, hairColors),
    hairStyle: Math.floor(random() * hairStyles.length),
    brow: 1 + random() * 1.2,
    browTilt: (random() - 0.5) * 0.5,
    nose: Math.floor(random() * 3),
    mouth: Math.floor(random() * 3),
    facial: random() < 0.55 ? "none" : pick(random, facials),
    glasses: random() < 0.22,
    sleepy: random() < 0.15,
    outfit: pick(random, outfits),
    main,
    trim: lighten(main, 0.08),
    pants: pick(random, pantsColors),
    shirt: pick(random, shirtColors),
    accent: pick(random, accentColors),
    shoes: pick(random, shoeColors),
    build,
    belly: build >= 1.08 && random() < 0.5,
    headWidth: 0.95 + random() * 0.1,
    pack: Math.floor(random() * 4),
  };
};
