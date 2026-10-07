import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The journeys' outcome in Markdown, for the CI job's summary page: each
 * journey that failed, the step it failed in (the spec's numbered step,
 * then the page object's intent), the error, what the run was made of
 * (WebID, seed), and how to replay it from the job's artifact.
 */

interface Step {
  title: string;
  error?: unknown;
  steps?: Step[];
}
interface Result {
  status: string;
  duration: number;
  errors?: { message?: string }[];
  steps?: Step[];
}
interface Spec {
  title: string;
  file: string;
  tests: { annotations?: { type: string; description?: string }[]; results: Result[] }[];
}
interface Suite {
  specs?: Spec[];
  suites?: Suite[];
}
export interface Report {
  suites?: Suite[];
  stats?: { expected: number; unexpected: number; flaky: number; skipped: number; duration: number };
}

const ANSI = /\u001b\[[0-9;]*m/g;

/** The path of step titles down to the innermost step that failed. */
export function failingStepPath(steps: Step[] | undefined): string[] {
  for (const step of steps ?? []) {
    if (step.error !== undefined) return [step.title, ...failingStepPath(step.steps)];
  }
  return [];
}

function specsOf(suites: Suite[] | undefined): Spec[] {
  return (suites ?? []).flatMap((suite) => [...(suite.specs ?? []), ...specsOf(suite.suites)]);
}

export function summarize(report: Report, artifact: string): string {
  const failed = specsOf(report.suites).flatMap((spec) =>
    spec.tests.flatMap((test) =>
      test.results.filter((result) => !["passed", "skipped"].includes(result.status)).map((result) => ({ spec, test, result })),
    ),
  );
  const stats = report.stats;
  const lines = ["## User journeys", ""];
  if (stats !== undefined) {
    lines.push(`${stats.expected} passed, ${stats.unexpected} failed, ${stats.flaky} flaky, ${stats.skipped} skipped in ${Math.round(stats.duration / 1000)}s.`, "");
  }
  if (failed.length === 0) return [...lines, "Every journey passed."].join("\n") + "\n";
  for (const { spec, test, result } of failed) {
    const path = failingStepPath(result.steps);
    const message = (result.errors ?? []).map((error) => error.message ?? "").join("\n").replace(ANSI, "").split("\n").slice(0, 12).join("\n");
    lines.push(`### ✗ ${spec.title} (${spec.file})`, "");
    lines.push(`**Failed in:** ${path.length > 0 ? path.join(" › ") : "(outside any step)"}`, "");
    const about = (test.annotations ?? []).filter((note) => note.description !== undefined).map((note) => `${note.type}: \`${note.description}\``);
    if (about.length > 0) lines.push(about.join(" · "), "");
    lines.push("```", message.trim(), "```", "");
  }
  lines.push(
    "### Replaying a failure",
    "",
    `1. Download the **${artifact}** artifact from this run and unzip it.`,
    "2. Open the trace — every step, with the page before and after each action, its network and console: " +
      "`npx playwright show-trace test-results/<journey>/trace.zip`, or drop the zip on https://trace.playwright.dev.",
    "3. Or open the whole report: `npx playwright show-report playwright-report`. Each journey step has a screenshot; " +
      "the failing journey also has its video, diagnostics.json (console, page errors, failed requests), css.log " +
      "(the Solid server's log for the journey) and pod-dump.ttl (what was in the pod).",
    "",
  );
  return lines.join("\n");
}

/** `node harness/summary.ts <artifact name>`: appends the summary to GITHUB_STEP_SUMMARY, or prints it. */
if (import.meta.main) {
  const report = JSON.parse(await readFile(join(import.meta.dirname, "..", "test-results", "results.json"), "utf8").catch(() => "{}")) as Report;
  const markdown = report.suites === undefined ? "## User journeys\n\nNo report: the journeys did not run (see the job's log).\n" : summarize(report, process.argv[2] ?? "the journeys'");
  const target = process.env.GITHUB_STEP_SUMMARY;
  if (target === undefined || target === "") console.log(markdown);
  else await appendFile(target, markdown);
}
