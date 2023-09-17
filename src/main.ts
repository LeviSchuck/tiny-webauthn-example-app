import { Hono } from "hono";
import {setCookie} from "hono/cookie";
import {
  homePageLoggedIn,
  homePageNotLoggedIn,
  registerPage,
  signInPage,
} from "./pages";
import { deriveCSRFToken } from "./secret";
import { AppEnv } from "./env";
import { authenticationApp } from "./authentication";
import { registrationApp } from "./registration";
import { getSession } from "./session";

const ENCODER = new TextEncoder();

export const app = new Hono<AppEnv>();

app.route("/authentication", authenticationApp);
app.route("/registration", registrationApp);

app.post("/sign-out", async (c) => {
  const sessionId = getSession(c);
  if (!sessionId) {
    return c.redirect("/", 302);
  }
  const expectedCSRF = await deriveCSRFToken(c.env.SECRET, sessionId);
  const form = await c.req.formData();
  const csrf = form.get("csrf");
  if (!csrf || typeof csrf != "string") {
    return c.text("Missing CSRF", 400);
  }

  if (!crypto.subtle.timingSafeEqual(ENCODER.encode(expectedCSRF), ENCODER.encode(csrf))) {
    return c.text("Bad CSRF", 400);
  }
  setCookie(c, "session", "", {
    expires: new Date(new Date().getTime() - 1000),
    httpOnly: true,
    secure: true,
  });
  await c.env.DATA_SOURCE.deleteSession(sessionId);
  return c.redirect("/", 302);
});

app.get("/", async (c) => {
  const sessionId = getSession(c);
  const session =
    (sessionId && await c.env.DATA_SOURCE.findSession(sessionId)) ||
    null;
  const user =
    (session && await c.env.DATA_SOURCE.findUserByUserId(session.userId)) ||
    null;
  if (!user || !session) {
    return homePageNotLoggedIn(c);
  }

  const csrf = await deriveCSRFToken(c.env.SECRET, session.sessionId);

  const credentials = await c.env.DATA_SOURCE.findCredentialsForUserId(
    user.userId,
  );

  return homePageLoggedIn(c, csrf, user, credentials);
});
app.get("/sign-in", (c) => {
  return signInPage(c);
});
app.get("/register", (c) => {
  return registerPage(c);
});

app.onError((e, c) => {
  console.error(e);
  if (e.stack) {
    console.error(e.stack)
  }
  return c.text('Internal error', 500);
})