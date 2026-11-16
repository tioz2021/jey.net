import { describe, expect, it } from "vitest";

import {
  createMnemonic,
  decryptForDevice,
  encryptToDevices,
  identityFromMnemonic,
  newDeviceId,
  type DevicePublicKey,
} from "./chat-crypto";

function device(identity: ReturnType<typeof identityFromMnemonic>): DevicePublicKey {
  return { device_id: identity.device_id, public_key: identity.public_key };
}

describe("chat E2E crypto", () => {
  it("recovers the same public key from a phrase", () => {
    const phrase = createMnemonic();
    const first = identityFromMnemonic(phrase, newDeviceId());
    const recovered = identityFromMnemonic(phrase, newDeviceId());
    expect(phrase.split(" ")).toHaveLength(24);
    expect(recovered.public_key).toBe(first.public_key);
  });

  it("recovers old history after a phrase restore on a new device id", async () => {
    const phrase = createMnemonic();
    const oldDevice = identityFromMnemonic(phrase, newDeviceId());
    const restored = identityFromMnemonic(phrase, newDeviceId());
    const message = await encryptToDevices(
      oldDevice,
      [device(oldDevice)],
      "history survives",
      "thread-old",
      "client-old",
    );
    await expect(
      decryptForDevice(restored, message, "thread-old", "client-old"),
    ).resolves.toBe("history survives");
  });

  it("decrypts one ciphertext on every recipient device", async () => {
    const aliceOne = identityFromMnemonic(createMnemonic(), newDeviceId());
    const aliceTwo = identityFromMnemonic(createMnemonic(), newDeviceId());
    const bob = identityFromMnemonic(createMnemonic(), newDeviceId());
    const message = await encryptToDevices(
      aliceOne,
      [device(aliceOne), device(aliceTwo), device(bob)],
      "multi-device secret",
      "thread-1",
      "client-1",
    );

    for (const identity of [aliceOne, aliceTwo, bob]) {
      await expect(
        decryptForDevice(identity, message, "thread-1", "client-1"),
      ).resolves.toBe("multi-device secret");
    }
  });

  it("rejects a different AAD context and a tampered ciphertext", async () => {
    const alice = identityFromMnemonic(createMnemonic(), newDeviceId());
    const bob = identityFromMnemonic(createMnemonic(), newDeviceId());
    const message = await encryptToDevices(
      alice,
      [device(bob)],
      "authenticated",
      "thread-1",
      "client-1",
    );

    await expect(
      decryptForDevice(bob, message, "thread-2", "client-1"),
    ).resolves.toBeNull();
    await expect(
      decryptForDevice(bob, message, "thread-1", "client-2"),
    ).resolves.toBeNull();

    const tampered = {
      ...message,
      envelopes: message.envelopes.map((envelope) => ({
        ...envelope,
        ciphertext: `${envelope.ciphertext.slice(0, -2)}AA`,
      })),
    };
    await expect(
      decryptForDevice(bob, tampered, "thread-1", "client-1"),
    ).resolves.toBeNull();
  });

  it("refuses to build an envelope without recipients", async () => {
    const alice = identityFromMnemonic(createMnemonic(), newDeviceId());
    await expect(
      encryptToDevices(alice, [], "nothing", "thread", "client"),
    ).rejects.toThrow("No recipient devices");
  });
});
