import { describe, expect, it, vi } from "vitest";
import { routedFetch } from "./routedFetch";

describe("routedFetch", () => {
  it("sends requests below the origin to the local pod, every other one to the remote", async () => {
    const local = vi.fn(async () => new Response("local"));
    const remote = vi.fn(async () => new Response("remote"));
    const fetch = routedFetch({ origin: "https://guest.example/", local, remote });
    expect(await (await fetch("https://guest.example/a")).text()).toBe("local");
    expect(
      await (await fetch(new Request("https://guest.example/b"), { method: "HEAD" })).text(),
    ).toBe("local");
    expect(await (await fetch(new URL("https://pod.example/a"))).text()).toBe("remote");
    expect(local).toHaveBeenCalledWith("https://guest.example/a", undefined);
    expect(remote).toHaveBeenCalledTimes(1);
  });
});
