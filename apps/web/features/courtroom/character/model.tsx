"use client";

// Body of a character: the Blockbench model of a member (tinted with their look) or of a court officer (own colours), drawn in the toon style of the room, with its clips.
import type { Look } from "./looks";
import type { Clips, FaceSpec, Rig } from "./motion";
import type { Suit } from "@tribunal/bot/room/world";
import type { RefObject } from "react";
import type { Texture } from "three";
import { InkOutlines, mergeCubes, toonify } from "../toon-model";
import { lookTints, SUIT_TINTS } from "./looks";
import { BB, buildFace, CLIP_NAMES, ON_DEMAND_CLIPS, ONE_SHOT_CLIPS } from "./motion";
import { facetGeometry, Toon } from "./parts";
import { useGLTF } from "@react-three/drei";
import { createPortal } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { AnimationMixer, Color, LoopOnce } from "three";

export type ModelKind = "member" | "judge" | "police" | "clerk";

/**
 * The models share one rig and their clips. `skin` is the colour painted on the head (the member's light grey is tinted with their skin),
 * the face says where the overlays go on each painted face: the judge has painted half-closed lids and the judge and the police 3D brows,
 * the clerk painted brows above his glasses.
 */
const MODELS: Record<ModelKind, { url: string; skin: string; face: FaceSpec }> = {
  member: {
    url: "/models/member.gltf",
    skin: "#f2f2f2",
    face: {
      lidTop: 5.9,
      mouthTop: 2.3,
      brows: true,
    },
  },
  judge: {
    url: "/models/judge.gltf",
    skin: "#f5b58c",
    face: {
      lidTop: 5.9,
      mouthTop: 1.3,
      brows: false,
    },
  },
  police: {
    url: "/models/police.gltf",
    skin: "#e8a67f",
    face: {
      lidTop: 5.4,
      mouthTop: 1.3,
      brows: false,
    },
  },
  clerk: {
    url: "/models/clerk.gltf",
    skin: "#f1c6a4",
    face: {
      lidTop: 5.65,
      mouthTop: 1.3,
      brows: false,
    },
  },
};
/** The model is about 1.85 m tall (1 Blockbench unit = 1/16 m): scaled to the ~2.05 m of the room */
const MODEL_SCALE = 1.1;
const BENCH_SEAT = 0.5;
const CHAIR_SEAT = 0.45;
// Small details, thin bars and the transparent face plate stay without an ink outline:
const UNOUTLINED
  = /face|button|buckle|belt|tie|collar|pocket|tip|thumb|bang|hairline|hair_crown|sole|cuff|ear|nose|neck|glasses|brow|stache|chin|wig_(roll|ridge|bow)|gavel_(handle|band|knob)|pen_|jabot|badge|epaulette|stripe|stole|gold_band|baton|cap_cord|shirt_v|lapel|patch|burn|rim/u;

/** Meshes the code looks up by name: the moustache follows the mouth, the gavel is found by its head */
const KEPT_APART = /^(stache_|gavel_head$)/u;

/** Height of the character's origin: seated, the underside of the thighs (8.15 units under the hips at rest, 10 units high) rests on the seat */
export const modelBaseY = (seated: boolean, onBench: boolean, elevation: number) => {
  if (!seated) return elevation;

  return (onBench ? BENCH_SEAT : CHAIR_SEAT + elevation) - 8.15 * BB * MODEL_SCALE;
};

