"use client";

import type { Box, Seat } from "@tribunal/bot/room/layout";
import { tileBoxTexture, tilePlaneTexture, useCourtroomTextures } from "./textures";
import { Outlines } from "@react-three/drei";
import { GATE, OBSTACLES, RESTRICTED_ZONE, ROOM, SEATS, SIDE_DOOR } from "@tribunal/bot/room/layout";

export const INK = "#2b1b3d";

// Tints multiplied with the wood texture:
const WOOD_TINTS: Record<"bench" | "desk" | "stand" | "rail", string> = {
  bench: "#ffe1a6",
  desk: "#ffc77d",
  stand: "#c88a67",
  rail: "#ffdf9e",
};

type Textures = ReturnType<typeof useCourtroomTextures>;

const Wood = ({ kind, textures }: { kind: keyof typeof WOOD_TINTS; textures: Textures }) => <meshToonMaterial map={textures.wood} color={WOOD_TINTS[kind]} />;

const Part = ({ position, size, textures, kind = "stand", color, outline = true }: {
  position: [number, number, number];
  size: [number, number, number];
  textures: Textures;
  kind?: keyof typeof WOOD_TINTS;
  color?: string;
  outline?: boolean;
}) => (
  <mesh position={position} castShadow receiveShadow>
    <boxGeometry args={size} onUpdate={tileBoxTexture} />
    {color === undefined ? <Wood kind={kind} textures={textures} /> : <meshToonMaterial color={color} />}
    {outline && <Outlines thickness={0.025} color={INK} />}
  </mesh>
);

/** Slatted public bench, with its seat top and footprint matching the shared layout. */
const Bench = ({ box, textures }: {
  box: Box;
  textures: Textures;
}) => {
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  return (
    <group position={[(box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2]}>
      {[-1, 0, 1].map((slat) => (
        <Part key={slat} position={[0, box.height - 0.05, (slat * depth) / 3]} size={[width, 0.1, depth / 3 - 0.015]} textures={textures} kind="bench" />
      ))}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (width / 2 - 0.05), 0, 0]}>
          <Part position={[0, 0.21, 0]} size={[0.1, 0.42, depth]} textures={textures} />
          <Part position={[0, 0.7, 0]} size={[0.1, 0.12, depth]} textures={textures} kind="bench" />
          <Part position={[0, 0.78, depth / 2 - 0.04]} size={[0.08, 0.72, 0.08]} textures={textures} />
        </group>
      ))}
      {[0.74, 1.02].map((height) => (
        <Part key={height} position={[0, height, depth / 2 - 0.02]} size={[width - 0.18, 0.2, 0.04]} textures={textures} kind="bench" />
      ))}
    </group>
  );
};

/** Chair at a seat of the courtroom: seat, back behind the sitter and four legs */
const Chair = ({ seat, textures }: { seat: Seat; textures: Textures }) => (
  <group position={[seat.position.x, 0, seat.position.z]} rotation-y={seat.rotation}>
    <Part position={[0, 0.42, 0]} size={[0.5, 0.06, 0.5]} textures={textures} kind="bench" />
    <Part position={[0, 0.75, -0.3]} size={[0.5, 0.6, 0.06]} textures={textures} kind="bench" />
    {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
      <Part key={`${String(x)}:${String(z)}`} position={[x * 0.2, 0.2, z * 0.2]} size={[0.06, 0.4, 0.06]} textures={textures} outline={false} />
    )),
    )}
  </group>
);

/** Chunky desk with an apron, an inset front panel and brass handles. */
const Desk = ({ box, textures }: {
  box: Box;
  textures: Textures;
}) => {
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  const legHeight = box.height - 0.1;
  return (
    <group position={[(box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2]}>
      <Part position={[0, box.height - 0.05, 0]} size={[width, 0.1, depth]} textures={textures} kind="desk" />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => (
        <Part
          key={`${String(sx)}:${String(sz)}`}
          position={[sx * (width / 2 - 0.13), legHeight / 2, sz * (depth / 2 - 0.13)]}
          size={[0.22, legHeight, 0.22]}
          textures={textures}
          outline={false}
        />
      )),
      )}
      <Part position={[0, box.height * 0.56, depth / 2 - 0.09]} size={[width - 0.3, box.height * 0.6, 0.16]} textures={textures} />
      <Part position={[0, box.height * 0.56, depth / 2 - 0.035]} size={[width - 0.65, box.height * 0.35, 0.06]} textures={textures} kind="desk" />
      {[-0.28, 0.28].map((side) => (
        <Part
          key={side}
          position={[side * width, box.height * 0.67, depth / 2 - 0.015]}
          size={[0.16, 0.04, 0.03]}
          textures={textures}
          color="#ffd23f"
          outline={false}
        />
      ))}
    </group>
  );
};

