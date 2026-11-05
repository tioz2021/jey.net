"use client";

import { useEffect, useMemo, useState } from "react";

import { Button, Card, Dialog, PageHeader } from "@/components/ui";
import { useToast } from "@/components/toasts";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/locale-context";
import type { AdminUser } from "@/lib/types";

import styles from "./people.module.css";

type Pending =
  | { kind: "sessions"; user: AdminUser }
  | { kind: "suspend"; user: AdminUser }
  | { kind: "delete"; user: AdminUser }
  | { kind: "admin"; user: AdminUser }
  | { kind: "test"; user: AdminUser };

export function AdminPeople() {
  const { t, date } = useI18n();
  const { notify } = useToast();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [testTotal, setTestTotal] = useState(0);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeWord, setPurgeWord] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  function load(offset = 0, append = false) {
    setLoading(true);
    api.admin
      .users(query, offset)
      .then((response) => {
        setUsers((current) => (append ? [...current, ...response.users] : response.users));
        setTotal(response.total);
        setTestTotal(response.test_total);
      })
      .catch(() =>
          notify({
            tone: "error",
            title: t("admin.usersError"),
            text: "",
            requestId: null,
          }),
        )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on search only
  }, [query]);

  const online = useMemo(() => users.filter((user) => user.online).length, [users]);
  const dateTime = (value: string | null) =>
    value ? date(value, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  function ask(kind: Pending["kind"], user: AdminUser) {
    setPending({ kind, user } as Pending);
  }

  async function purge() {
    if (purgeWord.trim() !== "delete") return;
    setBusy(true);
    try {
      const result = await api.admin.purgeTestData();
      setPurgeOpen(false);
      setPurgeWord("");
      notify({
        tone: "success",
        title: t("admin.testPurged", { count: result.deleted }),
        text: "",
        requestId: null,
      });
      load();
    } catch {
      notify({ tone: "error", title: t("admin.actionError"), text: "", requestId: null });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === "sessions") {
        const result = await api.admin.revokeSessions(pending.user.id);
        notify({
          tone: "success",
          title: t("admin.sessionsRevoked", { count: result.revoked }),
          text: "",
          requestId: null,
        });
      } else if (pending.kind === "suspend") {
        const suspended = !pending.user.suspended_at;
        await api.admin.suspend(pending.user.id, suspended);
        notify({
          tone: "success",
          title: suspended ? t("admin.userSuspended") : t("admin.userRestored"),
          text: "",
          requestId: null,
        });
      } else if (pending.kind === "admin") {
        await api.admin.setAdmin(pending.user.id, !pending.user.is_admin);
        notify({ tone: "success", title: t("admin.adminChanged"), text: "", requestId: null });
      } else if (pending.kind === "test") {
        await api.admin.setTest(pending.user.id, !pending.user.is_test);
        notify({ tone: "success", title: t("admin.testChanged"), text: "", requestId: null });
      } else {
        await api.admin.deleteUser(pending.user.id);
        notify({ tone: "success", title: t("admin.userDeleted"), text: "", requestId: null });
      }
      setPending(null);
      load();
    } catch {
      notify({ tone: "error", title: t("admin.actionError"), text: "", requestId: null });
    } finally {
      setBusy(false);
    }
  }

  const title = pending
    ? pending.kind === "sessions"
      ? t("admin.revokeTitle")
      : pending.kind === "suspend"
        ? pending.user.suspended_at
          ? t("admin.restoreTitle")
          : t("admin.suspendTitle")
        : pending.kind === "admin"
          ? t("admin.adminTitle")
          : pending.kind === "test"
            ? t("admin.testTitle")
            : t("admin.deleteTitle")
    : "";
  const text = pending
    ? t("admin.actionText", { name: pending.user.display_name })
    : "";

  return (
    <main>
      <PageHeader subtitle={t("admin.peopleSubtitle")} title={t("admin.people")} />
      <section className={styles.stats}>
        <div><strong>{total}</strong><span>{t("analytics.totalUsers")}</span></div>
        <div><strong>{online}</strong><span>{t("analytics.online")}</span></div>
        <div><strong>{users.filter((user) => user.is_admin).length}</strong><span>admin</span></div>
        <div><strong>{users.filter((user) => user.suspended_at).length}</strong><span>{t("admin.suspended")}</span></div>
      </section>

      <Card title={t("admin.testData")}>
        <p className={styles.muted}>{t("admin.testDataHint", { count: testTotal })}</p>
        <Button disabled={testTotal === 0} onClick={() => setPurgeOpen(true)} variant="danger">
          {t("admin.purgeTest")}
        </Button>
      </Card>

      <Card title={t("admin.allUsers")}>
        <div className={styles.searchRow}>
          <input
            aria-label={t("admin.searchPlaceholder")}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("admin.searchPlaceholder")}
            value={search}
          />
        </div>
        {loading && users.length === 0 ? (
          <p className={styles.muted}>{t("admin.loading")}</p>
        ) : users.length === 0 ? (
          <p className={styles.muted}>{t("admin.noUsers")}</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("analytics.name")}</th>
                  <th>{t("analytics.email")}</th>
                  <th>{t("analytics.items")}</th>
                  <th>{t("analytics.lastSeen")}</th>
                  <th>{t("admin.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      {user.online ? <span className={styles.dot} /> : null}
                      {user.display_name}
                      {user.is_admin ? <span className={styles.role}>admin</span> : null}
                      {user.suspended_at ? <span className={styles.role}>{t("admin.suspended")}</span> : null}
                      {user.is_test ? <span className={styles.testRole}>{t("admin.testMarked")}</span> : null}
                      {!user.is_public ? <span className={styles.role}>{t("analytics.private")}</span> : null}
                    </td>
                    <td>{user.email}</td>
                    <td>{user.items}</td>
                    <td>{dateTime(user.last_seen_at)}</td>
                    <td>
                      <div className={styles.actions}>
                        <button onClick={() => ask("sessions", user)} type="button">{t("admin.sessions")}</button>
                        <button onClick={() => ask("suspend", user)} type="button">
                          {user.suspended_at ? t("admin.restore") : t("admin.suspend")}
                        </button>
                        <button onClick={() => ask("admin", user)} type="button">
                          {user.is_admin ? t("admin.unadmin") : t("admin.makeAdmin")}
                        </button>
                        <button onClick={() => ask("test", user)} type="button">
                          {user.is_test ? t("admin.testUnmark") : t("admin.testMark")}
                        </button>
                        <button className={styles.danger} onClick={() => ask("delete", user)} type="button">
                          {t("admin.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {users.length < total ? (
          <Button onClick={() => load(users.length, true)} variant="secondary">
            {t("admin.loadMore")}
          </Button>
        ) : null}
      </Card>

      <Dialog
        footer={
          <>
            <Button onClick={() => setPending(null)} size="sm" variant="secondary">{t("common.cancel")}</Button>
            <Button loading={busy} onClick={() => void confirm()} size="sm" variant={pending?.kind === "delete" ? "danger" : "primary"}>
              {t("admin.confirm")}
            </Button>
          </>
        }
        onClose={() => setPending(null)}
        open={pending !== null}
        title={title}
      >
        <p>{text}</p>
      </Dialog>
      <Dialog
        footer={
          <>
            <Button onClick={() => { setPurgeOpen(false); setPurgeWord(""); }} size="sm" variant="secondary">{t("common.cancel")}</Button>
            <Button disabled={purgeWord.trim() !== "delete"} loading={busy} onClick={() => void purge()} size="sm" variant="danger">{t("admin.purgeConfirm")}</Button>
          </>
        }
        onClose={() => { setPurgeOpen(false); setPurgeWord(""); }}
        open={purgeOpen}
        title={t("admin.purgeTitle")}
      >
        <p>{t("admin.purgeText", { count: testTotal })}</p>
        <input
          aria-label={t("admin.purgeWord")}
          className={styles.confirmInput}
          onChange={(event) => setPurgeWord(event.target.value)}
          placeholder={t("admin.purgeWord")}
          value={purgeWord}
        />
      </Dialog>
    </main>
  );
}
