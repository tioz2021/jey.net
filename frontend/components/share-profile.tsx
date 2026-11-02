"use client";

import { useEffect, useState } from "react";

import { useToast } from "@/components/toasts";
import { Button } from "@/components/ui";
import { useUser } from "@/lib/user-context";

import styles from "./share-profile.module.css";

/**
 * The share link for a public profile.
 *
 * The account comes from the context, so toggling "Публичный профиль" and
 * saving updates this block without a page reload.
 */
export function ShareProfile() {
  const { user } = useUser();
  const { notify } = useToast();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!user) {
    return null;
  }

  const userId = user.id;
  const link = origin ? `${origin}/u/${userId}` : `/u/${userId}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/u/${userId}`);
      notify({
        tone: "success",
        title: "Ссылка скопирована",
        text: "Можно отправлять её кому угодно.",
        requestId: null,
      });
    } catch {
      notify({
        tone: "error",
        title: "Не удалось скопировать",
        text: "Выделите ссылку и скопируйте вручную.",
        requestId: null,
      });
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="share-heading">
      <h2 className={styles.title} id="share-heading">
        Публичный профиль
      </h2>

      {user.is_public ? (
        <>
          <p className={styles.text}>
            По ссылке видны только завершённые записи. Заметки, планы и черновики
            остаются приватными.
          </p>

          <div className={styles.row}>
            <input
              aria-label="Ссылка на публичный профиль"
              className={styles.input}
              onFocus={(event) => event.target.select()}
              readOnly
              value={link}
            />
            <Button onClick={copyLink} variant="secondary">
              Копировать
            </Button>
          </div>
        </>
      ) : (
        <p className={styles.text}>
          Профиль закрыт: ссылка не работает, а страница отвечает «не найдено».
          Включите «Публичный профиль» выше и сохраните.
        </p>
      )}
    </section>
  );
}
