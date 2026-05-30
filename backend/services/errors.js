/**
 * Custom error types for vault operations.
 * All extend Error for standard try/catch compatibility.
 */

export class VaultError extends Error {
  constructor(message, code = 'VAULT_ERROR', cause = null) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    this.cause = cause;
  }
}

export class MountError extends VaultError {
  constructor(message, code = 'MOUNT_ERROR', cause = null) {
    super(message, code, cause);
    this.name = 'MountError';
  }
}

export class ValidationError extends VaultError {
  constructor(message, code = 'VALIDATION_ERROR', cause = null) {
    super(message, code, cause);
    this.name = 'ValidationError';
  }
}
