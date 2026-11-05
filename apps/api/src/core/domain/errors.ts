/** Framework-free error hierarchy. Presentation maps these to HTTP; inner layers never know about HTTP. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = 'validation_failed';
  constructor(message: string, readonly issues: unknown = undefined) {
    super(message);
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = 'unauthorized';
}

export class EmailTakenError extends DomainError {
  readonly code = 'email_taken';
  constructor() {
    super('An account with this email already exists');
  }
}

/** Optimistic-concurrency guard tripped inside a transaction; the client can safely retry. */
export class ConcurrentModificationError extends DomainError {
  readonly code = 'concurrent_modification';
}
