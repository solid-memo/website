import { Fragment, type ComponentChildren } from "preact";
import { liveLink } from "@solid-memo/markdown/links";
import type { MdBlock, MdInline } from "@solid-memo/markdown/parse";
import { breakable } from "./breakable";
import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";

/**
 * Markdown from data, rendered (docs/markdown.md). A plain walker over
 * the folded tree of @solid-memo/markdown: each kind of node makes one
 * fixed element with fixed attributes, and data only ever becomes text
 * children, never markup, a class, a style, an id or a handler. There is
 * no HTML string anywhere, so nothing to sanitise.
 *
 * A code block or a table is a region of its own that scrolls sideways
 * and takes the focus, so it can be scrolled from the keyboard; the keys
 * of the screen around it leave such a region alone (dataRegion).
 */
export function MarkdownBlocks({ blocks, tight = false }: { blocks: readonly MdBlock[]; tight?: boolean }) {
  return (
    <>
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} block={block} tight={tight} />
      ))}
    </>
  );
}

function MarkdownBlock({ block, tight }: { block: MdBlock; tight: boolean }) {
  const { t } = useI18n();
  switch (block.type) {
    case "paragraph":
      // A tight list's items hold their text bare, as HTML renders them.
      return tight ? <MarkdownInlines nodes={block.children} /> : <p><MarkdownInlines nodes={block.children} /></p>;
    case "code":
      return (
        <div class="md-code">
          {block.lang !== undefined && <span class="md-code-lang">{block.lang}</span>}
          <pre class="md-region" tabIndex={0} role="region" aria-label={t("markdown.code")}>
            <code translate={false}>{block.value}</code>
          </pre>
        </div>
      );
    case "list": {
      const items = block.items.map((item, index) => (
        <li key={index}>
          <MarkdownBlocks blocks={item} tight={block.tight} />
        </li>
      ));
      return block.ordered ? <ol start={block.start === 1 ? undefined : block.start}>{items}</ol> : <ul>{items}</ul>;
    }
    case "quote":
      return (
        <blockquote>
          <MarkdownBlocks blocks={block.children} />
        </blockquote>
      );
    case "rule":
      return <hr />;
    case "table": {
      const [header, ...body] = block.rows;
      const cells = (row: MdInline[][], Cell: "th" | "td") =>
        row.map((cell, index) => {
          const align = block.align[index];
          return (
            <Cell key={index} class={align === null ? undefined : `md-align-${align}`}>
              <MarkdownInlines nodes={cell} />
            </Cell>
          );
        });
      return (
        <div class="md-table md-region" tabIndex={0} role="region" aria-label={t("markdown.table")}>
          <table>
            <thead>
              <tr>{cells(header!, "th")}</tr>
            </thead>
            <tbody>
              {body.map((row, index) => (
                <tr key={index}>{cells(row, "td")}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
}

/**
 * Whether a key pressed at `target` belongs to what it was pressed on: a
 * link from data, or a code block or table region being scrolled, whose
 * keys a screen's own (Space to reveal, Enter for Next, a grade's
 * number) must leave alone.
 */
export function inDataRegion(target: Element): boolean {
  return target.closest("a, .md-region") !== null;
}

/**
 * Phrasing content. Text may wrap after a slash, as card text does
 * (breakable); code never. A link is followed only when liveLink says
 * so, in a new tab as every outside link is (ExternalLink); when its text
 * is not its own address, or its host is an international one, the host
 * it leads to follows it, in sight, so the text cannot pass for another
 * place. Both are isolated from the text around them, so no bidi
 * control there can reorder them. Any other link is its text.
 */
export function MarkdownInlines({ nodes }: { nodes: readonly MdInline[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <Fragment key={index}>{inline(node)}</Fragment>
      ))}
    </>
  );
}

function inline(node: MdInline): ComponentChildren {
  switch (node.type) {
    case "text":
      return breakable(node.value);
    case "inlineCode":
      return (
        <code class="md-inline-code" translate={false}>
          {node.value}
        </code>
      );
    case "emphasis":
      return (
        <em>
          <MarkdownInlines nodes={node.children} />
        </em>
      );
    case "strong":
      return (
        <strong>
          <MarkdownInlines nodes={node.children} />
        </strong>
      );
    case "break":
      return <br />;
    case "link":
      return <MarkdownLink url={node.url} nodes={node.children} />;
  }
}

function MarkdownLink({ url, nodes }: { url: string; nodes: readonly MdInline[] }) {
  const { t } = useI18n();
  const link = liveLink(url);
  const text = <MarkdownInlines nodes={nodes} />;
  if (link === null) return text;
  const shown = nodes.map(inlineSource).join("");
  // Text that is the address as written needs no host beside it, unless
  // its host is an international one: the punycode host then shows what
  // look-alike letters hide.
  const ownAddress = shown === link.href || (shown === url && !PUNYCODE.test(link.host));
  // Both isolated (dir), so a bidi override in the text before them cannot
  // reorder the address or the host they show.
  return (
    <>
      <ExternalLink url={link.href} dir="ltr">
        {text}
      </ExternalLink>
      {!ownAddress && (
        <span class="md-link-host" dir="ltr">
          {" "}
          {t("markdown.linkHost", { host: link.host })}
        </span>
      )}
    </>
  );
}

/** A host with an international (punycode) label. */
const PUNYCODE = /(?:^|\.)xn--/i;

/** A link's text as the reader sees it, for comparing with its address. */
function inlineSource(node: MdInline): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
      return node.value;
    case "break":
      return " ";
    default:
      return node.children.map(inlineSource).join("");
  }
}
