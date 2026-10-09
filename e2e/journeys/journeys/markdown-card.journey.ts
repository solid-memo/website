import { test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";

/**
 * A card written in Markdown keeps its line breaks through the pod: added
 * with "Format with Markdown" ticked and an indented code block on its
 * front, opened again with the box ticked and the front as typed, edited
 * to a fenced block of two lines, saved, and read back from the pod on a
 * reload of the app, the preview showing the code each time
 * (docs/markdown.md#writing-markdown-in-the-app).
 */
test("edit a card in Markdown and keep its line breaks @markdown", async ({ app, runId, account }) => {
  const deck = `Markdown ${runId}`;
  const title = `Clone ${runId}`;
  const added = `${title} with:\n\n    git clone https://example.org/repo.git`;
  const edited = `${title} and enter it:\n\n\`\`\`sh\ngit clone https://example.org/repo.git\ncd repo\n\`\`\``;

  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in with a WebID", () => logInAndCreateInstance(app, account, `Markdown ${runId}`));

  await app.step("03 · Create a deck", async () => {
    await app.decks.openDeckCreator();
    await app.deckCreator.create(deck);
  });

  await app.step("04 · Add a card in Markdown with a code block", async () => {
    await app.deckBrowser.openFor(deck);
    await app.deckBrowser.openCardCreator();
    await app.cardCreator.addMarkdownCard(added, "`git clone`", "git clone https://example.org/repo.git");
    await app.cardCreator.back();
  });

  await app.step("05 · Open the card: in Markdown, its lines as typed", async () => {
    await app.cardEditor.open(title);
    await app.cardEditor.expectMarkdown(added, "git clone https://example.org/repo.git");
  });

  await app.step("06 · Edit the front to a block of two lines and save", async () => {
    await app.cardEditor.saveFront(edited);
    await app.cardEditor.expectMarkdown(edited, "git clone https://example.org/repo.git\ncd repo");
  });

  await app.step("07 · Reload: the pod keeps the lines and the format", async () => {
    await app.chrome.reload();
    await app.cardEditor.expectMarkdown(edited, "git clone https://example.org/repo.git\ncd repo");
  });
});
