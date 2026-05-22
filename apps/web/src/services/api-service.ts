import type {
  CatalogFilterState,
  CatalogListing,
  CatalogModelSummary,
  DashboardSummary,
  GpuListing,
  ProductType,
} from "../types/listing";
import type {
  PublishedListingDetail,
  SubmissionBundle,
  SubmissionProfile,
  SubmissionRecord,
} from "../types/submission";

function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${window.location.origin}/api`;
    }
  }

  if (import.meta.env.DEV) {
    return import.meta.env.VITE_API_BASE_URL?.trim() || "http://localhost:3001/api";
  }

  return "/api";
}

export const API_BASE = resolveApiBase();

interface ApiErrorShape {
  code: string;
  message: string;
  statusCode: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    total?: number;
    lastUpdated?: string;
    page?: number;
    perPage?: number;
    totalPages?: number;
  };
  message?: string;
  error?: ApiErrorShape;
}

interface DashboardPayload {
  summary: DashboardSummary | null;
  listings: GpuListing[];
}

export interface DashboardData {
  summary: DashboardSummary | null;
  featuredListings: GpuListing[];
  lastUpdated: string;
}

export interface CatalogData {
  listings: CatalogListing[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  lastUpdated: string;
}

export interface CatalogModelListData {
  models: CatalogModelSummary[];
  total: number;
  lastUpdated: string;
}

export interface CatalogModelDetailData {
  model: CatalogModelSummary;
  listings: CatalogListing[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  lastUpdated: string;
}

export interface ListingComment {
  id: string;
  listingId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface AuthMeData {
  profile: SubmissionProfile;
  authConfigured: boolean;
}

export interface SubmissionResultData {
  submission: SubmissionRecord;
  analysis: SubmissionBundle["analysis"];
  nextStep: string;
}

export interface AccountWatchlistItem {
  listingId: string;
  alertPrice: number | null;
  createdAt: string;
  updatedAt: string;
  isAlertTriggered: boolean;
  listing: CatalogListing | null;
}

export interface AccountNotificationData {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  kind: "published" | "comment" | "alert" | "review";
}

type JsonLike = object | Array<unknown> | null | undefined;

function buildHeaders(token?: string, contentType = "application/json"): HeadersInit {
  const headers: Record<string, string> = {};
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function apiFetch<T>(endpoint: string, options?: RequestInit & { token?: string; contentType?: string }): Promise<ApiResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...buildHeaders(options?.token, options?.contentType),
        ...(options?.headers ?? {}),
      },
    });

    const data = (await response.json()) as ApiResponse<T>;
    if (!response.ok || data.success === false) {
      throw new Error(data.error?.message ?? `API Error: ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function jsonRequest(method: string, body?: JsonLike, token?: string): RequestInit & { token?: string } {
  return {
    method,
    token,
    body: body == null ? undefined : JSON.stringify(body),
  };
}

export async function fetchDashboard(): Promise<DashboardData> {
  const response = await apiFetch<DashboardPayload>("/dashboard");

  return {
    summary: response.data.summary,
    featuredListings: response.data.listings ?? [],
    lastUpdated: response.meta?.lastUpdated ?? response.data.summary?.generatedAt ?? "",
  };
}

export async function fetchCatalog(
  filters: CatalogFilterState,
  page = 1,
  perPage = 5000,
  productType: ProductType = "gpu",
): Promise<CatalogData> {
  const params = new URLSearchParams();

  params.set("product", productType);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.brand !== "all") params.set("brand", filters.brand);
  if (filters.minPrice > 0) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice > 0 && filters.maxPrice < 100000) params.set("maxPrice", String(filters.maxPrice));
  params.set("sort", filters.sortBy);
  params.set("page", String(page));
  params.set("perPage", String(perPage));

  const response = await apiFetch<CatalogListing[]>(`/catalog?${params.toString()}`);

  return {
    listings: response.data ?? [],
    total: response.meta?.total ?? 0,
    page: response.meta?.page ?? page,
    perPage: response.meta?.perPage ?? perPage,
    totalPages: response.meta?.totalPages ?? 1,
    lastUpdated: response.meta?.lastUpdated ?? "",
  };
}

