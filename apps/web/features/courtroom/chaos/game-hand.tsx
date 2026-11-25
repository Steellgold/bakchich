"use client";

// The articulated Blockbench hand, shared by both sides of a board game.
import type { ThreeElements } from "@react-three/fiber";
import type { RpsPick } from "@tribunal/bot/room/chaos";
import { InkOutlines, mergeCubes, toonify, ToonModel } from "../toon-model";
import { useGLTF } from "@react-three/drei";
import { createPortal, useFrame } from "@react-three/fiber";
import { RPS_SHAKE_MS } from "@tribunal/bot/room/games";
import { useEffect, useMemo, useRef } from "react";
import { AnimationMixer, LoopOnce, Quaternion, Vector3 } from "three";

const HAND = "/models/fp_hand.gltf";
const pinch = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(0.63, -0.7, 0.35).normalize());

export type HandPose = RpsPick | "hold";

/** The game begins its three fist shakes when both choices have reached the server. */
export const GameHand = ({ pose, token, revealAt, handScale = 1, ...props }: ThreeElements["group"] & {
  pose: HandPose;
  token?: "red" | "yellow";
  revealAt?: number | null;
  handScale?: number;
}) => {
  const { scene, animations } = useGLTF(HAND);
  const appliedRef = useRef<HandPose | null>(null);
  const model = useMemo(() => {
    // Merge inside each finger joint only: the clips and token_anchor keep their named nodes.
    mergeCubes(scene, (mesh) => (/sleeve|palm_block/u).test(mesh.name));
    const root = scene.clone(true);
    const toon = toonify(root, (mesh) => mesh.userData.outline === true);
    return {
      root,
      ...toon,
      mixer: new AnimationMixer(root),
      anchor: root.getObjectByName("token_anchor"),
    };
  }, [scene]);

  useFrame(() => {
    const shaking = revealAt !== undefined && (revealAt === null || Date.now() - revealAt < RPS_SHAKE_MS);
    const target = shaking ? "rock" : pose;

    if (appliedRef.current === target) return;

    appliedRef.current = target;
    model.mixer.stopAllAction();
    const clip = animations.find((animation) => animation.name === target);

    if (clip === undefined) return;

    const action = model.mixer.clipAction(clip).setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.reset().play();
    // All clips end at 0.2 s; sample the final pose without running an animation per finger.
    model.mixer.update(0.2);
    action.paused = true;
  });

  useEffect(() => () => {
    model.mixer.stopAllAction();
    model.mixer.uncacheRoot(model.root);
    for (const material of model.materials.values()) material.dispose();
  }, [model]);

  return (
    <group {...props}>
      <primitive object={model.root} scale={handScale} />
      <InkOutlines meshes={model.outlined} thickness={0.005} />
      {token !== undefined && model.anchor !== undefined && createPortal(
        <group quaternion={pinch} scale={1 / handScale}>
          <ToonModel url={`/models/token_${token}.gltf`} shadow={false} />
        </group>,
        model.anchor,
      )}
    </group>
  );
};

useGLTF.preload(HAND);
