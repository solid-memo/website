import { test } from "../fixtures.ts";
import { logInAndCreateInstance } from "../flows/logIn.ts";

/** The shortest journey: in and out again. When this fails, so does every other. */
test("log in with a WebID and log out @smoke", async ({ app, account, runId }) => {
  await app.step("01 · Visit Solid Memo", () => app.onboarding.visit());
  await app.step("02 · Log in with the WebID", () => logInAndCreateInstance(app, account, `Smoke ${runId}`));
  await app.step("03 · Log out", async () => {
    await app.chrome.logOut();
    await app.onboarding.expectLoggedOut();
  });
});
