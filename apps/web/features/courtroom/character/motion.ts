// Motion of the character models: their animation clips, and a talking layer driven by the loudness of the voice (the intonation) for the face and the arms.
import type { Air } from "@tribunal/bot/room/world";
import type { AnimationAction, AnimationMixer, ColorRepresentation, Object3D } from "three";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshToonMaterial, PlaneGeometry } from "three";

/** One Blockbench unit in the model's own space */
export const BB = 1 / 16;

export const CLIP_NAMES = ["idle", "walk", "run", "sit", "fight", "jump", "dive", "fall", "flop", "get_up", "hero_land", "hero_rise"] as const;
type ClipName = (typeof CLIP_NAMES)[number];

/** Clips that play once from their start when asked for (the others loop; `fall` too, but only while asked for) */
export const ONE_SHOT_CLIPS: readonly ClipName[] = ["jump", "dive", "flop", "get_up", "hero_land", "hero_rise"];
/** Clips played on demand, not from the start: the jump and the window jump ones */
export const ON_DEMAND_CLIPS: readonly ClipName[] = [...ONE_SHOT_CLIPS, "fall"];
/** Length of `flop` and of `hero_land`, after which `get_up` and `hero_rise` take over */
const FLOP_CLIP_S = 0.4;
const HERO_LAND_CLIP_S = 0.5;

export type Clips = {
  mixer: AnimationMixer;
  actions: Partial<Record<ClipName, AnimationAction>>;
  weights: Record<ClipName, number>;
  jumpAt: number;
  /** The window jump clip that owns the body right now */
  forced: ClipName | null;
};

/** The clip that owns the body during a window jump, from the phase and the seconds since it began */
const airClip = (air: Air | null, age: number): ClipName | null => {
  if (air === "dive" || air === "fall") return air;
  if (air === "flop") return age < FLOP_CLIP_S ? "flop" : "get_up";
  if (air === "hero") return age < HERO_LAND_CLIP_S ? "hero_land" : "hero_rise";

  return null;
};

type Voice = {
  /** Slow average of the loudness: a sharp rise above it is an emphasis */
  slow: number;
  /** How much the talking layer holds the arms, from 0 (rest) to 1 */
  activity: number;
  emphasisAt: number;
  strength: number;
  kind: number;
  hand: number;
  phraseAt: number;
  tilt: number;
  /** The phrase had a voice level (otherwise beats are made up) */
  voiced: boolean;
  wasSpeaking: boolean;
  loudFor: number;
  mouth: number;
  blinkAt: number;
};

/** Overlays on the painted face, in head space */
export type Face = {
  mouth: Mesh;
  lids: Mesh[];
  brows: Mesh[];
  /** The moustache cubes, lifted with the open mouth (the judge's hides his mouth) */
  stache: Group;
  voice: Voice;
  dispose: () => void;
};

/** The joints the animation loop moves, as [the character's left (-X), right (+X)] */
export type Rig = {
  arms: [Object3D | null, Object3D | null];
  elbows: [Object3D | null, Object3D | null];
  wrists: [Object3D | null, Object3D | null];
  legs: [Object3D | null, Object3D | null];
  knees: [Object3D | null, Object3D | null];
  head: Object3D | null;
  /** The judge holds a gavel in his right hand (the character's left): he bangs it on emphases */
  gavel: boolean;
  clips?: Clips;
  face?: Face;
};

