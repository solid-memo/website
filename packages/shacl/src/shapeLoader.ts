import { getSolidDataset, toRdfJsDataset } from "@inrupt/solid-client";
import type { DatasetCore } from "@rdfjs/types";
import { PROFILES, REFERENCE_DATA, type ProfileName } from "./profiles";
import type { ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";

/**
 * The shape documents, fetched once each and parsed the way pod
 * documents are: Solid Memo's shapes and the reference data from the
 * shapes' and the vocabulary's pods (@solid-memo/vocab/pods), where they
 * are published and nowhere else, and the vendored profiles as the site
 * publishes them (vendor/…).
 */
export interface ShapeLoader {
  load(descriptor: ShapeDescriptor): Promise<DatasetCore>;
  /** A profile's shape files, each as the site publishes it. */
  loadProfile(profile: ProfileName): Promise<DatasetCore[]>;
  /** The reference data profile checks load beside a document, from the vocabulary's pod. */
  loadReferenceData(): Promise<DatasetCore[]>;
}

export function createShapeLoader({
  fetch,
  shapesBaseUrl,
  vocabBaseUrl,
  vendorBaseUrl,
}: {
  fetch: typeof globalThis.fetch;
  /** The shapes' pod, SHAPES_POD. */
  shapesBaseUrl: string;
  /** The vocabulary's pod, VOCAB_POD. */
  vocabBaseUrl: string;
  /** Where the site publishes the vendored profiles, e.g. `new URL("vendor/", document.baseURI).href`. */
  vendorBaseUrl: string;
}): ShapeLoader {
  const loaded = new Map<string, Promise<DatasetCore>>();
  function fetchOnce(url: string): Promise<DatasetCore> {
    let dataset = loaded.get(url);
    if (dataset === undefined) {
      dataset = getSolidDataset(url, { fetch }).then(toRdfJsDataset);
      loaded.set(url, dataset);
    }
    return dataset;
  }
  return {
    load(descriptor) {
      return fetchOnce(new URL(descriptor.shapeDocument, shapesBaseUrl).href);
    },
    loadProfile(profile) {
      return Promise.all(PROFILES[profile].map((path) => fetchOnce(new URL(path, vendorBaseUrl).href)));
    },
    loadReferenceData() {
      return Promise.all(REFERENCE_DATA.map((path) => fetchOnce(new URL(path, vocabBaseUrl).href)));
    },
  };
}
