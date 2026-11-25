"use client";

import type { VoteResult } from "@tribunal/bot/court/engine";
import type { Challenge, GameView } from "@tribunal/bot/room/chaos";
import type { ArchiveFile, ClientMessage, ServerMessage } from "@tribunal/bot/room/protocol";
import { CHALLENGE_MS } from "@tribunal/bot/room/chaos";
import { useCallback, useEffect, useRef, useState } from "react";

const SPEECH_DURATION_MS = 6_000;
const TOAST_DURATION_MS = 7_000;
/** How long a splat stays on a wall or the floor */
export const SPLAT_LIFE_MS = 8_000;
/** Objection signs and whispers stay up this long */
export const CALLOUT_LIFE_MS = 2_500;

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
export type TomatoFlight = Extract<
  ServerMessage,
  {
    type: "effect";
    kind: "tomato" | "web";
  }
> & { at: number };
/** An objection shouted (above the shouter) or a rumor whispered (at the ear of the target) */
export type Callout = {
  kind: "objection" | "whisper";
  fromId: string;
  toId: string | null;
  at: number;
};

/** Window jump events (client clock): a pane broken, a ceiling portal (closed once `closedAt` is set) and a landing */
export type WindowBreak = {
  side: -1 | 1;
  z: number;
  at: number;
};
export type Portal = {
  id: string;
  x: number;
  z: number;
  at: number;
  closedAt: number | null;
};
export type Landing = {
  id: string;
  kind: "flop" | "hero";
  x: number;
  z: number;
  at: number;
};
/** How long the glass shards, the closed portal and the landing marks are kept */
export const JUMP_FX_LIFE_MS = 8_000;

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
  const [callouts, setCallouts] = useState<Callout[]>([]);
  /** When each member last jumped (client clock) */
  const [archives, setArchives] = useState<ArchiveFile[] | null>(null);
  const [jumps, setJumps] = useState<Record<string, number>>({});
  const [challenge, setChallenge] = useState<(Challenge & { at: number }) | null>(null);
  const [game, setGame] = useState<GameView | null>(null);
  const [windowBreaks, setWindowBreaks] = useState<WindowBreak[]>([]);
  const [portals, setPortals] = useState<Portal[]>([]);
  const [landings, setLandings] = useState<Landing[]>([]);
  const [shakeAt, setShakeAt] = useState(0);

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
        if (message.kind === "tomato" || message.kind === "web") setTomatoes((current) => [
          ...current,
          {
            ...message,
            at,
          },
        ]);
        else if (message.kind === "jump") setJumps((current) => ({
          ...current,
          [message.fromId]: at,
        }));
        else {
          const callout: Callout = {
            kind: message.kind,
            fromId: message.fromId,
            toId: message.kind === "whisper" ? message.toId : null,
            at,
          };
          setCallouts((current) => [...current, callout]);
        }
      }

      if (message.type === "window-break") setWindowBreaks((current) => [
        ...current,
        {
          side: message.side,
          z: message.z,
          at: Date.now(),
        },
      ]);
      if (message.type === "portal-open") setPortals((current) => [
        ...current.filter((portal) => portal.id !== message.id),
        {
          id: message.id,
          x: message.x,
          z: message.z,
          at: Date.now(),
          closedAt: null,
        },
      ]);
      if (message.type === "portal-close") setPortals((current) => current.map((portal) => (portal.id === message.id ? {
        ...portal,
        closedAt: Date.now(),
      } : portal)));
      if (message.type === "shake") setShakeAt(Date.now());
      if (message.type === "landing") setLandings((current) => [
        ...current,
        {
          id: message.id,
          kind: message.kind,
          x: message.x,
          z: message.z,
          at: Date.now(),
        },
      ]);

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
      if (message.type === "challenged") setChallenge({ ...message.challenge, at: Date.now() });
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
      setTomatoes((current) => (current.length === 0 ? current : current.filter((flight) => now - flight.at < flight.duration * 1_000 + SPLAT_LIFE_MS)));
      setCallouts((current) => (current.length === 0 ? current : current.filter((callout) => now - callout.at < CALLOUT_LIFE_MS)));
      setWindowBreaks((current) => (current.length === 0 ? current : current.filter((windowBreak) => now - windowBreak.at < JUMP_FX_LIFE_MS)));
      setPortals((current) => (current.length === 0 ? current : current.filter((portal) => portal.closedAt === null || now - portal.closedAt < JUMP_FX_LIFE_MS)));
      setLandings((current) => (current.length === 0 ? current : current.filter((landing) => now - landing.at < JUMP_FX_LIFE_MS)));
      // The server drops the challenge after the same delay:
      setChallenge((current) => (current !== null && now - current.at >= CHALLENGE_MS ? null : current));
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

  return { selfId, snapshot, speeches, verdict, voteResult, rejected, toasts, tomatoes, callouts, jumps, archives, setArchives, challenge, setChallenge, game, windowBreaks, portals, landings, shakeAt, send };
};
