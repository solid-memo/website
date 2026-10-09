import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";

/** Site-wide attribution and build version, shown under every screen. */
export function Footer({
  /** Full commit hash of the build; the line is left out when unknown. */
  commitSha,
}: {
  commitSha: string | null;
}) {
  const { tx } = useI18n();
  return (
    <footer class="site-footer">
      <p>
        {tx("footer.createdBy", {
          author: <ExternalLink url="https://github.com/antwika">antwika</ExternalLink>,
        })}
      </p>
      {commitSha !== null && (
        <p>
          {tx("footer.version", {
            version: (
              <ExternalLink url={`https://github.com/antwika/solid-memo/commit/${commitSha}`} title={commitSha}>
                {commitSha.slice(0, 7)}
              </ExternalLink>
            ),
          })}
        </p>
      )}
    </footer>
  );
}
