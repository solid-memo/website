import { startCss } from "./harness/cssServer.ts";

/**
 * The Solid server every journey logs in to: the one JOURNEY_SERVER_URL
 * names (`npm run css` keeps one up between runs), else a Community Solid
 * Server 7 started here in Docker and stopped after. The journeys read its
 * URL from JOURNEY_CSS_URL.
 */
export default async function setup() {
  const given = process.env.JOURNEY_SERVER_URL;
  if (given !== undefined && given !== "") {
    process.env.JOURNEY_CSS_URL = given.endsWith("/") ? given : `${given}/`;
    return;
  }
  const { url, stop } = await startCss();
  process.env.JOURNEY_CSS_URL = url;
  return stop;
}
