"use client";

import type { WindowBreak } from "./use-room-socket";
import type { ThreeElements } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { Furniture } from "./furniture";
import { tilePlaneTexture, useCourtroomTextures } from "./textures";
import { isNotTiny, ToonModel } from "./toon-model";
import { useFrame } from "@react-three/fiber";
import { ENTRANCE, GATE, RESTRICTED_ZONE, ROOM, SIDE_DOOR, WINDOW_ZS } from "@tribunal/bot/room/layout";
import { Suspense, useRef } from "react";

const model = (name: string) => `/models/${name}.gltf`;

// Options shared by every piece of the shell: the glass and the sky are never inked (the outline would fill the window), glowing parts and the sky are unlit.
const SHELL = {
  outline: (mesh: Mesh) => !(/^(glass|sky_)/u).test(mesh.name) && isNotTiny(mesh),
  split: /^(glass|sky_)|_core/u,
  unlit: /^sky_|_core/u,
  // The light comes from above the room: the shell casts no visible shadow, so it skips the shadow pass.
  shadow: false,
};

/** Width of a wall section: every wall piece is 2 m wide */
const SECTION = 2;
/** A broken pane is back after this long */
const PANE_RESTORE_MS = 6_000;
const BEAM_ZS = [4, 10, 16, 22, 28];
const LAMP_XS = [-5, 5];
const LAMP_Z_OFFSET = 1.5;

const DOOR_OPEN_ANGLE = 1.7;

/** A door section: its leaves (named groups of the model, with the side they swing to) turn around their hinge while `open` is set */
const Door = ({ name, leaves, open, ...props }: ThreeElements["group"] & {
  name: string;
  leaves: Record<string, 1 | -1>;
  open: boolean;
}) => {
  const ref = useRef<Group>(null);

  useFrame((_state, delta) => {
    for (const [leafName, sign] of Object.entries(leaves)) {
      const leaf = ref.current?.getObjectByName(leafName);

      if (leaf === undefined) continue;

      leaf.rotation.y += ((open ? sign * DOOR_OPEN_ANGLE : 0) - leaf.rotation.y) * Math.min(1, delta * 6);
    }
  });

  return (
    <group ref={ref} {...props}>
      <ToonModel url={model(name)} {...SHELL} />
    </group>
  );
};

/** A side wall section: a window (its glass pane is hidden for PANE_RESTORE_MS after `brokenAt`, a Date.now() time) or a plain panel */
const SideSection = ({ window: isWindow, brokenAt, ...props }: ThreeElements["group"] & {
  window: boolean;
  brokenAt: number;
}) => {
  const ref = useRef<Group>(null);
  const hiddenRef = useRef(false);

  useFrame(() => {
    const hidden = Date.now() - brokenAt < PANE_RESTORE_MS;

    if (hidden === hiddenRef.current) return;

    const pane = ref.current?.getObjectByName("glass_pane");

    if (pane === undefined) return;

    pane.visible = !hidden;
    hiddenRef.current = hidden;
  });

  return <ToonModel ref={ref} url={model(isWindow ? "wall_window" : "wall_panel")} {...props} {...SHELL} />;
};

