/**
 * Where Solid Memo's vocabulary and shapes are published, each on a pod
 * of its own (docs/vocab.md): the vocabulary's documents at
 * `<VOCAB_POD>v1`, `topics` and `external`, its terms fragments of them
 * (`<VOCAB_POD>v1#Card`); each shape at `<SHAPES_POD><class>/v<N>`
 * (`…/card/v1#shape`). Every IRI of either is its document's address,
 * and the pods are the only copy: this repository keeps none.
 */
export const VOCAB_POD = "https://pod.solid-memo.com/vocab/";
export const SHAPES_POD = "https://pod.solid-memo.com/shapes/";
