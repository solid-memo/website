import type { DeckGroupV1 } from "@solid-memo/vocab/types.generated";
import { defaultDeckGroupDescription, isDefaultDeckGroupDescription } from "./dcat";
import type { StoredGroup } from "./deckTree";

/**
 * A deck group between its shape record and the model (domain/deckTree.ts).
 * The record states what the model leaves to the pod: the group's
 * description, which DCAT-AP asks for and the app writes for the user,
 * and its publisher, the catalogue's. A negative position, which the
 * shape does not allow and the tree reads as none, is left out, so that
 * the group is not written back with it.
 */
export function deckGroupFromRecord(url: string, data: DeckGroupV1): StoredGroup {
  return {
    group: { url, title: data.title },
    decks: [...data.dataset],
    groups: [...data.catalog],
    ...(data.position === undefined || data.position < 0 ? {} : { position: data.position }),
  };
}

/**
 * The group as its latest record. Its description is the one it has
 * (`previous`, the record as stored) unless that is the default for its
 * old name, or it has none yet: then the default for its name.
 */
export function deckGroupToRecord(stored: StoredGroup, publisher: string, previous?: DeckGroupV1): DeckGroupV1 {
  const kept = previous !== undefined && !isDefaultDeckGroupDescription(previous.description, previous.title);
  return {
    title: stored.group.title,
    description: kept ? previous.description : defaultDeckGroupDescription(stored.group.title),
    publisher,
    dataset: [...stored.decks],
    catalog: [...stored.groups],
    ...(stored.position === undefined ? {} : { position: stored.position }),
  };
}
