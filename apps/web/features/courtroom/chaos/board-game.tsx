"use client";

// Tables, tokens and articulated hands live in the courtroom for players and spectators alike.
import type { RoomGame } from "@tribunal/bot/room/chaos";
import type { Group } from "three";
import { ToonModel } from "../toon-model";
import { CELL_PITCH, connect4HandTarget, HAND_SCALE, restPosition, rpsHandTarget } from "./game-geometry";
import { GameHand } from "./game-hand";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import { Vector3 } from "three";

const TABLE_TOP = 0.95;
const FIRST_ROW_Y = 0.111;
const DROP_START_Y = 0.65;
const DROP_MS = 450;
const goal = new Vector3();

/** A token drops through the open top of the board into the server-chosen row. */
const Disc = ({ column, row, color, droppedAt }: {
  column: number;
  row: number;
  color: "red" | "yellow";
  droppedAt: number | null;
}) => {
  const ref = useRef<Group>(null);
  const settledRef = useRef(false);
  const targetY = FIRST_ROW_Y + row * CELL_PITCH;

  useFrame(() => {
    if (ref.current === null) return;

    if (settledRef.current) return;

    const age = droppedAt === null ? DROP_MS : Date.now() - droppedAt;
    const t = Math.max(0, Math.min(1, age / DROP_MS));
    // The animation is over: park the token on its cell and stop writing every frame.
    settledRef.current = t === 1;
    // Gravity-like fall with a tiny bounce after reaching the cell.
    const falling = DROP_START_Y + (targetY - DROP_START_Y) * Math.min(1, (t / 0.82) ** 2);
    const bounce = t > 0.82 ? Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.012 : 0;
    ref.current.position.y = t === 1 ? targetY : falling + bounce;
  });

  return (
    <group ref={ref} position={[(column - 3) * CELL_PITCH, targetY, 0]}>
      <ToonModel url={`/models/token_${color}.gltf`} shadow={false} />
    </group>
  );
};

/** A hand advances over the selected column, or rests on its own edge of the table. */
const BoardHand = ({ game, id, side, localColumn }: {
  game: Extract<RoomGame, { kind: "connect4" }>;
  id: string;
  side: number;
  localColumn: number | null;
}) => {
  const ref = useRef<Group>(null);
  const column = localColumn ?? game.hovered[id] ?? 3;
  const active = game.turn === id && game.winner === null && !game.draw;
  const sign = side === 0 ? -1 : 1;

  useFrame((_state, delta) => {
    const group = ref.current;

    if (group === null) return;

    const blend = 1 - Math.exp(-delta * 18);
    connect4HandTarget(sign, column, active, goal);
    group.position.lerp(goal, blend);
  });

  return (
    <group ref={ref} position={restPosition(sign, new Vector3())} rotation-y={side === 0 ? Math.PI : 0}>
      <GameHand handScale={HAND_SCALE} pose={active ? "hold" : "paper"} token={active ? (side === 0 ? "red" : "yellow") : undefined} />
    </group>
  );
};

/** Both fists shake exactly three times, then reveal the simultaneous server result. */
const RpsHand = ({ game, id, side }: {
  game: Extract<RoomGame, { kind: "rps" }>;
  id: string;
  side: number;
}) => {
  const ref = useRef<Group>(null);
  const sign = side === 0 ? -1 : 1;

  useFrame(() => {
    const group = ref.current;

    if (group === null) return;

    const { target, wave } = rpsHandTarget(sign, game.revealedAt, goal);
    group.position.y = target.y;
    group.rotation.x = wave * 0.18;
  });

  return (
    <group ref={ref} position={[sign * 0.17, 1.23, sign * 0.25]} rotation-y={side === 0 ? Math.PI : 0}>
      <GameHand handScale={HAND_SCALE} pose={game.picks[id] ?? "rock"} revealAt={game.revealedAt} />
    </group>
  );
};

const Board = ({ game, selfId, hoverColumn }: {
  game: RoomGame;
  selfId: string | null;
  hoverColumn: number | null;
}) => (
  <group position={[game.position.x, 0, game.position.z]} rotation-y={game.rotation}>
    <ToonModel url="/models/game_table.gltf" />
    {game.kind === "connect4" && (
      <group position-y={TABLE_TOP}>
        <ToonModel url="/models/connect4.gltf" />
        {game.board.flatMap((cells, column) => cells.flatMap((owner, row) => owner === null ? [] : [
          <Disc
            key={`${String(column)}:${String(row)}`}
            column={column}
            row={row}
            color={owner === game.players[0] ? "red" : "yellow"}
            droppedAt={game.lastDrop?.column === column && game.lastDrop.row === row ? game.lastDrop.at : null}
          />,
        ]))}
      </group>
    )}
    {game.players.map((id, side) => game.kind === "connect4" ? (
      <BoardHand key={id} game={game} id={id} side={side} localColumn={id === selfId ? hoverColumn : null} />
    ) : <RpsHand key={id} game={game} id={id} side={side} />)}
  </group>
);

/** The server snapshot includes every table, including those the local member is only watching. */
export const BoardGames = ({ games, selfId, hoverColumn = null }: {
  games: RoomGame[];
  selfId: string | null;
  hoverColumn?: number | null;
}) => (
  <Suspense fallback={null}>
    {games.map((game) => <Board key={game.id} game={game} selfId={selfId} hoverColumn={hoverColumn} />)}
  </Suspense>
);

for (const name of ["game_table", "connect4", "token_red", "token_yellow"]) useGLTF.preload(`/models/${name}.gltf`);
