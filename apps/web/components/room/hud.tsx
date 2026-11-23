"use client";

import type { NearbyInteraction } from "./player-controller";
import type { VoteResult } from "@tribunal/bot/court/engine";
import type { ClientMessage, TrialView } from "@tribunal/bot/room/protocol";
import { useEffect, useState } from "react";

const VOTE_RESULTS: Record<VoteResult, string> = {
  "ok": "Vote enregistré.",
  "not-allowed": "L'accusé et le plaignant ne votent pas.",
  "closed": "Le vote n'est pas ouvert.",
  "no-trial": "Aucun procès en cours.",
};

const formatCountdown = (endsAt: number, now: number) => {
  const seconds = Math.max(0, Math.round((endsAt - now) / 1_000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
};

type HudProps = {
  trial: TrialView | null;
  verdict: string | null;
  voteResult: VoteResult | null;
  interaction: NearbyInteraction;
  seated: boolean;
  send: (message: ClientMessage) => void;
};

/** Overlay with the trial in progress, its countdown, the vote buttons and the interaction hints */
export const Hud = ({ trial, verdict, voteResult, interaction, seated, send }: HudProps) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="hud">
      <div className="hud-panel">
        {trial === null ? <strong>Audience suspendue</strong> : (
          <>
            <strong>{`Le peuple contre ${trial.accused.name}`}</strong>
            <span>{`Crime : « ${trial.crime} »`}</span>
            <span>{`${trial.phase === "debate" ? "Débats" : "Vote"} : ${formatCountdown(trial.endsAt, now)}`}</span>
          </>
        )}
        {verdict !== null && <span className="verdict">{verdict}</span>}
      </div>

      {trial?.phase === "vote" && (
        <div className="hud-vote">
          <button type="button" className="button" onClick={() => send({ type: "vote", guilty: true })}>Coupable</button>
          <button type="button" className="button innocent" onClick={() => send({ type: "vote", guilty: false })}>Non coupable</button>
          {voteResult !== null && <span>{VOTE_RESULTS[voteResult]}</span>}
        </div>
      )}

      <div className="hud-hints">
        {seated && <span>[E] Se lever</span>}
        {!seated && interaction === "become-juror" && <span>[E] Devenir juré</span>}
        {!seated && interaction === "sit-on-bench" && <span>[E] S’asseoir</span>}
        <span>ZQSD : se déplacer, clic glissé : caméra</span>
      </div>
    </div>
  );
};
