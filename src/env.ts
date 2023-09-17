import { DataSource } from "./data";

export interface CloudflareEnv {
	WEBAUTHN_DEMO: KVNamespace;
  __STATIC_CONTENT: KVNamespace;
	RP_ID: string;
	ORIGINS: string;
	SECRET: string;
}

export type Env = {
  DATA_SOURCE: DataSource;
	RP_ID: string;
  ORIGINS: string[];
  SECRET: CryptoKey;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {};
}