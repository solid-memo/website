/**
 * The Docker images the end-to-end tests run, kept in one file between CI
 * jobs (.github/actions/e2e-images, docs/testing.md), so a job pulls
 * nothing from Docker Hub, whose limit on pulls without an account the
 * runners share.
 *
 * `node e2e/pod/images.ts save <file> <compose.yml>...` writes every image the
 * compose files name to the file, each with all its tags (a built image's
 * inputs tag with it, which e2e/pod/servers.ts goes by); `load <file>`
 * brings them back, when the file is there. An image the cache brings that
 * is no longer the one asked for does no harm: a pulled image is named by
 * its digest, and a built one by the hash of what it is built from, so the
 * harness pulls or builds as it would have.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Values for what compose files ask, enough to list their images. */
const PLACEHOLDERS = { E2E_PORT: "1", E2E_SECRET: "placeholder" };

function docker(args: string[]): string {
  const result = spawnSync("docker", args, { env: { ...process.env, ...PLACEHOLDERS }, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`docker ${args.join(" ")} failed (${result.status}):\n${result.stdout}${result.stderr}`);
  return result.stdout;
}

/**
 * Every tag of each image the compose files name. An image pulled by
 * digest may have no tag (compose does not give it the one its reference
 * names), so it is given that one first: saved and loaded by it, the image
 * keeps its digest in the containerd image store, and compose finds it by
 * its reference without pulling.
 */
function tagsOf(composeFiles: string[]): string[] {
  const references = composeFiles.flatMap((file) => docker(["compose", "-f", file, "config", "--images"]).split("\n").filter(Boolean));
  const tags = references.flatMap((reference) => {
    const tagged = /^([^@]+:[^@/]+)@sha256:/.exec(reference)?.[1];
    if (tagged !== undefined) docker(["tag", reference, tagged]);
    return JSON.parse(docker(["image", "inspect", "--format", "{{json .RepoTags}}", reference])) as string[];
  });
  return [...new Set(tags)].sort();
}

/** Runs one command; a cache that cannot be kept or used only costs a pull, so it warns and never fails the job. */
function tolerantly(run: () => void): void {
  try {
    run();
  } catch (error) {
    console.log(`::warning::The end-to-end image cache was not used: ${(error as Error).message}`);
  }
}

const [command, file, ...composeFiles] = process.argv.slice(2);
if (command === "save" && file !== undefined && composeFiles.length > 0) {
  tolerantly(() => {
    const tags = tagsOf(composeFiles);
    if (tags.length === 0) throw new Error(`no image of ${composeFiles.join(", ")} has a tag to save it by.`);
    mkdirSync(dirname(file), { recursive: true });
    docker(["save", "-o", file, ...tags]);
    console.log(`Saved ${tags.join(", ")}.`);
  });
} else if (command === "load" && file !== undefined && composeFiles.length === 0) {
  tolerantly(() => console.log(existsSync(file) ? docker(["load", "-i", file]).trim() : `No ${file}: nothing to load.`));
} else {
  throw new Error("Usage: node e2e/pod/images.ts save <file> <compose.yml>... | load <file>");
}
