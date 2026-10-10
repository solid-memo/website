/* Generated from ns/vocab/v1.ttl, ns/vocab/topics.ttl, ns/vocab/external.ttl by `npm run generate`. Do not edit: change the source and regenerate. */

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
  iri: "https://solid-memo.com/ns/vocab/v1.ttl#StudyDirections",
  title: "Study directions",
  concepts: [
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#frontToBack",
      label: { en: "Front to back" },
      definition: { en: "Each card is shown by its front and answered with its back." },
      notation: "front-to-back",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#backToFront",
      label: { en: "Back to front" },
      definition: { en: "Each card is shown by its back and answered with its front." },
      notation: "back-to-front",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#bidirectional",
      label: { en: "Both ways" },
      definition: { en: "Each card is asked both ways, each way scheduled on its own." },
      notation: "bidirectional",
    },
  ],
} as const satisfies ConceptScheme;

/** What the app does when data in an instance does not conform to its shapes. */
export const INVALID_DATA_POLICIES = {
  iri: "https://solid-memo.com/ns/vocab/v1.ttl#InvalidDataPolicies",
  title: "Invalid data policies",
  concepts: [
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#blockInstance",
      label: { en: "Block the instance" },
      definition: { en: "Any invalid data stops the app from using the instance until it is repaired." },
      notation: "block-instance",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#blockSubject",
      label: { en: "Set invalid data aside" },
      definition: { en: "Decks with invalid data are set aside until they are repaired; everything else keeps working. The default." },
      notation: "block-subject",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#warnOnly",
      label: { en: "Warn only" },
      definition: { en: "Invalid data is reported, and the app keeps working with it." },
      notation: "warn-only",
    },
  ],
} as const satisfies ConceptScheme;

/** How the app is shown: light, dark, or as the browser prefers. */
export const THEMES = {
  iri: "https://solid-memo.com/ns/vocab/v1.ttl#Themes",
  title: "Themes",
  concepts: [
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#systemTheme",
      label: { en: "As the browser prefers" },
      definition: { en: "The app is light or dark as the browser or operating system prefers, following it when it changes. The default." },
      notation: "system",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#lightTheme",
      label: { en: "Light" },
      definition: { en: "The app is shown light, whatever the browser prefers." },
      notation: "light",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#darkTheme",
      label: { en: "Dark" },
      definition: { en: "The app is shown dark, whatever the browser prefers." },
      notation: "dark",
    },
  ],
} as const satisfies ConceptScheme;

/** How a prompt is answered during study. */
export const ANSWER_MODES = {
  iri: "https://solid-memo.com/ns/vocab/v1.ttl#AnswerModes",
  title: "Answer modes",
  concepts: [
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#recall",
      label: { en: "Recall" },
      definition: { en: "The learner recalls the answer, sees it, and grades how well they knew it." },
      notation: "recall",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#multipleChoice",
      label: { en: "Multiple choice" },
      definition: { en: "The learner chooses the answer among the card's back and its distractors; the choice is graded right or wrong." },
      notation: "multiple-choice",
    },
  ],
} as const satisfies ConceptScheme;

/** How the texts of a card, a course step or a course chapter are written. */
export const TEXT_FORMATS = {
  iri: "https://solid-memo.com/ns/vocab/v1.ttl#TextFormats",
  title: "Text formats",
  concepts: [
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#plainText",
      label: { en: "Plain text" },
      definition: { en: "Text shown as written. The same as no text format; stated where a person chose it." },
      notation: "plain",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#markdown",
      label: { en: "Markdown" },
      definition: { en: "CommonMark 0.31.2, with GitHub Flavored Markdown pipe tables as its one extension." },
      notation: "markdown",
    },
  ],
} as const satisfies ConceptScheme;

/** The spaced-repetition algorithms a review state's fields may belong to. */
export const SCHEDULERS = {
  iri: "https://solid-memo.com/ns/vocab/v1.ttl#Schedulers",
  title: "Schedulers",
  concepts: [
    {
      iri: "https://solid-memo.com/ns/vocab/v1.ttl#sm2",
      label: { en: "SM-2" },
      definition: { en: "The SuperMemo 2 algorithm: an ease factor, an interval in days, a count of successful repetitions in a row and a due day. The same as no scheduler." },
      notation: "sm2",
    },
  ],
} as const satisfies ConceptScheme;

