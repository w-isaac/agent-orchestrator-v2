const RANGE_CHECK_RE = /^projects_([a-z_]+)_port_range_check$/;
const PORT_UNIQUE_RE = /^projects_([a-z_]+)_port_unique$/;

export interface InvalidPortRangeBody {
  error: 'invalid_port_range';
  field: string;
  message: string;
}

export interface PortConflictBody {
  error: 'port_conflict';
  field: string;
  value: unknown;
}

export type MappedPgError =
  | { status: 400; body: InvalidPortRangeBody }
  | { status: 409; body: PortConflictBody };

interface PgLikeError {
  code?: string;
  constraint?: string;
  message?: string;
}

function isPgLikeError(err: unknown): err is PgLikeError {
  return typeof err === 'object' && err !== null && 'code' in err;
}

export function mapPgError(
  err: unknown,
  payload?: Record<string, unknown>,
): MappedPgError {
  if (isPgLikeError(err)) {
    const { code, constraint } = err;

    if (code === '23514' && typeof constraint === 'string') {
      const match = RANGE_CHECK_RE.exec(constraint);
      if (match) {
        const field = match[1];
        return {
          status: 400,
          body: {
            error: 'invalid_port_range',
            field,
            message: err.message ?? `Port value for ${field} is out of allowed range (1-65535)`,
          },
        };
      }
    }

    if (code === '23505' && typeof constraint === 'string') {
      const match = PORT_UNIQUE_RE.exec(constraint);
      if (match) {
        const rawField = match[1];
        const field = rawField.endsWith('_port') ? rawField : `${rawField}_port`;
        const value = payload ? payload[field] : undefined;
        return {
          status: 409,
          body: {
            error: 'port_conflict',
            field,
            value,
          },
        };
      }
    }
  }

  throw err;
}
