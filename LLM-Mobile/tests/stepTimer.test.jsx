// The timer belongs to the step that mandates the wait, not to the message.
// These cover the wiring that puts it there, and the extraction contract the
// whole feature rests on — neither had any coverage before.
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProcedureViewer from '../components/ProcedureViewer';
import { extractTimers } from '../services/procedureTimers';

jest.mock('../services/photo', () => ({ capturePhotos: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-constants', () => ({ executionEnvironment: 'standalone' }));

// Keep the real extraction logic; stub only the two calls that reach the OS.
jest.mock('../services/procedureTimers', () => ({
  ...jest.requireActual('../services/procedureTimers'),
  scheduleTimerNotification: jest.fn().mockResolvedValue('notif-1'),
  cancelTimerNotification: jest.fn(),
}));

const steps = [
  { title: 'Charge in 150g increments', description: 'Charge a little at a time.',
    warningLevel: 'none', timerSeconds: 60, timerLabel: 'Charging wait' },
  { title: 'Disconnect the charge hose', description: 'Disconnect immediately.',
    warningLevel: 'none', timerSeconds: 0, timerLabel: '' },
];

function Harness({ onTimerComplete } = {}) {
  const [state, setState] = React.useState({ currentStep: 0, completedSteps: [], overviewOpen: false });
  return (
    <ProcedureViewer
      steps={steps}
      state={state}
      onChange={setState}
      onTimerComplete={onTimerComplete}
    />
  );
}

test('the step that mandates a wait shows its own countdown', async () => {
  const ui = await render(<Harness />);
  expect(ui.getByText('MANDATED WAIT')).toBeTruthy();
  expect(ui.getByText('Charging wait')).toBeTruthy();
  // 60s, formatted by formatRemaining
  expect(ui.getByText('1:00')).toBeTruthy();
  expect(ui.getByText('Start')).toBeTruthy();
});

test('a step with no mandated wait shows no countdown', async () => {
  const ui = await render(<Harness />);
  await fireEvent.press(ui.getByText('Mark this step as complete'));
  await fireEvent.press(ui.getByText('Next'));

  expect(ui.getByText('Step 2 of 2')).toBeTruthy();
  expect(ui.queryByText('MANDATED WAIT')).toBeNull();
  expect(ui.queryByText('Charging wait')).toBeNull();
});

// The marker contract between the backend prompt and the client. A change to
// either side that breaks this shows up as "the timer just stopped appearing",
// which is painful to diagnose from the UI alone.
describe('timer marker extraction', () => {
  test('pulls a marker off its own line and leaves no syntax behind', () => {
    const { cleanText, timers } = extractTimers(
      'Close the valve.\n[[TIMER:180|Compressor restart wait]]\nRestart the unit.'
    );
    expect(timers).toEqual([{ id: 't0', seconds: 180, label: 'Compressor restart wait' }]);
    expect(cleanText).not.toMatch(/TIMER|\[\[/);
  });

  test('drops durations outside 5s..2h rather than showing a nonsense timer', () => {
    expect(extractTimers('x\n[[TIMER:2|blink]]').timers).toHaveLength(0);
    expect(extractTimers('x\n[[TIMER:99999|forever]]').timers).toHaveLength(0);
  });

  test('never leaves a malformed marker on screen', () => {
    const { cleanText, timers } = extractTimers('Wait here.\n[[TIMER:abc|bad]]');
    expect(timers).toHaveLength(0);
    expect(cleanText).not.toMatch(/TIMER|\[\[/);
  });

  test('caps at three timers per answer', () => {
    const text = [1, 2, 3, 4].map(n => `step ${n}\n[[TIMER:60|w${n}]]`).join('\n');
    expect(extractTimers(text).timers).toHaveLength(3);
  });
});


// The regression that moving timers into step cards introduces if the running
// state is not lifted: only the current step is rendered, so walking ahead to
// read the next step unmounts the countdown. For a 15-minute wait that is
// exactly when a technician looks ahead.
test('a running wait survives navigating away from its step and back', async () => {
  const ui = await render(<Harness />);

  await fireEvent.press(ui.getByText('Start'));
  expect(ui.getByText('Cancel')).toBeTruthy();

  await fireEvent.press(ui.getByText('Mark this step as complete'));
  await fireEvent.press(ui.getByText('Next'));
  expect(ui.getByText('Step 2 of 2')).toBeTruthy();
  expect(ui.queryByText('MANDATED WAIT')).toBeNull();

  await fireEvent.press(ui.getByText('Previous'));
  expect(ui.getByText('Step 1 of 2')).toBeTruthy();

  // Still counting, not offering to start over.
  expect(ui.getByText('Cancel')).toBeTruthy();
  expect(ui.queryByText('Start')).toBeNull();
});

test('leaving a step does not cancel its scheduled alert', async () => {
  const { cancelTimerNotification } = require('../services/procedureTimers');
  cancelTimerNotification.mockClear();

  const ui = await render(<Harness />);
  await fireEvent.press(ui.getByText('Start'));
  await fireEvent.press(ui.getByText('Mark this step as complete'));
  await fireEvent.press(ui.getByText('Next'));

  expect(cancelTimerNotification).not.toHaveBeenCalled();
});
