"use client";

import { useEffect, useState } from "react";

import { Avatar } from "@/components/profile/avatar";
import { Button, Dialog } from "@/components/ui";
import { api } from "@/lib/api";
import { encodeItemShare } from "@/lib/chat-share";
import { encryptToDevices, type DevicePublicKey } from "@/lib/chat-crypto";
import { loadIdentity } from "@/lib/chat-identity";
import { useI18n } from "@/lib/locale-context";
import { useAppRouter } from "@/lib/navigation";
import { useToast } from "@/components/toasts";
import { useUser } from "@/lib/user-context";
import { mediaUrl } from "@/lib/media";
import type { FollowingProfile, Item } from "@/lib/types";

import styles from "./share-item.module.css";

export function ShareItemDialog({
  item,
  onClose,
  open,
}: {
  item: Item;
  onClose: () => void;
  open: boolean;
}) {
  const { t } = useI18n();
  const { user } = useUser();
  const { notify, notifyError } = useToast();
  const router = useAppRouter();
  const [people, setPeople] = useState<FollowingProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.follows
      .following()
      .then((response) => setPeople(response.people))
      .catch(() => setPeople([]))
      .finally(() => setLoading(false));
  }, [open]);

  async function share(person: FollowingProfile) {
    if (!user) return;
    setSendingTo(person.id);
    try {
      const thread = await api.chat.create(person.id);
      const identity = await loadIdentity();
      let encrypted;
      if (identity) {
        await api.chat.registerDevice({
          device_id: identity.device_id,
          public_key: identity.public_key,
          name: "Browser",
        }).catch(() => {});
        const [own, peer] = await Promise.all([
          api.chat.devices().catch(() => ({ devices: [] })),
          api.chat.userDevices(person.id).catch(() => ({ devices: [] })),
        ]);
        if (peer.devices.length > 0) {
          const recipients: DevicePublicKey[] = [
            ...peer.devices.map((device) => ({ device_id: device.device_id, public_key: device.public_key })),
            ...own.devices.map((device) => ({ device_id: device.device_id, public_key: device.public_key })),
            { device_id: identity.device_id, public_key: identity.public_key },
          ];
          const unique = [...new Map(recipients.map((device) => [device.device_id, device])).values()];
          const clientId = crypto.randomUUID();
          encrypted = await encryptToDevices(
            identity,
            unique,
            encodeItemShare(item, user.handle, user.is_public),
            thread.thread.id,
            clientId,
          );
          await api.chat.send(thread.thread.id, null, clientId, encrypted);
          window.dispatchEvent(new Event("jey:chat-updated"));
          notify({ tone: "success", title: t("share.sent"), text: "", requestId: null });
          onClose();
          router.push(`/messages/${thread.thread.id}`);
          return;
        }
      }
      // Legacy peer without E2E keys: share the link card as plaintext.
      const clientId = crypto.randomUUID();
      await api.chat.send(
        thread.thread.id,
        encodeItemShare(item, user.handle, user.is_public),
        clientId,
      );
      window.dispatchEvent(new Event("jey:chat-updated"));
      notify({ tone: "success", title: t("share.sent"), text: "", requestId: null });
      onClose();
      router.push(`/messages/${thread.thread.id}`);
    } catch (cause) {
      notifyError(cause);
    } finally {
      setSendingTo(null);
    }
  }

  return (
    <Dialog
      footer={<Button onClick={onClose} size="sm" variant="secondary">{t("common.cancel")}</Button>}
      onClose={onClose}
      open={open}
      title={t("share.title")}
    >
      <div className={styles.body}>
        <p className={styles.hint}>{t("share.pick")}</p>
        {loading ? <p className={styles.hint}>…</p> : null}
        {!loading && people.length === 0 ? <p className={styles.hint}>{t("share.noFriends")}</p> : null}
        <ul className={styles.list}>
          {people.map((person) => (
            <li key={person.id}>
              <button
                className={styles.person}
                disabled={sendingTo !== null}
                onClick={() => void share(person)}
                type="button"
              >
                <Avatar
                  name={person.display_name}
                  size={32}
                  url={person.avatar_key ? mediaUrl(person.avatar_key) : null}
                />
                <span>
                  <strong>{person.display_name}</strong>
                  {person.handle ? <small>@{person.handle}</small> : null}
                </span>
                <span className={styles.send}>
                  {sendingTo === person.id ? "…" : t("share.send")}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!item.public_hidden && item.status === "done" ? null : (
          <p className={styles.note}>{t("share.privateNote")}</p>
        )}
      </div>
    </Dialog>
  );
}
