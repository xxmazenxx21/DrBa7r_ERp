/**
 * The one shape every successful response uses:
 *   { "message": string, "data": object | array | null }
 */
export interface ApiResponse<T> {
  message: string;
  data: T;
}

export function ok<T>(message: string, data: T): ApiResponse<T> {
  return { message, data };
}