export async function fetchCatalogModels(search = "", limit = 500): Promise<CatalogModelListData> {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  params.set("limit", String(limit));

  const response = await apiFetch<CatalogModelSummary[]>(`/models?${params.toString()}`);
  return {
    models: response.data ?? [],
    total: response.meta?.total ?? response.data?.length ?? 0,
    lastUpdated: response.meta?.lastUpdated ?? "",
  };
}

export async function fetchCatalogModelDetail(slug: string, sort = "buyable_desc"): Promise<CatalogModelDetailData> {
  const params = new URLSearchParams();
  params.set("sort", sort);

  const response = await apiFetch<{ model: CatalogModelSummary; listings: CatalogListing[] }>(
    `/models/${encodeURIComponent(slug)}?${params.toString()}`,
  );

  return {
    model: response.data.model,
    listings: response.data.listings ?? [],
    total: response.meta?.total ?? response.data.listings.length,
    page: response.meta?.page ?? 1,
    perPage: response.meta?.perPage ?? response.data.listings.length,
    totalPages: response.meta?.totalPages ?? 1,
    lastUpdated: response.meta?.lastUpdated ?? "",
  };
}

export async function deleteCatalogListing(listingId: string, token: string | null): Promise<void> {
  await apiFetch(`/catalog/${encodeURIComponent(listingId)}`, {
    method: "DELETE",
    token: token ?? undefined,
  });
}

export async function restoreCatalogListings(token: string | null): Promise<void> {
  await apiFetch("/catalog/removed/restore", jsonRequest("POST", {}, token ?? undefined));
}

export async function fetchAccountWatchlist(token: string): Promise<AccountWatchlistItem[]> {
  const response = await apiFetch<AccountWatchlistItem[]>("/me/watchlist", { token });
  return response.data ?? [];
}

export async function saveAccountWatchlistItem(
  listingId: string,
  alertPrice: number | null,
  token: string,
): Promise<AccountWatchlistItem> {
  const response = await apiFetch<AccountWatchlistItem>("/me/watchlist", jsonRequest("POST", { listingId, alertPrice }, token));
  return response.data;
}

export async function deleteAccountWatchlistItem(listingId: string, token: string): Promise<void> {
  await apiFetch(`/me/watchlist/${encodeURIComponent(listingId)}`, {
    method: "DELETE",
    token,
  });
}

export async function fetchAccountNotifications(token: string): Promise<AccountNotificationData[]> {
  const response = await apiFetch<AccountNotificationData[]>("/me/notifications", { token });
  return response.data ?? [];
}

export async function fetchListingComments(listingId: string): Promise<ListingComment[]> {
  const response = await apiFetch<ListingComment[]>(`/listings/${encodeURIComponent(listingId)}/comments`);
  return response.data ?? [];
}

export async function createListingComment(
  listingId: string,
  input: { body: string },
  token: string,
): Promise<ListingComment> {
  const response = await apiFetch<ListingComment>(
    `/listings/${encodeURIComponent(listingId)}/comments`,
    jsonRequest("POST", input, token),
  );
  return response.data;
}

