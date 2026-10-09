// The components' own test setup (packages/ui): the DOM matchers, and what
// happy-dom lacks. Not for the build tests, which run in node.
if (typeof HTMLElement !== "undefined") await import("@solid-memo/ui/test/setup");

export {};
