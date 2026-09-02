import { isResizeObserverLoopError } from './handleError';

describe('isResizeObserverLoopError', () => {
  it.each([
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications.',
  ])('recognizes the browser ResizeObserver diagnostic: %s', (message) => {
    expect(isResizeObserverLoopError(message)).toBe(true);
  });

  it('does not suppress unrelated runtime errors', () => {
    expect(isResizeObserverLoopError('ResizeObserver callback failed')).toBe(false);
  });
});