/** What a deck of flashcards is about. */
export const TOPICS = {
  iri: "https://solid-memo.com/ns/vocab/topics.ttl",
  title: "Solid Memo topics",
  concepts: [
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
      label: { en: "Languages", de: "Sprachen", es: "Idiomas", fr: "Langues", ko: "언어", sv: "Språk" },
      definition: { en: "Vocabulary and grammar of human languages.", de: "Wortschatz und Grammatik menschlicher Sprachen.", es: "Vocabulario y gramática de los idiomas humanos.", fr: "Vocabulaire et grammaire des langues humaines.", ko: "인간 언어의 어휘와 문법.", sv: "Ordförråd och grammatik i mänskliga språk." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#swedish",
      label: { en: "Swedish", de: "Schwedisch", es: "Sueco", fr: "Suédois", ko: "스웨덴어", sv: "Svenska" },
      definition: { en: "The Swedish language.", de: "Die schwedische Sprache.", es: "El idioma sueco.", fr: "La langue suédoise.", ko: "스웨덴어.", sv: "Det svenska språket." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#geography",
      label: { en: "Geography", de: "Geografie", es: "Geografía", fr: "Géographie", ko: "지리", sv: "Geografi" },
      definition: { en: "Countries, capitals, flags and the places of the world.", de: "Länder, Hauptstädte, Flaggen und die Orte der Welt.", es: "Países, capitales, banderas y los lugares del mundo.", fr: "Pays, capitales, drapeaux et lieux du monde.", ko: "세계의 나라, 수도, 국기와 장소.", sv: "Länder, huvudstäder, flaggor och världens platser." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#computing",
      label: { en: "Computing", de: "Informatik", es: "Informática", fr: "Informatique", ko: "컴퓨팅", sv: "Datorer" },
      definition: { en: "Computers, software and the protocols of the web.", de: "Computer, Software und die Protokolle des Webs.", es: "Ordenadores, software y los protocolos de la web.", fr: "Ordinateurs, logiciels et protocoles du Web.", ko: "컴퓨터, 소프트웨어와 웹의 프로토콜.", sv: "Datorer, mjukvara och webbens protokoll." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#linked-data",
      label: { en: "Linked data", de: "Linked Data", es: "Datos enlazados", fr: "Données liées", ko: "링크드 데이터", sv: "Länkade data" },
      definition: { en: "Data on the web described with RDF and named and linked by IRIs, and the Solid specifications built on it.", de: "Daten im Web, mit RDF beschrieben und durch IRIs benannt und verknüpft, und die Solid-Spezifikationen, die darauf aufbauen.", es: "Datos en la web descritos con RDF, nombrados y enlazados mediante IRI, y las especificaciones de Solid basadas en ellos.", fr: "Données du Web décrites en RDF, nommées et reliées par des IRI, et les spécifications Solid qui reposent sur elles.", ko: "RDF로 기술되고 IRI로 이름 붙여지고 연결되는 웹의 데이터, 그리고 그 위에 세워진 Solid 사양.", sv: "Data på webben som beskrivs med RDF och namnges och länkas med IRI:er, och Solid-specifikationerna som bygger på det." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#computing",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#science",
      label: { en: "Science", de: "Naturwissenschaften", es: "Ciencias", fr: "Sciences", ko: "과학", sv: "Naturvetenskap" },
      definition: { en: "The natural sciences.", de: "Die Naturwissenschaften.", es: "Las ciencias naturales.", fr: "Les sciences de la nature.", ko: "자연과학.", sv: "Naturvetenskaperna." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#chemistry",
      label: { en: "Chemistry", de: "Chemie", es: "Química", fr: "Chimie", ko: "화학", sv: "Kemi" },
      definition: { en: "Elements, compounds and their reactions.", de: "Elemente, Verbindungen und ihre Reaktionen.", es: "Elementos, compuestos y sus reacciones.", fr: "Éléments, composés et leurs réactions.", ko: "원소, 화합물과 그 반응.", sv: "Grundämnen, föreningar och deras reaktioner." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#science",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#art",
      label: { en: "Art", de: "Kunst", es: "Arte", fr: "Art", ko: "미술", sv: "Konst" },
      definition: { en: "Paintings, artists and the history of art.", de: "Gemälde, Künstler und die Geschichte der Kunst.", es: "Pinturas, artistas y la historia del arte.", fr: "Peintures, artistes et histoire de l’art.", ko: "그림, 화가와 미술의 역사.", sv: "Målningar, konstnärer och konstens historia." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#labour-market",
      label: { en: "Labour market", de: "Arbeitsmarkt", es: "Mercado laboral", fr: "Marché du travail", ko: "노동 시장", sv: "Arbetsmarknad" },
      definition: { en: "Occupations, work and the labour market.", de: "Berufe, Arbeit und der Arbeitsmarkt.", es: "Ocupaciones, trabajo y el mercado laboral.", fr: "Métiers, travail et marché du travail.", ko: "직업과 일, 그리고 노동 시장.", sv: "Yrken, arbete och arbetsmarknaden." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#spanish",
      label: { en: "Spanish", de: "Spanisch", es: "Español", fr: "Espagnol", ko: "스페인어", sv: "Spanska" },
      definition: { en: "The Spanish language.", de: "Die spanische Sprache.", es: "El idioma español.", fr: "La langue espagnole.", ko: "스페인어.", sv: "Det spanska språket." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#latin",
      label: { en: "Latin", de: "Latein", es: "Latín", fr: "Latin", ko: "라틴어", sv: "Latin" },
      definition: { en: "The Latin language and its phrases.", de: "Die lateinische Sprache und ihre Redewendungen.", es: "El latín y sus expresiones.", fr: "La langue latine et ses locutions.", ko: "라틴어와 그 표현.", sv: "Det latinska språket och dess uttryck." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#greek",
      label: { en: "Greek", de: "Griechisch", es: "Griego", fr: "Grec", ko: "그리스어", sv: "Grekiska" },
      definition: { en: "The Greek language and its alphabet.", de: "Die griechische Sprache und ihr Alphabet.", es: "El idioma griego y su alfabeto.", fr: "La langue grecque et son alphabet.", ko: "그리스어와 그 알파벳.", sv: "Det grekiska språket och dess alfabet." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#french",
      label: { en: "French", de: "Französisch", es: "Francés", fr: "Français", ko: "프랑스어", sv: "Franska" },
      definition: { en: "The French language.", de: "Die französische Sprache.", es: "El idioma francés.", fr: "La langue française.", ko: "프랑스어.", sv: "Det franska språket." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#german",
      label: { en: "German", de: "Deutsch", es: "Alemán", fr: "Allemand", ko: "독일어", sv: "Tyska" },
      definition: { en: "The German language.", de: "Die deutsche Sprache.", es: "El idioma alemán.", fr: "La langue allemande.", ko: "독일어.", sv: "Det tyska språket." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#italian",
      label: { en: "Italian", de: "Italienisch", es: "Italiano", fr: "Italien", ko: "이탈리아어", sv: "Italienska" },
      definition: { en: "The Italian language.", de: "Die italienische Sprache.", es: "El idioma italiano.", fr: "La langue italienne.", ko: "이탈리아어.", sv: "Det italienska språket." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#finnish",
      label: { en: "Finnish", de: "Finnisch", es: "Finés", fr: "Finnois", ko: "핀란드어", sv: "Finska" },
      definition: { en: "The Finnish language.", de: "Die finnische Sprache.", es: "El idioma finés.", fr: "La langue finnoise.", ko: "핀란드어.", sv: "Det finska språket." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#portuguese",
      label: { en: "Portuguese", de: "Portugiesisch", es: "Portugués", fr: "Portugais", ko: "포르투갈어", sv: "Portugisiska" },
      definition: { en: "The Portuguese language.", de: "Die portugiesische Sprache.", es: "El idioma portugués.", fr: "La langue portugaise.", ko: "포르투갈어.", sv: "Det portugisiska språket." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#korean",
      label: { en: "Korean", de: "Koreanisch", es: "Coreano", fr: "Coréen", ko: "한국어", sv: "Koreanska" },
      definition: { en: "The Korean language.", de: "Die koreanische Sprache.", es: "El idioma coreano.", fr: "La langue coréenne.", ko: "한국어.", sv: "Det koreanska språket." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#japanese",
      label: { en: "Japanese", de: "Japanisch", es: "Japonés", fr: "Japonais", ko: "일본어", sv: "Japanska" },
      definition: { en: "The Japanese language.", de: "Die japanische Sprache.", es: "El idioma japonés.", fr: "La langue japonaise.", ko: "일본어.", sv: "Det japanska språket." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#english",
      label: { en: "English", de: "Englisch", es: "Inglés", fr: "Anglais", ko: "영어", sv: "Engelska" },
      definition: { en: "The English language.", de: "Die englische Sprache.", es: "El idioma inglés.", fr: "La langue anglaise.", ko: "영어.", sv: "Det engelska språket." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#languages",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#physics",
      label: { en: "Physics", de: "Physik", es: "Física", fr: "Physique", ko: "물리학", sv: "Fysik" },
      definition: { en: "Matter, energy, forces and their units.", de: "Materie, Energie, Kräfte und ihre Einheiten.", es: "Materia, energía, fuerzas y sus unidades.", fr: "Matière, énergie, forces et leurs unités.", ko: "물질, 에너지, 힘과 그 단위.", sv: "Materia, energi, krafter och deras enheter." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#science",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#astronomy",
      label: { en: "Astronomy", de: "Astronomie", es: "Astronomía", fr: "Astronomie", ko: "천문학", sv: "Astronomi" },
      definition: { en: "Stars, planets, constellations and the universe.", de: "Sterne, Planeten, Sternbilder und das Universum.", es: "Estrellas, planetas, constelaciones y el universo.", fr: "Étoiles, planètes, constellations et l’Univers.", ko: "별, 행성, 별자리와 우주.", sv: "Stjärnor, planeter, stjärnbilder och universum." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#science",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#biology",
      label: { en: "Biology", de: "Biologie", es: "Biología", fr: "Biologie", ko: "생물학", sv: "Biologi" },
      definition: { en: "Living things: animals, plants and the human body.", de: "Lebewesen: Tiere, Pflanzen und der menschliche Körper.", es: "Los seres vivos: animales, plantas y el cuerpo humano.", fr: "Les êtres vivants : animaux, plantes et corps humain.", ko: "생물: 동물, 식물과 인체.", sv: "Levande varelser: djur, växter och människokroppen." },
      broader: "https://solid-memo.com/ns/vocab/topics.ttl#science",
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#history",
      label: { en: "History", de: "Geschichte", es: "Historia", fr: "Histoire", ko: "역사", sv: "Historia" },
      definition: { en: "Past events, eras and the people who shaped them.", de: "Vergangene Ereignisse, Epochen und die Menschen, die sie geprägt haben.", es: "Acontecimientos pasados, épocas y las personas que las marcaron.", fr: "Événements passés, époques et personnes qui les ont marquées.", ko: "지나간 사건과 시대, 그리고 그것을 만든 사람들.", sv: "Historiska händelser, epoker och människorna som formade dem." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#literature",
      label: { en: "Literature", de: "Literatur", es: "Literatura", fr: "Littérature", ko: "문학", sv: "Litteratur" },
      definition: { en: "Books, authors and literary prizes.", de: "Bücher, Autorinnen und Autoren und Literaturpreise.", es: "Libros, autores y premios literarios.", fr: "Livres, auteurs et prix littéraires.", ko: "책, 작가와 문학상.", sv: "Böcker, författare och litterära priser." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#music",
      label: { en: "Music", de: "Musik", es: "Música", fr: "Musique", ko: "음악", sv: "Musik" },
      definition: { en: "Composers, works and the language of music.", de: "Komponisten, Werke und die Sprache der Musik.", es: "Compositores, obras y el lenguaje de la música.", fr: "Compositeurs, œuvres et langage musical.", ko: "작곡가, 작품과 음악의 언어.", sv: "Tonsättare, verk och musikens språk." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#mythology",
      label: { en: "Mythology", de: "Mythologie", es: "Mitología", fr: "Mythologie", ko: "신화", sv: "Mytologi" },
      definition: { en: "Gods, heroes and the myths of the world.", de: "Götter, Helden und die Mythen der Welt.", es: "Dioses, héroes y los mitos del mundo.", fr: "Dieux, héros et mythes du monde.", ko: "세계의 신, 영웅과 신화.", sv: "Gudar, hjältar och världens myter." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#mathematics",
      label: { en: "Mathematics", de: "Mathematik", es: "Matemáticas", fr: "Mathématiques", ko: "수학", sv: "Matematik" },
      definition: { en: "Numbers, formulas and mathematical notation.", de: "Zahlen, Formeln und mathematische Notation.", es: "Números, fórmulas y notación matemática.", fr: "Nombres, formules et notation mathématique.", ko: "수, 공식과 수학 기호.", sv: "Tal, formler och matematisk notation." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#sports",
      label: { en: "Sports", de: "Sport", es: "Deportes", fr: "Sports", ko: "스포츠", sv: "Sport" },
      definition: { en: "Sports, games and their competitions.", de: "Sportarten, Spiele und ihre Wettbewerbe.", es: "Deportes, juegos y sus competiciones.", fr: "Sports, jeux et compétitions.", ko: "스포츠, 경기와 대회.", sv: "Idrotter, spel och deras tävlingar." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#economics",
      label: { en: "Economics", de: "Wirtschaft", es: "Economía", fr: "Économie", ko: "경제", sv: "Ekonomi" },
      definition: { en: "Money, currencies and the economy.", de: "Geld, Währungen und die Wirtschaft.", es: "Dinero, monedas y la economía.", fr: "Argent, monnaies et économie.", ko: "돈, 통화와 경제.", sv: "Pengar, valutor och ekonomin." },
    },
    {
      iri: "https://solid-memo.com/ns/vocab/topics.ttl#film",
      label: { en: "Film", de: "Film", es: "Cine", fr: "Cinéma", ko: "영화", sv: "Film" },
      definition: { en: "Films, film-makers and film awards.", de: "Filme, Filmschaffende und Filmpreise.", es: "Películas, cineastas y premios de cine.", fr: "Films, cinéastes et prix du cinéma.", ko: "영화, 영화 제작자와 영화상.", sv: "Filmer, filmskapare och filmpriser." },
    },
  ],
} as const satisfies ConceptScheme;

/** An entry of an EU authority table Solid Memo data may point at (ns/vocab/external.ttl): its IRI, its code and its English label. */
export interface ReferenceConcept {
  readonly iri: string;
  readonly code: string;
  readonly label: string;
}

/** The EU's languages (its authority table) a release may state it is in (dcterms:language): those the reference data describes, so a release's profile check finds them. */
export const EU_LANGUAGES: readonly ReferenceConcept[] = [
  { iri: "http://publications.europa.eu/resource/authority/language/ENG", code: "ENG", label: "English" },
  { iri: "http://publications.europa.eu/resource/authority/language/SWE", code: "SWE", label: "Swedish" },
  { iri: "http://publications.europa.eu/resource/authority/language/SPA", code: "SPA", label: "Spanish" },
  { iri: "http://publications.europa.eu/resource/authority/language/LAT", code: "LAT", label: "Latin" },
  { iri: "http://publications.europa.eu/resource/authority/language/ITA", code: "ITA", label: "Italian" },
  { iri: "http://publications.europa.eu/resource/authority/language/ELL", code: "ELL", label: "Modern Greek" },
  { iri: "http://publications.europa.eu/resource/authority/language/FRA", code: "FRA", label: "French" },
  { iri: "http://publications.europa.eu/resource/authority/language/DEU", code: "DEU", label: "German" },
  { iri: "http://publications.europa.eu/resource/authority/language/FIN", code: "FIN", label: "Finnish" },
  { iri: "http://publications.europa.eu/resource/authority/language/POR", code: "POR", label: "Portuguese" },
  { iri: "http://publications.europa.eu/resource/authority/language/JPN", code: "JPN", label: "Japanese" },
  { iri: "http://publications.europa.eu/resource/authority/language/KOR", code: "KOR", label: "Korean" },
];
