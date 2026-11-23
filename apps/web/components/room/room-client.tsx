"use client";

import type { NearbyInteraction } from "./player-controller";
import type { Speech } from "@/lib/use-room-socket";
import { Character } from "./character";
import { Courtroom } from "./courtroom";
import { Hud } from "./hud";
import { PlayerController } from "./player-controller";
import { isBenchSeat, seatById } from "./seats";
import { useRoomSocket } from "@/lib/use-room-socket";
import { Canvas } from "@react-three/fiber";
import { ROOM, SEATS } from "@tribunal/bot/room/layout";
import Link from "next/link";
import { useState } from "react";

const latestSpeech = (speeches: Speech[], speakerId: string | null) => speeches.findLast((speech) => speech.speakerId === speakerId)?.text ?? null;

/** The courtroom page: 3D scene, local player, other members and the HUD */
export const RoomClient = ({ url, token }: { url: string; token?: string }) => {
  const { selfId, snapshot, speeches, verdict, voteResult, rejected, send } = useRoomSocket(url, token);
  const [interaction, setInteraction] = useState<NearbyInteraction>(null);

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

  return (
    <div className="room">
      <Canvas shadows camera={{ fov: 60, position: [ROOM.spawn.x, 3.5, ROOM.depth - 0.4] }}>
        <color attach="background" args={["#fff4d6"]} />
        <ambientLight intensity={1.4} />
        <directionalLight position={[6, 14, 10]} intensity={2.2} castShadow />
        <Courtroom />

        <Character id={SEATS.judge.id} name="Le Juge" avatarUrl={null} position={SEATS.judge.position} rotation={SEATS.judge.rotation} seated speech={latestSpeech(speeches, null)} color="#8e5bff" elevation={1.05} wig />

        {snapshot?.npcs.map((npc) => {
          const seat = seatById.get(npc.seatId);
          if (seat === undefined) return null;
          return <Character key={npc.id} id={npc.id} name={npc.name} avatarUrl={npc.avatarUrl} position={seat.position} rotation={seat.rotation} seated onBench={isBenchSeat(npc.seatId)} speech={latestSpeech(speeches, npc.id)} />;
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
            interpolate
          />
        ))}

        {self !== undefined && <PlayerController self={self} speech={latestSpeech(speeches, self.id)} send={send} occupiedSeats={occupiedSeats} onInteraction={setInteraction} />}
      </Canvas>

      <Hud trial={snapshot?.trial ?? null} verdict={verdict} voteResult={voteResult} interaction={interaction} seated={(self?.seatId ?? null) !== null} send={send} />
    </div>
  );
};
