export type ErrorCode =
  | "PROVIDER_ERROR"
  | "AUTH_ERROR"
  | "QUOTA_ERROR"
  | "RATE_LIMITED"
  | "NOT_SUPPORTED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "TIMEOUT";

export interface UnimapErrorOptions {
  code?: ErrorCode;
  providerId?: string;
  /** Upstream HTTP status, where applicable. */
  status?: number;
  cause?: unknown;
}

/** Base error for everything thrown by the SDK. Carries a stable `code`. */
export class UnimapError extends Error {
  readonly code: ErrorCode;
  readonly providerId?: string;
  readonly status?: number;

  constructor(message: string, options: UnimapErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code ?? "PROVIDER_ERROR";
    this.providerId = options.providerId;
    this.status = options.status;
  }

  toJSON(): { name: string; code: ErrorCode; message: string; providerId?: string; status?: number } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      providerId: this.providerId,
      status: this.status,
    };
  }
}

type SubOptions = Omit<UnimapErrorOptions, "code">;

export class ProviderError extends UnimapError {
  constructor(message: string, options: SubOptions = {}) {
    super(message, { ...options, code: "PROVIDER_ERROR" });
  }
}
export class AuthError extends UnimapError {
  constructor(message: string, options: SubOptions = {}) {
    super(message, { ...options, code: "AUTH_ERROR" });
  }
}
export class QuotaError extends UnimapError {
  constructor(message: string, options: SubOptions = {}) {
    super(message, { ...options, code: "QUOTA_ERROR" });
  }
}
export class RateLimitError extends UnimapError {
  constructor(message: string, options: SubOptions = {}) {
    super(message, { ...options, code: "RATE_LIMITED" });
  }
}
export class NotSupportedError extends UnimapError {
  constructor(message: string, options: SubOptions = {}) {
    super(message, { ...options, code: "NOT_SUPPORTED" });
  }
}
export class ValidationError extends UnimapError {
  constructor(message: string, options: SubOptions = {}) {
    super(message, { ...options, code: "VALIDATION_ERROR" });
  }
}
export class NotFoundError extends UnimapError {
  constructor(message: string, options: SubOptions = {}) {
    super(message, { ...options, code: "NOT_FOUND" });
  }
}
