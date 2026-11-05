/**
 * Wire types, mirroring `docs/protocol.md` and the server's views.
 *
 * These are the only place where the JSON shape is described; pages and
 * components work with these types and never touch raw responses.
 */

export type ItemKind = "movie" | "tv" | "book" | "game" | "anime" | "image" | "other";

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
  public_statuses: string[];
  public_show_progress: boolean;
  avatar_key: string | null;
  banner_key: string | null;
  has_password: boolean;
  created_at: string;
}

export interface CastMember {
  tmdb_id: number;
  name: string;
  character: string | null;
  profile_path: string | null;
}

export interface MovieTranslation {
  title: string;
  overview: string | null;
  tagline: string | null;
  director: string | null;
  cast: Array<CastMember | string>;
  genres: string[];
  countries: string[];
  languages: string[];
  companies: string[];
}

export interface MovieDetails {
  original_title: string;
  overview: string | null;
  tagline: string | null;
  runtime: number | null;
  release_date: string | null;
  status: string | null;
  director: string | null;
  authors?: string[] | null;
  publisher?: string | null;
  page_count?: number | null;
  isbn?: string | null;
  cover_id?: number | null;
  cover_url?: string | null;
  platforms?: string[];
  developers?: string[];
  publishers?: string[];
  anime_format?: string | null;
  anime_season?: string | null;
  /** Old snapshots kept cast as plain names; the server normalises new ones. */
  cast: Array<CastMember | string>;
  genres: string[];
  countries: string[];
  languages: string[];
  companies: string[];
  budget: number | null;
  revenue: number | null;
  imdb_id: string | null;
  vote_average_tenths: number | null;
  vote_count: number | null;
  translations?: Record<string, MovieTranslation>;
  number_of_seasons?: number | null;
  number_of_episodes?: number | null;
  seasons?: SeasonSummary[];
  watched_episodes?: WatchedEpisode[];
}

export interface WatchedEpisode {
  season_number: number;
  episode_number: number;
}

export interface TvEpisode {
  episode_number: number;
  name: string;
  overview: string | null;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  watched: boolean;
}

export interface TvSeasonResponse {
  season: { season_number: number; name: string };
  episodes: TvEpisode[];
}

export interface SeasonSummary {
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
}

export interface MovieSearchItem {
  tmdb_id: number;
  title: string;
  original_title: string;
  year: number | null;
  poster_path: string | null;
  overview: string | null;
}

export interface BookSearchItem {
  book_id: string;
  source: "openlibrary" | "googlebooks" | string;
  title: string;
  authors: string[];
  year: number | null;
  cover_id: number | null;
  cover_url?: string | null;
  isbn: string | null;
}

export interface BookDetailsResponse {
  book_id: string;
  title: string;
  authors: string[];
  year: number | null;
  overview: string | null;
  publisher: string | null;
  page_count: number | null;
  isbn: string | null;
  cover_id: number | null;
  cover_url: string | null;
  source: "openlibrary" | "googlebooks" | string;
  subjects: string[];
}

export interface GameSearchItem {
  igdb_id: number;
  title: string;
  year: number | null;
  cover_url: string | null;
  platforms: string[];
  summary: string | null;
}

export interface AnimeSearchItem {
  anime_id: string;
  source: "anilist" | "shikimori" | string;
  title: string;
  year: number | null;
  cover_url: string | null;
  format: string | null;
  episodes: number | null;
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
  public_hidden: boolean;
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
  public_hidden?: boolean;
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
  followers: number;
  following: number;
}

export interface PublicItem {
  id: string;
  kind: ItemKind;
  title: string;
  subtitle: string | null;
  year: number | null;
  status: ItemStatus;
  rating: number | null;
  review: string | null;
  cover_key: string | null;
  external_source: string | null;
  external_id: string | null;
  details: MovieDetails | null;
  public_hidden: boolean;
  titles?: Record<string, string> | null;
  directors?: Record<string, string> | null;
  genres?: Record<string, string[]> | null;
  updated_at: string;
  progress_visible?: boolean;
}

export interface TasteGenre {
  name: string;
  count: number;
}

export interface TasteRecommendation extends PublicItem {
  author_id: string;
  author_name: string;
  matched_genres: string[];
}

export interface SimilarItem {
  source: string;
  external_id: string;
  title: string;
  year: number | null;
  poster_path: string | null;
  cover_url: string | null;
  cover_id: number | null;
  kind: string;
  href: string;
}

export interface FriendRecommendation extends PublicItem {
  author_id: string;
  friends: string[];
  friend_count: number;
  average_rating: number;
}

export interface PublicUserCard {
  id: string;
  display_name: string;
  avatar_key: string | null;
  item_count: number;
  followers: number;
  created_at: string;
  last_active: string | null;
}

export interface FollowingProfile {
  id: string;
  display_name: string;
  avatar_key: string | null;
  notifications: boolean;
}

export interface BlockedProfile {
  id: string;
  display_name: string;
  avatar_key: string | null;
  blocked_at: string;
}

export interface NotificationItem {
  id: string;
  kind: "follow" | string;
  actor_id: string;
  actor_name: string;
  actor_avatar: string | null;
  item_id: string | null;
  item_title: string | null;
  item_kind: string | null;
  created_at: string;
  read: boolean;
}

export interface FollowState {
  following: boolean;
  blocked?: boolean;
  followers: number;
  following_count: number;
}

export interface FeedItem extends PublicItem {
  author_id: string;
  author_name: string;
}

export interface PublicProfileResponse {
  profile: PublicProfile;
  items: PublicItem[];
  preview?: boolean;
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

