import type { ComponentChildren, ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { UseCases } from "@solid-memo/application/useCases";
import { AppShell, SOLID_MEMO, STUDIO, type WorkspaceProps } from "@solid-memo/ui/App";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { Loading } from "@solid-memo/ui/Loading";
import { isStudioHash } from "@solid-memo/ui/router";
import { MAIN_ID } from "@solid-memo/ui/SkipLink";
import { Workspace } from "@solid-memo/ui/Workspace";

/** The Studio's code, as its entry point (`@solid-memo/studio`) exports it. */
export interface StudioModule {
  StudioWorkspace: ComponentType<WorkspaceProps>;
}

/**
 * The site's one page: Solid Memo, and Solid Memo Studio at the hashes
 * under `#/studio` (docs/studio.md). Both live in one shell, so the
 * session, its login, the language and the theme carry from one to the
 * other. The Studio's code is fetched (`loadStudio`, from src/main.tsx)
 * only once a Studio route is opened, so a learner never downloads it.
 * `commitSha` is the build's, shown in the footer.
 */
export function App({
  useCases,
  commitSha,
  loadStudio,
}: {
  useCases: UseCases;
  commitSha: string | null;
  loadStudio: () => Promise<StudioModule>;
}) {
  const [inStudio, setInStudio] = useState(() => isStudioHash(window.location.hash));
  // A link from one app to the other is a hash link within the page.
  useEffect(() => {
    const follow = () => setInStudio(isStudioHash(window.location.hash));
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);

  // The Studio's workspace once its code is here, or one that says it could not be fetched.
  const [studio, setStudio] = useState<ComponentType<WorkspaceProps> | null>(null);
  useEffect(() => {
    if (!inStudio || studio !== null) return;
    loadStudio().then(
      (module) => setStudio(() => module.StudioWorkspace),
      () => setStudio(() => StudioUnavailable),
    );
  }, [inStudio]);

  return (
    <AppShell
      useCases={useCases}
      commitSha={commitSha}
      identity={inStudio ? STUDIO : SOLID_MEMO}
      workspace={inStudio ? (studio ?? StudioLoading) : Workspace}
    />
  );
}

/** The Studio while its code is on its way. */
function StudioLoading(props: WorkspaceProps) {
  const { t } = useI18n();
  return <StudioPlaceholder {...props} status={<Loading label={t("studio.loading")} />} />;
}

/** The Studio when its code could not be fetched (offline, or the site was deployed anew meanwhile). */
function StudioUnavailable(props: WorkspaceProps) {
  const { t } = useI18n();
  return <StudioPlaceholder {...props} status={<ErrorMessage error={t("studio.loadFailed")} />} />;
}

/** The site header, then the main content: what the shell puts first, then the Studio's `status`. */
function StudioPlaceholder({ banner, children, status }: WorkspaceProps & { status: ComponentChildren }) {
  return (
    <>
      <header class="site-header">{banner}</header>
      <main id={MAIN_ID} tabIndex={-1} class="workspace">
        {children}
        {status}
      </main>
    </>
  );
}
