import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { AppEnv } from "./env";
import {
  parseWebAuthnObject,
  stringifyWebAuthnObject,
  AuthenticatorAttestationResponse,
  AuthenticatorTransport,
  PublicKeyCredentialDescriptor,
  WebAuthnCreateResponse,
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from "@levischuck/tiny-webauthn";
import { decodeBase64Url, encodeBase64Url } from "@levischuck/tiny-encodings";
import {
  assembleChallenge,
  disassembleAndVerifyChallenge,
} from "./challenge";
import { usernameToId } from "./secret";
import { getSession } from "./session";

export const registrationApp = new Hono<AppEnv>();

const DECODER = new TextDecoder();

registrationApp.post("/options", async (c) => {
  const sessionId = getSession(c);
  const session =
    (sessionId && await c.env.DATA_SOURCE.findSession(sessionId)) ||
    null;
  const user =
    (session && await c.env.DATA_SOURCE.findUserByUserId(session.userId)) ||
    null;
  let username: string | null = null;

  if (user) {
    username = user.username;
  } else {
    const queryUsername = c.req.query("username");
    if (queryUsername) {
      username = queryUsername;
    }
  }

  if (!username) {
    return c.json({
      error: true,
      message: "Missing username",
    }, 400);
  }

  const id = (user && user.userId) || await usernameToId(c.env.SECRET, username);

  const passkey = c.req.query("passkey");

  const expiration = new Date().getTime() + 60_000;
  const random = crypto.getRandomValues(new Uint8Array(16));
  const challenge = await assembleChallenge(c.env.SECRET, random, expiration, id);

  let excludeCredentials: PublicKeyCredentialDescriptor[] | undefined;

  if (user) {
    const credentials = await c.env.DATA_SOURCE.findCredentialsForUserId(
      user.userId,
    );
    if (credentials.length > 0) {
      excludeCredentials = [];
      for (const credential of credentials) {
        excludeCredentials.push({
          type: "public-key",
          id: credential.credentialId,
        });
      }
    }
  }

  const options = await generateRegistrationOptions({
    rpId: c.env.RP_ID,
    rpName: "example-app",
    userDisplayName: username,
    userId: id,
    userName: username,
    timeoutMilliseconds: 120_000,
    challenge,
    kind: passkey && "passkey" || "server-side",
    supportedAlgorithms: [-8, -7, -257],
    excludeCredentials,
  });

  const json = {
    options: stringifyWebAuthnObject(options),
    authenticatingData: {
      challenge: encodeBase64Url(challenge),
      expiration,
      userId: encodeBase64Url(id),
    },
  };
  return c.json(json);
});

registrationApp.post("/submit", async (c) => {
  const body = await c.req.json() as {
    username?: string;
    response: string;
    transports?: AuthenticatorTransport[];
  };

  if (body.transports) {
    for (const transport of body.transports) {
      if (
        transport != "ble" && transport != "hybrid" &&
        transport != "internal" && transport != "nfc" &&
        transport != "smart-card" && transport != "usb"
      ) {
        return c.json({
          error: true,
          message: `Unexpected transport "${transport}"`,
        }, 400);
      }
    }
  }

  const sessionId = getSession(c);
  const session =
    (sessionId && await c.env.DATA_SOURCE.findSession(sessionId)) ||
    null;
  const user =
    (session && await c.env.DATA_SOURCE.findUserByUserId(session.userId)) ||
    null;

  if (!user && !body.username) {
    return c.json({
      error: true,
      message: `Missing username`,
    }, 400);
  }

  const response = parseWebAuthnObject(
    body.response,
  ) as AuthenticatorAttestationResponse;
  if (!(response as AuthenticatorAttestationResponse).attestationObject) {
    return c.json({
      error: true,
      message: "Missing attestationObject",
    }, 400);
  }

  const clientDataJson = JSON.parse(
    DECODER.decode(response.clientDataJSON),
  ) as { challenge: string };
  const challenge = decodeBase64Url(clientDataJson.challenge);

  let userId: Uint8Array;
  try {
    const result = await disassembleAndVerifyChallenge(c.env.SECRET, challenge);
    userId = result.userId;
    const expiration = result.expiration;
    if (new Date().getTime() > expiration) {
      return c.json({
        error: true,
        message: "Challenge expired",
      }, 400);
    }
    if (user) {
      if (!crypto.subtle.timingSafeEqual(userId, user.userId)) {
        return c.json({
          error: true,
          message: "User ID did not match the challenge",
        }, 400);
      }
    } else if (body.username) {
      const expectedUserId = await usernameToId(c.env.SECRET, body.username);
      if (!crypto.subtle.timingSafeEqual(userId, expectedUserId)) {
        return c.json({
          error: true,
          message: "User ID did not match the challenge",
        }, 400);
      }
    } else {
      // Unreachable
      return c.json({
        error: true,
        message: `Missing username`,
      }, 400);
    }
  } catch (e) {
    return c.json({
      error: true,
      message: (e as Error).message,
    }, 400);
  }

  if (!user) {
    const existingUser = await c.env.DATA_SOURCE.findUserByUserId(userId);
    if (existingUser) {
      return c.json({
        error: true,
        message: "User already registered",
      }, 400);
    }
  }

  let verification: WebAuthnCreateResponse;
  try {
    verification = await verifyRegistrationResponse({
      rpId: c.env.RP_ID,
      origins: c.env.ORIGINS,
      attestationResponse: response as AuthenticatorAttestationResponse,
      challenge,
      expectedAlgorithms: [-8, -7, -257],
    });
  } catch (e) {
    console.error(e);
    return c.json({
      error: true,
      message: "verification failed",
    }, 400);
  }

  const transports = body.transports;

  console.log("# Registration");
  console.log("#" + "-".repeat(79));
  console.log(`username: ${body.username}`);
  console.log(`userId: ${encodeBase64Url(userId)}`);
  console.log(`challenge: ${encodeBase64Url(challenge)}`);
  console.log(`clientDataJson: ${encodeBase64Url(response.clientDataJSON)}`);
  console.log(
    `attestationObject: ${encodeBase64Url(response.attestationObject)}`,
  );
  console.log(`credentialId: ${encodeBase64Url(verification.credentialId)}`);
  console.log(`publicKey: ${encodeBase64Url(verification.coseKey)}`);
  console.log(`signCount: ${verification.signCount}`);
  console.log(`transports: ${transports && JSON.stringify(transports)}`);
  console.log("#" + "-".repeat(79));

  // Step 26 - verify that the credentialId is not associated for any user
  // Also known as step 22 in https://www.w3.org/TR/webauthn-3/

  const existingCredential = await c.env.DATA_SOURCE.findCredentialById(
    verification.credentialId,
  );
  if (existingCredential) {
    return c.json({
      error: true,
      message: "Credential is already registered",
    }, 400);
  }

  // Step 27 - Create and store a new credential record on the user account
  // Also known as step 23 in https://www.w3.org/TR/webauthn-3/

  if (!user && body.username) {
    await c.env.DATA_SOURCE.createUser({
      userId,
      username: body.username,
    });
  }

  await c.env.DATA_SOURCE.createCredential({
    credentialId: verification.credentialId,
    publicKey: verification.coseKey,
    signCount: verification.signCount,
    userId: userId,
    userVerified: verification.userVerified,
    transports,
  });

  if (!user) {
    const sessionId = encodeBase64Url(
      crypto.getRandomValues(new Uint8Array(16)),
    );
    await c.env.DATA_SOURCE.createSession({
      sessionId,
      userId,
    });

    setCookie(c, "session", sessionId, {
      httpOnly: true,
      secure: c.env.RP_ID != "localhost",
      path: "/",
    });
  }

  return c.json({
    status: "OK",
  });
});
