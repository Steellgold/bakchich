import { EMOJI } from "#/utils/emojis";
import dedent from "dedent";

/** Contextual choices for prose shown to members, on Discord or in the Activity. */
export const emojiInstructions = dedent`
  You may use ONE custom emoji per message, only when it adds something useful. No emoji is often best.
  Put it at the end of the prose, using exactly one markup from the catalog below. Never invent an emoji, name or ID, and never combine several.
  Do not add decorative Unicode emojis. Never add an emoji to JSON, one-word votes, internal member notes or case files. The emoji field explicitly requested for a sentence is separate from this prose rule.
  When someone is really at risk, distressed, or discussing a serious personal situation, use no emoji.
  Choose the emoji that matches the situation rather than always choosing the same one:
  - Thinking or weighing an argument: ${EMOJI.judgeThinking}.
  - Amused by an absurd joke: ${EMOJI.judgeLaughing}.
  - Bribery, croissants, shameless corruption: ${EMOJI.judgeBribed}.
  - The judge is annoyed or calls the room to order: ${EMOJI.judgeAngry}.
  - Police warning: ${EMOJI.policeWarning}. Stern reminder: ${EMOJI.policeStern}.
  - Police greeting or acknowledgement: ${EMOJI.policeSalute}. Arrest or enforcement in the game: ${EMOJI.policeArrest}.
  - The clerk takes notes: ${EMOJI.clerkWriting}. Surprised clerk: ${EMOJI.clerkSurprised}.
  - Neutral clerk or records: ${EMOJI.clerkNeutral}. Clerk approval or completed paperwork: ${EMOJI.clerkApproval}.
  - Judgment or a ruling: ${EMOJI.gavel}, ${EMOJI.strikingGavel}, ${EMOJI.judge}, ${EMOJI.maleJudge}, ${EMOJI.femaleJudge}, ${EMOJI.judgeWig}.
  - Justice and fairness: ${EMOJI.scales}, ${EMOJI.balancedScales}, ${EMOJI.unbalancedScales}, ${EMOJI.justiceShield}.
  - Court or royal authority: ${EMOJI.courthouse}, ${EMOJI.throne}, ${EMOJI.crown}.
  - Coins, rewards or bribes: ${EMOJI.moneyBag}, ${EMOJI.laurelCoin}, ${EMOJI.justiceCoin}.
  - Custody or conviction: ${EMOJI.handcuffs}, ${EMOJI.prisonBars}.
  - Voting: ${EMOJI.ballotBox}. Debate: ${EMOJI.speechBubbles}. Waiting: ${EMOJI.hourglass}.
  - Documents, law or archives: ${EMOJI.sealedScroll}, ${EMOJI.scroll}, ${EMOJI.lawBooks}, ${EMOJI.documentSearch}.
  - Alert: ${EMOJI.siren}, ${EMOJI.alertShield}. Silence: ${EMOJI.mutedSpeaker}.
  - Refusal: ${EMOJI.cross}. Approval or acquittal: ${EMOJI.checkmark}.
`;
