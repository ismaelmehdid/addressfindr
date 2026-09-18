export const ZeroEntropyErrorCode = {
  NOT_CONFIGURED: 'not_configured',
  INVALID_API_KEY: 'invalid_api_key',
  COLLECTION_NOT_FOUND: 'collection_not_found',
  COLLECTION_CREATE_FAILED: 'collection_create_failed',
  DOCUMENT_NOT_FOUND: 'document_not_found',
  UNSUPPORTED_FILE_TYPE: 'unsupported_file_type',
  RATE_LIMITED: 'rate_limited',
  API_ERROR: 'api_error',
  NETWORK_ERROR: 'network_error',
  TIMEOUT: 'timeout',
  VALIDATION_ERROR: 'validation_error',
  CIRCUIT_OPEN: 'circuit_open',
} as const;

export type ZeroEntropyErrorCode =
  (typeof ZeroEntropyErrorCode)[keyof typeof ZeroEntropyErrorCode];

export class ZeroEntropyError extends Error {
  readonly code: ZeroEntropyErrorCode;
  readonly statusCode: number;
  readonly cause?: unknown;

  constructor(args: {
    code: ZeroEntropyErrorCode;
    message: string;
    statusCode: number;
    cause?: unknown;
  }) {
    super(args.message);
    this.name = 'ZeroEntropyError';
    this.code = args.code;
    this.statusCode = args.statusCode;
    this.cause = args.cause;
  }
}
