import { closingConnections } from "./connections.ts";

/**
 * Every request the tests make, to a pod or not, on a connection of its
 * own (connections.ts): before any test file is imported, so also where a
 * module keeps the fetch it was given.
 */
globalThis.fetch = closingConnections(globalThis.fetch);
