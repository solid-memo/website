/* Generated from ns/vocab/v1.ttl by `npm run generate`. Do not edit: change the source and regenerate. */

/** Solid Memo's own vocabulary, version 1.13 (see docs/vocab.md). */
export const SM_NS = "https://solid-memo.com/ns/vocab/v1.ttl#";

export const SM = {
  /** One Solid Memo data location: a container in a pod holding decks, cards, review state and preferences. Described by the container's meta document. (Since 1.0.) */
  Instance: `${SM_NS}Instance`,
  /** A named set of cards studied together. In a pod, a subject of the instance's catalog document; in the deck library, the document itself. (Since 1.0.) */
  Deck: `${SM_NS}Deck`,
  /** A flashcard: a front and a back, each text, a picture, or both. (Since 1.0.) */
  Card: `${SM_NS}Card`,
  /** SM-2 scheduling state of one card in one study direction. Its subject is named after the card: #<cardId> for front-to-back, #<cardId>@back-to-front for the other way. (Since 1.0.) */
  ReviewState: `${SM_NS}ReviewState`,
  /** Study preferences of one instance: daily caps, the day boundary, the answer scale and developer mode. (Since 1.0.) */
  Preferences: `${SM_NS}Preferences`,
  /** What Solid Memo found an instance document to be at one version of it (its ETag): that it conformed to the shapes, that nothing in it was in an older format. A subject of the instance's digest document; derived data, rebuilt whenever it does not hold. (Added in 1.9.) */
  DocumentReceipt: `${SM_NS}DocumentReceipt`,
  /** How many of a deck's prompts fall due on which study day and how many are still new, computed from given versions of its cards and reviews documents, so the deck list can count today's study without them. A subject of the instance's digest document; derived data, rebuilt whenever it does not hold. (Added in 1.9.) */
  DeckSchedule: `${SM_NS}DeckSchedule`,
  /** One grade given to one prompt (a card, studied one way) during study: an entry of the instance's answer log, one document per study month, which the study statistics are computed from. Appended, never edited; resetting a study day removes that day's answers. (Added in 1.10.) */
  Answer: `${SM_NS}Answer`,
  /** A named group of decks and deck groups that the user arranged on the deck list. A subject of the instance's catalog document: a dcat:Catalog of its decks (dcat:dataset) and sub-groups (dcat:catalog), listed by the one catalogue or group it is in. (Added in 1.13.) */
  DeckGroup: `${SM_NS}DeckGroup`,
  /** Which version of its class's shape the subject conforms to. Absent means 1, the format that predates the field. Every subject Solid Memo writes carries it. (Since 1.0.) */
  formatVersion: `${SM_NS}formatVersion`,
  /** Where a deck or deck group stands among the members of the one catalogue or group it is in, 0 first; the decks and groups of one parent share one sequence. Absent means after every member that has one. (Added in 1.13. On a deck it is outside the deck format, without a version bump: an older reader ignores it and an older writer keeps it.) */
  position: `${SM_NS}position`,
  /** The document holding the deck's cards, one sm:Card per hash fragment. (Since 1.0.) */
  cardsDocument: `${SM_NS}cardsDocument`,
  /** The document holding the deck's review states, joined to its cards by fragment id. (Since 1.0.) */
  reviewsDocument: `${SM_NS}reviewsDocument`,
  /** How the deck is studied: "front-to-back", "back-to-front" or "bidirectional" (every card asked both ways, each way scheduled on its own). Absent means front-to-back. (Added in 1.5 for deck format 2; deprecated in 1.6 for studyDirection.) @deprecated Use studyDirection. */
  direction: `${SM_NS}direction`,
  /** How the deck is studied: a concept of solid-memo:StudyDirections. Replaces the string-valued direction. (Added in 1.6 for deck format 3.) */
  studyDirection: `${SM_NS}studyDirection`,
  /** In the deck library's index only: how many cards a listed deck document holds. (Added in 1.4 for the library index.) */
  cardCount: `${SM_NS}cardCount`,
  /** Maximum unseen cards of this deck introduced per study day, in place of the instance's newCardsPerDay. Absent means the instance's. (Added in 1.7.) */
  deckNewCardsPerDay: `${SM_NS}deckNewCardsPerDay`,
  /** Maximum due-card reviews of this deck per study day, in place of the instance's maxReviewsPerDay. Absent means the instance's. (Added in 1.7.) */
  deckMaxReviewsPerDay: `${SM_NS}deckMaxReviewsPerDay`,
  /** Text on the front of the card. (Since 1.0.) */
  front: `${SM_NS}front`,
  /** Text on the back of the card. (Since 1.0.) */
  back: `${SM_NS}back`,
  /** A picture on the front of the card, shown above any text. Always an IRI, never a string literal. (Added in 1.3 for card format 2.) */
  frontImage: `${SM_NS}frontImage`,
  /** A picture on the back of the card, shown above any text. Always an IRI, never a string literal. (Added in 1.3 for card format 2.) */
  backImage: `${SM_NS}backImage`,
  /** What the front's picture shows, in words: its text alternative for whoever cannot see it. Language-tagged text, one per language. While the front is the question it should not give the answer away. (Added in 1.12, in card format 4 without a version bump: an older reader ignores it.) */
  frontImageDescription: `${SM_NS}frontImageDescription`,
  /** What the back's picture shows, in words: its text alternative for whoever cannot see it. Language-tagged text, one per language. While the back is the question it should not give the answer away. (Added in 1.12, in card format 4 without a version bump: an older reader ignores it.) */
  backImageDescription: `${SM_NS}backImageDescription`,
  /** A short note under the front's text, smaller, shown once the answer is revealed, so it never gives the answer away: what holds of the front ("Out of use"). Language-tagged text in any language, one per language. (Added in 1.8 for card format 3.) */
  frontNote: `${SM_NS}frontNote`,
  /** A short caption above the back's text that says what kind of answer it is ("Out of use · replaced by", "Capital", "Past tense"), shown whenever the back is, smaller than it. The back's text stays the answer itself. Language-tagged text in any language, one per language. (Added in 1.8 for card format 3.) */
  backLabel: `${SM_NS}backLabel`,
  /** A short note under the back's text, smaller, shown once the answer is revealed: when or why something changed, where it comes from. The back's text stays the answer itself. Language-tagged text in any language, one per language. (Added in 1.8 for card format 3.) */
  backNote: `${SM_NS}backNote`,
  /** SM-2 easiness factor, never below 1.3. (Since 1.0.) */
  easeFactor: `${SM_NS}easeFactor`,
  /** Days between the last review and the next due day. (Since 1.0.) */
  intervalDays: `${SM_NS}intervalDays`,
  /** Successful reviews in a row. (Since 1.0.) */
  repetitions: `${SM_NS}repetitions`,
  /** The study day the card becomes due, as a plain "YYYY-MM-DD" string: a study day is a calendar label, not an instant, and an xsd:date would risk timezone shifts. (Since 1.0.) */
  due: `${SM_NS}due`,
  /** When the card was first reviewed in this direction (its introduction). (Since 1.0.) */
  firstReviewedAt: `${SM_NS}firstReviewedAt`,
  /** When the card was most recently reviewed in this direction. (Since 1.0.) */
  lastReviewedAt: `${SM_NS}lastReviewedAt`,
  /** Snapshot: the ease factor before the first review of the study day of lastReviewedAt. The five previous* terms are written all together or not at all; resetting the day restores them. (Added in 1.2 for resetting the study day.) */
  previousEaseFactor: `${SM_NS}previousEaseFactor`,
  /** Snapshot: the interval before the first review of the study day. (Added in 1.2 for resetting the study day.) */
  previousIntervalDays: `${SM_NS}previousIntervalDays`,
  /** Snapshot: the repetition count before the first review of the study day. (Added in 1.2 for resetting the study day.) */
  previousRepetitions: `${SM_NS}previousRepetitions`,
  /** Snapshot: the due day before the first review of the study day. (Added in 1.2 for resetting the study day.) */
  previousDue: `${SM_NS}previousDue`,
  /** Snapshot: lastReviewedAt before the first review of the study day. (Added in 1.2 for resetting the study day.) */
  previousLastReviewedAt: `${SM_NS}previousLastReviewedAt`,
  /** Maximum unseen cards introduced per study day. (Since 1.0.) */
  newCardsPerDay: `${SM_NS}newCardsPerDay`,
  /** Maximum due-card reviews per study day. (Since 1.0.) */
  maxReviewsPerDay: `${SM_NS}maxReviewsPerDay`,
  /** Local hour (0-23) at which the study day rolls over: with 4, reviewing at 03:00 still counts as the previous day. (Since 1.0.) */
  dayBoundaryHour: `${SM_NS}dayBoundaryHour`,
  /** Which grading buttons a study session shows: "sm2" (the six SM-2 grades) or "minimal". (Since 1.0.) */
  answerScale: `${SM_NS}answerScale`,
  /** Whether the instance shows developer tools (the raw WebID document, shape validation). Absent means off. (Added in 1.1.) */
  developerMode: `${SM_NS}developerMode`,
  /** What the app does when data in the instance does not conform to its shapes: a concept of solid-memo:InvalidDataPolicies. (Added in 1.6 for preferences format 3.) */
  invalidDataPolicy: `${SM_NS}invalidDataPolicy`,
  /** Whether the app is shown light, dark, or as the browser prefers: a concept of solid-memo:Themes. (Added in 1.11 for preferences format 4.) */
  theme: `${SM_NS}theme`,
  /** The document a receipt is about. (Added in 1.9.) */
  receiptOf: `${SM_NS}receiptOf`,
  /** The version of the document a receipt is about: its ETag, as the pod gave it. (Added in 1.9.) */
  documentVersion: `${SM_NS}documentVersion`,
  /** At that version the document conformed to Solid Memo's shapes; the value names the rules (a hash of the shapes) it was checked by. (Added in 1.9.) */
  conformedTo: `${SM_NS}conformedTo`,
  /** True when, at that version, nothing in the document was in an older format than the app that wrote the receipt knew. (Added in 1.9.) */
  latestFormat: `${SM_NS}latestFormat`,
  /** The deck a schedule is about. (Added in 1.9.) */
  scheduleOf: `${SM_NS}scheduleOf`,
  /** The version (ETag) of the deck's cards document the schedule was computed from. (Added in 1.9.) */
  cardsVersion: `${SM_NS}cardsVersion`,
  /** The version (ETag) of the deck's reviews document the schedule was computed from; "absent" when there was none. (Added in 1.9.) */
  reviewsVersion: `${SM_NS}reviewsVersion`,
  /** The study direction the schedule was computed for: a concept of solid-memo:StudyDirections. (Added in 1.9.) */
  scheduledDirection: `${SM_NS}scheduledDirection`,
  /** The day boundary hour the schedule's study days were counted with. (Added in 1.9.) */
  scheduledDayBoundaryHour: `${SM_NS}scheduledDayBoundaryHour`,
  /** The study day ("YYYY-MM-DD") the schedule was computed on. (Added in 1.9.) */
  scheduledOn: `${SM_NS}scheduledOn`,
  /** How many reviewed prompts fall due on one study day, as "YYYY-MM-DD count"; one value per day. (Added in 1.9.) */
  dueOnDay: `${SM_NS}dueOnDay`,
  /** How many of the deck's prompts (cards in use, in each direction studied) were never reviewed. (Added in 1.9.) */
  unreviewedCount: `${SM_NS}unreviewedCount`,
  /** How many reviews were made on the study day the schedule was computed on. (Added in 1.9.) */
  reviewedOnDayCount: `${SM_NS}reviewedOnDayCount`,
  /** How many prompts were first reviewed on the study day the schedule was computed on. (Added in 1.9.) */
  introducedOnDayCount: `${SM_NS}introducedOnDayCount`,
  /** The deck the answer was given in: its catalog entry, which may since have been removed. (Added in 1.10.) */
  answeredDeck: `${SM_NS}answeredDeck`,
  /** The card the answer was given to, which may since have been removed. (Added in 1.10.) */
  answeredCard: `${SM_NS}answeredCard`,
  /** The way the card was asked: a concept of solid-memo:StudyDirections. (Added in 1.10.) */
  answeredDirection: `${SM_NS}answeredDirection`,
  /** The SM-2 quality of the answer, 0 to 5, whichever answer scale gave it; below 3 means the card was forgotten. (Added in 1.10.) */
  grade: `${SM_NS}grade`,
  /** When the answer was given. (Added in 1.10.) */
  answeredAt: `${SM_NS}answeredAt`,
  /** The study day the answer counts towards, as a plain "YYYY-MM-DD" string, fixed when it was given, so a later change of the day boundary does not move it. (Added in 1.10.) */
  answeredOn: `${SM_NS}answeredOn`,
  /** The prompt's interval before the answer; absent on a prompt's first answer, which introduced it. (Added in 1.10.) */
  priorIntervalDays: `${SM_NS}priorIntervalDays`,
  /** The prompt's interval after the answer: the days until it is due again. (Added in 1.10.) */
  nextIntervalDays: `${SM_NS}nextIntervalDays`,
  /** The ways a deck can be studied. (Added in 1.6.) */
  StudyDirections: `${SM_NS}StudyDirections`,
  /** Each card is shown by its front and answered with its back. (Added in 1.6.) */
  frontToBack: `${SM_NS}frontToBack`,
  /** Each card is shown by its back and answered with its front. (Added in 1.6.) */
  backToFront: `${SM_NS}backToFront`,
  /** Each card is asked both ways, each way scheduled on its own. (Added in 1.6.) */
  bidirectional: `${SM_NS}bidirectional`,
  /** What the app does when data in an instance does not conform to its shapes. (Added in 1.6.) */
  InvalidDataPolicies: `${SM_NS}InvalidDataPolicies`,
  /** Any invalid data stops the app from using the instance until it is repaired. The default. (Added in 1.6.) */
  blockInstance: `${SM_NS}blockInstance`,
  /** Decks with invalid data are set aside until they are repaired; everything else keeps working. (Added in 1.6.) */
  blockSubject: `${SM_NS}blockSubject`,
  /** Invalid data is reported, and the app keeps working with it. (Added in 1.6.) */
  warnOnly: `${SM_NS}warnOnly`,
  /** How the app is shown: light, dark, or as the browser prefers. (Added in 1.11.) */
  Themes: `${SM_NS}Themes`,
  /** The app is light or dark as the browser or operating system prefers, following it when it changes. The default. (Added in 1.11.) */
  systemTheme: `${SM_NS}systemTheme`,
  /** The app is shown light, whatever the browser prefers. (Added in 1.11.) */
  lightTheme: `${SM_NS}lightTheme`,
  /** The app is shown dark, whatever the browser prefers. (Added in 1.11.) */
  darkTheme: `${SM_NS}darkTheme`,
} as const;
