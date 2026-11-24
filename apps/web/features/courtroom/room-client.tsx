"use client";

import type { NearbyInteraction } from "./player-controller";
import type { Speech } from "@/features/courtroom/use-room-socket";
import type { Vec2 } from "@tribunal/bot/room/layout";
import type { PlayerState } from "@tribunal/bot/room/world";
import { ChaosEffects } from "./chaos/chaos-effects";
import { Character } from "./character/character";
import { Courtroom } from "./courtroom";
import { Gate } from "./furniture";
import { Hud } from "./hud";
import { PlayerController } from "./player-controller";
import { CLERK_SEAT, isBenchSeat, seatById, seatElevation } from "./seats";
import { GameDialog } from "@/components/game-ui";
import { useRoomSocket } from "@/features/courtroom/use-room-socket";
import { Canvas, useFrame } from "@react-three/fiber";
import { ENTRANCE, JUDGE_NAME, MAX_SPEED, OBSTACLES, RESTRICTED_ZONE, ROOM, SEATS } from "@tribunal/bot/room/layout";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const latestSpeech = (speeches: Speech[], speakerId: string | null) => speeches.findLast((speech) => speech.speakerId === speakerId)?.text ?? null;

type LeavingPlayer = Pick<PlayerState, "id" | "name" | "avatarUrl" | "position">;

/** Where the walk out starts from the aisle in front of a member's spot: along the rail inside the court, in front of the bench row in the public */
const exitLaneZ = (position: Vec2) => {
  if (position.z < RESTRICTED_ZONE.max.z) return RESTRICTED_ZONE.max.z - 0.4;

  const bench = OBSTACLES.find((box) => box.kind === "bench" && position.z >= box.min.z - 0.4 && position.z <= box.max.z + 0.4);
  return bench === undefined ? position.z : bench.min.z - 0.7;
};

/** Facing of a character walking from one point to another (0 faces the entrance) */
const headingOf = (from: Vec2, to: Vec2) => Math.atan2(to.x - from.x, to.z - from.z);

/** Sleeper's neighbour within 0.9 m sideways and 0.5 m front/back, in the sleeper's own frame: +1 at their right, -1 at their left, 0 nobody */
const leanSideOf = (id: string, position: Vec2, rotation: number, others: { id: string; position: Vec2 }[]): -1 | 0 | 1 => {
  let side = 0;
  let nearest = Infinity;

  for (const other of others) {
    if (other.id === id) continue;

    const dx = other.position.x - position.x;
    const dz = other.position.z - position.z;
    // A character with rotation 0 faces +Z, so its right is -X:
    const sideways = -dx * Math.cos(rotation) + dz * Math.sin(rotation);
    const ahead = dx * Math.sin(rotation) + dz * Math.cos(rotation);

    if (Math.abs(ahead) > 0.5 || Math.abs(sideways) > 0.9 || Math.abs(sideways) >= nearest) continue;

    nearest = Math.abs(sideways);
    side = Math.sign(sideways);
  }

  return side === 1 ? 1 : side === -1 ? -1 : 0;
};

/** A member who disconnected: steps out of their row, walks up the aisle and goes out through the entrance door, removed once outside */
const LeavingCharacter = ({ player, onDone }: {
  player: LeavingPlayer;
  onDone: (id: string) => void;
}) => {
  const positionRef = useRef<Vec2>({ ...player.position });
  const stepRef = useRef(0);
  const targets = useMemo<Vec2[]>(() => {
    const lane = exitLaneZ(player.position);
    return [
      {
        x: player.position.x,
        z: lane,
      },
      {
        x: ENTRANCE.x,
        z: lane,
      },
      {
        x: ENTRANCE.x,
        z: ENTRANCE.z + 1,
      },
    ];
  }, [player.position]);
  const [rotation, setRotation] = useState(() => headingOf(player.position, targets[0] ?? player.position));

  useFrame((_state, delta) => {
    const target = targets[stepRef.current];

    if (target === undefined) return;

    const dx = target.x - positionRef.current.x;
    const dz = target.z - positionRef.current.z;
    const distance = Math.hypot(dx, dz);
    const step = MAX_SPEED * delta;

    if (distance > step) {
      positionRef.current = {
        x: positionRef.current.x + (dx / distance) * step,
        z: positionRef.current.z + (dz / distance) * step,
      };
      return;
    }

    positionRef.current = { ...target };
    stepRef.current += 1;
    const next = targets[stepRef.current];
    if (next === undefined) onDone(player.id);
    else setRotation(headingOf(target, next));
  });

  return (
    <Character
      id={player.id}
      name={player.name}
      avatarUrl={player.avatarUrl}
      position={player.position}
      follow={positionRef}
      rotation={rotation}
      seated={false}
      speech={null}
    />
  );
};

