import { AsyncLocalStorage } from 'node:async_hooks';

const requestDeadlines = new AsyncLocalStorage();

export class RequestDeadlineExceededError extends Error {
  constructor(message = 'The Alexa response deadline was exceeded', options = {}) {
    super(message, options);
    this.name = 'RequestDeadlineExceededError';
  }
}

export class RequestDeadline {
  constructor({ budgetMs, now = () => performance.now() }) {
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) {
      throw new TypeError('Request deadline budget must be a positive number');
    }
    this.budgetMs = budgetMs;
    this.now = now;
    this.startedAt = now();
  }

  remainingMs() {
    return Math.max(0, Math.floor(this.budgetMs - (this.now() - this.startedAt)));
  }

  hasTime(minimumMs = 1) {
    return this.remainingMs() >= minimumMs;
  }

  assertActive() {
    if (!this.hasTime()) throw new RequestDeadlineExceededError();
  }

  timeoutMs(maximumMs) {
    this.assertActive();
    return Math.max(1, Math.min(Math.floor(maximumMs), this.remainingMs()));
  }

  signal(maximumMs) {
    return AbortSignal.timeout(this.timeoutMs(maximumMs));
  }
}

export function runWithRequestDeadline(deadline, callback) {
  return requestDeadlines.run(deadline, callback);
}

export function currentRequestDeadline() {
  return requestDeadlines.getStore() ?? null;
}
