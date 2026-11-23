/**
 * Wire types, mirroring `docs/protocol.md` and the server's views.
 *
 * These are the only place where the JSON shape is described; pages and
 * components work with these types and never touch raw responses.
 */

import type {
  AnimeSearchItem,
  BookDetails as BookDetailsResponse,
  BookSearchItem,
  GameSearchItem,
  ItemFilters,
  MovieDetailsResponse,
  MovieSearchItem,
  ItemKind,
  ItemStatus,
  ChatDeviceView as ChatDevice,
  ChatEncryptedMessageView as ChatEncryptedMessage,
  ChatEnvelopeView as ChatEnvelope,
  ChatLastMessageView as ChatLastMessage,
  ChatMessageView as ChatMessage,
  ChatPeerView as ChatPeer,
  ChatReactionView as ChatReaction,
  ChatSettingsView as ChatSettings,
  ChatThreadView as ChatThread,
  CollectionDetailResponse as CollectionDetail,
  CommentListResponse,
  CommentView as Comment,
  CollectionView as Collection,
  ItemView as Item,
  PublicCollectionResponse as PublicCollection,
  PublicCollectionSummary,
  PublicItem,
  PublicProfileResponse,
  PublicProfileView as PublicProfile,
  PublicTierListSummary,
  TierListDetailResponse as TierListDetail,
  TvEpisodeView as TvEpisode,
  TvSeasonResponse,
  UploadResponse,
  UploadView as Upload,
  TierListItemView as TierListItem,
  TierListView as TierList,
  UserView as User,
} from "./generated";

export type { ItemKind, ItemStatus } from "./generated";

export type Sort =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "rating_desc"
  | "title_asc"
  | "year_desc";

export type {
  AnimeSearchItem,
  BookDetails as BookDetailsResponse,
  BookSearchItem,
  ChatDeviceView as ChatDevice,
  ChatEncryptedMessageView as ChatEncryptedMessage,
  ChatEnvelopeView as ChatEnvelope,
  ChatLastMessageView as ChatLastMessage,
  ChatMessageView as ChatMessage,
  ChatPeerView as ChatPeer,
  ChatReactionView as ChatReaction,
  ChatSettingsView as ChatSettings,
  ChatThreadView as ChatThread,
  CollectionDetailResponse as CollectionDetail,
  CommentListResponse,
  CommentView as Comment,
  GameSearchItem,
  ItemFilters,
  MovieDetailsResponse,
  MovieSearchItem,
  CollectionView as Collection,
  ItemView as Item,
  PublicCollectionResponse as PublicCollection,
  PublicCollectionSummary,
  PublicItem,
  PublicProfileResponse,
  PublicProfileView as PublicProfile,
  PublicTierListSummary,
  TierListDetailResponse as TierListDetail,
  TvEpisodeView as TvEpisode,
  TvSeasonResponse,
  UploadResponse,
  UploadView as Upload,
  TierListItemView as TierListItem,
  TierListView as TierList,
  UserView as User,
} from "./generated";
export type { ItemPatch, NewItem } from "./generated";

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

export interface ItemProgress {
  current: number;
  total: number | null;
  unit: "episode" | "page" | "hour";
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
  progress?: ItemProgress | null;
  last_action_at?: string | null;
  rewatch_count?: number | null;
}

export interface WatchedEpisode {
  season_number: number;
  episode_number: number;
}

export interface SeasonSummary {
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
}

export type TierListKind = "all" | "movie" | "tv" | "anime" | "book" | "game" | "image" | "other";

export type TierName = "S" | "A" | "B" | "C" | "D" | "E" | "F";

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

export interface TasteGenre {
  name: string;
  count: number;
}

