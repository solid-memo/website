import { useState } from "preact/hooks";
import type { AgentV1 } from "@solid-memo/vocab/types.generated";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { addAuthorChanges, agentIdFor, authorsOf, editAuthorChanges, otherAuthorsOf, removeAuthorChanges } from "@solid-memo/domain/release/releaseMetadata";
import { useI18n } from "@solid-memo/ui/i18n";
import type { DraftEditor } from "./draftEditor";

const MAILTO = "mailto:";

/** An agent as its form holds it: a name, and an email without its `mailto:`. */
function agentOf(name: string, email: string): AgentV1 {
  return { name: name.trim(), ...(email.trim() === "" ? {} : { mbox: `${MAILTO}${email.trim()}` }) };
}

function emailOf(agent: AgentV1): string {
  return agent.mbox?.startsWith(MAILTO) ? agent.mbox.slice(MAILTO.length) : (agent.mbox ?? "");
}

/**
 * The release's authors (docs/studio.md, The release's metadata and
 * provenance): agents kept in the release itself (`#<name>`), each
 * renamed or removed, and a new one added last. A change of them writes
 * the attribution again for the authors it leaves (releaseMetadata.ts).
 * Authors another document describes are named, and kept as they are.
 */
export function ReleaseAuthors({ draft, onEdit }: { draft: ReleaseDraft; onEdit: DraftEditor["edit"] }) {
  const { t } = useI18n();
  const authors = authorsOf(draft);
  const others = otherAuthorsOf(draft);
  return (
    <>
      <p class="hint">{t("studio.release.authorsHint")}</p>
      {authors.length === 0 ? (
        <p>{t("studio.release.noAuthors")}</p>
      ) : (
        <ul class="release-authors">
          {authors.map((node) => (
            <li key={node.id}>
              <AuthorForm
                id={`release-author-${node.id}`}
                agent={node.data}
                onSave={(agent) => onEdit(editAuthorChanges(draft, node.id, agent))}
                onRemove={() => onEdit(removeAuthorChanges(draft, node.id))}
              />
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && <p class="hint">{t("studio.release.otherAuthors", { authors: others.join(", ") })}</p>}
      <NewAuthorForm draft={draft} onEdit={onEdit} />
    </>
  );
}

/** An author's name and email, saved by its button once changed; and its removal. */
function AuthorForm({ id, agent, onSave, onRemove }: { id: string; agent: AgentV1; onSave: (agent: AgentV1) => void; onRemove: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(agent.name);
  const [email, setEmail] = useState(emailOf(agent));
  const changed = name.trim() !== agent.name || email.trim() !== emailOf(agent);
  return (
    <form
      class="card-edit"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(agentOf(name, email));
      }}
    >
      <fieldset>
        <legend>{agent.name}</legend>
        <AgentFields id={id} name={name} email={email} onName={setName} onEmail={setEmail} />
        <button type="submit" disabled={!changed || name.trim() === ""}>
          {t("studio.release.saveAuthor")}
        </button>{" "}
        <button type="button" aria-label={t("studio.release.removeOf", { name: agent.name })} onClick={onRemove}>
          {t("studio.release.remove")}
        </button>
      </fieldset>
    </form>
  );
}

function AgentFields({
  id,
  name,
  email,
  onName,
  onEmail,
}: {
  id: string;
  name: string;
  email: string;
  onName: (name: string) => void;
  onEmail: (email: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <label for={`${id}-name`}>{t("studio.release.authorName")}</label>
      <input id={`${id}-name`} value={name} autocomplete="off" onInput={(event) => onName(event.currentTarget.value)} />
      <label for={`${id}-email`}>{t("studio.release.authorEmail")}</label>
      <input id={`${id}-email`} type="email" value={email} autocomplete="off" onInput={(event) => onEmail(event.currentTarget.value)} />
    </>
  );
}

/** A new author, by name (its id made of it: agentIdFor) and email; the form is empty again once added. */
function NewAuthorForm({ draft, onEdit }: { draft: ReleaseDraft; onEdit: DraftEditor["edit"] }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [empty, setEmpty] = useState(false);
  return (
    <form
      class="card-edit"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() === "") {
          setEmpty(true);
          return;
        }
        if (onEdit(addAuthorChanges(draft, agentIdFor(draft, name), agentOf(name, email))) !== null) return;
        setName("");
        setEmail("");
      }}
    >
      <fieldset>
        <legend>{t("studio.release.newAuthor")}</legend>
        <AgentFields
          id="release-new-author"
          name={name}
          email={email}
          onName={(next) => {
            setEmpty(false);
            setName(next);
          }}
          onEmail={setEmail}
        />
        <p class="error" role="alert">
          {empty && t("studio.release.authorEmpty")}
        </p>
        <button type="submit">{t("studio.release.addAuthor")}</button>
      </fieldset>
    </form>
  );
}
