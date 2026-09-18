export type CircuitState = 'closed' | 'open' | 'half-open';

export interface ICircuitBreaker {
  isOpen(): Promise<boolean>;
  recordSuccess(): Promise<void>;
  recordFailure(): Promise<void>;
  getState(): Promise<CircuitState>;
  reset(): Promise<void>;
}
