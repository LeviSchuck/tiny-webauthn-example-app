/** @jsx jsx */
import { Context } from "hono"
import { jsx } from "hono/jsx";
import { Credential, User } from "./data";
import { encodeBase64Url } from "@levischuck/tiny-encodings"

const FOOTER = <div class="footer">
  <p>This is a demo of <a href="https://github.com/LeviSchuck/tiny-webauthn"><code>@levischuck/tiny-webauthn</code></a>.</p>
  <p>The source code for this service is at <a href="https://github.com/LeviSchuck/tiny-webauthn-example-app">github:levischuck/tiny-webauthn-example-app</a>.</p>
</div>

export function signInPage(c: Context): Response {
  return c.html(
    <html>
      <body>
        <head>
          <link rel="stylesheet" href="/static/style.css" />
        </head>
        <div class="content">
          <h1>Sign in</h1>
          <label for="username">Username:</label>
          <input type="text" id="username" />
          <br />
          <button id="sign-in">Sign In</button>
          <div id="status"></div>
        </div>
        {FOOTER}
        <script type="text/javascript" src="/static/utils.js"></script>
        <script type="text/javascript" src="/static/sign-in.js"></script>
      </body>
    </html>,
  );
}

export function homePageLoggedIn(
  c: Context,
  csrf: string,
  user: User,
  credentials: Credential[],
) {
  return c.html(
    <html>
      <body>
        <head>
          <link rel="stylesheet" href="/static/style.css" />
        </head>
        <div class="content">
          <h1>WebAuthn Demo</h1>
          <p>You are logged in as {user.username}</p>
          <form method="post" action="/sign-out">
            <button type="submit">Sign Out</button>
            <input type="hidden" name="csrf" value={csrf} />
          </form>
          <button id="register-another">Register another authenticator</button>
          {" "}
          <label for="passkey">As Passkey:</label>
          <input type="checkbox" id="passkey" />
          <div id="status"></div>
          <hr />
          <h2>Current credentials</h2>
          <ul>
            {credentials.map((c) => {
              return (
                <li>
                  <code>{encodeBase64Url(c.credentialId)}</code>
                  <br /> - <strong>User Verified</strong>:{" "}
                  {c.userVerified && "true"}, <strong>Sign Count:</strong>{" "}
                  {c.signCount}, <strong>Transports</strong>:{" "}
                  {JSON.stringify(c.transports)}
                </li>
              );
            })}
          </ul>
        </div>
        {FOOTER}
        <script type="text/javascript" src="/static/utils.js"></script>
        <script type="text/javascript" src="/static/register.js"></script>
      </body>
    </html>,
  );
}

export function homePageNotLoggedIn(c: Context) {
  return c.html(
    <html>
      <body>
        <head>
          <link rel="stylesheet" href="/static/style.css" />
        </head>
        <div class="content">
          <h1>WebAuthn Demo</h1>
          <a href="/register">
            <button>Register</button>
          </a>
          <br />
          <a href="/sign-in">
            <button>Sign In with username</button>
          </a>
          <br />
          <button id="sign-in-passkey">Sign In with passkey</button>
          <div id="status"></div>
        </div>
        {FOOTER}
        <script type="text/javascript" src="/static/utils.js"></script>
        <script type="text/javascript" src="/static/sign-in-passkey.js">
        </script>
      </body>
    </html>,
  );
}

export function registerPage(c: Context) {
  return c.html(
    <html>
      <body>
        <head>
          <link rel="stylesheet" href="/static/style.css" />
        </head>
        <div class="content">
          <h1>Register</h1>
          <label for="username">Username:</label>
          <input type="text" id="username" />
          <br />
          <label for="passkey">Passkey:</label>
          <input type="checkbox" id="passkey" />
          <br />
          <button id="register">Register</button>
          <div id="status"></div>
        </div>
        {FOOTER}
        <script type="text/javascript" src="/static/utils.js"></script>
        <script type="text/javascript" src="/static/register.js"></script>
      </body>
    </html>,
  );
}
