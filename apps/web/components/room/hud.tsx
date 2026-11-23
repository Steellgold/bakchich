"use client";

import type { NearbyInteraction } from "./player-controller";
import type { VoteResult } from "@tribunal/bot/court/engine";
import type { ClientMessage, TrialView } from "@tribunal/bot/room/protocol";
import type { Role } from "@tribunal/bot/room/world";
import { useEffect, useState } from "react";

const VOTE_RESULTS: Record<VoteResult, string> = {
  "ok": "Vote enregistré.",
  "not-allowed": "L'accusé et le plaignant ne votent pas.",
  "not-in-voice": "Rejoins le salon vocal du procès pour voter.",
  "closed": "Le vote n'est pas ouvert.",
  "no-trial": "Aucun procès en cours.",
};

const ROLE_LABELS: Record<Role, string> = {
  accused: "Accusé",
  prosecutor: "Procureur",
  defense: "Avocat de la défense",
  witness: "Témoin",
};

// Not imported from the court engine: its value exports pull Node modules into the browser bundle.
const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} et ${names.at(-1) ?? ""}`);

const formatCountdown = (endsAt: number, now: number) => {
  const seconds = Math.max(0, Math.round((endsAt - now) / 1_000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
};

const roleLabel = (role: Role | null, seatId: string | null) => {
  if (role !== null) return ROLE_LABELS[role];
  return seatId?.startsWith("jury-") === true ? "Juré" : "Public";
};

type HudProps = {
  trial: TrialView | null;
  verdict: string | null;
  voteResult: VoteResult | null;
  interaction: NearbyInteraction;
  role: Role | null;
  seatId: string | null;
  send: (message: ClientMessage) => void;
};

/** Overlay: the case at the top, the verdict, the vote card, then the role and the controls at the bottom */
export const Hud = ({ trial, verdict, voteResult, interaction, role, seatId, send }: HudProps) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 500);
    return () => {
      clearInterval(timer);
    };
  }, []);

  let action: string | null = null;
  if (seatId !== null) action = "Se lever";
  else if (interaction === "become-juror") action = "Devenir juré";
  else if (interaction === "sit-on-bench" || interaction === "sit-down") action = "S’asseoir";

  return (
    <div className="hud">
      <div className="hud-top">
        <section className="panel case">
          <div className="case-head">
            <span className="pill">{trial === null ? "Audience suspendue" : trial.phase === "debate" ? "Débats" : "Vote"}</span>
            {trial !== null && <span className="timer">{formatCountdown(trial.endsAt, now)}</span>}
          </div>
          {trial !== null && (
            <>
              <h2 className="case-title">{`Le peuple contre ${joinNames(trial.accused.map((member) => member.name))}`}</h2>
              <p className="case-crime">{`« ${trial.crime} »`}</p>
              <ul className="case-people">
                <li>{`Plaignant : ${trial.plaintiff.name}`}</li>
                {trial.lawyer !== null && <li>{`Avocat : ${trial.lawyer.name}`}</li>}
                {trial.witness !== null && <li>{`À la barre : ${trial.witness.name}`}</li>}
              </ul>
            </>
          )}
        </section>

        {verdict !== null && (
          <section className="panel verdict-card">
            <span className="pill">Verdict</span>
            <p>{verdict}</p>
          </section>
        )}
      </div>

      <div className="hud-bottom">
        {trial?.phase === "vote" && (
          <section className="panel vote-card">
            <h3>À vous de juger !</h3>
            <div className="vote-buttons">
              <button type="button" className="button" onClick={() => send({ type: "vote", guilty: true })}>Coupable</button>
              <button type="button" className="button innocent" onClick={() => send({ type: "vote", guilty: false })}>Non coupable</button>
            </div>
            {voteResult !== null && <p className={`vote-note ${voteResult === "ok" ? "ok" : "error"}`}>{VOTE_RESULTS[voteResult]}</p>}
          </section>
        )}

        <span className="role">{`Vous : ${roleLabel(role, seatId)}`}</span>

        <ul className="hints">
          {action !== null && (
            <li className="hint action">
              <kbd>E</kbd>
              {action}
            </li>
          )}
          <li className="hint">
            <kbd>Z</kbd>
            <kbd>Q</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>
            Bouger
          </li>
          <li className="hint">
            <kbd>Clic</kbd>
            Caméra à la souris
          </li>
          <li className="hint">
            <kbd>Échap</kbd>
            Libérer le curseur
          </li>
        </ul>
      </div>
    </div>
  );
};
