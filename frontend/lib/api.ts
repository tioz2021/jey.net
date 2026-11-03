/**
 * The single entry point to the server.
 *
 * Everything goes through `request`: it sends cookies, parses the error
 * envelope into `ApiError`, and sends the browser to the login page when the
 * session is gone. Pages call the `api` object and never `fetch` directly.
 */

import { ApiError } from "./errors";
import type {
  ImportReport,
  UploadResponse,
  Item,
  ItemFilters,
  ItemList,
  ItemPatch,
  ItemResponse,
  NewItem,
  Stats,
  TagCount,
  TvSeasonResponse,
  MovieDetailsResponse,
  MovieSearchItem,
  TagsResponse,
  UserResponse,
} from "./types";

const BASE = "/api/v1";

/** Pages that must not bounce to themselves on a 401. */
const PUBLIC_PATHS = new Set(["/login", "/register"]);

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Set to false on the login form: a 401 there is a wrong password. */
  redirectOnUnauthorized?: boolean;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: ApiError["details"];
    request_id?: string;
  };
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    body,
    redirectOnUnauthorized = true,
    headers,
    ...rest
  } = options;

  const isFormData = body instanceof FormData;

  const response = await fetch(`${BASE}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      Accept: "application/json",
      // The browser sets the multipart boundary itself.
      ...(body === undefined || isFormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...headers,
    },
    body:
      body === undefined
        ? undefined
        : isFormData
          ? body
          : JSON.stringify(body),
  });

  // 204 and empty bodies carry nothing to parse.
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const envelope = (payload ?? {}) as ErrorEnvelope;
    const error = envelope.error;

    const apiError = new ApiError(
      response.status,
      error?.code ?? "unknown",
      error?.message ?? `HTTP ${response.status}`,
      error?.details ?? null,
      error?.request_id ?? null,
    );

    if (response.status === 401 && redirectOnUnauthorized) {
      redirectToLogin();
    }

    throw apiError;
  }

  return payload as T;
}

function redirectToLogin() {
  if (typeof window === "undefined") {
    return;
  }

  const { pathname, search } = window.location;
  if (PUBLIC_PATHS.has(pathname)) {
    return;
  }

  const next = encodeURIComponent(`${pathname}${search}`);
  window.location.assign(`/login?next=${next}`);
}

/** Drops empty values so the query string stays readable. */
function toQuery(filters: Record<string, unknown>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    params.set(key, String(value));
  }

  const query = params.toString();

  return query ? `?${query}` : "";
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  display_name: string;
  locale?: string;
}

export interface ProfilePatch {
  display_name?: string;
  locale?: string;
  is_public?: boolean;
  public_statuses?: string[];
  public_show_progress?: boolean;
}

export interface PasswordChangeInput {
  current_password: string;
  new_password: string;
}

export const auth = {
  login: (input: LoginInput) =>
    request<UserResponse>("/auth/login", {
      method: "POST",
      body: input,
      redirectOnUnauthorized: false,
    }),

  register: (input: RegisterInput) =>
    request<UserResponse>("/auth/register", {
      method: "POST",
      body: input,
      redirectOnUnauthorized: false,
    }),

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  /** Ends every session of the account, including the current one. */
  logoutAll: () => request<void>("/me/sessions/revoke-all", { method: "POST" }),

  me: (options: { redirectOnUnauthorized?: boolean } = {}) =>
    request<UserResponse>("/me", {
      redirectOnUnauthorized: options.redirectOnUnauthorized,
    }),

  updateMe: (patch: ProfilePatch) =>
    request<UserResponse>("/me", { method: "PATCH", body: patch }),

  setAvatar: (uploadId: string) =>
    request<UserResponse>("/me/avatar", {
      method: "POST",
      body: { upload_id: uploadId },
    }),

  clearAvatar: () =>
    request<UserResponse>("/me/avatar", { method: "DELETE" }),

  setBanner: (uploadId: string) =>
    request<UserResponse>("/me/banner", {
      method: "POST",
      body: { upload_id: uploadId },
    }),

  clearBanner: () =>
    request<UserResponse>("/me/banner", { method: "DELETE" }),

  changePassword: (input: PasswordChangeInput) =>
    request<void>("/me/password", { method: "PATCH", body: input }),

  deleteMe: (password?: string) =>
    request<void>("/me", {
      method: "DELETE",
      body: password ? { password } : {},
    }),

  requestPasswordReset: (email: string) =>
    request<void>("/auth/password-reset/request", {
      method: "POST",
      body: { email },
      redirectOnUnauthorized: false,
    }),

  confirmPasswordReset: (token: string, newPassword: string) =>
    request<void>("/auth/password-reset/confirm", {
      method: "POST",
      body: { token, new_password: newPassword },
      redirectOnUnauthorized: false,
    }),

  verifyEmail: (token: string) =>
    request<void>("/auth/verify-email", {
      method: "POST",
      body: { token },
      redirectOnUnauthorized: false,
    }),
};

export const items = {
  list: (filters: ItemFilters = {}) =>
    request<ItemList>(`/items${toQuery({ ...filters })}`),

  get: (id: string) => request<ItemResponse>(`/items/${id}`),

  create: (input: NewItem) =>
    request<ItemResponse>("/items", { method: "POST", body: input }),

  update: (id: string, patch: ItemPatch) =>
    request<ItemResponse>(`/items/${id}`, { method: "PATCH", body: patch }),

  remove: (id: string) =>
    request<void>(`/items/${id}`, { method: "DELETE" }),

  restore: (id: string) =>
    request<ItemResponse>(`/items/${id}/restore`, { method: "POST" }),

  purge: (id: string) =>
    request<void>(`/items/${id}/purge`, { method: "DELETE" }),

  emptyTrash: () =>
    request<{ purged: number }>("/trash", { method: "DELETE" }),

  setCover: (id: string, uploadId: string) =>
    request<ItemResponse>(`/items/${id}/cover`, {
      method: "POST",
      body: { upload_id: uploadId },
    }),

  episodes: (id: string, season: number) =>
    request<TvSeasonResponse>(
      `/items/${id}/episodes?season=${encodeURIComponent(String(season))}`,
    ),

  toggleEpisode: (
    id: string,
    season: number,
    episode: number,
    watched: boolean,
  ) =>
    request<{ item: Item; watched_total: number }>(
      `/items/${id}/episodes/${season}/${episode}`,
      { method: "POST", body: { watched } },
    ),

  refresh: (id: string) =>
    request<ItemResponse>(`/items/${id}/refresh`, { method: "POST" }),

  setPoster: (id: string) =>
    request<ItemResponse>(`/items/${id}/poster`, { method: "POST" }),

  clearCover: (id: string) =>
    request<ItemResponse>(`/items/${id}/cover`, { method: "DELETE" }),
};

export const uploads = {
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);

    return request<UploadResponse>("/uploads", { method: "POST", body: form });
  },
};

export const tags = {
  list: () => request<TagsResponse>("/tags"),

  remove: (id: string) => request<void>(`/tags/${id}`, { method: "DELETE" }),

  rename: (id: string, name: string) =>
    request<{ tag: TagCount }>(`/tags/${id}`, {
      method: "PATCH",
      body: { name },
    }),

  merge: (id: string, intoId: string) =>
    request<{ merged_into: string }>(`/tags/${id}/merge`, {
      method: "POST",
      body: { into_id: intoId },
    }),
};

export const movies = {
  search: (q: string) =>
    request<{ results: MovieSearchItem[] }>(
      `/movies/search?q=${encodeURIComponent(q)}`,
    ),

  get: (id: number) =>
    request<{ movie: MovieDetailsResponse }>(`/movies/${id}`),
};

export const publicItems = {
  episodes: (userId: string, itemId: string, season: number) =>
    fetch(
      `/api/v1/public/users/${encodeURIComponent(userId)}/items/${encodeURIComponent(itemId)}/episodes?season=${encodeURIComponent(String(season))}`,
      { cache: "no-store" },
    ).then(async (response) => {
      if (!response.ok) {
        throw new Error("public episodes failed");
      }
      return (await response.json()) as TvSeasonResponse;
    }),
};

export const tv = {
  search: (q: string) =>
    request<{ results: MovieSearchItem[] }>(
      `/tv/search?q=${encodeURIComponent(q)}`,
    ),

  get: (id: number) =>
    request<{ movie: MovieDetailsResponse }>(`/tv/${id}`),
};

export const stats = {
  get: () => request<Stats>("/stats"),
};

export const transfer = {
  import: (file: { items: NewItem[] }) =>
    request<ImportReport>("/import", { method: "POST", body: file }),
};

export const api = { auth, items, movies, publicItems, tv, tags, stats, transfer, uploads };

export type { Item, ItemFilters, ItemList, ItemPatch, NewItem, Stats };
