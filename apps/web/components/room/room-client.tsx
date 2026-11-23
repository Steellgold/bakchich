"use client";

import type { Speech } from "@/lib/use-room-socket";
import { Character } from "./character";
import { Courtroom } from "./courtroom";
import { Hud } from "./hud";
import { PlayerController } from "./player-controller";
import { seatById } from "./seats";
import { useRoomSocket } from "@/lib/use-room-socket";
import { Canvas } from "@react-three/fiber";
import { SEATS } from "@tribunal/bot/room/layout";
import Link from "next/link";
import { useState } from "react";

const latestSpeech = (speeches: Speech[], speakerId: string | null) => speeches.findLast((speech) => speech.speakerId === speakerId)?.text ?? null;

/** The courtroom page: 3D scene, local player, other members and the HUD */
export const RoomClient = ({ url }: { url: string }) => {
  const { selfId, snapshot, speeches, verdict, voteResult, rejected, send } = useRoomSocket(url);
  const [nearGate, setNearGate] = useState(false);

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

  return (
    <div className="room">
      <Canvas shadows camera={{ fov: 60, position: [0, 4, 34] }}>
        <color attach="background" args={["#9ad9ff"]} />
        <ambientLight intensity={1.4} />
        <directionalLight position={[6, 14, 10]} intensity={2.2} castShadow />
        <Courtroom />

        <Character name="Le Juge" avatarUrl={null} position={SEATS.judge.position} rotation={SEATS.judge.rotation} seated speech={latestSpeech(speeches, null)} color="#8e5bff" elevation={1.05} wig />

        {snapshot?.npcs.map((npc) => {
          const seat = seatById.get(npc.seatId);
          return seat === undefined ? null : <Character key={npc.id} name={npc.name} avatarUrl={npc.avatarUrl} position={seat.position} rotation={seat.rotation} seated speech={latestSpeech(speeches, npc.id)} />;
        })}

        {snapshot?.players.filter((player) => player.id !== selfId).map((player) => (
          <Character
            key={player.id}
            name={player.name}
            avatarUrl={player.avatarUrl}
            position={player.position}
            rotation={player.rotation}
            seated={player.seatId !== null}
            speech={latestSpeech(speeches, player.id)}
            interpolate
          />
        ))}

        {self !== undefined && <PlayerController self={self} speech={latestSpeech(speeches, self.id)} send={send} onNearGate={setNearGate} />}
      </Canvas>

      <Hud trial={snapshot?.trial ?? null} verdict={verdict} voteResult={voteResult} nearGate={nearGate} seated={(self?.seatId ?? null) !== null} send={send} />
    </div>
  );
};