/** Balustrade: top bar on thin balusters, along the longest side of the box */
const Rail = ({ box, textures }: {
  box: Box;
  textures: Textures;
}) => {
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  const horizontal = width >= depth;
  const length = horizontal ? width : depth;
  const thickness = horizontal ? depth : width;
  const posts = Math.floor(length / 0.7) + 1;
  const postWidth = Math.min(0.16, thickness);
  return (
    <group position={[(box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2]}>
      <Part position={[0, box.height - 0.06, 0]} size={horizontal ? [length, 0.12, thickness] : [thickness, 0.12, length]} textures={textures} kind="rail" />
      <Part position={[0, 0.12, 0]} size={horizontal ? [length, 0.12, thickness * 0.7] : [thickness * 0.7, 0.12, length]} textures={textures} />
      {Array.from({ length: posts }, (_, index) => {
        const offset = -length / 2 + postWidth / 2 + (index * (length - postWidth)) / Math.max(posts - 1, 1);
        const end = index === 0 || index === posts - 1;
        const size = end ? postWidth : postWidth * 0.55;
        return (
          <Part
            key={offset}
            position={horizontal ? [offset, (box.height - 0.12) / 2, 0] : [0, (box.height - 0.12) / 2, offset]}
            size={[size, box.height - 0.12, size]}
            textures={textures}
            kind={end ? "stand" : "rail"}
            outline={end}
          />
        );
      })}
    </group>
  );
};

/** Paneled rostrum; the judge's chair stays centered on the authoritative seat. */
/** Folder colors on the archive shelves */
const FOLDER_COLORS = ["#cf3934", "#f2bd3c", "#3fb5a8", "#9b55e0", "#e8812a", "#fff1c1"] as const;
const SHELVES = 4;

/** The archive cabinet: an open wooden cabinet, its shelves packed with the clerk's folders and paper stacks */
const Cabinet = ({ box, textures }: {
  box: Box;
  textures: Textures;
}) => {
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  const shelfGap = (box.height - 0.3) / SHELVES;
  // The open side faces the room (towards the judge, -z):
  const front = -depth / 2;
  return (
    <group position={[(box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2]}>
      <Part position={[0, box.height / 2, depth / 2 - 0.05]} size={[width, box.height, 0.1]} textures={textures} kind="stand" />
      {[-1, 1].map((side) => (
        <Part key={side} position={[side * (width / 2 - 0.06), box.height / 2, 0]} size={[0.12, box.height, depth]} textures={textures} kind="stand" />
      ))}
      <Part position={[0, box.height - 0.06, 0]} size={[width + 0.12, 0.12, depth + 0.08]} textures={textures} kind="desk" />
      {Array.from({ length: SHELVES + 1 }, (_shelf, shelf) => (
        <Part
          key={`shelf-${String(shelf)}`}
          position={[0, 0.08 + shelf * shelfGap, 0]}
          size={[width - 0.12, 0.06, depth - 0.1]}
          textures={textures}
          kind="desk"
          outline={shelf === 0}
        />
      ))}
      {Array.from({ length: SHELVES }, (_shelf, shelf) => Array.from({ length: 11 }, (_folder, index) => {
        // A stable jumble: folders of varied colors and heights, with a gap now and then.
        const seed = (shelf * 7 + index * 13) % 17;

        if (seed % 6 === 0) return null;

        const height = shelfGap * (0.55 + (seed % 4) * 0.08);
        return (
          <Part
            key={`folder-${String(shelf)}-${String(index)}`}
            position={[-width / 2 + 0.25 + index * ((width - 0.5) / 10), 0.11 + shelf * shelfGap + height / 2, front + 0.3]}
            size={[0.12, height, depth * 0.55]}
            textures={textures}
            color={FOLDER_COLORS[seed % FOLDER_COLORS.length]}
            outline={false}
          />
        );
      }))}
      {[0.6, -0.5].map((x, index) => (
        <Part
          key={x}
          position={[x, 0.11 + (index + 1) * shelfGap + 0.06, front + 0.3]}
          size={[0.32, 0.1, 0.24]}
          textures={textures}
          color="#fff9ee"
          outline={false}
        />
      ))}
    </group>
  );
};

const Stand = ({ box, textures }: {
  box: Box;
  textures: Textures;
}) => {
  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;
  const judge
    = SEATS.judge.position.x >= box.min.x && SEATS.judge.position.x <= box.max.x && SEATS.judge.position.z >= box.min.z && SEATS.judge.position.z <= box.max.z;

  return (
    <group position={[centerX, 0, centerZ]}>
      <Part position={[0, 0.1, 0]} size={[width, 0.2, depth]} textures={textures} />
      <Part position={[0, box.height / 2, depth / 2 - 0.2]} size={[width, box.height, 0.32]} textures={textures} />
      <Part position={[0, box.height - 0.06, depth / 2 - 0.23]} size={[width, 0.12, 0.46]} textures={textures} kind="desk" />
      {[-1, 1].map((side) => (
        <Part key={side} position={[side * (width / 2 - 0.14), box.height / 2, 0]} size={[0.28, box.height, depth]} textures={textures} kind="desk" />
      ))}
      <Part position={[0, box.height * 0.5, depth / 2 - 0.025]} size={[width - 0.8, box.height * 0.48, 0.05]} textures={textures} kind="desk" />
      {judge && (
        <group position={[SEATS.judge.position.x - centerX, 0, SEATS.judge.position.z - centerZ]}>
          <Part position={[0, 1, 0]} size={[1.25, 0.1, 0.75]} textures={textures} kind="desk" />
          <Part position={[0, 1.77, -0.48]} size={[1.35, 1.8, 0.16]} textures={textures} kind="desk" />
          <Part position={[0, 1.8, -0.385]} size={[1.02, 1.42, 0.03]} textures={textures} color="#8e5bff" />
          <Part position={[0, 2.65, -0.48]} size={[1.5, 0.16, 0.2]} textures={textures} color="#ffd23f" />
          {[-0.57, 0.57].map((side) => (
            <Part key={side} position={[side, 1.25, 0]} size={[0.14, 0.12, 0.75]} textures={textures} kind="desk" />
          ))}
        </group>
      )}
    </group>
  );
};

/** An enclosed civic hall: plaster ceiling, wood paneling, frosted windows and a crooked seal. */
const Interior = ({ textures }: { textures: Textures }) => (
  <group>
    <mesh position={[0, 4, ROOM.depth / 2]} rotation-x={Math.PI / 2} receiveShadow>
      <planeGeometry args={[ROOM.width, ROOM.depth]} onUpdate={tilePlaneTexture} />
      <meshToonMaterial color="#fff4d6" />
    </mesh>
    {OBSTACLES.filter((box) => box.kind === "wall").map((wall) => {
      const width = wall.max.x - wall.min.x;
      const depth = wall.max.z - wall.min.z;
      // Offset the finish by 2 cm to avoid coplanar faces against the plaster.
      const trimWidth = width + (width < depth ? 0.04 : 0);
      const trimDepth = depth + (depth < width ? 0.04 : 0);
      return (
        <group key={`${String(wall.min.x)}:${String(wall.min.z)}`} position={[(wall.min.x + wall.max.x) / 2, 0, (wall.min.z + wall.max.z) / 2]}>
          <Part position={[0, 0.4, 0]} size={[trimWidth, 0.8, trimDepth]} textures={textures} kind="desk" />
          <Part position={[0, 0.85, 0]} size={[trimWidth, 0.1, trimDepth]} textures={textures} />
          <Part position={[0, 3.91, 0]} size={[trimWidth, 0.18, trimDepth]} textures={textures} color={INK} />
        </group>
      );
    })}
    {[4, 10, 16, 22, 28].map((z) => (
      <group key={z} position={[0, 0, z]}>
        <Part position={[0, 3.91, 0]} size={[ROOM.width, 0.18, 0.2]} textures={textures} kind="rail" />
        {[-5, 5].map((x) => (
          <group key={x} position={[x, 3.74, 0]}>
            <mesh>
              <cylinderGeometry args={[0.44, 0.44, 0.1, 8]} />
              <meshToonMaterial color={INK} />
              <Outlines thickness={0.02} color={INK} />
            </mesh>
            <mesh position={[0, -0.06, 0]}>
              <cylinderGeometry args={[0.36, 0.3, 0.1, 8]} />
              <meshToonMaterial color="#fff4d6" emissive="#ffd23f" emissiveIntensity={0.6} />
            </mesh>
          </group>
        ))}
      </group>
    ))}
    {[-1, 1].flatMap((side) => [5, 17, 24].map((z) => (
      <group key={`${String(side)}:${String(z)}`} position={[side * (ROOM.width / 2 - 0.02), 2.3, z]}>
        <Part position={[0, 0, 0]} size={[0.06, 1.7, 2.3]} textures={textures} />
        <Part position={[-side * 0.04, 0, 0]} size={[0.04, 1.48, 2.08]} textures={textures} color="#9ad9ff" outline={false} />
        <Part position={[-side * 0.065, 0, 0]} size={[0.035, 1.5, 0.07]} textures={textures} color={INK} outline={false} />
        <Part position={[-side * 0.065, 0, 0]} size={[0.035, 0.07, 2.1]} textures={textures} color={INK} outline={false} />
      </group>
    )),
    )}
    <group position={[0, 3.18, 0.08]}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.65, 0.65, 0.08, 8]} />
        <meshToonMaterial color="#8e5bff" />
        <Outlines thickness={0.025} color={INK} />
      </mesh>
      <group position={[0, 0, 0.08]} rotation-z={0.12}>
        <Part position={[0, 0, 0]} size={[0.07, 0.7, 0.06]} textures={textures} color="#ffd23f" />
        <Part position={[0, 0.2, 0]} size={[0.86, 0.06, 0.06]} textures={textures} color="#ffd23f" />
        {[-0.35, 0.35].map((x) => (
          <group key={x} position={[x, 0, 0]}>
            <Part position={[0, 0.03, 0]} size={[0.025, 0.3, 0.025]} textures={textures} color="#ffd23f" outline={false} />
            <mesh position={[0, -0.14, 0]}>
              <cylinderGeometry args={[0.17, 0.1, 0.06, 6]} />
              <meshToonMaterial color="#ffd23f" />
              <Outlines thickness={0.015} color={INK} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  </group>
);

/** The shared courtroom layout, with CC0 surfaces tinted to match the site's palette. */
export const Courtroom = () => {
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

      {OBSTACLES.map((box) => {
        const key = `${String(box.min.x)}:${String(box.min.z)}:${box.kind}`;

        if (box.kind === "bench") return <Bench key={key} box={box} textures={textures} />;
        if (box.kind === "desk") return <Desk key={key} box={box} textures={textures} />;
        if (box.kind === "rail") return <Rail key={key} box={box} textures={textures} />;
        if (box.kind === "stand") return <Stand key={key} box={box} textures={textures} />;
        if (box.kind === "cabinet") return <Cabinet key={key} box={box} textures={textures} />;

        return (
          <mesh key={key} position={[(box.min.x + box.max.x) / 2, box.height / 2, (box.min.z + box.max.z) / 2]} castShadow receiveShadow>
            <boxGeometry args={[box.max.x - box.min.x, box.height, box.max.z - box.min.z]} onUpdate={tileBoxTexture} />
            <meshToonMaterial map={textures.plaster} color="#a9dcea" emissive="#3ea6ff" emissiveIntensity={0.15} />
            <Outlines thickness={0.04} color={INK} />
          </mesh>
        );
      })}

      <Interior textures={textures} />

      {[...SEATS.accused, SEATS.prosecutor, SEATS.defense, SEATS.witness, ...SEATS.jury].map((seat) => (
        <Chair key={seat.id} seat={seat} textures={textures} />
      ))}

      <mesh position={[GATE.x, 0.03, GATE.z]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.4, 0.6, 5]} />
        <meshBasicMaterial color="#ff4f5e" />
      </mesh>

      <mesh position={[SIDE_DOOR.x - 0.05, 1.2, SIDE_DOOR.z]}>
        <boxGeometry args={[0.1, 2.4, 1.4]} onUpdate={tileBoxTexture} />
        <Wood kind="stand" textures={textures} />
        <Outlines thickness={0.04} color={INK} />
      </mesh>
    </group>
  );
};
