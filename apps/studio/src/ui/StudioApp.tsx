import type { UseCases } from "@solid-memo/application/useCases";
import { AppShell, type AppIdentity } from "@solid-memo/ui/App";
import { StudioWorkspace } from "./StudioWorkspace";

/**
 * Solid Memo Studio, as it names itself, with a way back to Solid Memo,
 * a folder up on the same origin (docs/studio.md), before the user is in.
 */
const STUDIO: AppIdentity = {
  name: "studio.name",
  tagline: "studio.tagline",
  headerLink: { href: "../#/", label: "studio.backToApp" },
};

/**
 * Solid Memo Studio: the shell every app on the site shares (the session,
 * its login and the masthead, the language and the theme) around the
 * Studio's own screens. `commitSha` is the build's, shown in the footer.
 */
export function StudioApp({
  useCases,
  commitSha,
}: {
  useCases: UseCases;
  commitSha: string | null;
}) {
  return (
    <AppShell
      useCases={useCases}
      commitSha={commitSha}
      identity={STUDIO}
      workspace={StudioWorkspace}
    />
  );
}
