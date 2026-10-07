/**
 * REWIND JSON-RPC 2.0 Protocol Types & Helpers
 * Shared message format for daemon ↔ CLI / dashboard communication.
 */

/* ── Standard JSON-RPC Error Codes ──────────────────────────────── */

export const PARSE_ERROR = -32700
export const INVALID_REQUEST = -32600
export const METHOD_NOT_FOUND = -32601
export const INVALID_PARAMS = -32602
export const INTERNAL_ERROR = -32603
export const AUTH_REQUIRED = -32000

/* ── Wire Types ─────────────────────────────────────────────────── */

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: JsonRpcError
}

/* ── Parsing ────────────────────────────────────────────────────── */

/**
 * Parse a raw string into a validated JsonRpcRequest.
 * Throws a structured JsonRpcError on any validation failure.
 */
export function parseJsonRpc(raw: string): JsonRpcRequest {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw { code: PARSE_ERROR, message: 'Parse error: invalid JSON' } satisfies JsonRpcError
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw { code: INVALID_REQUEST, message: 'Invalid request: expected object' } satisfies JsonRpcError
  }

  const obj = parsed as Record<string, unknown>

  if (obj.jsonrpc !== '2.0') {
    throw { code: INVALID_REQUEST, message: 'Invalid request: missing jsonrpc "2.0"' } satisfies JsonRpcError
  }
  if (typeof obj.method !== 'string' || obj.method.length === 0) {
    throw { code: INVALID_REQUEST, message: 'Invalid request: missing or empty method' } satisfies JsonRpcError
  }
  if (obj.id === undefined || obj.id === null) {
    throw { code: INVALID_REQUEST, message: 'Invalid request: missing id' } satisfies JsonRpcError
  }

  return {
    jsonrpc: '2.0',
    id: obj.id as string | number,
    method: obj.method as string,
    params: (typeof obj.params === 'object' && obj.params !== null && !Array.isArray(obj.params))
      ? obj.params as Record<string, unknown>
      : undefined,
  }
}

/* ── Response Builders ──────────────────────────────────────────── */

export function createSuccessResponse(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

export function createErrorResponse(id: string | number | null, error: JsonRpcError): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error }
}
