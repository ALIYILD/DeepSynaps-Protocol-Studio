import { apiBaseUrl } from "../../config/api";
import { ApiErrorResponse } from "./types";

export class ApiError extends Error {
  code: string;
  status: number;
  warnings: string[];

  constructor({
    code,
    message,
    status,
    warnings = [],
  }: {
    code: string;
    message: string;
    status: number;
    warnings?: string[];
  }) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.warnings = warnings;
  }
}

export async function requestJson<TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ApiError({
      code: "network_error",
      message: "The API could not be reached. Verify that the backend is running and reachable from the frontend.",
      status: 0,
      warnings: error instanceof Error ? [error.message] : [],
    });
  }

  if (!response.ok) {
    let payload: Partial<ApiErrorResponse> | undefined;

    try {
      payload = (await response.json()) as Partial<ApiErrorResponse>;
    } catch {
      payload = undefined;
    }

    throw new ApiError({
      code: payload?.code ?? "request_failed",
      message: payload?.message ?? "The API request could not be completed.",
      status: response.status,
      warnings: payload?.warnings ?? [],
    });
  }

  return (await response.json()) as TResponse;
}
