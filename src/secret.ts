import { encodeBase64Url } from "@levischuck/tiny-encodings";

const ENCODER = new TextEncoder();

export async function usernameToId(key: CryptoKey, username: string): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(
    { name: "HMAC" },
    key,
    ENCODER.encode(`username:${username}`),
  );
  return new Uint8Array(signature.slice(0, 12));
}

export async function deriveCSRFToken(key: CryptoKey, sessionId: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: "HMAC" },
    key,
    ENCODER.encode(`csrf:${sessionId}`),
  );
  return encodeBase64Url(new Uint8Array(signature.slice(0, 12)));
}
