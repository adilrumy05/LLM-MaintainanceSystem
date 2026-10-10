import { AccessibilityInfo } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import AnimationCard from '../components/AnimationCard';
import { animation } from './fixtures/animation';

beforeEach(() => { jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test('while it is being made it can be cancelled', async () => {
  const onCancel = jest.fn();
  await render(<AnimationCard state={{ status: 'generating', ref: 'r' }} active onCancel={onCancel} />);
  expect(screen.getByText(/Drawing the animation/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Cancel animation'));
  expect(onCancel).toHaveBeenCalled();
});

test('one left unfinished by an earlier session is shown as interrupted, with Retry', async () => {
  const onRetry = jest.fn();
  await render(<AnimationCard state={{ status: 'generating', ref: 'r' }} active={false} onRetry={onRetry} />);
  expect(screen.getByText('The animation was interrupted.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Retry animation'));
  expect(onRetry).toHaveBeenCalled();
});

test('not available gives the reason and what the manual is missing, and no Retry', async () => {
  await render(<AnimationCard state={{ status: 'unavailable', message: 'The manual does not give enough detail to draw this.', missing: ['wire colours'] }} onRetry={jest.fn()} />);
  expect(screen.getByText(/does not give enough detail/)).toBeTruthy();
  expect(screen.getByText('• wire colours')).toBeTruthy();
  expect(screen.queryByLabelText('Retry animation')).toBeNull();
});

test.each([
  [{ status: 'failed', message: 'The animation could not be made. Try again.' }, 'The animation could not be made. Try again.'],
  [{ status: 'cancelled' }, 'Animation cancelled.'],
  [{ status: 'ready', animation: { steps: [] } }, 'The animation could not be made.'],
])('%p offers Retry', async (state, text) => {
  await render(<AnimationCard state={state} onRetry={jest.fn()} />);
  expect(screen.getByText(text)).toBeTruthy();
  expect(screen.getByLabelText('Retry animation')).toBeTruthy();
});

test('a ready animation plays step by step with the words and page from the manual', async () => {
  await render(<AnimationCard state={{ status: 'ready', animation }} />);
  expect(screen.getByText('Step 1 of 3')).toBeTruthy();
  expect(screen.getByText('Switch off the power supply before wiring.')).toBeTruthy();
  expect(screen.getByText('Before you start')).toBeTruthy();
  expect(screen.getAllByText('p.56').length).toBeGreaterThan(0);
  expect(screen.getByLabelText('Back').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByLabelText('Next'));
  expect(screen.getByText('Step 2 of 3')).toBeTruthy();
  expect(screen.getByText('Outdoor unit terminal 1 connects to indoor unit terminal 1')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Next'));
  expect(screen.getByLabelText('Next').props.accessibilityState.disabled).toBe(true);
});

test('Play moves through the steps and stops at the last', async () => {
  jest.useFakeTimers();
  await render(<AnimationCard state={{ status: 'ready', animation }} />);
  await fireEvent.press(screen.getByLabelText('Play'));
  expect(screen.getByLabelText('Pause')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(4600); });
  expect(screen.getByText('Step 2 of 3')).toBeTruthy();
  await act(async () => { jest.advanceTimersByTime(4600); });
  await act(async () => { jest.advanceTimersByTime(4600); });
  expect(screen.getByText('Step 3 of 3')).toBeTruthy();
  expect(screen.getByLabelText('Play')).toBeTruthy();
});

test('All steps shows every step at once, and the card can be closed', async () => {
  await render(<AnimationCard state={{ status: 'ready', animation }} />);
  await fireEvent.press(screen.getByLabelText('All steps'));
  expect(screen.getByText('3 steps')).toBeTruthy();
  expect(screen.getByText('Secure the cable onto the control board with the holder.')).toBeTruthy();
  expect(screen.getByLabelText('Play').props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByLabelText('Hide animation'));
  expect(screen.queryByText('3 steps')).toBeNull();
});

test('each drawing is described for a screen reader, and works with Reduce Motion on', async () => {
  AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(true);
  await render(<AnimationCard state={{ status: 'ready', animation }} />);
  await act(async () => {});
  expect(screen.getByLabelText('Drawing for step 1. Schematic, not to scale.')).toBeTruthy();
});
