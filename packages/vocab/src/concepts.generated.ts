/* Generated from https://pod.solid-memo.com/vocab/v1, https://pod.solid-memo.com/vocab/topics by `npm run generate`. Do not edit: change the source and regenerate. */

/** Text by language tag (lower case), one of them English. */
export type ConceptText = Readonly<Record<string, string>>;

/** A concept of one of Solid Memo's SKOS concept schemes (see docs/vocab.md). */
export interface Concept {
  readonly iri: string;
  /** skos:prefLabel, in every language of the scheme. */
  readonly label: ConceptText;
  /** skos:definition, in every language of the scheme. */
  readonly definition: ConceptText;
  /** skos:notation: the concept's code, where the scheme gives one. */
  readonly notation?: string;
  /** skos:broader: the concept above this one, for a concept below the top. */
  readonly broader?: string;
}

export interface ConceptScheme {
  readonly iri: string;
  readonly title: string;
  readonly concepts: readonly Concept[];
}

/** The ways a deck can be studied. */
export const STUDY_DIRECTIONS = {
  iri: "https://pod.solid-memo.com/vocab/v1#StudyDirections",
  title: "Study directions",
  concepts: [
    {
      iri: "https://pod.solid-memo.com/vocab/v1#frontToBack",
      label: { en: "Front to back" },
      definition: { en: "Each card is shown by its front and answered with its back." },
      notation: "front-to-back",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/v1#backToFront",
      label: { en: "Back to front" },
      definition: { en: "Each card is shown by its back and answered with its front." },
      notation: "back-to-front",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/v1#bidirectional",
      label: { en: "Both ways" },
      definition: { en: "Each card is asked both ways, each way scheduled on its own." },
      notation: "bidirectional",
    },
  ],
} as const satisfies ConceptScheme;

/** What the app does when data in an instance does not conform to its shapes. */
export const INVALID_DATA_POLICIES = {
  iri: "https://pod.solid-memo.com/vocab/v1#InvalidDataPolicies",
  title: "Invalid data policies",
  concepts: [
    {
      iri: "https://pod.solid-memo.com/vocab/v1#blockInstance",
      label: { en: "Block the instance" },
      definition: { en: "Any invalid data stops the app from using the instance until it is repaired. The default." },
      notation: "block-instance",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/v1#blockSubject",
      label: { en: "Set invalid data aside" },
      definition: { en: "Decks with invalid data are set aside until they are repaired; everything else keeps working." },
      notation: "block-subject",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/v1#warnOnly",
      label: { en: "Warn only" },
      definition: { en: "Invalid data is reported, and the app keeps working with it." },
      notation: "warn-only",
    },
  ],
} as const satisfies ConceptScheme;

/** How the app is shown: light, dark, or as the browser prefers. */
export const THEMES = {
  iri: "https://pod.solid-memo.com/vocab/v1#Themes",
  title: "Themes",
  concepts: [
    {
      iri: "https://pod.solid-memo.com/vocab/v1#systemTheme",
      label: { en: "As the browser prefers" },
      definition: { en: "The app is light or dark as the browser or operating system prefers, following it when it changes. The default." },
      notation: "system",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/v1#lightTheme",
      label: { en: "Light" },
      definition: { en: "The app is shown light, whatever the browser prefers." },
      notation: "light",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/v1#darkTheme",
      label: { en: "Dark" },
      definition: { en: "The app is shown dark, whatever the browser prefers." },
      notation: "dark",
    },
  ],
} as const satisfies ConceptScheme;

