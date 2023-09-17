import { getAssetFromKV } from "@cloudflare/kv-asset-handler";
// @ts-ignore
import manifestJSON from '__STATIC_CONTENT_MANIFEST'
const manifest = JSON.parse(manifestJSON)

export interface StaticEnv {
  __STATIC_CONTENT: KVNamespace
}

export async function asset(request: Request, env: StaticEnv, ctx: ExecutionContext) : Promise<Response> {
  // The UX for getAssetFromKV is poor for ES Module workers
  return await getAssetFromKV({request, waitUntil: function(promise) {
    ctx.waitUntil(promise)
  }}, {
    ASSET_NAMESPACE: env.__STATIC_CONTENT,
    ASSET_MANIFEST: manifest,
  });
}

