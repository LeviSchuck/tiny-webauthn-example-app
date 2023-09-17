import { decodeBase64Url } from "@levischuck/tiny-encodings";
import { asset } from "./assets";
import { DataSource } from "./data";
import { CloudflareEnv, Env } from "./env";
import { KVData } from "./kvData";
import { app } from "./main";

let secretKey : CryptoKey | undefined;
let dataSource : DataSource | undefined;

export default {
	async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname.startsWith("/static/")) {
			try {
				const response = await asset(new Request(`https://${url.hostname}${url.pathname.slice(7)}`), env, ctx);
				if (response && response.status >= 200 && response.status < 400) {
					return response;
				}
			} catch (_e) {
				// Nothing
			}
			return new Response('Not found', {
				status: 404
			})
		}

		// Lazily initialize the secret key
		if (!secretKey) {
			secretKey = await crypto.subtle.importKey(
				"raw",
				decodeBase64Url(env.SECRET),
				{ name: "HMAC", hash: "SHA-256" },
				false,
				["sign", "verify"],
			);
		}
		// Lazily initialize the data source
		if (!dataSource) {
			dataSource = new KVData(env.WEBAUTHN_DEMO);
		}
		const origins = JSON.parse(env.ORIGINS) as string[];
		// Build the app environment for hono
		const appEnv : Env = {
			DATA_SOURCE: dataSource,
			ORIGINS: origins,
			RP_ID: env.RP_ID,
			SECRET: secretKey
		};
		try {
			return app.fetch(request, appEnv, ctx);
		} catch (e) {
			console.error(e);
			return new Response('internal server error', {status: 500})
		}
	},
};