/** What a deck of flashcards is about. */
export const TOPICS = {
  iri: "https://pod.solid-memo.com/vocab/topics",
  title: "Solid Memo topics",
  concepts: [
    {
      iri: "https://pod.solid-memo.com/vocab/topics#languages",
      label: { en: "Languages", sv: "Språk" },
      definition: { en: "Vocabulary and grammar of human languages.", sv: "Ordförråd och grammatik i mänskliga språk." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#swedish",
      label: { en: "Swedish", sv: "Svenska" },
      definition: { en: "The Swedish language.", sv: "Det svenska språket." },
      broader: "https://pod.solid-memo.com/vocab/topics#languages",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#geography",
      label: { en: "Geography", sv: "Geografi" },
      definition: { en: "Countries, capitals, flags and the places of the world.", sv: "Länder, huvudstäder, flaggor och världens platser." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#computing",
      label: { en: "Computing", sv: "Datorer" },
      definition: { en: "Computers, software and the protocols of the web.", sv: "Datorer, mjukvara och webbens protokoll." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#science",
      label: { en: "Science", sv: "Naturvetenskap" },
      definition: { en: "The natural sciences.", sv: "Naturvetenskaperna." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#chemistry",
      label: { en: "Chemistry", sv: "Kemi" },
      definition: { en: "Elements, compounds and their reactions.", sv: "Grundämnen, föreningar och deras reaktioner." },
      broader: "https://pod.solid-memo.com/vocab/topics#science",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#art",
      label: { en: "Art", sv: "Konst" },
      definition: { en: "Paintings, artists and the history of art.", sv: "Målningar, konstnärer och konstens historia." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#labour-market",
      label: { en: "Labour market", sv: "Arbetsmarknad" },
      definition: { en: "Occupations, work and the labour market.", sv: "Yrken, arbete och arbetsmarknaden." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#spanish",
      label: { en: "Spanish", sv: "Spanska" },
      definition: { en: "The Spanish language.", sv: "Det spanska språket." },
      broader: "https://pod.solid-memo.com/vocab/topics#languages",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#latin",
      label: { en: "Latin", sv: "Latin" },
      definition: { en: "The Latin language and its phrases.", sv: "Det latinska språket och dess uttryck." },
      broader: "https://pod.solid-memo.com/vocab/topics#languages",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#greek",
      label: { en: "Greek", sv: "Grekiska" },
      definition: { en: "The Greek language and its alphabet.", sv: "Det grekiska språket och dess alfabet." },
      broader: "https://pod.solid-memo.com/vocab/topics#languages",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#french",
      label: { en: "French", sv: "Franska" },
      definition: { en: "The French language.", sv: "Det franska språket." },
      broader: "https://pod.solid-memo.com/vocab/topics#languages",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#german",
      label: { en: "German", sv: "Tyska" },
      definition: { en: "The German language.", sv: "Det tyska språket." },
      broader: "https://pod.solid-memo.com/vocab/topics#languages",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#italian",
      label: { en: "Italian", sv: "Italienska" },
      definition: { en: "The Italian language.", sv: "Det italienska språket." },
      broader: "https://pod.solid-memo.com/vocab/topics#languages",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#finnish",
      label: { en: "Finnish", sv: "Finska" },
      definition: { en: "The Finnish language.", sv: "Det finska språket." },
      broader: "https://pod.solid-memo.com/vocab/topics#languages",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#portuguese",
      label: { en: "Portuguese", sv: "Portugisiska" },
      definition: { en: "The Portuguese language.", sv: "Det portugisiska språket." },
      broader: "https://pod.solid-memo.com/vocab/topics#languages",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#physics",
      label: { en: "Physics", sv: "Fysik" },
      definition: { en: "Matter, energy, forces and their units.", sv: "Materia, energi, krafter och deras enheter." },
      broader: "https://pod.solid-memo.com/vocab/topics#science",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#astronomy",
      label: { en: "Astronomy", sv: "Astronomi" },
      definition: { en: "Stars, planets, constellations and the universe.", sv: "Stjärnor, planeter, stjärnbilder och universum." },
      broader: "https://pod.solid-memo.com/vocab/topics#science",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#biology",
      label: { en: "Biology", sv: "Biologi" },
      definition: { en: "Living things: animals, plants and the human body.", sv: "Levande varelser: djur, växter och människokroppen." },
      broader: "https://pod.solid-memo.com/vocab/topics#science",
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#history",
      label: { en: "History", sv: "Historia" },
      definition: { en: "Past events, eras and the people who shaped them.", sv: "Historiska händelser, epoker och människorna som formade dem." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#literature",
      label: { en: "Literature", sv: "Litteratur" },
      definition: { en: "Books, authors and literary prizes.", sv: "Böcker, författare och litterära priser." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#music",
      label: { en: "Music", sv: "Musik" },
      definition: { en: "Composers, works and the language of music.", sv: "Tonsättare, verk och musikens språk." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#mythology",
      label: { en: "Mythology", sv: "Mytologi" },
      definition: { en: "Gods, heroes and the myths of the world.", sv: "Gudar, hjältar och världens myter." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#mathematics",
      label: { en: "Mathematics", sv: "Matematik" },
      definition: { en: "Numbers, formulas and mathematical notation.", sv: "Tal, formler och matematisk notation." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#sports",
      label: { en: "Sports", sv: "Sport" },
      definition: { en: "Sports, games and their competitions.", sv: "Idrotter, spel och deras tävlingar." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#economics",
      label: { en: "Economics", sv: "Ekonomi" },
      definition: { en: "Money, currencies and the economy.", sv: "Pengar, valutor och ekonomin." },
    },
    {
      iri: "https://pod.solid-memo.com/vocab/topics#film",
      label: { en: "Film", sv: "Film" },
      definition: { en: "Films, film-makers and film awards.", sv: "Filmer, filmskapare och filmpriser." },
    },
  ],
} as const satisfies ConceptScheme;
