/** Custom emojis shared by Discord messages and the Activity; keep this module browser-safe. */
export const EMOJI = {
  gavel: "<:gavel:1574428820721762314>",
  throne: "<:throne:1574428711468404736>",
  moneyBag: "<:money_bag:1574428708348108941>",
  laurelCoin: "<:laurel_coin:1574428706749812787>",
  justiceCoin: "<:justice_coin:1574428703398821990>",
  handcuffs: "<:handcuffs:1574428701406269602>",
  ballotBox: "<:ballot_box:1574428698864525444>",
  speechBubbles: "<:speech_bubbles:1574428696973025291>",
  sealedScroll: "<:sealed_scroll:1574428695223861389>",
  scales: "<:scales:1574428692866666728>",
  prisonBars: "<:prison_bars:1574428691046604880>",
  maleJudge: "<:male_judge:1574428689071087797>",
  lawBooks: "<:law_books:1574428687485632512>",
  justiceShield: "<:justice_shield:1574428685988135022>",
  judgeWig: "<:judge_wig:1574428684150907061>",
  hourglass: "<:hourglass:1574428682360193024>",
  femaleJudge: "<:female_judge:1574428680057266216>",
  courthouse: "<:courthouse:1574428678564356106>",
  unbalancedScales: "<:unbalanced_scales:1574427312412168262>",
  strikingGavel: "<:striking_gavel:1574427311028314212>",
  siren: "<:siren:1574427309543399424>",
  alertShield: "<:alert_shield:1574427308188631061>",
  scroll: "<:scroll:1574427306699657317>",
  mutedSpeaker: "<:muted_speaker:1574427304841576510>",
  judge: "<:judge:1574427303394541770>",
  documentSearch: "<:document_search:1574427298508316804>",
  crown: "<:crown:1574427296914481262>",
  cross: "<:cross:1574427295379234856>",
  checkmark: "<:checkmark:1574427292317257868>",
  balancedScales: "<:balanced_scales:1574427290178293952>",
  policeWarning: "<:police_warning:1574909145650434109>",
  policeStern: "<:police_stern:1574909143356014835>",
  policeSalute: "<:police_salute:1574909141133303889>",
  policeArrest: "<:police_arrest:1574909138914246746>",
  judgeThinking: "<:judge_thinking:1574912173132480643>",
  judgeLaughing: "<:judge_laughing:1574912170926547064>",
  judgeBribed: "<:judge_bribed:1574912168200110170>",
  judgeAngry: "<:judge_angry:1574912166442827956>",
  clerkWriting: "<:clerk_writing:1574909128206450839>",
  clerkSurprised: "<:clerk_surprised:1574909125845065898>",
  clerkNeutral: "<:clerk_neutral:1574909124037054475>",
  clerkApproval: "<:clerk_approval:1574909122489614376>",
  tiboRaf: "<:tibo_raf:1574932814837719140>",
} as const;

const allowedEmojis = new Set<string>(Object.values(EMOJI));

/** One budget for a whole message, including its separate panel sections. */
export const createEmojiLimiter = (maximum = 1) => {
  let used = 0;
  return (text: string): string => text.replace(/<a?:\w+:\d+>/gu, (emoji) => {
    if (!allowedEmojis.has(emoji) || used >= maximum) return "";
    used += 1;
    return emoji;
  });
};

/** Unknown custom emojis and any beyond the budget are removed; zero strips them for speech. */
export const limitEmojis = (text: string, maximum = 1): string => createEmojiLimiter(maximum)(text).trim();
