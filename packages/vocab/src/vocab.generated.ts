/* Generated from ns/vocab/v1.ttl by `npm run generate`. Do not edit: change the source and regenerate. */

/** Solid Memo's own vocabulary, version 1.16 (see docs/vocab.md). */
export const SM_NS = "https://solid-memo.com/ns/vocab/v1.ttl#";

export const SM = {
  /** One Solid Memo data location: a container in a pod holding decks, cards, review state and preferences. Described by the container's meta document. (Since 1.0.) */
  Instance: `${SM_NS}Instance`,
  /** A named set of cards studied together. In a pod, a subject of the instance's catalog document; in the deck library, the document itself. (Since 1.0.) */
  Deck: `${SM_NS}Deck`,
  /** A flashcard: a front and a back, each text, a picture, or both. (Since 1.0.) */
  Card: `${SM_NS}Card`,
  /** SM-2 scheduling state of one card in one study direction. It names its card with reviewOf and the direction with reviewDirection (since 1.16); without them, its subject is named after the card: #<cardId> for front-to-back, #<cardId>@back-to-front for the other way. (Since 1.0.) */
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
  /** A chapter of a course: a library deck that is also a schema:Course. A subject of the deck's release beside its cards, part of the course (schema:isPartOf) at its place (schema:position), made of steps that each teach a piece of theory and check it with questions, and ending with a review of all its questions. Never copied into a pod: a copy reads it from the release it came from. (Added in 1.14.) */
  Chapter: `${SM_NS}Chapter`,
  /** One step of a course chapter: a short piece of theory, then the multiple-choice questions (cards) that check it. A subject of the deck's release, part of its chapter (schema:isPartOf) at its place (schema:position). (Added in 1.14.) */
  Step: `${SM_NS}Step`,
  /** A wrong option of a card asked as a multiple-choice question, the card's back being the right one. A subject of the document that holds its card, which names it with solid-memo:distractor; copied with the card. (Added in 1.14.) */
  Distractor: `${SM_NS}Distractor`,
  /** Which version of its class's shape the subject conforms to. Absent means 1, the format that predates the field. Every subject Solid Memo writes carries it. (Since 1.0.) */
  formatVersion: `${SM_NS}formatVersion`,
  /** Where a deck or deck group stands among the members of the one catalogue or group it is in, 0 first; the decks and groups of one parent share one sequence. Absent means after every member that has one. (Added in 1.13. On a deck it is outside the deck format, without a version bump: an older reader ignores it and an older writer keeps it.) */
  position: `${SM_NS}position`,
  /** How a subject's texts are written: a concept of solid-memo:TextFormats. On a card (solid-memo:Card) it covers exactly solid-memo:front, back, frontNote, backNote and backLabel, and the distractorText and distractorNote of the card's distractors, which carry no text format of their own; on a course step (solid-memo:Step), its solid-memo:theory; on a course chapter (solid-memo:Chapter), its dcterms:description, never its title. These lists are fixed for 1.x: a new text predicate needs its own decision. A picture's description and every other text are always plain. Absent means plain text, shown as written. Each language's value is its own document, and its language tag still says what language the prose is in. A concept this reader does not know is read as plain text. (Added in 1.15. On a card, step or chapter it is outside the format's version: an older reader ignores it and shows the text as written; an older writer keeps it through an edit, but drops it when it copies a card from the library, which the library upgrade repairs.) */
  textFormat: `${SM_NS}textFormat`,
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
  /** A wrong option to show next to the card's back when the card is asked as a multiple-choice question; a subject of the same document. A card with distractors has text on its back, the right option. (Added in 1.14. Outside the card format's version: an older reader ignores it and studies the card front to back.) */
  distractor: `${SM_NS}distractor`,
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
  /** The card the review state is of, a subject of its deck's cards document. Where it is absent, the card is named by the state's subject: #<cardId> or #<cardId>@back-to-front. (Added in 1.16, in review-state format 2 without a version bump: an older reader names the card by the subject, as before.) */
  reviewOf: `${SM_NS}reviewOf`,
  /** The way the card is asked in the review state: solid-memo:frontToBack or solid-memo:backToFront, a concept of solid-memo:StudyDirections (never solid-memo:bidirectional: each way has its own state). Where it is absent, the direction is named by the state's subject: back to front when it ends in @back-to-front, else front to back. (Added in 1.16, in review-state format 2 without a version bump: an older reader names the direction by the subject, as before.) */
  reviewDirection: `${SM_NS}reviewDirection`,
  /** The scheduling algorithm the review state's fields belong to: a concept of solid-memo:Schedulers. Absent means solid-memo:sm2, as every state was before 1.16. (Added in 1.16, in review-state format 2 without a version bump: an older reader takes every state for SM-2, as before.) */
  scheduler: `${SM_NS}scheduler`,
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
  /** The short piece of theory a course step teaches, read before its questions: language-tagged text, one per language. (Added in 1.14.) */
  theory: `${SM_NS}theory`,
  /** A card of the same release, asked as a multiple-choice question right after the step's theory; answering it puts it among the cards the learner studies. A card is checked by one step at most. (Added in 1.14.) */
  checkedBy: `${SM_NS}checkedBy`,
  /** A card of the same release asked only in the chapter's final review, next to every card its steps check. (Added in 1.14.) */
  reviewQuestion: `${SM_NS}reviewQuestion`,
  /** The text of a wrong option: untagged, its language unknown, or language-tagged, one per language, as the back of its card is. (Added in 1.14.) */
  distractorText: `${SM_NS}distractorText`,
  /** Why the option is wrong, shown to a learner who chose it: language-tagged text, one per language. (Added in 1.14.) */
  distractorNote: `${SM_NS}distractorNote`,
  /** A chapter of the course the deck was copied from (its prov:wasDerivedFrom release) whose final review the learner has passed. (Added in 1.14. On a deck it is outside the deck format, without a version bump: an older reader ignores it and an older writer keeps it.) */
  completedChapter: `${SM_NS}completedChapter`,
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
  /** How the prompt was answered: a concept of solid-memo:AnswerModes. Absent means recalled, as every answer was before 1.14. (Added in 1.14. Outside the answer format's version: an older reader ignores it.) */
  answerMode: `${SM_NS}answerMode`,
  /** The wrong option chosen, when a multiple-choice answer was wrong. Absent when the right option was chosen. (Added in 1.14. Outside the answer format's version: an older reader ignores it.) */
  chosenDistractor: `${SM_NS}chosenDistractor`,
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
  /** Any invalid data stops the app from using the instance until it is repaired. (Added in 1.6.) */
  blockInstance: `${SM_NS}blockInstance`,
  /** Decks with invalid data are set aside until they are repaired; everything else keeps working. The default. (Added in 1.6.) */
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
  /** How a prompt is answered during study. (Added in 1.14.) */
  AnswerModes: `${SM_NS}AnswerModes`,
  /** The learner recalls the answer, sees it, and grades how well they knew it. (Added in 1.14.) */
  recall: `${SM_NS}recall`,
  /** The learner chooses the answer among the card's back and its distractors; the choice is graded right or wrong. (Added in 1.14.) */
  multipleChoice: `${SM_NS}multipleChoice`,
  /** How the texts of a card, a course step or a course chapter are written. (Added in 1.15.) */
  TextFormats: `${SM_NS}TextFormats`,
  /** Text shown as written. The same as no text format; stated where a person chose it. (Added in 1.15.) */
  plainText: `${SM_NS}plainText`,
  /** CommonMark 0.31.2, with GitHub Flavored Markdown pipe tables as its one extension. (Added in 1.15.) */
  markdown: `${SM_NS}markdown`,
  /** The spaced-repetition algorithms a review state's fields may belong to. (Added in 1.16.) */
  Schedulers: `${SM_NS}Schedulers`,
  /** The SuperMemo 2 algorithm: an ease factor, an interval in days, a count of successful repetitions in a row and a due day. The same as no scheduler. (Added in 1.16.) */
  sm2: `${SM_NS}sm2`,
} as const;