/** Walls of 2 m sections (origin at the foot of the inner face, room side towards -Z, so each wall is turned to face inward) */
const Walls = ({ doorOpen, sideDoorOpen, windowBreaks }: {
  doorOpen: boolean;
  sideDoorOpen: boolean;
  windowBreaks: WindowBreak[];
}) => {
  const brokenAt = (side: -1 | 1, z: number) => windowBreaks.findLast((windowBreak) => windowBreak.side === side && windowBreak.z === z)?.at ?? 0;
  const half = ROOM.width / 2;
  const columns = Array.from({ length: ROOM.width / SECTION }, (_, index) => -half + SECTION * (index + 0.5));
  const rows = Array.from({ length: ROOM.depth / SECTION }, (_, index) => SECTION * (index + 0.5));
  // The entrance wall keeps one section for the door, the rest is split in 5 slightly narrower sections on each side:
  const narrow = (half - SECTION / 2) / 5 / SECTION;
  const entranceColumns = [-1, 1].flatMap((side) => Array.from({ length: 5 }, (_, index) => side * (SECTION / 2 + narrow * SECTION * (index + 0.5))));

  return (
    <group>
      {columns.map((x) => (
        <ToonModel key={`judge:${String(x)}`} url={model("wall_panel")} position={[x, 0, 0]} rotation-y={Math.PI} {...SHELL} />
      ))}
      {entranceColumns.map((x) => (
        <ToonModel key={`entrance:${String(x)}`} url={model("wall_panel")} position={[x, 0, ROOM.depth]} scale-x={narrow} {...SHELL} />
      ))}
      <Door name="door_entrance" leaves={{ leaf: 1 }} open={doorOpen} position={[ENTRANCE.x, 0, ENTRANCE.z]} />
      {rows.map((z) => (
        <SideSection key={`left:${String(z)}`} window={WINDOW_ZS.includes(z)} brokenAt={brokenAt(-1, z)} position={[-half, 0, z]} rotation-y={-Math.PI / 2} />
      ))}
      {rows.filter((z) => z !== SIDE_DOOR.z).map((z) => (
        <SideSection key={`right:${String(z)}`} window={WINDOW_ZS.includes(z)} brokenAt={brokenAt(1, z)} position={[half, 0, z]} rotation-y={Math.PI / 2} />
      ))}
      <Door name="door_side" leaves={{ leaf_left: 1, leaf_right: -1 }} open={sideDoorOpen} position={[SIDE_DOOR.x, 0, SIDE_DOOR.z]} rotation-y={Math.PI / 2} />
    </group>
  );
};

/** Plaster ceiling with beams and hanging lamps (the lamps hang between the beams), and the crooked seal above the judge */
const Ceiling = () => (
  <group>
    <mesh position={[0, 4, ROOM.depth / 2]} rotation-x={Math.PI / 2} receiveShadow>
      <planeGeometry args={[ROOM.width, ROOM.depth]} onUpdate={tilePlaneTexture} />
      <meshToonMaterial color="#fff4d6" />
    </mesh>
    {BEAM_ZS.map((z) => (
      <group key={z}>
        <ToonModel url={model("ceiling_beam")} position={[0, 4, z]} {...SHELL} />
        {LAMP_XS.map((x) => (
          <ToonModel key={x} url={model("lamp")} position={[x, 4, z + LAMP_Z_OFFSET]} {...SHELL} />
        ))}
      </group>
    ))}
    <ToonModel url={model("seal")} position={[0, 3.18, 0.12]} rotation-y={Math.PI} {...SHELL} />
  </group>
);

/** The shared courtroom layout: procedural floor and ceiling, Blockbench walls, doors and furniture. */
export const Courtroom = ({ doorOpen, sideDoorOpen, windowBreaks }: {
  doorOpen: boolean;
  sideDoorOpen: boolean;
  windowBreaks: WindowBreak[];
}) => {
  const zoneWidth = RESTRICTED_ZONE.max.x - RESTRICTED_ZONE.min.x;
  const zoneDepth = RESTRICTED_ZONE.max.z - RESTRICTED_ZONE.min.z;
  const textures = useCourtroomTextures();

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, ROOM.depth / 2]} receiveShadow>
        <planeGeometry args={[ROOM.width, ROOM.depth]} onUpdate={tilePlaneTexture} />
        <meshToonMaterial map={textures.tiles} color="#fff4d6" />
      </mesh>

      <mesh
        rotation-x={-Math.PI / 2}
        position={[(RESTRICTED_ZONE.min.x + RESTRICTED_ZONE.max.x) / 2, 0.01, (RESTRICTED_ZONE.min.z + RESTRICTED_ZONE.max.z) / 2]}
        receiveShadow
      >
        <planeGeometry args={[zoneWidth, zoneDepth]} onUpdate={tilePlaneTexture} />
        <meshToonMaterial map={textures.parquet} color="#e2ccff" />
      </mesh>

      <Suspense fallback={null}>
        <Walls doorOpen={doorOpen} sideDoorOpen={sideDoorOpen} windowBreaks={windowBreaks} />
        <Ceiling />
        <Furniture />
      </Suspense>

      <mesh position={[GATE.x, 0.03, GATE.z]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.4, 0.6, 5]} />
        <meshBasicMaterial color="#ff4f5e" />
      </mesh>
    </group>
  );
};
