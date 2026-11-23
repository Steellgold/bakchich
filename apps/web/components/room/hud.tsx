"use client";

import type { NearbyInteraction } from "./player-controller";
import type { VoteResult } from "@tribunal/bot/court/engine";
import type { ClientMessage, TrialView } from "@tribunal/bot/room/protocol";
import type { Role } from "@tribunal/bot/room/world";
import { Emblem, GameButton, GameDialog } from "@/components/game-ui";
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

/** Below this, the timer turns red and pulses */
const HURRY_MS = 30_000;

// Not imported from the court engine: its value exports pull Node modules into the browser bundle.
const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} et ${names.at(-1) ?? ""}`);

const formatCountdown = (remainingMs: number) => {
  const seconds = Math.max(0, Math.round(remainingMs / 1_000));
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

/** Overlay: the case and the verdict at the top, the role and controls bottom-left, the prompt and the vote bottom-centre */
export const Hud = ({ trial, verdict, voteResult, interaction, role, seatId, send }: HudProps) => {
  const [now, setNow] = useState(() => Date.now());
  const [guilty, setGuilty] = useState<boolean | null>(null);

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

  const vote = (choice: boolean) => {
    setGuilty(choice);
    send({ type: "vote", guilty: choice });
  };
  const remaining = trial === null ? 0 : trial.endsAt - now;
  // The highlighted choice is the last one the court accepted:
  const accepted = voteResult === "ok" ? guilty : null;

  return (
    <div className="hud">
      <div className="hud-top">
        <section className="plate panel case">
          <div className="case-head">
            <span className="plate badge">{trial === null ? "Audience suspendue" : trial.phase === "debate" ? "Débats" : "Vote"}</span>
            {trial !== null && <span className={`plate timer${remaining <= HURRY_MS ? " is-hurry" : ""}`}>{formatCountdown(remaining)}</span>}
          </div>
          {trial !== null && (
            <>
              <h2 className="case-title">{`Le peuple contre ${joinNames(trial.accused.map((member) => member.name))}`}</h2>
              <p className="case-crime">{`« ${trial.crime} »`}</p>
              <ul className="case-people">
                <li>
                  <span className="case-label">Plaignant</span>
                  {trial.plaintiff.name}
                </li>
                {trial.lawyer !== null && (
                  <li>
                    <span className="case-label">Avocat</span>
                    {trial.lawyer.name}
                  </li>
                )}
                {trial.witness !== null && (
                  <li>
                    <span className="case-label">À la barre</span>
                    {trial.witness.name}
                  </li>
                )}
              </ul>
            </>
          )}
        </section>

        {verdict !== null && (
          <section key={verdict} className="plate verdict" role="status">
            <Emblem />
            <span className="plate badge">Verdict</span>
            <p className="verdict-line">{verdict}</p>
          </section>
        )}
      </div>

      <div className="hud-bottom">
        <div className="hud-corner">
          <span className="plate role">
            <span className="role-label">Vous</span>
            {roleLabel(role, seatId)}
          </span>
          <ul className="hints">
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

        <div className="hud-center">
          {trial?.phase === "vote" && (
            <GameDialog
              size="compact"
              title="À vous de juger !"
              actions={(
                <>
                  <GameButton variant="danger" selected={accepted === true} onClick={() => vote(true)}>Coupable</GameButton>
                  <GameButton variant="success" selected={accepted === false} onClick={() => vote(false)}>Non coupable</GameButton>
                </>
              )}
            >
              {voteResult !== null && <p key={`${voteResult}-${String(guilty)}`} className={`plate notice ${voteResult === "ok" ? "notice-success" : "notice-error"}`} role="status">{VOTE_RESULTS[voteResult]}</p>}
            </GameDialog>
          )}

          {action !== null && (
            <p key={action} className="plate prompt">
              <kbd>E</kbd>
              {action}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
