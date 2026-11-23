"use client";

import type { VoteResult } from "@tribunal/bot/court/engine";
import type { ClientMessage, ServerMessage } from "@tribunal/bot/room/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

const SPEECH_DURATION_MS = 6_000;

export type Snapshot = Extract<ServerMessage, { type: "snapshot" }>;
export type Speech = { speakerId: string | null; text: string; at: number };

/** Live connection to the courtroom served by the bot */
export const useRoomSocket = (url: string) => {
  const socketRef = useRef<WebSocket | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [voteResult, setVoteResult] = useState<VoteResult | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);

  useEffect(() => {
    const socket = new WebSocket(url);
    socketRef.current = socket;

    const onMessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "welcome") setSelfId(message.selfId);
      if (message.type === "snapshot") setSnapshot(message);
      if (message.type === "speech") setSpeeches((current) => [...current, { speakerId: message.speakerId, text: message.text, at: Date.now() }]);
      if (message.type === "verdict") setVerdict(message.line);
      if (message.type === "vote-result") setVoteResult(message.result);
      if (message.type === "rejected") setRejected(message.reason);
    };
    const onClose = () => {
      setRejected((current) => current ?? "Connexion perdue avec la salle d'audience.");
    };
    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onClose);

    // Speech bubbles fade after a few seconds:
    const pruner = setInterval(() => {
      setSpeeches((current) => current.filter((speech) => Date.now() - speech.at < SPEECH_DURATION_MS));
    }, 1_000);

    return () => {
      clearInterval(pruner);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
      socket.close();
    };
  }, [url]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  return { selfId, snapshot, speeches, verdict, voteResult, rejected, send };
};
