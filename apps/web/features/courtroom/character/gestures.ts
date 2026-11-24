// Arm gestures while talking and the motion constants of the characters.

export type ArmPose = {
  x: number;
  outward: number;
  wobble?: number;
};
type Gesture = {
  left: ArmPose;
  right: ArmPose;
};

export const IDLE: ArmPose = {
  x: 0,
  outward: 0.07,
};

// Gestures an arm can make while talking, x raises it forward and outward spreads it from the body:
const gestures: Record<string, Gesture> = {
  explain: {
    left: IDLE,
    right: {
      x: -1.3,
      outward: 0.35,
      wobble: 0.25,
    },
  },
  open: {
    left: {
      x: -0.7,
      outward: 0.9,
      wobble: 0.1,
    },
    right: {
      x: -0.7,
      outward: 0.9,
      wobble: 0.1,
    },
  },
  point: {
    left: IDLE,
    right: {
      x: -1.5,
      outward: 0.1,
      wobble: 0.05,
    },
  },
  cross: {
    left: {
      x: -1.1,
      outward: -0.75,
      wobble: 0.04,
    },
    right: {
      x: -1.1,
      outward: -0.75,
      wobble: 0.04,
    },
  },
  chop: {
    left: IDLE,
    right: {
      x: -1,
      outward: 0.2,
      wobble: 0.45,
    },
  },
  emphasis: {
    left: {
      x: -1,
      outward: 0.5,
      wobble: 0.3,
    },
    right: {
      x: -1,
      outward: 0.5,
      wobble: 0.3,
    },
  },
};

// Each member talks with one pack of gestures, picked from their appearance:
export const gesturePacks: Gesture[][] = [
  [gestures.explain, gestures.open, gestures.point],
  [gestures.cross, gestures.explain, gestures.emphasis],
  [gestures.chop, gestures.emphasis, gestures.open, gestures.point],
  [gestures.open, gestures.cross, gestures.chop],
].map((pack) => pack.filter((gesture): gesture is Gesture => gesture !== undefined));

export const GESTURE_SECONDS = 2.4;
// Remote members arrive in steps of 100 ms: the character follows them smoothly and reads a little ahead from their last speed.
export const FOLLOW_RATE = 14;
export const TURN_RATE = 12;
export const EXTRAPOLATE_SECONDS = 0.1;
export const STALE_SECONDS = 0.25;
export const STRIDE_PER_METER = 2.4;
/** Depth of the flat front face of the 8-sided torso, as a share of its radius (cos 22.5° × 0.62 depth scale) */
export const FRONT = 0.573;
export const EIGHTH = Math.PI / 8;