/** The courtroom page: 3D scene, local player, other members and the HUD */
export const RoomClient = ({ url, token }: {
  url: string;
  token?: string;
}) => {
  const { selfId, snapshot, speeches, verdict, voteResult, rejected, toasts, tomatoes, jumps, archives, setArchives, challenge, setChallenge, game, send }
    = useRoomSocket(url, token);
  const [interaction, setInteraction] = useState<NearbyInteraction>(null);
  const [target, setTarget] = useState<PlayerState | null>(null);
  const [leaving, setLeaving] = useState<LeavingPlayer[]>([]);
  const previousPlayersRef = useRef(new Map<string, LeavingPlayer>());
  const jurorsRef = useRef<Set<string> | null>(null);
  const gateTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [gateOpen, setGateOpen] = useState(false);

  // The gate opens for a moment when someone becomes a juror:
  useEffect(() => {
    if (snapshot === null) return;

    const jurors = new Set(snapshot.players.filter((player) => player.seatId?.startsWith("jury-") === true).map((player) => player.id));
    const previous = jurorsRef.current;
    jurorsRef.current = jurors;

    if (previous === null || ![...jurors].some((id) => !previous.has(id))) return;

    setGateOpen(true);
    clearTimeout(gateTimerRef.current);
    gateTimerRef.current = setTimeout(() => setGateOpen(false), 2500);
  }, [snapshot]);

  useEffect(() => () => clearTimeout(gateTimerRef.current), []);

  // Members who vanished from the snapshot walk out instead of disappearing:
  useEffect(() => {
    if (snapshot === null) return;

    const current = new Map<string, LeavingPlayer>(snapshot.players.map((player) => [player.id, player]));
    const gone = [...previousPlayersRef.current.values()].filter((player) => player.id !== selfId && !current.has(player.id));
    previousPlayersRef.current = current;
    setLeaving((list) => [...list.filter((player) => !current.has(player.id)), ...gone]);
  }, [snapshot, selfId]);

  if (rejected !== null) {
    return (
      <main className="screen">
        <GameDialog
          size="compact"
          title="Audience interrompue"
          actions={(
            <Link className="plate btn btn-secondary" href="/">
              Retour
            </Link>
          )}
        >
          <p>{rejected}</p>
        </GameDialog>
      </main>
    );
  }

  const self = snapshot?.players.find((player) => player.id === selfId);
  const occupiedSeats = new Set(snapshot?.players.map((player) => player.seatId));
  const speaking = new Set(snapshot?.speaking);
  const sleeping = new Set(snapshot?.sleeping);
  const splats = new Set(snapshot?.splats);
  const fighting = new Set(snapshot?.fighting);
  const levelOf = (id: string) => snapshot?.levels[id] ?? 0;
  const neighbours = [
    ...(snapshot?.players ?? []),
    ...(snapshot?.npcs ?? []).flatMap((npc) => {
      const seat = seatById.get(npc.seatId);
      return seat === undefined ? [] : [{ id: npc.id, position: seat.position }];
    }),
  ];
  const leanOf = (id: string, position: Vec2, rotation: number) => (sleeping.has(id) ? leanSideOf(id, position, rotation, neighbours) : 0);
  const positionOf = (id: string) => snapshot?.players.find((player) => player.id === id)?.position;

  return (
    <div className="room">
      <Canvas
        shadows
        camera={{
          fov: 60,
          position: [ROOM.spawn.x, 3.5, ROOM.depth - 0.4],
        }}
      >
        <color attach="background" args={["#fff4d6"]} />
        <ambientLight intensity={1.4} />
        <directionalLight position={[6, 14, 10]} intensity={2.2} castShadow />
        <Courtroom doorOpen={leaving.length > 0} sideDoorOpen={(snapshot?.officers.length ?? 0) > 0} />
        <Gate open={gateOpen} />

        <Character
          id="clerk"
          name="Le Greffier"
          avatarUrl={null}
          position={CLERK_SEAT.position}
          rotation={CLERK_SEAT.rotation}
          seated
          speech={latestSpeech(speeches, "clerk")}
          elevation={seatElevation(CLERK_SEAT.id)}
          variant="clerk"
          typing={snapshot?.trial !== null && snapshot?.trial !== undefined}
        />
        <ChaosEffects tomatoes={tomatoes} officers={snapshot?.officers ?? []} positionOf={positionOf} />

        <Character
          id={SEATS.judge.id}
          name={JUDGE_NAME}
          avatarUrl={null}
          position={SEATS.judge.position}
          rotation={SEATS.judge.rotation}
          seated
          speech={latestSpeech(speeches, null)}
          speaking={speaking.has("judge")}
          // On the throne of the judge stand, its seat 1.5 m high:
          elevation={1.05}
          variant="judge"
        />

        {snapshot?.npcs.map((npc) => {
          const seat = seatById.get(npc.seatId);

          if (seat === undefined) return null;

          return (
            <Character
              key={npc.id}
              id={npc.id}
              name={npc.name}
              avatarUrl={npc.avatarUrl}
              position={seat.position}
              rotation={seat.rotation}
              seated
              onBench={isBenchSeat(npc.seatId)}
              elevation={seatElevation(npc.seatId)}
              speech={latestSpeech(speeches, npc.id)}
              speaking={speaking.has(npc.id)}
            />
          );
        })}

        {snapshot?.players
          .filter((player) => player.id !== selfId)
          .map((player) => (
            <Character
              key={player.id}
              id={player.id}
              name={player.name}
              avatarUrl={player.avatarUrl}
              position={player.position}
              rotation={player.rotation}
              seated={player.seatId !== null}
              onBench={isBenchSeat(player.seatId)}
              elevation={seatElevation(player.seatId)}
              speech={latestSpeech(speeches, player.id)}
              speaking={speaking.has(player.id)}
              level={levelOf(player.id)}
              jumpAt={jumps[player.id]}
              sleeping={sleeping.has(player.id)}
              leanSide={leanOf(player.id, player.position, player.rotation)}
              splat={splats.has(player.id)}
              fighting={fighting.has(player.id)}
              interpolate
            />
          ))}

        {leaving.map((player) => (
          <LeavingCharacter key={player.id} player={player} onDone={(id) => setLeaving((list) => list.filter((entry) => entry.id !== id))} />
        ))}

        {self !== undefined && (
          <PlayerController
            self={self}
            trial={snapshot?.trial ?? null}
            speech={latestSpeech(speeches, self.id)}
            speaking={speaking.has(self.id)}
            level={levelOf(self.id)}
            jumpAt={jumps[self.id] ?? 0}
            sleeping={sleeping.has(self.id)}
            leanSide={leanOf(self.id, self.position, self.rotation)}
            splat={splats.has(self.id)}
            fighting={fighting.has(self.id)}
            send={send}
            occupiedSeats={occupiedSeats}
            onInteraction={setInteraction}
            others={snapshot?.players.filter((player) => player.id !== self.id) ?? []}
            onTarget={setTarget}
          />
        )}
      </Canvas>

      <Hud
        trial={snapshot?.trial ?? null}
        verdict={verdict}
        voteResult={voteResult}
        interaction={interaction}
        role={self?.role ?? null}
        seatId={self?.seatId ?? null}
        target={target}
        toasts={toasts}
        challenge={challenge}
        onChallengeAnswered={() => setChallenge(null)}
        game={game}
        archives={archives}
        onCloseArchives={() => setArchives(null)}
        send={send}
      />
    </div>
  );
};
