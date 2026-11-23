"use client";

import type { NearbyInteraction } from "./player-controller";
import type { Speech } from "@/lib/use-room-socket";
import type { Vec2 } from "@tribunal/bot/room/layout";
import type { PlayerState } from "@tribunal/bot/room/world";
import { Character } from "./character";
import { Courtroom } from "./courtroom";
import { Hud } from "./hud";
import { PlayerController } from "./player-controller";
import { isBenchSeat, seatById } from "./seats";
import { useRoomSocket } from "@/lib/use-room-socket";
import { Canvas, useFrame } from "@react-three/fiber";
import { MAX_SPEED, ROOM, SEATS } from "@tribunal/bot/room/layout";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const latestSpeech = (speeches: Speech[], speakerId: string | null) => speeches.findLast((speech) => speech.speakerId === speakerId)?.text ?? null;

type LeavingPlayer = Pick<PlayerState, "id" | "name" | "avatarUrl" | "position">;

const EXIT_Z = ROOM.depth - 0.3;

/** A member who disconnected: walks to the aisle then to the entrance, and is removed once there */
const LeavingCharacter = ({ player, onDone }: { player: LeavingPlayer; onDone: (id: string) => void }) => {
  const positionRef = useRef<Vec2>({ ...player.position });
  const stepRef = useRef(0);
  const [rotation, setRotation] = useState(() => Math.atan2(-player.position.x, 0));
  const targets = useMemo<Vec2[]>(() => [{ x: 0, z: player.position.z }, { x: 0, z: EXIT_Z }], [player.position.z]);

  useFrame((_state, delta) => {
    const target = targets[stepRef.current];
    if (target === undefined) return;
    const dx = target.x - positionRef.current.x;
    const dz = target.z - positionRef.current.z;
    const distance = Math.hypot(dx, dz);
    const step = MAX_SPEED * delta;
    if (distance > step) {
      positionRef.current = { x: positionRef.current.x + (dx / distance) * step, z: positionRef.current.z + (dz / distance) * step };
      return;
    }
    positionRef.current = { ...target };
    stepRef.current += 1;
    if (stepRef.current >= targets.length) onDone(player.id);
    else setRotation(0);
  });

  return <Character id={player.id} name={player.name} avatarUrl={player.avatarUrl} position={player.position} follow={positionRef} rotation={rotation} seated={false} speech={null} />;
};

/** The courtroom page: 3D scene, local player, other members and the HUD */
export const RoomClient = ({ url, token }: { url: string; token?: string }) => {
  const { selfId, snapshot, speeches, verdict, voteResult, rejected, send } = useRoomSocket(url, token);
  const [interaction, setInteraction] = useState<NearbyInteraction>(null);
  const [leaving, setLeaving] = useState<LeavingPlayer[]>([]);
  const previousPlayersRef = useRef(new Map<string, LeavingPlayer>());

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
      <main className="home">
        <div className="card">
          <p>{rejected}</p>
          <Link className="button" href="/">Retour</Link>
        </div>
      </main>
    );
  }

  const self = snapshot?.players.find((player) => player.id === selfId);
  const occupiedSeats = new Set(snapshot?.players.map((player) => player.seatId));
  const speaking = new Set(snapshot?.speaking);

  return (
    <div className="room">
      <Canvas shadows camera={{ fov: 60, position: [ROOM.spawn.x, 3.5, ROOM.depth - 0.4] }}>
        <color attach="background" args={["#fff4d6"]} />
        <ambientLight intensity={1.4} />
        <directionalLight position={[6, 14, 10]} intensity={2.2} castShadow />
        <Courtroom />

        <Character id={SEATS.judge.id} name="Le Juge" avatarUrl={null} position={SEATS.judge.position} rotation={SEATS.judge.rotation} seated speech={latestSpeech(speeches, null)} speaking={speaking.has("judge")} color="#8e5bff" elevation={1.05} wig />

        {snapshot?.npcs.map((npc) => {
          const seat = seatById.get(npc.seatId);
          if (seat === undefined) return null;
          return <Character key={npc.id} id={npc.id} name={npc.name} avatarUrl={npc.avatarUrl} position={seat.position} rotation={seat.rotation} seated onBench={isBenchSeat(npc.seatId)} speech={latestSpeech(speeches, npc.id)} speaking={speaking.has(npc.id)} />;
        })}

        {snapshot?.players.filter((player) => player.id !== selfId).map((player) => (
          <Character
            key={player.id}
            id={player.id}
            name={player.name}
            avatarUrl={player.avatarUrl}
            position={player.position}
            rotation={player.rotation}
            seated={player.seatId !== null}
            onBench={isBenchSeat(player.seatId)}
            speech={latestSpeech(speeches, player.id)}
            speaking={speaking.has(player.id)}
            interpolate
          />
        ))}

        {leaving.map((player) => (
          <LeavingCharacter key={player.id} player={player} onDone={(id) => setLeaving((list) => list.filter((entry) => entry.id !== id))} />
        ))}

        {self !== undefined && <PlayerController self={self} trial={snapshot?.trial ?? null} speech={latestSpeech(speeches, self.id)} speaking={speaking.has(self.id)} send={send} occupiedSeats={occupiedSeats} onInteraction={setInteraction} />}
      </Canvas>

      <Hud trial={snapshot?.trial ?? null} verdict={verdict} voteResult={voteResult} interaction={interaction} role={self?.role ?? null} seatId={self?.seatId ?? null} send={send} />
    </div>
  );
};
