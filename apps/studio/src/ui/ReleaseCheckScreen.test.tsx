import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { AppError } from "@solid-memo/domain/appError";
import { problem, type ReleaseProblem } from "@solid-memo/domain/release/problems";
import type { CheckPolicy, ProblemTarget } from "@solid-memo/domain/release/releaseCheck";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { courseDraft, DRAFT_URL } from "../test/fixtures";
import { ReleaseCheckScreen, type ShapesState } from "./ReleaseCheckScreen";

const at = (id: string) => `${DRAFT_URL}#${id}`;
const links = {
  policyHref: (policy: CheckPolicy) => `#/check/${policy}`,
  targetHref: (target: ProblemTarget) => `#/${Object.values(target).join("/")}`,
  previewHref: "#/preview",
  trialHref: "#/trial",
};
const notAsked: ShapesState = { asked: false, running: false, stale: false, problems: undefined, error: null };

function renderScreen(
  options: { problems?: ReleaseProblem[] | undefined; error?: unknown; shapes?: ShapesState; policy?: CheckPolicy } = {},
) {
  const { error = null, shapes = notAsked, policy = "pod" } = options;
  // Undefined stated: the draft is being checked.
  const problems = "problems" in options ? options.problems : [];
  const onCheckShapes = vi.fn();
  render(<ReleaseCheckScreen draft={courseDraft()} policy={policy} problems={problems} error={error} shapes={shapes} links={links} onCheckShapes={onCheckShapes} />);
  return onCheckShapes;
}

describe("ReleaseCheckScreen", () => {
  it("checks for a pod or the library, a link each, and says when it finds nothing", () => {
    renderScreen();
    const policies = screen.getByRole("navigation", { name: "Check for" });
    expect(within(policies).getByRole("link", { name: "A release in your pod" })).toHaveAttribute("aria-current", "page");
    expect(within(policies).getByRole("link", { name: "The Solid Memo library" })).toHaveAttribute("href", "#/check/library");
    expect(screen.getByText(/held to the rules of its data/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No problems found.");
    expect(screen.queryByRole("heading", { name: "Errors" })).toBeNull();
    expect(screen.getByRole("link", { name: "Preview the listing" })).toHaveAttribute("href", "#/preview");
  });

  it("lists every problem by severity, then by what it is in, each linking to its place in the editors", () => {
    renderScreen({
      policy: "library",
      problems: [
        problem(at("ch-apps"), { code: "chapterWithoutStep", params: {} }),
        problem(at("q-pods-1a"), { code: "fewDistractors", params: { count: 1, least: 2 } }, { field: SM.distractor }),
        problem(at("ch-apps"), { code: "missingLanguage", params: { language: "en" } }, { field: "http://purl.org/dc/terms/title" }),
        problem(DRAFT_URL, { code: "unshaped", params: {} }, { severity: "warning" }),
      ],
    });
    expect(screen.getByText(/held to its curation too/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("4 problems.");
    const errors = screen.getByRole("region", { name: "Errors" });
    expect(within(errors).getByRole("link", { name: "Apps" })).toHaveAttribute("href", "#/chapter/ch-apps");
    expect(within(errors).getByRole("link", { name: "Has no step in use." })).toHaveAttribute("href", "#/chapter/ch-apps/steps");
    expect(within(errors).getByRole("link", { name: "Title: no text in English." })).toHaveAttribute("href", "#/chapter/ch-apps/title");
    expect(within(errors).getByRole("link", { name: "What holds data?" })).toHaveAttribute("href", "#/question/q-pods-1a");
    expect(within(errors).getByRole("link", { name: /^Has 1 wrong option/ })).toHaveAttribute("href", "#/question/q-pods-1a/distractors");
    const warnings = screen.getByRole("region", { name: "Warnings" });
    expect(within(warnings).getByRole("link", { name: "This release" })).toHaveAttribute("href", "#/draft");
  });

  it("says while it checks, or why it could not", () => {
    renderScreen({ problems: undefined });
    expect(screen.getByText("Checking the draft…")).toBeInTheDocument();
    renderScreen({ problems: undefined, error: new AppError("draftGone") });
    expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("That draft no longer exists."))).toBe(true);
  });

  it("checks against the shapes when asked, says what they found, and offers to check again once the draft changed or they failed", () => {
    const onCheckShapes = renderScreen();
    const shapes = () => screen.getByRole("region", { name: "Shapes" });
    fireEvent.click(within(shapes()).getByRole("button", { name: "Check against the shapes" }));
    expect(onCheckShapes).toHaveBeenCalledTimes(1);
  });

  it("says the shapes are running, what they found, and when it is an older draft's", () => {
    const shapes = () => screen.getAllByRole("region", { name: "Shapes" }).at(-1)!;
    renderScreen({ shapes: { ...notAsked, asked: true, running: true } });
    expect(within(shapes()).getByText("Checking against the shapes…")).toBeInTheDocument();
    renderScreen({ shapes: { ...notAsked, asked: true, problems: [] } });
    expect(within(shapes()).getByText("The shapes find nothing wrong.")).toBeInTheDocument();
    expect(within(shapes()).queryByRole("button")).toBeNull();
    const found = [problem(DRAFT_URL, { code: "unshaped", params: {} })];
    renderScreen({ shapes: { ...notAsked, asked: true, stale: true, problems: found } });
    expect(within(shapes()).getByText(/The shapes find 1 problem, among those above. The draft changed since/)).toBeInTheDocument();
    expect(within(shapes()).getByRole("button", { name: "Check again" })).toBeInTheDocument();
    renderScreen({ shapes: { ...notAsked, asked: true, error: new AppError("draftGone") } });
    expect(within(shapes()).getByRole("alert")).toHaveTextContent("That draft no longer exists.");
    expect(within(shapes()).getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });
});
