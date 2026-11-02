/**
 * The server always answers errors as
 * `{"error": {"code", "message", "details"?, "request_id"}}`.
 *
 * `details.field` points at the input that caused a validation failure;
 * import errors additionally carry a list of per-item problems.
 */

export interface ImportItemError {
  index: number;
  field?: string;
  message: string;
}

export interface ApiErrorDetails {
  field?: string;
  retry_after_secs?: number;
  errors?: ImportItemError[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetails | null;
  readonly requestId: string | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: ApiErrorDetails | null,
    requestId: string | null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Name of the input to highlight, when the server reported one. */
  get field(): string | null {
    return this.details?.field ?? null;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** A human-readable message for anything thrown by the API layer. */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }

  return "Не удалось выполнить запрос";
}
