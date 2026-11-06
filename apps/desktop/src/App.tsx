import { useEffect, useState } from "react";

import { ItemCard } from "@/components/items/item-card";
import { Button, Card, Input, Select } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import type { Item, ItemKind, ItemStatus, NewItem } from "@/lib/types";

import { tauriSource } from "./data/tauri-source";
import type { LocalItem } from "./data/source";
import "./app.css";

type Access = {
  has_access: boolean;
  user_id?: string;
  server_url?: string;
};

export function App() {
  const { t } = useI18n();
  const [access, setAccess] = useState<Access | null>(null);
  const [items, setItems] = useState<LocalItem[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ItemKind>("movie");
  const [status, setStatus] = useState<ItemStatus>("planned");
  const [server, setServer] = useState("https://j3ynet.site");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [action, setAction] = useState("");

  const invoke = <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
    const api = (window as unknown as { __TAURI__?: { core?: { invoke?: <R>(name: string, args?: Record<string, unknown>) => Promise<R> } } }).__TAURI__;
    if (!api?.core?.invoke) {
      return Promise.reject(new Error("Tauri API is unavailable"));
    }
    return api.core.invoke<T>(command, args);
  };

  async function boot() {
    const status = await invoke<Access>("local_access_status");
    setAccess(status);
    if (status.has_access) await load();
  }

  async function load(search = query) {
    try {
      setError("");
      const [nextItems, db] = await Promise.all([
        tauriSource.list(search || undefined) as Promise<LocalItem[]>,
        invoke<{ path: string; outbox: number; schema_version: number }>("local_db_status"),
      ]);
      setItems(nextItems);
      setAction(`${db.path} · schema ${db.schema_version} · outbox ${db.outbox}`);
    } catch (cause) {
      setError(String(cause));
    }
  }

  useEffect(() => {
    if (access?.has_access) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access?.has_access]);

  useEffect(() => {
    if (!access?.has_access) return;
    const timer = window.setTimeout(() => void load(query), 180);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await invoke("local_sign_in", {
        input: { server_url: server, email, password },
      });
      setPassword("");
      await boot();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const input: NewItem = { kind, title: title.trim(), status };
      await tauriSource.create(input);
      setTitle("");
      await load();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!access) {
    return <main className="desktop-shell"><p>Загрузка…</p></main>;
  }

  if (!access.has_access) {
    return (
      <main className="desktop-shell">
        <header className="desktop-head">
          <h1>jey.net</h1>
          <p className="desktop-muted">Первый вход нужен один раз. Дальше библиотека работает без сервера.</p>
        </header>
        <Card title="Вход">
          <form className="desktop-form" onSubmit={signIn}>
            <Input label="Сервер" value={server} onChange={(event) => setServer(event.target.value)} />
            <Input label="Email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <Input label="Пароль" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <Button loading={busy} type="submit">Войти</Button>
          </form>
          {error ? <p className="desktop-error">{error}</p> : null}
        </Card>
      </main>
    );
  }

  return (
    <main className="desktop-shell">
      <header className="desktop-head desktop-head-row">
        <div>
          <h1>jey.net</h1>
          <p className="desktop-muted">Локальная библиотека · сервер {access.server_url}</p>
        </div>
        <div className="desktop-actions">
          <Button variant="secondary" size="sm" onClick={async () => {
            const report = await invoke<{ path: string }>("local_export_json");
            setAction(`Экспорт: ${report.path}`);
          }}>Экспорт JSON</Button>
          <Button variant="secondary" size="sm" onClick={async () => {
            const report = await invoke<{ path: string; items: number; media_files: number }>("local_backup");
            setAction(`Бэкап: ${report.path} · ${report.items} записей · ${report.media_files} файлов`);
          }}>Бэкап</Button>
        </div>
      </header>

      <section className="desktop-tools">
        <Input label="Поиск" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название, автор или заметка" />
      </section>

      <Card title="Добавить запись">
        <form className="desktop-form" onSubmit={create}>
          <Select label="Тип" value={kind} onChange={(event) => setKind(event.target.value as ItemKind)}>
            <option value="movie">{t("nav.movies")}</option>
            <option value="tv">{t("nav.series")}</option>
            <option value="anime">{t("nav.anime")}</option>
            <option value="book">{t("nav.books")}</option>
            <option value="game">{t("nav.games")}</option>
          </Select>
          <Input label="Название" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={300} />
          <Select label="Статус" value={status} onChange={(event) => setStatus(event.target.value as ItemStatus)}>
            <option value="planned">Запланировано</option>
            <option value="in_progress">В процессе</option>
            <option value="done">Готово</option>
            <option value="dropped">Брошено</option>
          </Select>
          <Button loading={busy} type="submit">Добавить</Button>
        </form>
      </Card>

      {error ? <p className="desktop-error">{error}</p> : null}
      {action ? <p className="desktop-muted">{action}</p> : null}

      <ul className="desktop-list">
        {items.map((item) => (
          <li key={item.id} className="desktop-list-item">
            <ItemCard item={item as Item} href={`#${item.id}`} />
            {item.pending ? <span className="desktop-pending">ожидает синхронизации</span> : null}
            <div className="desktop-actions">
              <Button size="sm" variant="secondary" onClick={async () => {
                const value = window.prompt("Новое название", item.title);
                if (!value?.trim()) return;
                await tauriSource.update(item.id, { title: value.trim() });
                await load();
              }}>Изменить</Button>
              <Button size="sm" variant="secondary" onClick={async () => {
                if (window.confirm(`Удалить «${item.title}»?`)) {
                  await tauriSource.delete(item.id);
                  await load();
                }
              }}>Удалить</Button>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="desktop-muted">Записей пока нет.</p> : null}
    </main>
  );
}
