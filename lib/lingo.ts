// Every flavored UI string lives here, keyed by lingo. Each member picks the
// lingo the app speaks to them in (members.lingo); "english" is the default
// and the plain-vocabulary baseline. Buttons, nav, and rule errors stay plain
// everywhere — personality lives in headings, empty states, and asides.
// Pure data: safe to import from both server and client components.

export const LINGO_KEYS = [
  "english",
  "bangalore",
  "hyderabad",
  "mumbai",
  "delhi",
  "chennai",
] as const;

export type LingoKey = (typeof LINGO_KEYS)[number];

export interface Lingo {
  /** Display name in the picker. */
  name: string;
  /** Register description handed to the AI polish prompt. */
  register: string;
  footer: string;
  activityHeading: string;
  activitySoFarHeading: string;
  activityEmpty: string;
  joinedFeed: string;
  joinedLedger: string;
  openEmptyTitle: string;
  openEmptySub: string;
  resolvedEmpty: string;
  openBetsEmpty: string;
  betsEmpty: string;
  leaderboardTitle: string;
  leaderboardSub: (min: number) => string;
  leaderboardEmptyTitle: string;
  calibratingSub: string;
  membersTitle: string;
  membersSub: string;
  newTitle: string;
  inboxEmptyTitle: string;
  inboxEmptySub: string;
  stakeLimit: string;
  voidHint: string;
  oops: string;
  questionPlaceholder: string;
  criteriaPlaceholder: string;
}

