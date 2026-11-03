"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toasts";
import { Button, Dialog, Input, Select } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import { ApiError } from "@/lib/errors";
import type { TagCount } from "@/lib/types";

import styles from "./tag-actions.module.css";

type Mode = "rename" | "merge" | "delete" | null;

export function TagActions({ tag, tags }: { tag: TagCount; tags: TagCount[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const { notify, notifyError } = useToast();
  const [mode, setMode] = useState<Mode>(null);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState(tag.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [target, setTarget] = useState("");

  const others = tags.filter((candidate) => candidate.id !== tag.id);

  function open(next: Exclude<Mode, null>) {
    setName(tag.name);
    setNameError(null);
    setTarget("");
    setMode(next);
  }

  function close() {
    if (!pending) {
      setMode(null);
    }
  }

  async function rename() {
    setPending(true);
    setNameError(null);

    try {
      await api.tags.rename(tag.id, name.trim());
      setMode(null);
      router.refresh();
      notify({
        tone: "success",
        title: t("tags.renamed"),
        text: `Теперь он называется «${name.trim()}».`,
        requestId: null,
      });
    } catch (cause) {
      if (cause instanceof ApiError && cause.field === "name") {
        setNameError(cause.message);
      } else {
        notifyError(cause);
      }
    } finally {
      setPending(false);
    }
  }

  async function merge() {
    if (!target) {
      return;
    }

    setPending(true);

    try {
      await api.tags.merge(tag.id, target);
      setMode(null);
      router.refresh();
      notify({
        tone: "success",
        title: t("tags.merged"),
        text: t("tags.mergedText", { name: tag.name }),
        requestId: null,
      });
    } catch (cause) {
      notifyError(cause);
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);

    try {
      await api.tags.remove(tag.id);
      setMode(null);
      router.refresh();
    } catch (cause) {
      notifyError(cause);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={() => open("rename")}>
          {t("tags.rename")}
        </Button>
        <Button
          disabled={others.length === 0}
          variant="ghost"
          size="sm"
          onClick={() => open("merge")}
        >
          {t("tags.merge")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => open("delete")}>
          {t("tags.delete")}
        </Button>
      </div>

      <Dialog
        open={mode === "rename"}
        title={t("tags.renameTitle", { name: tag.name })}
        onClose={close}
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={close}>
              Отмена
            </Button>
            <Button
              disabled={pending || name.trim().length === 0}
              loading={pending}
              onClick={rename}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <Input
          autoFocus
          error={nameError ?? undefined}
          label={t("tags.newName")}
          maxLength={40}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Dialog>

      <Dialog
        open={mode === "merge"}
        title={t("tags.mergeTitle", { name: tag.name })}
        onClose={close}
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={close}>
              Отмена
            </Button>
            <Button disabled={!target} loading={pending} onClick={merge}>
              {t("tags.merge")}
            </Button>
          </>
        }
      >
        <Select
          label={t("tags.mergeTarget")}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">{t("tags.mergeChoose")}</option>
          {others.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} ({candidate.item_count})
            </option>
          ))}
        </Select>
        <p className={styles.hint}>
          {t("tags.mergeHint", { name: tag.name })}
        </p>
      </Dialog>

      <Dialog
        open={mode === "delete"}
        title={t("tags.deleteTitle", { name: tag.name })}
        onClose={close}
        footer={
          <>
            <Button variant="secondary" disabled={pending} onClick={close}>
              Отмена
            </Button>
            <Button variant="danger" loading={pending} onClick={remove}>
              {t("tags.delete")}
            </Button>
          </>
        }
      >
        <p className={styles.hint}>
          {t("tags.deleteText")}
        </p>
      </Dialog>
    </>
  );
}
