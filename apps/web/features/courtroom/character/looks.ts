// Appearance of the members: every member gets a stable look from their ID, the colours that tint their model.
const skinTones = ["#ffd1a1", "#efb88d", "#d6986a", "#b97953", "#8d563f", "#6e4538"] as const;
const hairColors = ["#2b1d1a", "#4a2c26", "#85512e", "#d8a254", "#b75f38", "#3a3547", "#b2a6a6", "#ece4d8", "#7a3fb0", "#2f6f8f"] as const;
const mainColors = ["#4f1a80", "#7e1f3a", "#1f3a5f", "#24533a", "#2e2b36", "#b8771a", "#1f6f73", "#6b4226", "#5b2a5e"] as const;
const pantsColors = ["#2a2633", "#232c45", "#4a3326", "#5b5866", "#a8916b"] as const;
const accentColors = ["#f2bd3c", "#cf3934", "#3fb5a8", "#e0679a", "#9b55e0", "#e8812a"] as const;
const shoeColors = ["#1c1420", "#4a2a1a", "#6b3a22"] as const;

export type Look = {
  skin: string;
  hair: string;
  main: string;
  pants: string;
  /** Colour of the avatar badge */
  accent: string;
  shoes: string;
  /** Half-closed eyelids */
  sleepy: boolean;
};

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

export const memberLook = (id: string): Look => {
  const random = randomFor(id);
  return {
    skin: pick(random, skinTones),
    hair: pick(random, hairColors),
    main: pick(random, mainColors),
    pants: pick(random, pantsColors),
    accent: pick(random, accentColors),
    shoes: pick(random, shoeColors),
    sleepy: random() < 0.15,
  };
};
