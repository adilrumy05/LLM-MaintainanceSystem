import { createRequestGuard } from '../utils/requestGuard';

// The bug this replaces: Cancel set a shared flag, the next question cleared it,
// and the cancelled reply - still in flight - was then shown as the answer.

test('APP-B4-1 a cancelled reply stays stale even after a new question starts', () => {
  const guard = createRequestGuard();
  const first = guard.begin();
  guard.cancel();
  const second = guard.begin();

  expect(guard.isCurrent(first.id)).toBe(false);   // the late reply is dropped
  expect(guard.isCurrent(second.id)).toBe(true);
});

test('APP-B4-2 starting a new request makes the previous one stale', () => {
  const guard = createRequestGuard();
  const a = guard.begin();
  const b = guard.begin();
  expect(guard.isCurrent(a.id)).toBe(false);
  expect(guard.isCurrent(b.id)).toBe(true);
});

test('APP-B4-3 cancel actually aborts the network request', () => {
  const guard = createRequestGuard();
  const { signal } = guard.begin();
  expect(signal.aborted).toBe(false);
  guard.cancel();
  expect(signal.aborted).toBe(true);
});

test('APP-B4-4 starting a new request aborts the one still in flight', () => {
  const guard = createRequestGuard();
  const first = guard.begin();
  guard.begin();
  expect(first.signal.aborted).toBe(true);
});
