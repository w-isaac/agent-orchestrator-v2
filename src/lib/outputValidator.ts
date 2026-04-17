import { NormalizedResult, NormalizedArtifact } from './resultNormalizer';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  pass: boolean;
  errors: ValidationError[];
}

export interface ValidationOptions {
  /** Minimum confidence threshold (0-1). Artifacts below this fail. Default 0.0 */
  confidenceThreshold?: number;
  /** Allowed scope values. If set, artifacts with a scope not in this list fail. */
  allowedScopes?: string[];
}

/**
 * Validates a normalized result for:
 * 1. Schema conformance (required fields present)
 * 2. Scope adherence (artifacts must be in allowed scopes, if specified)
 * 3. Confidence threshold (artifacts must meet minimum confidence)
 */
export function validateOutput(
  result: NormalizedResult,
  options: ValidationOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const { confidenceThreshold = 0, allowedScopes } = options;

  // Schema conformance: top-level fields
  if (!Array.isArray(result.artifacts)) {
    errors.push({ field: 'artifacts', message: 'artifacts must be an array' });
  }
  if (!Array.isArray(result.relationships)) {
    errors.push({ field: 'relationships', message: 'relationships must be an array' });
  }
  if (!result.metadata || typeof result.metadata !== 'object') {
    errors.push({ field: 'metadata', message: 'metadata must be an object' });
  }

  // Validate each artifact
  if (Array.isArray(result.artifacts)) {
    result.artifacts.forEach((artifact: NormalizedArtifact, i: number) => {
      if (!artifact.id) {
        errors.push({ field: `artifacts[${i}].id`, message: 'id is required' });
      }
      if (!artifact.type) {
        errors.push({ field: `artifacts[${i}].type`, message: 'type is required' });
      }
      if (artifact.content === undefined || artifact.content === null) {
        errors.push({ field: `artifacts[${i}].content`, message: 'content is required' });
      }

      // Confidence threshold
      if (typeof artifact.confidence === 'number' && artifact.confidence < confidenceThreshold) {
        errors.push({
          field: `artifacts[${i}].confidence`,
          message: `confidence ${artifact.confidence} is below threshold ${confidenceThreshold}`,
        });
      }

      // Scope adherence
      if (allowedScopes && artifact.scope && !allowedScopes.includes(artifact.scope)) {
        errors.push({
          field: `artifacts[${i}].scope`,
          message: `scope "${artifact.scope}" is not in allowed scopes: ${allowedScopes.join(', ')}`,
        });
      }
    });
  }

  // Validate relationships
  if (Array.isArray(result.relationships)) {
    result.relationships.forEach((rel, i) => {
      if (!rel.source_id) {
        errors.push({ field: `relationships[${i}].source_id`, message: 'source_id is required' });
      }
      if (!rel.target_id) {
        errors.push({ field: `relationships[${i}].target_id`, message: 'target_id is required' });
      }
    });
  }

  return { pass: errors.length === 0, errors };
}
