"use client";

import type { Aim, NearbyInteraction } from "./player-controller";
import type { Toast } from "@/features/courtroom/use-room-socket";
import type { Floor, Mode, Phase, Style, VoteResult } from "@tribunal/bot/court/engine";
import type { Challenge, GameView, RoomGame } from "@tribunal/bot/room/chaos";
import type { ArchiveFile, ClientMessage, TrialView } from "@tribunal/bot/room/protocol";
import type { PlayerState, Role } from "@tribunal/bot/room/world";
import type { RefObject } from "react";
import { ArchivesDialog } from "./archives-dialog";
import { ChaosHud } from "./chaos/chaos-hud";
import { EmojiText } from "./emoji-text";
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

const PHASE_LABELS: Record<Phase, string> = {
  "opening": "Ouverture",
  "examination": "Interrogatoire",
  "prosecution": "Accusation",
  "defense": "Défense",
  "witnesses": "Témoins",
  "closing-prosecution": "Plaidoirie de l'accusation",
  "closing-defense": "Plaidoirie de la défense",
  "last-word": "Dernier mot",
  "vote": "Vote",
  "deliberation": "Délibéré",
};

const MODE_LABELS: Record<Mode, string> = {
  jury: "Jury populaire",
  bench: "Juge seul",
  assizes: "Assises",
};
const STYLE_LABELS: Record<Style, string> = {
  american: "À l'américaine",
  french: "À la française",
};

/** Below this, the timer turns red and pulses */
const HURRY_MS = 30_000;

// Not imported from the court engine: its value exports pull Node modules into the browser bundle.
const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} et ${names.at(-1) ?? ""}`);

const formatCountdown = (remainingMs: number) => {
  const seconds = Math.max(0, Math.round(remainingMs / 1_000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
};

/** Who has the floor, by name */
const floorName = (trial: TrialView, floor: Floor): string | null => {
  if (floor === "judge") return "le juge";
  if (floor === "accused") return joinNames(trial.accused.map((member) => member.name));
  if (floor === "prosecution") return trial.plaintiff.name;
  if (floor === "defense") return trial.lawyer?.name ?? joinNames(trial.accused.map((member) => member.name));
  if (floor === "witness") return trial.witness?.name ?? null;

  return null;
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
  target: PlayerState | null;
  toasts: Toast[];
  aim: Aim;
  gaugeRef: RefObject<HTMLElement | null>;
  challenge: Challenge | null;
  onChallengeAnswered: () => void;
  game: GameView | null;
  roomGame: RoomGame | null;
  archives: ArchiveFile[] | null;
  onCloseArchives: () => void;
  send: (message: ClientMessage) => void;
};

/** Overlay: the case and the verdict at the top, the role and controls bottom-left, the prompt and the vote bottom-centre */
export const Hud
  = ({ trial, verdict, voteResult, interaction, role, seatId, target, aim, gaugeRef, toasts, challenge, onChallengeAnswered, game, roomGame, archives, onCloseArchives, send }: HudProps) => {
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
    else if (interaction === "open-archives") action = "Consulter les archives";
    else if (interaction === "sit-on-bench" || interaction === "sit-down") action = "S’asseoir";

    const vote = (choice: boolean) => {
      setGuilty(choice);
      send({
        type: "vote",
        guilty: choice,
      });
    };
    const remaining = trial === null ? 0 : trial.endsAt - now;
    // The highlighted choice is the last one the court accepted:
    const accepted = voteResult === "ok" ? guilty : null;
    const floor = trial === null ? null : floorName(trial, trial.floor);
    const canMakeChaos = roomGame === null && role === null && seatId?.startsWith("jury-") !== true;

    return (
      <div className="hud">
        <div className="hud-top">
          <section className="plate panel case">
            <div className="case-head">
              <span className="plate badge">{trial === null ? "Audience suspendue" : PHASE_LABELS[trial.phase]}</span>
              {trial !== null && <span className={`plate timer${remaining <= HURRY_MS ? " is-hurry" : ""}`}>{formatCountdown(remaining)}</span>}
            </div>
            {trial !== null && (
              <>
                <h2 className="case-title">{`Le peuple contre ${joinNames(trial.accused.map((member) => member.name))}`}</h2>
                <p className="case-crime">{`« ${trial.crime} »`}</p>
                <p className="case-floor">{`${STYLE_LABELS[trial.style]} · ${MODE_LABELS[trial.mode]}${floor === null ? "" : ` · La parole : ${floor}`}`}</p>
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
              <p className="verdict-line"><EmojiText>{verdict}</EmojiText></p>
            </section>
          )}
        </div>

        <div className="hud-bottom">
          {roomGame === null && (
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
                  <kbd>Maj</kbd>
                  Courir
                </li>
                <li className="hint">
                  <kbd>Espace</kbd>
                  Sauter
                </li>
                <li className="hint">
                  <kbd>Clic</kbd>
                  Caméra à la souris
                </li>
                <li className="hint">
                  <kbd>Échap</kbd>
                  Libérer le curseur
                </li>
                {canMakeChaos && (
                  <>
                    <li className="hint">
                      <kbd>1</kbd>
                      Tomate
                    </li>
                    <li className="hint">
                      <kbd>O</kbd>
                      Objection !
                    </li>
                    <li className="hint">
                      <kbd>B</kbd>
                      Dormir
                    </li>
                  </>
                )}
              </ul>
            </div>
          )}

          <div className="hud-center">
            {roomGame === null && archives !== null && <ArchivesDialog files={archives} onClose={onCloseArchives} />}
            <ChaosHud
              target={target}
              aim={aim}
              gaugeRef={gaugeRef}
              canMakeChaos={canMakeChaos}
              toasts={toasts}
              challenge={challenge}
              onChallengeAnswered={onChallengeAnswered}
              game={game}
              roomGame={roomGame}
              send={send}
            />
            {roomGame === null && trial?.phase === "vote" && (
              <GameDialog
                size="compact"
                title="À vous de juger !"
                actions={(
                  <>
                    <GameButton variant="danger" selected={accepted === true} onClick={() => vote(true)}>
                      Coupable
                    </GameButton>
                    <GameButton variant="success" selected={accepted === false} onClick={() => vote(false)}>
                      Non coupable
                    </GameButton>
                  </>
                )}
              >
                {voteResult !== null && (
                  <p
                    key={`${voteResult}-${String(guilty)}`}
                    className={`plate notice ${voteResult === "ok" ? "notice-success" : "notice-error"}`}
                    role="status"
                  >
                    {VOTE_RESULTS[voteResult]}
                  </p>
                )}
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