export interface TasteRecommendation extends PublicItem {
  author_id: string;
  author_name: string;
  author_handle: string;
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

export interface FriendReview {
  author_name: string;
  author_handle: string;
  rating: number;
  review: string;
  updated_at: string;
}

export interface FriendRecommendation extends PublicItem {
  author_id: string;
  author_handle: string;
  friends: string[];
  friend_people?: Array<{ name: string; handle: string }>;
  friend_count: number;
  average_rating: number;
  reviews?: FriendReview[];
}

export interface CommunityRecommendation extends PublicItem {
  author_id: string;
  author_handle: string;
  people: Array<{ name: string; handle: string }>;
  people_count: number;
  average_rating: number;
  reviews?: FriendReview[];
  review_count?: number;
}

export interface LikedItem extends PublicItem {
  author_id: string;
  author_name: string;
  author_handle: string;
  liked_at: string;
}

export interface PublicUserCard {
  id: string;
  handle: string;
  display_name: string;
  avatar_key: string | null;
  item_count: number;
  followers: number;
  created_at: string;
  last_active: string | null;
}

export interface FollowingProfile {
  id: string;
  handle?: string;
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

export interface Report {
  id: string;
  target_type: "item" | "comment" | "profile" | "chat_message";
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  reporter_name: string;
  target_label: string;
  target_preview: string | null;
  target_author: string | null;
  target_author_id: string | null;
  target_url: string | null;
  target_available: boolean;
  resolved_at: string | null;
}

export interface NotificationPreferences {
  follow: boolean;
  item: boolean;
  comment: boolean;
  reaction: boolean;
}

export interface NotificationItem {
  id: string;
  kind: "follow" | string;
  actor_id: string;
  actor_name: string;
  actor_avatar: string | null;
  item_id: string | null;
  item_slug: string | null;
  item_author_id: string | null;
  item_author_handle: string | null;
  item_title: string | null;
  item_kind: string | null;
  comment_id: string | null;
  comment_body: string | null;
  report_id: string | null;
  created_at: string;
  read: boolean;
}

export interface AnalyticsSummary {
  days: number;
  counts: Record<string, number>;
  daily: Array<{ date: string; views: number; events: number }>;
  paths: Array<{ path: string; count: number }>;
  rate_limit: {
    active_blocks: number;
    tracked: number;
    max_attempts: number;
    drops_today: number;
    drops_7d: number;
  };
  retention: {
    unique_7d: number;
    unique_30d: number;
    new_7d: number;
    returning_7d: number;
  };
  cohorts: Array<{
    cohort: string;
    registered: number;
    added_item: number;
    returned: number;
  }>;
}

export interface AudienceUser {
  id: string;
  display_name: string;
  email: string;
  last_path: string | null;
  last_seen_at: string;
}

export interface AudienceRegistration {
  id: string;
  display_name: string;
  email: string;
  is_public: boolean;
  is_admin: boolean;
  created_at: string;
  last_seen_at: string | null;
  items: number;
}

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  is_public: boolean;
  is_admin: boolean;
  role: "user" | "viewer" | "moderator" | "admin";
  is_test: boolean;
  suspended_at: string | null;
  created_at: string;
  last_seen_at: string | null;
  online: boolean;
  items: number;
}

export interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
  test_total: number;
}

export interface SiteStatus {
  announcement: string | null;
  announcement_title: string | null;
  announcement_active: boolean;
  announcement_version: number;
  maintenance: boolean;
  registration_enabled: boolean;
}

export interface SiteSettings extends SiteStatus {
  updated_at: string;
}

export interface SystemStatus {
  version: string;
  services: { api: string; web: string; caddy: string; postgres: string };
  disk: { total: number; used: number };
  memory: { total: number; available: number };
  migrations: { count: number; latest: number | null; installed_at: string | null };
  errors_24h: number;
  metrics?: {
    requests: { total: number; "2xx": number; "3xx": number; "4xx": number; "5xx": number };
    latency_ms: {
      avg: number;
      max: number;
      buckets: Record<string, number>;
    };
  };
  backup: {
    ok?: boolean;
    missing?: boolean;
    finished_at?: string;
    file?: string;
    bytes?: number;
    sha256?: string;
  };
  last_deploy_at: string | null;
}

export interface SystemErrorGroup {
  path: string;
  status: number;
  count: number;
  first_seen: string;
  last_seen: string;
  last_request_id: string | null;
}

export interface SystemErrorsResponse {
  errors: SystemErrorGroup[];
  total: number;
  days: number;
}

export interface AdminAction {
  id: number;
  admin_id: string | null;
  admin_name: string;
  action: string;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AdminActionsResponse {
  actions: AdminAction[];
  total: number;
}

export interface AnalyticsAudience {
  stats: {
    total_users: number;
    public_users: number;
    online: number;
    new_7d: number;
  };
  online: AudienceUser[];
  registrations: AudienceRegistration[];
}

export interface FollowState {
  following: boolean;
  blocked?: boolean;
  followers: number;
  following_count: number;
}

export type FeedKindCounts = Partial<Record<ItemKind | "all", number>>;

export interface FeedItem extends PublicItem {
  author_id: string;
  author_name: string;
  author_handle: string;
}

export interface ReactionLiker {
  id: string;
  name: string;
  avatar: string | null;
}

export interface UserResponse {
  user: User;
}

export interface ItemResponse {
  item: Item;
}

export interface ChatSharedItem {
  id: string;
  kind: string;
  title: string;
  year: number | null;
  rating: number | null;
  review: string | null;
  cover_key: string | null;
  url: string | null;
}
