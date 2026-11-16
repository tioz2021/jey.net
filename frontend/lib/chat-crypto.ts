/**
 * T150.3: client-side chat cryptography.
 *
 * Identity: X25519 private key derived from a 24-word BIP39 recovery phrase.
 * Message: an ephemeral X25519 key wraps a per-device AES-256-GCM envelope.
 * The server only ever receives public keys and opaque envelopes.
 */
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import {
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const VERSION = 1;
const INFO = new TextEncoder().encode("jey-chat-x25519-aes-gcm-v1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type ChatIdentity = {
  device_id: string;
  public_key: string;
  private_key: string;
  created_at: string;
};

export type EncryptedEnvelope = {
  device_id: string;
  version: number;
  ephemeral_public: string;
  salt: string;
  nonce: string;
  ciphertext: string;
};

export type EncryptedMessage = {
  version: number;
  envelopes: EncryptedEnvelope[];
};

export type DevicePublicKey = {
  device_id: string;
  public_key: string;
};

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function unbase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function buffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function aad(threadId: string, clientId: string): Uint8Array {
  return encoder.encode(`jey-chat|${VERSION}|${threadId}|${clientId}`);
}

export function createMnemonic(): string {
  return generateMnemonic(wordlist, 256);
}

export function isRecoveryPhrase(value: string): boolean {
  return validateMnemonic(value.trim().toLowerCase(), wordlist);
}

export function identityFromMnemonic(mnemonic: string, deviceId: string): ChatIdentity {
  const phrase = mnemonic.trim().toLowerCase();
  if (!validateMnemonic(phrase, wordlist)) {
    throw new Error("Invalid recovery phrase");
  }
  const seed = mnemonicToSeedSync(phrase);
  const privateKey = sha256(
    new Uint8Array([...seed, ...encoder.encode("jey-chat-x25519-v1")]),
  );
  const publicKey = x25519.getPublicKey(privateKey);
  return {
    device_id: deviceId,
    public_key: base64(publicKey),
    private_key: base64(privateKey),
    created_at: new Date().toISOString(),
  };
}

export function newDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function fingerprint(identity: Pick<ChatIdentity, "public_key">): string {
  const digest = sha256(unbase64(identity.public_key));
  return base64(digest).slice(0, 12);
}

async function aesKey(shared: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const key = hkdf(sha256, shared, salt, INFO, 32);
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToDevices(
  identity: ChatIdentity,
  recipients: DevicePublicKey[],
  plaintext: string,
  threadId: string,
  clientId: string,
): Promise<EncryptedMessage> {
  const ephemeralPrivate = randomBytes(32);
  const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);
  const additionalData = aad(threadId, clientId);
  const envelopes: EncryptedEnvelope[] = [];

  for (const recipient of recipients) {
    const shared = x25519.getSharedSecret(
      ephemeralPrivate,
      unbase64(recipient.public_key),
    );
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    const key = await aesKey(shared, salt);
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: buffer(nonce),
        additionalData: buffer(additionalData),
      },
      key,
      buffer(encoder.encode(plaintext)),
    );
    envelopes.push({
      device_id: recipient.device_id,
      version: VERSION,
      ephemeral_public: base64(ephemeralPublic),
      salt: base64(salt),
      nonce: base64(nonce),
      ciphertext: base64(new Uint8Array(ciphertext)),
    });
  }

  // A sender's own device must be among recipients for history reloads.
  if (!envelopes.length) {
    throw new Error("No recipient devices");
  }
  return { version: VERSION, envelopes };
}

export async function decryptEnvelope(
  identity: ChatIdentity,
  envelope: EncryptedEnvelope,
  threadId: string,
  clientId: string,
): Promise<string> {
  if (envelope.version !== VERSION) {
    throw new Error("Unsupported encrypted message version");
  }
  const shared = x25519.getSharedSecret(
    unbase64(identity.private_key),
    unbase64(envelope.ephemeral_public),
  );
  const key = await aesKey(shared, unbase64(envelope.salt));
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: buffer(unbase64(envelope.nonce)),
      additionalData: buffer(aad(threadId, clientId)),
    },
    key,
    buffer(unbase64(envelope.ciphertext)),
  );
  return decoder.decode(plaintext);
}

/** Decrypts the envelope addressed to this device key. */
export async function decryptForDevice(
  identity: ChatIdentity,
  message: EncryptedMessage,
  threadId: string,
  clientId: string,
): Promise<string | null> {
  // A recovered identity keeps the same key but gets a new device_id, so
  // try every envelope rather than trusting device routing metadata.
  const ordered = [
    ...message.envelopes.filter((entry) => entry.device_id === identity.device_id),
    ...message.envelopes.filter((entry) => entry.device_id !== identity.device_id),
  ];
  for (const envelope of ordered) {
    try {
      return await decryptEnvelope(identity, envelope, threadId, clientId);
    } catch {
      // Try the next envelope.
    }
  }
  return null;
}
