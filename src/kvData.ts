import { decodeBase64Url, encodeBase64Url } from "@levischuck/tiny-encodings";
import { AuthenticatorTransport } from "@levischuck/tiny-webauthn";
import { Credential, CredentialUpdate, DataSource, Session, User } from "./data";


interface StoredCredential {
  credentialId: string
  publicKey: string
  signCount: number
  userVerified: boolean
  userId: string
  transports?: AuthenticatorTransport[]
}

export class KVData implements DataSource {
  private kv : KVNamespace;
  constructor(kv: KVNamespace) {
    this.kv = kv;
  }
  async findUserByUserId(userId: Uint8Array): Promise<User | null> {
    const encodedId = encodeBase64Url(userId);
    const user = await this.kv.get<{userId: string, username: string}>(`/user/${encodedId}`, 'json');
    if (user) {
      return {
        userId: decodeBase64Url(user.userId),
        username: user.username
      }
    }
    return null;
  }
  async findUserByUsername(username: string): Promise<User | null> {
    const encodedId = await this.kv.get(`/username/${username}`, 'text');
    if (encodedId) {
      const user = await this.kv.get<{userId: string, username: string}>(`/user/${encodedId}`, 'json');
      if (user) {
        return {
          userId: decodeBase64Url(user.userId),
          username: user.username
        }
      }
    }
    return null;
  }
  async createUser(user: User): Promise<void> {
    const encodedId = encodeBase64Url(user.userId);
    await this.kv.put(`/user/${encodedId}`, JSON.stringify({
      userId: encodedId,
      username: user.username
    }), {
      expirationTtl: 86400
    });
    await this.kv.put(`/username/${user.username}`, encodedId, {
      expirationTtl: 86400
    });
  }
  async createCredential(credential: Credential): Promise<void> {
    // credential IDs can get long.
    // crush them into a fixed size.
    const digest = await crypto.subtle.digest({name: "SHA-256"}, credential.credentialId);
    const encodedDigest = encodeBase64Url(digest.slice(0, 16));
    const encodedUserId = encodeBase64Url(credential.userId);
    const data : StoredCredential = {
      credentialId: encodeBase64Url(credential.credentialId),
      publicKey: encodeBase64Url(credential.publicKey),
      signCount: credential.signCount,
      userVerified: credential.userVerified,
      userId: encodedUserId
    };
    if (credential.transports) {
      data.transports = credential.transports;
    }
    await this.kv.put(`/credential/${encodedDigest}`, JSON.stringify(data), {
      expirationTtl: 86400
    });
    // Index the credential to the user
    await this.kv.put(`/user/${encodedUserId}/credential/${encodedDigest}`, '', {
      expirationTtl: 86400
    });
  }
  async findCredentialsForUserId(userId: Uint8Array): Promise<Credential[]> {
    const encodedUserId = encodeBase64Url(userId);
    const list = await this.kv.list({prefix: `/user/${encodedUserId}/credential/`});
    // Technically, the list could have multiple pages, though it is unlikely
    // For this example, pagination is not supported.
    const credentialPromises : Promise<Credential | null>[] = [];
    for (const entry of list.keys) {
      credentialPromises.push((async () => {
        try {
          const encodedDigest = entry.name.split('/')[4];
          const credential = await this.kv.get<StoredCredential>(`/credential/${encodedDigest}`, 'json')
          if (credential) {
            return {
              userId: decodeBase64Url(credential.userId),
              credentialId: decodeBase64Url(credential.credentialId),
              publicKey: decodeBase64Url(credential.publicKey),
              signCount: credential.signCount,
              userVerified: credential.userVerified,
              transports: credential.transports
            }
          }
        } catch (e) {
          console.error(`Could not parse ${entry.name}`);
        }
        return null;
      })());
    }
    const credentials : Credential[] = [];
    for (const credentialPromise of credentialPromises) {
      const credential = await credentialPromise;
      if (credential) {
        credentials.push(credential);
      }
    }
    return credentials;
  }
  async deleteCredential(credentialId: Uint8Array): Promise<void> {
    const digest = await crypto.subtle.digest({name: "SHA-256"}, credentialId);
    const encodedDigest = encodeBase64Url(digest.slice(0, 16));
    await this.kv.delete(`/credential/${encodedDigest}`)
  }
  async findCredentialById(credentialId: Uint8Array): Promise<Credential | null> {
    // credential IDs can get long.
    // crush them into a fixed size.
    const digest = await crypto.subtle.digest({name: "SHA-256"}, credentialId);
    const encodedDigest = encodeBase64Url(digest.slice(0, 16));

    const credential = await this.kv.get<StoredCredential>(`/credential/${encodedDigest}`, 'json')
    if (credential) {
      return {
        userId: decodeBase64Url(credential.userId),
        credentialId: decodeBase64Url(credential.credentialId),
        publicKey: decodeBase64Url(credential.publicKey),
        signCount: credential.signCount,
        userVerified: credential.userVerified,
        transports: credential.transports
      }
    }
    return null;
  }
  async updateCredential(credentialId: Uint8Array, update: CredentialUpdate): Promise<void> {
    const credential = await this.findCredentialById(credentialId);
    if (credential) {
      let dirty = false;
      if (update.signCount && update.signCount != credential.signCount) {
        dirty = true;
        credential.signCount = update.signCount;
      }
      if (update.userVerified !== undefined && update.userVerified != credential.userVerified) {
        dirty = true;
        credential.userVerified = update.userVerified;
      }
      if (dirty) {
        const data : StoredCredential = {
          credentialId: encodeBase64Url(credential.credentialId),
          publicKey: encodeBase64Url(credential.publicKey),
          signCount: credential.signCount,
          userVerified: credential.userVerified,
          userId: encodeBase64Url(credential.userId)
        };
        if (credential.transports) {
          data.transports = credential.transports;
        }
        const digest = await crypto.subtle.digest({name: "SHA-256"}, credentialId);
        const encodedDigest = encodeBase64Url(digest.slice(0, 16));
        await this.kv.put(`/credential/${encodedDigest}`, JSON.stringify(data), {
          expirationTtl: 86400
        });
      }
    }
  }
  async createSession(session: Session): Promise<void> {
    await this.kv.put(`/session/${session.sessionId}`, JSON.stringify({
      sessionId: session.sessionId,
      userId: encodeBase64Url(session.userId)
    }), {
      expirationTtl: 86400
    });
  }
  async deleteSession(sessionId: string): Promise<void> {
    await this.kv.delete(`/session/${sessionId}`);
  }
  async findSession(sessionId: string): Promise<Session | null> {
    const session = await this.kv.get<{sessionId: string, userId: string}>(`/session/${sessionId}`, 'json');
    if (session) {
      return {
        sessionId: session.sessionId,
        userId: decodeBase64Url(session.userId)
      }
    }
    return null;
  }
}