export const LINGOS: Record<LingoKey, Lingo> = {
  english: {
    name: "Plain English",
    register: "plain English",
    footer:
      "Virtual units (π) only. Zero-sum: winners split exactly what losers put in. Every outcome is on the record.",
    activityHeading: "Recent action",
    activitySoFarHeading: "Action so far",
    activityEmpty: "Nothing yet. Quiet before the action.",
    joinedFeed: "joined the game",
    joinedLedger: "Joined the game",
    openEmptyTitle: "No open predictions.",
    openEmptySub: "Someone has to stick their neck out first — why not you?",
    resolvedEmpty: "Nothing resolved yet. History starts with the first verdict.",
    openBetsEmpty: "nothing yet",
    betsEmpty: "Nobody has bet yet. First in sets the tone.",
    leaderboardTitle: "Who can actually predict things",
    leaderboardSub: (min) =>
      `Ranked by return on units bet, over at least ${min} resolved predictions. One lucky bet won't get you on the board — a track record will.`,
    leaderboardEmptyTitle: "The board is empty.",
    calibratingSub: "Not enough resolved predictions to rank yet.",
    membersTitle: "The group",
    membersSub: "One private table. Everyone sees everything.",
    newTitle: "Stick your neck out",
    inboxEmptyTitle: "All quiet.",
    inboxEmptySub: "When friends open predictions or bet against you, it shows up here.",
    stakeLimit: "You've hit the stake limit on this prediction.",
    voidHint: "Ambiguous or unresolvable — everyone gets their bet back",
    oops: "That didn't work.",
    questionPlaceholder: "Will it rain before 6 PM tomorrow?",
    criteriaPlaceholder:
      "I'll check at 6:00 PM sharp — a wet road counts as rain, photo as evidence. Rain resolves YES; dry resolves NO. If I can't check, I'll void it.",
  },

  bangalore: {
    name: "South Bangalore",
    register: "Bangalore English with light Kannada seasoning (scene, swalpa, guru, khaali, aiyo)",
    footer:
      "Virtual units (π) only — no money, only maryaade. Zero-sum: winners split exactly what losers put in. Yella on the record.",
    activityHeading: "The scene",
    activitySoFarHeading: "Scene so far",
    activityEmpty: "Scene illa. Quiet before the action.",
    joinedFeed: "joined the adda",
    joinedLedger: "Joined the adda",
    openEmptyTitle: "Scene illa.",
    openEmptySub:
      'No open predictions. Somebody has to say "ee sala cup namde" first — why not you?',
    resolvedEmpty: "No verdicts yet. History starts with the first one.",
    openBetsEmpty: "khaali for now",
    betsEmpty: "Khaali table — nobody has bet yet. First in sets the tone.",
    leaderboardTitle: "Ee sala cup yaardu?",
    leaderboardSub: (min) =>
      `Ranked by return on units bet, over at least ${min} resolved predictions. One lucky bet won't get you on the board — seventeen years of RCB taught us that much.`,
    leaderboardEmptyTitle: "Board khaali.",
    calibratingSub: "Not enough resolved predictions to rank yet. Swalpa time kodi.",
    membersTitle: "The adda",
    membersSub:
      "One private table. Everyone sees everything — the neighbourhood aunties would approve.",
    newTitle: "Create a scene",
    inboxEmptyTitle: "Full silence.",
    inboxEmptySub: "When friends open predictions or bet against you, the scene shows up here.",
    stakeLimit: "Full house, guru — you've hit the stake limit on this prediction.",
    voidHint: "Ambiguous or unresolvable — swalpa adjust maadi, everyone gets their bet back",
    oops: "Aiyo, that didn't work.",
    questionPlaceholder: "Will it rain in Jayanagar before 6 PM tomorrow?",
    criteriaPlaceholder:
      "I'll check from my terrace in 4th Block at 6:00 PM sharp — a wet road counts as rain, photo as evidence. Rain resolves YES; dry resolves NO. If I'm out of Bangalore by then, I'll void it.",
  },

  hyderabad: {
    name: "Hyderabadi",
    register:
      "Hyderabadi English with light Deccani seasoning (miyan, kya toh bhi, haule haule, lite lo)",
    footer:
      "Virtual units (π) only — no paise, sirf izzat. Zero-sum: winners split exactly what losers put in. Sab kuch record pe, miyan.",
    activityHeading: "Halchal",
    activitySoFarHeading: "Halchal so far",
    activityEmpty: "Koi halchal nahi. Ekdum shaanti.",
    joinedFeed: "joined the mehfil",
    joinedLedger: "Joined the mehfil",
    openEmptyTitle: "Ekdum khaali, miyan.",
    openEmptySub: "No open predictions. Someone has to make the pehla move — aap hi kar dalo.",
    resolvedEmpty: "No verdicts yet. History starts with the first one.",
    openBetsEmpty: "khaali abhi",
    betsEmpty: "Khaali table — nobody has bet yet. Pehla bet sets the tone, miyan.",
    leaderboardTitle: "Baap kaun hai?",
    leaderboardSub: (min) =>
      `Ranked by return on units bet, over at least ${min} resolved predictions. Ek lucky bet se baap nahi bante, miyan.`,
    leaderboardEmptyTitle: "Board ekdum khaali.",
    calibratingSub: "Not enough resolved predictions to rank yet. Haule haule.",
    membersTitle: "The mehfil",
    membersSub: "One private table. Everyone sees everything — mohalle waali khala style.",
    newTitle: "Kya toh bhi bolo",
    inboxEmptyTitle: "Ekdum shaanti.",
    inboxEmptySub: "When friends open predictions or bet against you, the halchal shows up here.",
    stakeLimit: "Bas miyan — you've hit the stake limit on this prediction.",
    voidHint: "Ambiguous or unresolvable — lite lo, everyone gets their bet back",
    oops: "Arre, kya toh bhi ho gaya. Try again.",
    questionPlaceholder: "Will the biryani line at Shadab cross the gate by 1 PM on Sunday?",
    criteriaPlaceholder:
      "I'll be at Shadab at 1:00 PM sharp and count the line, photo as evidence. Line past the gate resolves YES; shorter resolves NO. If it's closed, I'll void it.",
  },

  mumbai: {
    name: "Bambaiyya",
    register: "Mumbai English with light Bambaiyya seasoning (boss, bole toh, bindaas, daav, vaat)",
    footer:
      "Virtual units (π) only — paisa nahi, sirf izzat. Zero-sum: winners split exactly what losers put in. Sab kuch on the record, boss.",
    activityHeading: "Kya scene hai",
    activitySoFarHeading: "Scene abhi tak",
    activityEmpty: "Kuch nahi re. Shaanti chal rahi hai.",
    joinedFeed: "joined the gang",
    joinedLedger: "Joined the gang",
    openEmptyTitle: "Scene shaant hai, boss.",
    openEmptySub: "No open predictions. Koi toh bindaas pehla daav lagao — tu hi kar na.",
    resolvedEmpty: "No verdicts yet. History starts with the first one.",
    openBetsEmpty: "khaali haath abhi",
    betsEmpty: "Table khaali — nobody has bet yet. Pehla daav sets the tone, boss.",
    leaderboardTitle: "Bole toh, boss kaun?",
    leaderboardSub: (min) =>
      `Ranked by return on units bet, over at least ${min} resolved predictions. Ek lucky daav se boss nahi bante.`,
    leaderboardEmptyTitle: "Board khaali hai.",
    calibratingSub: "Not enough resolved predictions to rank yet. Aaram se.",
    membersTitle: "The gang",
    membersSub: "One private table. Everyone sees everything — building waali aunty approved.",
    newTitle: "Scene create kar",
    inboxEmptyTitle: "Sab shaant, boss.",
    inboxEmptySub: "When friends open predictions or bet against you, the scene lands here.",
    stakeLimit: "Full ho gaya, boss — you've hit the stake limit on this prediction.",
    voidHint: "Ambiguous or unresolvable — tension nahi, everyone gets their bet back",
    oops: "Vaat lagi. Try again, boss.",
    questionPlaceholder: "Will the 8:42 Churchgate fast actually leave on time tomorrow?",
    criteriaPlaceholder:
      "I'll be on the platform at 8:42 sharp and check m-indicator, screenshot as evidence. Departure within 2 minutes resolves YES; later resolves NO. Megablock means void.",
  },

  delhi: {
    name: "Dilli",
    register: "Delhi English with light Dilli seasoning (bhai, scene, ekdum, bawaal)",
    footer:
      "Virtual units (π) only — paisa nahi, sirf izzat. Zero-sum: winners split exactly what losers put in. Sab record pe hai, bhai.",
    activityHeading: "Aaj ka bawaal",
    activitySoFarHeading: "Bawaal so far",
    activityEmpty: "Koi bawaal nahi. Abhi sab shaant hai.",
    joinedFeed: "joined the circle",
    joinedLedger: "Joined the circle",
    openEmptyTitle: "Koi scene nahi, bhai.",
    openEmptySub: "No open predictions. Koi toh bada claim maaro — tu hi kar le.",
    resolvedEmpty: "No verdicts yet. History starts with the first one.",
    openBetsEmpty: "abhi toh khaali",
    betsEmpty: "Khaali table — nobody has bet yet. Pehla bet sets the tone, bhai.",
    leaderboardTitle: "Sabse bada khiladi kaun?",
    leaderboardSub: (min) =>
      `Ranked by return on units bet, over at least ${min} resolved predictions. Ek lucky bet se khiladi nahi bante, bhai.`,
    leaderboardEmptyTitle: "Board ekdum khaali.",
    calibratingSub: "Not enough resolved predictions to rank yet. Thoda sabar, bhai.",
    membersTitle: "Apna circle",
    membersSub: "One private table. Everyone sees everything — colony waali aunty approved.",
    newTitle: "Bada claim maaro",
    inboxEmptyTitle: "Koi bawaal nahi.",
    inboxEmptySub: "When friends open predictions or bet against you, the bawaal shows up here.",
    stakeLimit: "Bas bhai — you've hit the stake limit on this prediction.",
    voidHint: "Ambiguous or unresolvable — chill, everyone gets their bet back",
    oops: "Oho, kuch gadbad ho gaya. Try again.",
    questionPlaceholder: "Will the AQI cross 400 in Delhi tomorrow morning?",
    criteriaPlaceholder:
      "I'll screenshot the official CPCB reading for Anand Vihar at 8:00 AM sharp. 401 or higher resolves YES; 400 or lower resolves NO. If the station is down, I'll void it.",
  },

  chennai: {
    name: "Chennai Tanglish",
    register: "Chennai English with light Tanglish seasoning (machan, semma, vera level, aiyo)",
    footer:
      "Virtual units (π) only — no money, only maanam. Zero-sum: winners split exactly what losers put in. Ellame on the record.",
    activityHeading: "Enna nadakkudhu",
    activitySoFarHeading: "So far, machan",
    activityEmpty: "Onnum illa. Full silence.",
    joinedFeed: "joined the gumbal",
    joinedLedger: "Joined the gumbal",
    openEmptyTitle: "Onnum illa, machan.",
    openEmptySub: "No open predictions. Somebody has to make the first semma claim — why not you?",
    resolvedEmpty: "No verdicts yet. History starts with the first one.",
    openBetsEmpty: "onnum illa for now",
    betsEmpty: "Empty table — nobody has bet yet. First bet sets the tone, machan.",
    leaderboardTitle: "Yaaru da mass?",
    leaderboardSub: (min) =>
      `Ranked by return on units bet, over at least ${min} resolved predictions. One lucky bet is not mass, machan — a track record is.`,
    leaderboardEmptyTitle: "Board fulla empty.",
    calibratingSub: "Not enough resolved predictions to rank yet. Konjam porumai.",
    membersTitle: "The gumbal",
    membersSub: "One private table. Everyone sees everything — maami network approved.",
    newTitle: "Scene podu",
    inboxEmptyTitle: "Full silence, machan.",
    inboxEmptySub: "When friends open predictions or bet against you, it shows up here.",
    stakeLimit: "Mudinchidhu, machan — you've hit the stake limit on this prediction.",
    voidHint: "Ambiguous or unresolvable — tension aagadha, everyone gets their bet back",
    oops: "Aiyo, adhu work aagala. Try again.",
    questionPlaceholder: "Will it cross 38°C in T. Nagar tomorrow afternoon?",
    criteriaPlaceholder:
      "I'll screenshot the IMD Chennai reading at 3:00 PM sharp. 38.1°C or higher resolves YES; 38.0°C or lower resolves NO. If IMD is down, I'll void it.",
  },
};

export function isLingoKey(key: string): key is LingoKey {
  return (LINGO_KEYS as readonly string[]).includes(key);
}

/** The member's lingo, falling back to plain English for anything unknown. */
export function lingoOf(key: string): Lingo {
  return isLingoKey(key) ? LINGOS[key] : LINGOS.english;
}
