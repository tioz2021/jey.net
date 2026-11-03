/**
 * Wire types, mirroring `docs/protocol.md` and the server's views.
 *
 * These are the only place where the JSON shape is described; pages and
 * components work with these types and never touch raw responses.
 */

export type ItemKind = "movie" | "book" | "image" | "other";

export type ItemStatus = "planned" | "in_progress" | "done" | "dropped";

export type Sort =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "rating_desc"
  | "title_asc"
  | "year_desc";

export interface User {
  id: string;
  email: string;
  display_name: string;
  locale: string;
  email_verified: boolean;
  is_public: boolean;
  avatar_key: string | null;
  banner_key: string | null;
  has_password: boolean;
  created_at: string;
}

export interface MovieDetails {
  original_title: string;
  overview: string | null;
  runtime: number | null;
  director: string | null;
  cast: string[];
  genres: string[];
}

export interface MovieSearchItem {
  tmdb_id: number;
  title: string;
  original_title: string;
  year: number | null;
  poster_path: string | null;
  overview: string | null;
}

export interface MovieDetailsResponse extends MovieDetails {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
}

export interface Item {
  id: string;
  kind: ItemKind;
  title: string;
  subtitle: string | null;
  year: number | null;
  status: ItemStatus;
  rating: number | null;
  review: string | null;
  source_url: string | null;
  cover_key: string | null;
  external_source: string | null;
  external_id: string | null;
  details: MovieDetails | null;
  details_fetched_at: string | null;
  tags: string[];
  revision: number;
  sync_seq: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface NewItem {
  kind: ItemKind;
  title: string;
  subtitle?: string | null;
  year?: number | null;
  status: ItemStatus;
  rating?: number | null;
  review?: string | null;
  source_url?: string | null;
  external_source?: string | null;
  external_id?: string | null;
  details?: MovieDetails | null;
  tags?: string[];
}

/** Partial update: absent fields are left untouched by the server. */
export type ItemPatch = Partial<NewItem>;

export interface ItemFilters {
  kind?: ItemKind;
  status?: ItemStatus;
  sort?: Sort;
  limit?: number;
  cursor?: string | null;
  q?: string;
  tag?: string;
  year_from?: number;
  year_to?: number;
  rating_min?: number;
  rating_max?: number;
  month?: string;
  include_deleted?: boolean;
  only_deleted?: boolean;
}

export interface ItemNeighbors {
  prev_id: string | null;
  next_id: string | null;
}

export interface ItemList {
  items: Item[];
  next_cursor: string | null;
}

export interface TagCount {
  id: string;
  name: string;
  item_count: number;
}

export interface YearCount {
  year: number;
  count: number;
}

export interface MonthCount {
  /** `YYYY-MM`. */
  month: string;
  count: number;
}

export interface Stats {
  total: number;
  by_kind: Record<ItemKind, number>;
  by_status: Record<ItemStatus, number>;
  average_rating: number;
  by_year: YearCount[];
  /** The last twelve months, including months without records. */
  by_month: MonthCount[];
}

export interface ImportReport {
  imported: number;
  skipped: number;
  total: number;
}

export interface PublicProfile {
  id: string;
  display_name: string;
  avatar_key: string | null;
  banner_key: string | null;
  locale: string;
  created_at: string;
}

export interface PublicItem {
  id: string;
  kind: ItemKind;
  title: string;
  subtitle: string | null;
  year: number | null;
  rating: number | null;
  review: string | null;
  cover_key: string | null;
  tags: string[];
  updated_at: string;
}

export interface PublicProfileResponse {
  profile: PublicProfile;
  items: PublicItem[];
}

export interface UserResponse {
  user: User;
}

export interface ItemResponse {
  item: Item;
}

export interface Upload {
  id: string;
  mime: string;
  size_bytes: number;
  width: number;
  height: number;
}

export interface UploadResponse {
  upload: Upload;
}

export interface TagsResponse {
  tags: TagCount[];
}