/** Plays the clips of the current state (crossfaded) and tells whether they drive the body; without the needed clip the procedural motion does */
export const driveClips = (clips: Clips, state: {
  walk: number;
  run: number;
  seated: boolean;
  fighting: boolean;
  jumpAt: number;
  /** Window jump phase and seconds since it began */
  air: Air | null;
  airAge: number;
}, delta: number) => {
  const { actions, weights } = clips;
  const forced = airClip(state.air, state.airAge);
  const driven = forced !== null || (state.fighting ? actions.fight !== undefined : state.seated ? actions.sit !== undefined : actions.idle !== undefined && actions.walk !== undefined);

  if (forced !== clips.forced) {
    clips.forced = forced;
    if (forced !== null) actions[forced]?.reset().play();
  }

  if (driven && state.jumpAt !== clips.jumpAt && state.jumpAt > 0) actions.jump?.reset().play();

  clips.jumpAt = state.jumpAt;
  const jumping = driven && forced === null && actions.jump?.isRunning() === true;
  const targets: Record<ClipName, number> = {
    idle: 0,
    walk: 0,
    run: 0,
    sit: 0,
    fight: 0,
    jump: jumping ? 1 : 0,
    dive: 0,
    fall: 0,
    flop: 0,
    get_up: 0,
    hero_land: 0,
    hero_rise: 0,
  };

  if (forced !== null) targets[forced] = 1;
  else if (driven && !jumping) {
    if (state.fighting) targets.fight = 1;
    else if (state.seated) targets.sit = 1;
    else {
      targets.idle = 1 - state.walk;
      targets.run = actions.run === undefined ? 0 : state.walk * state.run;
      targets.walk = state.walk - targets.run;
    }
  }

  for (const name of CLIP_NAMES) {
    weights[name] += (targets[name] - weights[name]) * (1 - Math.exp(-delta * 10));
    actions[name]?.setEffectiveWeight(weights[name]);
  }

  clips.mixer.update(delta);
};

// The painted faces are 40x38 px over 10x9.6 units, their top 9.6 units above the head joint, with the eyes 2.25 units off the middle.
const FACE_Z = -4.6 * BB;
const EYE_X = 2.25 * BB;
const BROW_Y = 6.2 * BB;

/** Where the overlays go on a painted face, in units above the head joint */
export type FaceSpec = {
  /** Top of the eyes, where the eyelids hang from */
  lidTop: number;
  /** Just above the painted mouth line */
  mouthTop: number;
  /** 3D brows over the painted ones (faces with their own 3D or painted brows have none) */
  brows: boolean;
};

/** Adds the open mouth, the eyelids and the brows (over the painted ones) to the head of the model; the eyelids take the colour of the skin */
export const buildFace = (head: Object3D, spec: FaceSpec, skin: ColorRepresentation): Face => {
  const inside = new MeshBasicMaterial({ color: "#5a1f2e" });
  const ink = new MeshBasicMaterial({ color: "#3a2420" });
  const lid = new MeshToonMaterial({ color: skin });
  const mouthGeometry = new PlaneGeometry(2.6 * BB, BB).translate(0, -BB / 2, 0);
  const lidGeometry = new PlaneGeometry(1.9 * BB, 1.95 * BB).translate(0, -0.975 * BB, 0);
  const browGeometry = new BoxGeometry(1.8 * BB, 0.4 * BB, 0.3 * BB);

  // Planes face +Z and the model faces -Z: they are turned around.
  const mouth = new Mesh(mouthGeometry, inside);
  mouth.position.set(0, spec.mouthTop * BB, FACE_Z);
  mouth.rotation.y = Math.PI;
  mouth.visible = false;
  const lids = [-1, 1].map((side) => {
    const mesh = new Mesh(lidGeometry, lid);
    mesh.position.set(side * EYE_X, spec.lidTop * BB, FACE_Z);
    mesh.rotation.y = Math.PI;
    mesh.visible = false;
    return mesh;
  });
  const brows = (spec.brows ? [-1, 1] : []).map((side) => {
    const mesh = new Mesh(browGeometry, ink);
    mesh.position.set(side * EYE_X, BROW_Y, FACE_Z - 0.1 * BB);
    return mesh;
  });
  const stache = new Group();

  for (const part of head.children.filter((child) => child.name.startsWith("stache_"))) stache.add(part);

  head.add(mouth, ...lids, ...brows, stache);

  return {
    mouth,
    lids,
    brows,
    stache,
    voice: {
      slow: 0,
      activity: 0,
      emphasisAt: -10,
      strength: 0,
      kind: 0,
      hand: 0,
      phraseAt: 0,
      tilt: 1,
      voiced: false,
      wasSpeaking: false,
      loudFor: 0,
      mouth: 0,
      blinkAt: 0,
    },
    // GPU resources only: the meshes stay on the head, which is dropped with the model (and reused if React mounts it again).
    dispose: () => {
      for (const disposable of [inside, ink, lid, mouthGeometry, lidGeometry, browGeometry]) disposable.dispose();
    },
  };
};

