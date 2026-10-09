import type { FileExchange } from "@solid-memo/application/ports";

/** How long a saved file's text is kept for the browser to read, as FileSaver.js keeps it. */
const RELEASE_AFTER_MS = 40_000;

/**
 * The FileExchange of the browser. Saving hands a Blob to a link with
 * `download` and clicks it; the browser then saves it as it saves any
 * download. Opening clicks a hidden file input and reads the file the
 * user picks as text; closing the picker picks none (its `cancel` event).
 * Opening must follow the user's click closely: browsers show a file
 * picker only then.
 */
export function createBrowserFileExchange(document: Document = globalThis.document): FileExchange {
  return {
    save(name, mediaType, text) {
      const url = URL.createObjectURL(new Blob([text], { type: mediaType }));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      // Let go of the text once the download has surely read it: some browsers read it after the click returns.
      setTimeout(() => URL.revokeObjectURL(url), RELEASE_AFTER_MS);
    },

    open(accept) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = accept;
      input.hidden = true;
      document.body.append(input);
      return new Promise<{ name: string; text: string } | null>((resolve, reject) => {
        input.addEventListener("cancel", () => resolve(null));
        input.addEventListener("change", () => {
          const file = input.files?.[0];
          if (file === undefined) resolve(null);
          else file.text().then((text) => resolve({ name: file.name, text }), reject);
        });
        input.click();
      }).finally(() => input.remove());
    },
  };
}
