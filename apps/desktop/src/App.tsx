import { useEffect, useMemo, useState } from "react";

import { ItemCard } from "@/components/items/item-card";
import { Logo } from "@/components/logo";
import {
  IconAnime,
  IconBook,
  IconFilm,
  IconGame,
  IconList,
  IconTv,
} from "@/components/icons";
import { Button, Card, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { useI18n } from "@/lib/locale-context";
import type { Item, ItemKind, ItemStatus, NewItem } from "@/lib/types";

import { CardBoundary } from "./CardBoundary";
import { tauriSource } from "./data/tauri-source";
import type { LocalItem } from "./data/source";
import "./app.css";

type Access = {
  has_access: boolean;
  user_id?: string;
  server_url?: string;
};

const KINDS: Array<{ kind: ItemKind | null; label: string; Icon: typeof IconList }> = [
  { kind: null, label: "Все записи", Icon: IconList },
  { kind: "movie", label: "Фильмы", Icon: IconFilm },
  { kind: "tv", label: "Сериалы", Icon: IconTv },
  { kind: "anime", label: "Аниме", Icon: IconAnime },
  { kind: "book", label: "Книги", Icon: IconBook },
  { kind: "game", label: "Игры", Icon: IconGame },
];

export function App() {
  const { t } = useI18n();
  const [access, setAccess] = useState<Access | null>(null);
  const [items, setItems] = useState<LocalItem[]>([]);
  const [searchResults, setSearchResults] = useState<LocalItem[] | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ItemKind | null>(null);
  const [statusFilter, setStatusFilter] = useState<ItemStatus | "">("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState<{ changes_after: number; last_seq: number } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<LocalItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftStatus, setDraftStatus] = useState<ItemStatus>("planned");
  const [draftRating, setDraftRating] = useState("");
  const [draftReview, setDraftReview] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<ItemKind>("movie");
  const [newStatus, setNewStatus] = useState<ItemStatus>("planned");
  const [server, setServer] = useState("https://j3ynet.site");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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

  async function load() {
    try {
      setError("");
      const [nextItems, db] = await Promise.all([
        tauriSource.list() as Promise<LocalItem[]>,
        invoke<{ path: string; outbox: number; schema_version: number; media_files: number }>("local_db_status"),
      ]);
      // Media cache arrives in T109; until then a remote /media URL would be a
      // broken image inside the Tauri WebView.
      setItems(nextItems);
      setAction(`${db.path} · schema ${db.schema_version} · outbox ${db.outbox} · обложек ${db.media_files}`);
      const loaded: Record<string, string> = {};
      await Promise.all(
        nextItems.map(async (item) => {
          if (!item.cover_key) return;
          const data = await invoke<string | null>("local_cover_data", { key: item.cover_key });
          if (data) loaded[item.cover_key] = data;
        }),
      );
      setCovers(loaded);
      const expected = nextItems.filter((item) => item.cover_key).length;
      if (expected > 0 && Object.keys(loaded).length === 0) {
        setError("Обложки есть в кэше, но локальный файл не читается");
      }
    } catch (cause) {
      setError(String(cause));
    }
  }

  useEffect(() => {
    void boot().catch((cause) => {
      setError(String(cause));
      setAccess({ has_access: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (access?.has_access) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access?.has_access]);

  useEffect(() => {
    if (!access?.has_access) return;
    const needle = query.trim();
    if (!needle) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      tauriSource
        .search(needle)
        .then((results) => {
          if (!cancelled) setSearchResults(results as LocalItem[]);
        })
        .catch((cause) => {
          if (!cancelled) setError(String(cause));
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [access?.has_access, query]);

  useEffect(() => {
    if (!access?.has_access) return;
    void refreshSyncStatus();
    const timer = window.setInterval(() => void refreshSyncStatus(), 30_000);
    window.addEventListener("focus", refreshSyncStatus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshSyncStatus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access?.has_access]);

  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const item of items) result.set(item.kind, (result.get(item.kind) ?? 0) + 1);
    return result;
  }, [items]);

  const visibleItems = useMemo(() => {
    const source = searchResults ?? items;
    return source.filter(
      (item) =>
        (!kindFilter || item.kind === kindFilter) &&
        (!statusFilter || item.status === statusFilter),
    );
  }, [items, searchResults, kindFilter, statusFilter]);

  const displayItems = visibleItems.map((item) => ({
    ...item,
    cover_key: item.cover_key && covers[item.cover_key] ? item.cover_key : null,
  }));

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await invoke("local_sign_in", { input: { server_url: server, email, password } });
      setPassword("");
      await boot();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function signInGoogle() {
    setBusy(true);
    setError("");
    try {
      await invoke("local_google_sign_in", { input: { server_url: server } });
      await boot();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setError("");
    try {
      const report = await invoke<{ pushed: number; pulled: number; conflicts: number; media: number; last_seq: number }>("local_sync");
      const summary = `Синхронизировано: отправлено ${report.pushed}, получено ${report.pulled}, обложек ${report.media}, конфликтов ${report.conflicts}`;
      setSyncMessage(report.pushed + report.pulled + report.media === 0 ? `${summary} — изменений не было` : summary);
      setSyncStatus({ changes_after: 0, last_seq: report.last_seq });
      await load();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSyncing(false);
    }
  }

  async function refreshSyncStatus() {
    try {
      const status = await invoke<{ changes_after: number; last_seq: number }>("local_sync_status");
      setSyncStatus(status);
    } catch {
      setSyncStatus(null);
    }
  }

  function openItem(item: LocalItem) {
    setSelected(item);
    setDraftTitle(item.title);
    setDraftStatus(item.status);
    setDraftRating(item.rating == null ? "" : String(item.rating));
    setDraftReview(item.review ?? "");
  }

  async function saveSelected(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const rating = draftRating.trim() === "" ? null : Number(draftRating);
      const updated = await tauriSource.update(selected.id, {
        title: draftTitle.trim(),
        status: draftStatus,
        rating: rating && rating >= 1 && rating <= 10 ? rating : null,
        review: draftReview,
      });
      if (updated) {
        setSelected({ ...updated, pending: true });
        setDraftTitle(updated.title);
        setDraftStatus(updated.status);
        setDraftRating(updated.rating == null ? "" : String(updated.rating));
        setDraftReview(updated.review ?? "");
      }
      await load();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!newTitle.trim()) return;
    setBusy(true);
    setError("");
    try {
      const input: NewItem = { kind: newKind, title: newTitle.trim(), status: newStatus };
      await tauriSource.create(input);
      setNewTitle("");
      setCreating(false);
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
      <main className="desktop-auth">
        <header className="desktop-head">
          <h1><Logo size={26} /> jey.net</h1>
          <p className="desktop-muted">Первый вход нужен один раз. Дальше библиотека работает без сервера.</p>
        </header>
        <Card title="Вход">
          <form className="desktop-form" onSubmit={signIn}>
            <Input label="Сервер" value={server} onChange={(event) => setServer(event.target.value)} />
            <Input label="Email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <Input label="Пароль" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <div className="desktop-actions">
              <Button loading={busy} type="submit">Войти</Button>
              <Button disabled={busy} onClick={() => void signInGoogle()} type="button" variant="secondary">Войти через Google</Button>
            </div>
          </form>
          {error ? <p className="desktop-error">{error}</p> : null}
        </Card>
      </main>
    );
  }

  if (creating) {
    return (
      <main className="desktop-app">
        <header className="desktop-topbar">
          <div className="desktop-brand"><Logo size={22} /><span>jey.net</span></div>
          <div className="desktop-actions">
            <Button variant="secondary" size="sm" onClick={() => setCreating(false)}>← Назад к записям</Button>
          </div>
        </header>
        <div className="desktop-detail">
          <PageHeader title="Добавить запись" />
          <Card title="Новая запись">
            <form className="desktop-form desktop-form-column" onSubmit={create}>
              <Select label="Тип" value={newKind} onChange={(event) => setNewKind(event.target.value as ItemKind)}>
                <option value="movie">Фильм</option>
                <option value="tv">Сериал</option>
                <option value="anime">Аниме</option>
                <option value="book">Книга</option>
                <option value="game">Игра</option>
              </Select>
              <Input autoFocus label="Название" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} required maxLength={300} />
              <Select label="Статус" value={newStatus} onChange={(event) => setNewStatus(event.target.value as ItemStatus)}>
                <option value="planned">Запланировано</option>
                <option value="in_progress">В процессе</option>
                <option value="done">Готово</option>
                <option value="dropped">Брошено</option>
              </Select>
              <div className="desktop-actions">
                <Button loading={busy} type="submit">Добавить</Button>
                <Button onClick={() => setCreating(false)} type="button" variant="secondary">Отмена</Button>
              </div>
            </form>
          </Card>
        </div>
      </main>
    );
  }

  if (selected) {
    return (
      <main className="desktop-app">
        <header className="desktop-topbar">
          <div className="desktop-brand"><Logo size={22} /><span>jey.net</span></div>
          <div className="desktop-actions">
            <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>← Назад к записям</Button>
          </div>
        </header>
        <div className="desktop-detail">
          <PageHeader title={selected.title} subtitle={`${selected.kind} · ${selected.status}`} />
          <Card title="Запись">
            <form className="desktop-form desktop-form-column" onSubmit={saveSelected}>
              <Input label="Название" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} required maxLength={300} />
              <Select label="Статус" value={draftStatus} onChange={(event) => setDraftStatus(event.target.value as ItemStatus)}>
                <option value="planned">Запланировано</option>
                <option value="in_progress">В процессе</option>
                <option value="done">Готово</option>
                <option value="dropped">Брошено</option>
              </Select>
              <Input label="Оценка (1–10)" type="number" min={1} max={10} value={draftRating} onChange={(event) => setDraftRating(event.target.value)} />
              <Textarea label="Рецензия" value={draftReview} onChange={(event) => setDraftReview(event.target.value)} rows={8} />
              <div className="desktop-actions">
                <Button loading={busy} type="submit">Сохранить</Button>
                <Button onClick={() => setSelected(null)} type="button" variant="secondary">Отмена</Button>
                <Button onClick={async () => {
                  if (!window.confirm(`Удалить «${selected.title}»?`)) return;
                  await tauriSource.delete(selected.id);
                  setSelected(null);
                  await load();
                }} type="button" variant="secondary">Удалить</Button>
              </div>
            </form>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="desktop-app">
      <header className="desktop-topbar">
        <div className="desktop-brand"><Logo size={22} /><span>jey.net</span></div>
        <nav className="desktop-sections">
          <span className="desktop-section-active">{t("nav.items")}</span>
          <span className="desktop-section-muted">Коллекции</span>
        </nav>
        <div className="desktop-actions">
          <Button loading={syncing} size="sm" onClick={() => void sync()}>{syncing ? "Синхронизация…" : "Синхронизировать"}</Button>
          <details className="desktop-tools-menu">
            <summary aria-label="Дополнительные действия">⋯</summary>
            <div className="desktop-tools-popover">
              <Button variant="secondary" size="sm" onClick={async () => {
                const report = await invoke<{ path: string }>("local_export_json");
                setAction(`Экспорт: ${report.path}`);
              }}>Экспорт JSON</Button>
              <Button variant="secondary" size="sm" onClick={async () => {
                const report = await invoke<{ path: string; items: number; media_files: number }>("local_backup");
                setAction(`Бэкап: ${report.path} · ${report.items} записей · ${report.media_files} файлов`);
              }}>Бэкап</Button>
              <Button variant="secondary" size="sm" onClick={async () => {
                await invoke("local_sign_out");
                setAccess(null);
              }}>Выйти</Button>
            </div>
          </details>
        </div>
      </header>

      <div className="desktop-layout">
        <aside className="desktop-sidebar">
          <Card title="Типы">
            <div className="desktop-type-list">
              {KINDS.map(({ kind, label, Icon }) => (
                <button
                  className={`desktop-type ${kindFilter === kind ? "desktop-type-active" : ""}`}
                  key={label}
                  onClick={() => setKindFilter(kind)}
                  type="button"
                >
                  <Icon size={14} />
                  <span>{label}</span>
                  <span className="desktop-type-count">{kind ? counts.get(kind) ?? 0 : items.length}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card title="Фильтры">
            <div className="desktop-filter-form">
              <Input label="Поиск" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или автор" />
              <Select label="Статус" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ItemStatus | "")}>
                <option value="">Любой статус</option>
                <option value="planned">Запланировано</option>
                <option value="in_progress">В процессе</option>
                <option value="done">Готово</option>
                <option value="dropped">Брошено</option>
              </Select>
              <Button onClick={() => { setKindFilter(null); setStatusFilter(""); setQuery(""); }} type="button" variant="secondary">Сбросить</Button>
            </div>
          </Card>
        </aside>

        <div className="desktop-main">
          <PageHeader
            action={<Button onClick={() => setCreating(true)}>Добавить запись</Button>}
            title={t("nav.items")}
          />
          {syncStatus && syncStatus.changes_after > 0 ? (
            <div className="desktop-banner">
              Есть изменения в вебе: {syncStatus.changes_after}.{" "}
              <button className="desktop-banner-action" onClick={() => void sync()} type="button">Синхронизировать</button>
            </div>
          ) : null}
          {error ? <p className="desktop-error">{error}</p> : null}
          {syncMessage ? <p className="desktop-sync-result">{syncMessage}</p> : null}
          {action ? <p className="desktop-muted desktop-path">{action}</p> : null}
          <ul className="desktop-list">
            {displayItems.map((item) => (
              <li key={item.id} className="desktop-list-item">
                <CardBoundary title={item.title}>
                  <ItemCard
                    coverSrc={item.cover_key ? covers[item.cover_key] : undefined}
                    item={item as Item}
                    href={`#${item.id}`}
                    onOpen={() => openItem(item)}
                  />
                </CardBoundary>

              </li>
            ))}
          </ul>
          {visibleItems.length === 0 ? <p className="desktop-empty">Записей пока нет.</p> : null}
        </div>
      </div>
    </main>
  );
}
