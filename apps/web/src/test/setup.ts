import "@testing-library/jest-dom/vitest";

// happy-dom has no HTMLElement.translate. Browsers reflect it as the
// translate="yes"/"no" attribute, which Preact sets as a property
// (`translate={false}` on code from data), so the tests see the same.
// (A test of the build itself runs in node, with no DOM.)
if (typeof HTMLElement !== "undefined") {
  Object.defineProperty(HTMLElement.prototype, "translate", {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute("translate") !== "no";
    },
    set(this: HTMLElement, value: boolean) {
      this.setAttribute("translate", value ? "yes" : "no");
    },
  });
}