/** A member's model is tinted with their `look` and wears their avatar badge; the officers have none */
export const CharacterModel = ({ kind, look, suit = null, texture, splat, rigRef }: {
  kind: ModelKind;
  look?: Look;
  /** Spider-Man suit worn instead of the look (members only) */
  suit?: Suit | null;
  texture: Texture | null;
  splat: boolean;
  rigRef: RefObject<Rig | null>;
}) => {
  const spec = MODELS[kind];
  const { scene, animations } = useGLTF(spec.url);
  const model = useMemo(() => {
    mergeCubes(scene, (mesh) => !UNOUTLINED.test(mesh.name), KEPT_APART);
    const root = scene.clone(true);
    // The member's skin, hair, vest, pants and shoes are painted in light grey and tinted; the shirt, tie, belt, face and the officers keep their colours.
    const tints: Record<string, string> = look === undefined ? {} : lookTints(look);
    const { materials, outlined } = toonify(root, (mesh) => mesh.userData.outline === true, tints);

    const mixer = new AnimationMixer(root);
    const actions: Clips["actions"] = {};

    for (const name of CLIP_NAMES) {
      const clip = animations.find((animation) => animation.name === name);

      if (clip === undefined) continue;

      const action = mixer.clipAction(clip).setEffectiveWeight(0);
      if (ONE_SHOT_CLIPS.includes(name)) {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      if (!ON_DEMAND_CLIPS.includes(name)) action.play();
      actions[name] = action;
    }

    const node = (name: string) => root.getObjectByName(name) ?? null;
    const head = node("head");
    // The model's own right side (+X) ends up on the character's left once turned around:
    const rig: Rig = {
      arms: [node("arm_upper_right"), node("arm_upper_left")],
      elbows: [node("arm_lower_right"), node("arm_lower_left")],
      wrists: [node("hand_right"), node("hand_left")],
      legs: [node("leg_upper_right"), node("leg_upper_left")],
      knees: [node("leg_lower_right"), node("leg_lower_left")],
      head,
      gavel: node("gavel_head") !== null,
      clips: Object.keys(actions).length === 0 ? undefined : {
        mixer,
        actions,
        weights: {
          idle: 0,
          walk: 0,
          run: 0,
          sit: 0,
          fight: 0,
          jump: 0,
          dive: 0,
          fall: 0,
          flop: 0,
          get_up: 0,
          hero_land: 0,
          hero_rise: 0,
        },
        jumpAt: 0,
        forced: null,
      },
      face: head === null ? undefined : buildFace(head, spec.face, new Color(spec.skin).multiply(new Color(tints.skin ?? "#ffffff"))),
    };
    return {
      root,
      rig,
      materials,
      outlined,
      chest: node("chest"),
    };
  }, [scene, animations, look, spec]);

  useEffect(() => {
    rigRef.current = model.rig;
    return () => {
      rigRef.current = null;
    };
  }, [model, rigRef]);

  // The suit recolours the tinted materials in place (no rebuild, so the clips keep playing), the look comes back afterwards:
  useEffect(() => {
    if (look === undefined) return;

    for (const [name, colour] of Object.entries(suit === null ? lookTints(look) : SUIT_TINTS[suit])) {
      const material = model.materials.get(name);
      if (material !== undefined && "color" in material && material.color instanceof Color) material.color.set(colour);
    }
  }, [model, look, suit]);

  // Materials and face overlays belong to this instance only:
  useEffect(
    () => () => {
      model.rig.face?.dispose();
      for (const material of model.materials.values()) material.dispose();
    },
    [model],
  );

  const { head } = model.rig;

  return (
    <group rotation-y={Math.PI} scale={MODEL_SCALE}>
      <primitive object={model.root} />
      <InkOutlines meshes={model.outlined} thickness={0.018 / MODEL_SCALE} />

      {/* A tomato on the face plate (the model faces -Z) */}
      {head !== null
        && splat
        && createPortal(
          <Toon color="#d8262c" outlined position={[-0.6 * BB, 4.8 * BB, -4.7 * BB]} scale={[1.3, 1, 0.45]}>
            <icosahedronGeometry onUpdate={facetGeometry} args={[0.11, 1]} />
          </Toon>,
          head,
        )}

      {/* Discord avatar badge on the left of the vest */}
      {model.chest !== null
        && look !== undefined
        && createPortal(
          <>
            <Toon color={look.accent} position={[-2.6 * BB, 2.6 * BB, -2.95 * BB]} rotation-x={Math.PI / 2}>
              <cylinderGeometry args={[0.065, 0.065, 0.02, 12]} />
            </Toon>
            {texture !== null && (
              <mesh position={[-2.6 * BB, 2.6 * BB, -2.95 * BB - 0.012]} rotation-y={Math.PI}>
                <circleGeometry args={[0.054, 16]} />
                <meshBasicMaterial map={texture} />
              </mesh>
            )}
          </>,
          model.chest,
        )}
    </group>
  );
};

for (const { url } of Object.values(MODELS)) useGLTF.preload(url);
