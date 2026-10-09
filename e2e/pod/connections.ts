/**
 * A fetch that asks for a connection of its own on every request
 * (`Connection: close`), so none is sent on a pooled one. Node 24's fetch
 * (undici 7) writes a request onto an idle connection whose close it has
 * not read yet when the event loop was busy for longer than the server
 * keeps it (about 5 s on every server here: a big update's synchronous
 * stretch, on a slow runner), and the request fails, "other side closed",
 * without being retried. A browser resends such a request, so the app
 * needs no retry of its own: the fault is the tests' client's.
 *
 * The Fetch standard forbids the header and a browser drops it; undici
 * sends it and honours it, which connections.test.ts checks, so a Node
 * that stops doing so fails there rather than bring the flake back.
 */
export function closingConnections(send: typeof fetch): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("connection", "close");
    return send(input, { ...init, headers });
  };
}
