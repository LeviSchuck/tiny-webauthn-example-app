import { Context } from "hono";
import { getCookie } from 'hono/cookie';

export function getSession(c: Context): string | null {
  try {
    // Can throw errors :/
    return getCookie(c, "session") || null;
  } catch (_e) {
    // ignored
  }
  return null;
}