export async function adminHideListingComment(listingId: string, commentId: string, token: string): Promise<ListingComment> {
  const response = await apiFetch<ListingComment>(
    `/listings/${encodeURIComponent(listingId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: "DELETE",
      token,
    },
  );
  return response.data;
}

export async function fetchMe(token: string): Promise<AuthMeData> {
  const response = await apiFetch<AuthMeData>("/me", { token });
  return response.data;
}

export async function fetchMySubmissions(token: string): Promise<SubmissionBundle[]> {
  const response = await apiFetch<SubmissionBundle[]>("/my-submissions", { token });
  return response.data ?? [];
}

export async function fetchMySubmission(id: string, token: string): Promise<SubmissionBundle> {
  const response = await apiFetch<SubmissionBundle>(`/my-submissions/${id}`, { token });
  return response.data;
}

export async function fetchMySubmissionComments(id: string, token: string): Promise<ListingComment[]> {
  const response = await apiFetch<ListingComment[]>(`/my-submissions/${id}/comments`, { token });
  return response.data ?? [];
}

export async function deleteMySubmission(id: string, token: string): Promise<void> {
  await apiFetch(`/my-submissions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
}

export async function createLinkSubmission(sourceUrl: string, token: string): Promise<SubmissionRecord> {
  const response = await apiFetch<SubmissionRecord>("/submissions/link", jsonRequest("POST", { sourceUrl }, token));
  return response.data;
}

export interface NativeSubmissionInput {
  title: string;
  description: string;
  brand: string;
  model: string;
  category: string;
  price: number;
  currency: string;
  location: string;
  coverImageUrl?: string | null;
}

export async function createNativeSubmission(input: NativeSubmissionInput, token: string): Promise<SubmissionRecord> {
  const response = await apiFetch<SubmissionRecord>("/submissions/native", jsonRequest("POST", input, token));
  return response.data;
}

export async function updateSubmission(id: string, patch: Partial<NativeSubmissionInput>, token: string): Promise<SubmissionRecord> {
  const response = await apiFetch<SubmissionRecord>(`/submissions/${id}`, jsonRequest("PATCH", patch, token));
  return response.data;
}

export async function uploadSubmissionImages(id: string, files: File[], token: string): Promise<SubmissionBundle["images"]> {
  const form = new FormData();
  files.forEach((file) => form.append("images", file));

  const response = await apiFetch<SubmissionBundle["images"]>(`/submissions/${id}/images`, {
    method: "POST",
    token,
    body: form,
    contentType: "",
  });

  return response.data ?? [];
}

export async function submitSubmissionForReview(id: string, token: string): Promise<SubmissionResultData> {
  const response = await apiFetch<SubmissionResultData>(`/submissions/${id}/submit`, jsonRequest("POST", {}, token));
  return response.data;
}

export async function fetchReviewQueue(token: string): Promise<SubmissionBundle[]> {
  const response = await apiFetch<SubmissionBundle[]>("/admin/review-queue", { token });
  return response.data ?? [];
}

export async function fetchIngestQueue(token: string): Promise<SubmissionBundle[]> {
  const response = await apiFetch<SubmissionBundle[]>("/admin/ingest-queue", { token });
  return response.data ?? [];
}

export async function fetchReviewQueueItem(id: string, token: string): Promise<SubmissionBundle> {
  const response = await apiFetch<SubmissionBundle>(`/admin/review-queue/${id}`, { token });
  return response.data;
}

export async function approveSubmission(id: string, token: string): Promise<PublishedListingDetail> {
  const response = await apiFetch<PublishedListingDetail>(`/admin/submissions/${id}/approve`, jsonRequest("POST", {}, token));
  return response.data;
}

export async function rejectSubmission(id: string, note: string, token: string): Promise<SubmissionRecord> {
  const response = await apiFetch<SubmissionRecord>(`/admin/submissions/${id}/reject`, jsonRequest("POST", { note }, token));
  return response.data;
}

export async function requestSubmissionChanges(id: string, note: string, token: string): Promise<SubmissionRecord> {
  const response = await apiFetch<SubmissionRecord>(`/admin/submissions/${id}/request-changes`, jsonRequest("POST", { note }, token));
  return response.data;
}

export async function retrySubmissionIngest(
  id: string,
  token: string,
): Promise<{ submission: SubmissionRecord; ingestJob: SubmissionBundle["ingestJob"] }> {
  const response = await apiFetch<{ submission: SubmissionRecord; ingestJob: SubmissionBundle["ingestJob"] }>(
    `/submissions/${id}/retry-ingest`,
    jsonRequest("POST", {}, token),
  );
  return response.data;
}

export async function adminRequeueSubmissionIngest(
  id: string,
  token: string,
): Promise<{ submission: SubmissionRecord; ingestJob: SubmissionBundle["ingestJob"] }> {
  const response = await apiFetch<{ submission: SubmissionRecord; ingestJob: SubmissionBundle["ingestJob"] }>(
    `/admin/submissions/${id}/requeue-ingest`,
    jsonRequest("POST", {}, token),
  );
  return response.data;
}

export async function adminBlockSubmissionIngest(
  id: string,
  note: string,
  token: string,
): Promise<{ submission: SubmissionRecord; ingestJob: SubmissionBundle["ingestJob"] }> {
  const response = await apiFetch<{ submission: SubmissionRecord; ingestJob: SubmissionBundle["ingestJob"] }>(
    `/admin/submissions/${id}/block-ingest`,
    jsonRequest("POST", { note }, token),
  );
  return response.data;
}

export async function fetchPublishedListing(id: string): Promise<PublishedListingDetail> {
  const response = await apiFetch<PublishedListingDetail>(`/published-listings/${id}`);
  return response.data;
}
