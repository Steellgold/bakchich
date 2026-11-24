"use client";

import type { VoteResult } from "@tribunal/bot/court/engine";
import type { Challenge, GameView } from "@tribunal/bot/room/chaos";
import type { ArchiveFile, ClientMessage, ServerMessage } from "@tribunal/bot/room/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

const SPEECH_DURATION_MS = 6_000;
const TOAST_DURATION_MS = 7_000;
export const TOMATO_FLIGHT_MS = 600;

export type Snapshot = Extract<
  ServerMessage,
  {
    type: "snapshot";
  }
>;
export type Speech = {
  speakerId: string | null;
  text: string;
  at: number;
};
export type Toast = {
  text: string;
  at: number;
};
export type TomatoFlight = {
  fromId: string;
  toId: string;
  at: number;
};

/** Live connection to the courtroom served by the bot */
export const useRoomSocket = (url: string, token?: string) => {
  const socketRef = useRef<WebSocket | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [voteResult, setVoteResult] = useState<VoteResult | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tomatoes, setTomatoes] = useState<TomatoFlight[]>([]);
  /** When each member last jumped (client clock) */
  const [archives, setArchives] = useState<ArchiveFile[] | null>(null);
  const [jumps, setJumps] = useState<Record<string, number>>({});
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [game, setGame] = useState<GameView | null>(null);

  useEffect(() => {
    const socket = new WebSocket(url);
    socketRef.current = socket;

    const onOpen = () => {
      if (token !== undefined) socket.send(
        JSON.stringify({
          type: "auth",
          token,
        } satisfies ClientMessage),
      );
    };

    // The verdict and vote result belong to one trial: cleared when a new trial is displayed.
    let lastTrialId: string | null = null;

    const onMessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "welcome") setSelfId(message.selfId);

      if (message.type === "snapshot") {
        setSnapshot(message);

        if (message.trial !== null && message.trial.id !== lastTrialId) {
          lastTrialId = message.trial.id;
          setVerdict(null);
          setVoteResult(null);
        }
      }

      if (message.type === "speech") setSpeeches((current) => [
        ...current,
        {
          speakerId: message.speakerId,
          text: message.text,
          at: Date.now(),
        },
      ]);
      if (message.type === "verdict") setVerdict(message.line);
      if (message.type === "vote-result") setVoteResult(message.result);
      if (message.type === "rejected") setRejected(message.reason);
      // Chaos: shouts and whispers show as bubbles, tomatoes fly, rumors and refusals pop up for a few seconds.
      if (message.type === "effect") {
        const at = Date.now();
        if (message.kind === "tomato") setTomatoes((current) => [
          ...current,
          {
            fromId: message.fromId,
            toId: message.toId,
            at,
          },
        ]);
        else if (message.kind === "jump") setJumps((current) => ({
          ...current,
          [message.fromId]: at,
        }));
        else setSpeeches((current) => [
          ...current,
          {
            speakerId: message.fromId,
            text: message.kind === "objection" ? "OBJECTION !" : "Psst…",
            at,
          },
        ]);
      }

      if (message.type === "archives") setArchives(message.files);
      if (message.type === "rumor") setToasts((current) => [
        ...current,
        {
          text: `${message.fromName} : « ${message.text} »`,
          at: Date.now(),
        },
      ]);
      if (message.type === "chaos-refused") setToasts((current) => [
        ...current,
        {
          text: message.reason,
          at: Date.now(),
        },
      ]);
      if (message.type === "challenged") setChallenge(message.challenge);
      if (message.type === "game") setGame(message.game);
    };
    const onClose = () => {
      setRejected((current) => current ?? "Connexion perdue avec la salle d'audience.");
    };
    socket.addEventListener("open", onOpen);
    socket.addEventListener("message", onMessage);
    socket.addEventListener("close", onClose);

    // Speech bubbles fade after a few seconds:
    const pruner = setInterval(() => {
      const now = Date.now();
      setSpeeches((current) => current.filter((speech) => now - speech.at < SPEECH_DURATION_MS));
      setToasts((current) => (current.length === 0 ? current : current.filter((toast) => now - toast.at < TOAST_DURATION_MS)));
      setTomatoes((current) => (current.length === 0 ? current : current.filter((flight) => now - flight.at < TOMATO_FLIGHT_MS * 2)));
    }, 1_000);

    return () => {
      clearInterval(pruner);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
      socket.close();
    };
  }, [url, token]);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  return { selfId, snapshot, speeches, verdict, voteResult, rejected, toasts, tomatoes, jumps, archives, setArchives, challenge, setChallenge, game, send };
};