type ArmPose = {
  x: number;
  z: number;
  elbow: number;
  wrist: number;
};

/**
 * Pose of an arm at the peak of an emphasis, in model space (+X raises the arm, the forearm or the hand forward, `side` spreads it outward):
 * a chop, open palms, a finger pointed forward, or both hands up when very loud. One-handed gestures leave the other arm calm.
 */
const emphasisPose = (kind: number, dominant: boolean, side: number, calm: ArmPose): ArmPose => {
  if (kind === 0) return dominant ? {
    x: 1,
    z: side * 0.15,
    elbow: 1.3,
    wrist: -0.5,
  } : calm;
  if (kind === 1) return {
    x: 0.7,
    z: side * 0.7,
    elbow: 0.6,
    wrist: 0.6,
  };
  if (kind === 2) return dominant ? {
    x: 1.45,
    z: side * 0.05,
    elbow: 0.05,
    wrist: 0.1,
  } : calm;
  return {
    x: 2.7,
    z: side * 0.35,
    elbow: 0.5,
    wrist: 0.3,
  };
};

/** Talking layer of the member model, applied over the clips or the procedural motion: face, arms, elbows, wrists and head */
export const animateTalk = (rig: Rig, face: Face, { time, delta, speaking, level, sleeping, sleepy }: {
  time: number;
  delta: number;
  speaking: boolean;
  level: number;
  sleeping: boolean;
  sleepy: boolean;
}) => {
  const voice = face.voice;
  const ease = (rate: number) => 1 - Math.exp(-delta * rate);
  const loud = speaking ? level : 0;
  const attack = loud - voice.slow;
  voice.slow += (loud - voice.slow) * ease(1.5);
  voice.loudFor = voice.slow > 0.5 ? voice.loudFor + delta : Math.max(0, voice.loudFor - delta * 2);

  if (speaking && !voice.wasSpeaking) {
    voice.phraseAt = time;
    voice.tilt = Math.random() < 0.5 ? -1 : 1;
    voice.voiced = false;
  }

  if (level > 0) voice.voiced = true;

  // An emphasis on each sharp rise of the voice; without a voice level, one at the start of the phrase and every few seconds:
  const made = speaking && !voice.voiced && (!voice.wasSpeaking || time - voice.emphasisAt > 2.4);

  if ((speaking && attack > 0.2 && time - voice.emphasisAt > 0.3) || made) {
    voice.emphasisAt = time;
    voice.strength = made ? 0.5 : Math.min(1, loud);
    voice.kind = voice.strength > 0.85 ? 3 : Math.floor(Math.random() * 3);
    voice.hand = Math.random() < 0.6 ? 0 : 1;

    // The judge bangs his gavel on half of his emphases:
    if (rig.gavel && Math.random() < 0.5) {
      voice.kind = 0;
      voice.hand = 0;
    }
  }

  voice.wasSpeaking = speaking;
  // Calm hands while the voice goes on, back to rest when it stays low or stops:
  voice.activity += ((speaking ? (voice.voiced ? Math.min(1, voice.slow * 2.5) : 0.5) : 0) - voice.activity) * ease(speaking ? 4 : 2.5);
  // Quick rise, then a fall that is faster when the voice is louder:
  const since = time - voice.emphasisAt;
  const envelope = speaking ? (since < 0.07 ? since / 0.07 : Math.exp(-(since - 0.07) * (4 + voice.strength * 4))) : 0;
  const size = 0.6 + voice.strength * 0.6;
  const hold = Math.max(voice.activity, envelope);

  for (const index of [0, 1] as const) {
    const arm = rig.arms[index];
    const elbow = rig.elbows[index];
    const wrist = rig.wrists[index];
    // The character's left arm is the model's right one, on its +X side:
    const side = index === 0 ? 1 : -1;
    const calm: ArmPose = {
      x: 0.35 + Math.sin(time * 2.3 + index * 1.9) * 0.08,
      z: side * 0.12,
      elbow: 0.9 + Math.sin(time * 3.1 + index * 1.7) * 0.15,
      wrist: Math.sin(time * 4 + index) * 0.2,
    };
    const peak = emphasisPose(voice.kind, index === voice.hand, side, calm);
    const blend = (rest: number, top: number) => rest + (top * size - rest) * envelope;
    let pose: ArmPose = {
      x: blend(calm.x, peak.x),
      z: blend(calm.z, peak.z),
      elbow: blend(calm.elbow, peak.elbow),
      wrist: blend(calm.wrist, peak.wrist),
    };
    let weight = hold;

    // A gavel bang: raised in 0.18 s, slammed down on the desk in 0.06 s, then back to the calm pose.
    if (rig.gavel && voice.kind === 0 && index === voice.hand && speaking) {
      const raised = since < 0.18 ? since / 0.18 : Math.max(0, 1 - (since - 0.18) / 0.06);
      const hit = since < 0.18 ? 0 : since < 0.24 ? (since - 0.18) / 0.06 : Math.exp(-(since - 0.24) * 5);
      pose = {
        x: calm.x + (0.9 - calm.x) * raised + (0.5 - calm.x) * hit,
        z: calm.z,
        elbow: calm.elbow + (1.9 - calm.elbow) * raised + (0.7 - calm.elbow) * hit,
        wrist: calm.wrist + (-0.5 - calm.wrist) * raised + (0.9 - calm.wrist) * hit,
      };
      weight = Math.max(hold, raised, hit);
    }

    if (arm !== null) {
      arm.rotation.x += (pose.x - arm.rotation.x) * weight;
      arm.rotation.z += (pose.z - arm.rotation.z) * weight;
    }

    if (elbow !== null) elbow.rotation.x += (pose.elbow - elbow.rotation.x) * weight;
    if (wrist !== null) wrist.rotation.x += (pose.wrist - wrist.rotation.x) * weight;
  }

  // The head nods forward (-X) on each emphasis and tilts slowly during a long phrase:
  if (rig.head !== null) {
    rig.head.rotation.x -= envelope * voice.strength * 0.2;
    rig.head.rotation.z += voice.tilt * 0.08 * Math.min(1, (time - voice.phraseAt) / 2.5) * voice.activity;
  }

  // Mouth: hidden at rest (the painted line), open with the syllables, wider and taller when loud and on emphases.
  const syllable = Math.abs(Math.sin(time * (13 + loud * 5)) * Math.sin(time * 5.7 + 1.3));
  const open = speaking ? syllable * (0.25 + (voice.voiced ? loud : 0.5)) + envelope * voice.strength * 0.4 : 0;
  voice.mouth += (open - voice.mouth) * ease(25);
  face.mouth.visible = voice.mouth > 0.06;
  face.mouth.scale.set(0.7 + voice.mouth * 0.5, 0.4 + voice.mouth * 1.6, 1);
  face.stache.position.y = voice.mouth * 0.8 * BB;

  // Eyelids: a blink every 2 to 6 seconds, closed when asleep, half closed on sleepy members.
  if (time > voice.blinkAt + 0.13) voice.blinkAt = time + 2 + Math.random() * 4;

  const closed = sleeping || time >= voice.blinkAt ? 1 : sleepy ? 0.4 : 0;

  for (const lid of face.lids) {
    lid.visible = closed > 0;
    lid.scale.y = Math.max(closed, 0.001);
  }

  // Brows rise on loud peaks and frown (inner ends down) when the voice stays loud:
  const raise = envelope * voice.strength * 0.7;
  const frown = Math.min(1, voice.loudFor / 1.5);

  for (const brow of face.brows) {
    brow.position.y = BROW_Y + (raise - frown * 0.2) * BB;
    brow.rotation.z = Math.sign(brow.position.x) * 0.3 * frown;
  }
};

/** The clerk typing, over the seated clip: forearms forward on the desk, hands close together and tapping the keys */
export const animateTyping = (rig: Rig, time: number) => {
  for (const index of [0, 1] as const) {
    const side = index === 0 ? 1 : -1;
    rig.arms[index]?.rotation.set(0.45, 0, -side * 0.12);
    rig.elbows[index]?.rotation.set(1.05, 0, 0);
    rig.wrists[index]?.rotation.set(0.1 - Math.max(0, Math.sin(time * 18 + index * 2.1)) * 0.5, 0, 0);
  }
};
