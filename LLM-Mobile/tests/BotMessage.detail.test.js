import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
jest.mock('../services/api', () => ({ decodeEntities: text => text }));
import BotMessage from '../components/BotMessage';
import { FEATURES } from '../constants/featureFlags';

// Response detail is switched off until it passes its live checks; these tests turn it on.
beforeEach(() => { FEATURES.EFFORT_LEVELS = true; FEATURES.BRIEF_ANSWERS = true; });
afterAll(() => { FEATURES.EFFORT_LEVELS = false; FEATURES.BRIEF_ANSWERS = false; });

const base = { id: 'm', text: 'Short answer.', responseDetail: 'brief', isProcedural: true, sources: [],
  steps: [{ title: 'First step', description: 'First description.', warningLevel: 'none', toolsRequired: [] }] };

function Harness({ initial = base, onCopy = jest.fn(), onSelectText = jest.fn() }) {
  const [item, setItem] = useState(initial);
  return <BotMessage item={item} updateMessage={(_id, updater) => setItem(updater)} onCopy={onCopy} onSelectText={onSelectText} />;
}

test('APP-A4-1 a Brief answer is labelled, opens on the answer and can switch to the procedure', async () => {
  const onCopy = jest.fn(); const onSelectText = jest.fn();
  await render(<Harness onCopy={onCopy} onSelectText={onSelectText} />);

  expect(screen.getByText('Brief answer')).toBeTruthy();
  expect(screen.getByText('Short answer.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Copy answer'));
  expect(onCopy.mock.calls[0][0].text).toBe('Short answer.');
  await fireEvent.press(screen.getByLabelText('Select text to copy or reply to'));
  expect(onSelectText.mock.calls[0][1]).toBe('Short answer.');

  await fireEvent.press(screen.getByLabelText('Show procedure answer'));
  expect(screen.getByText('First description.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Select text to copy or reply to'));
  expect(onSelectText.mock.calls[1][1]).toContain('First description.');

  await fireEvent.press(screen.getByLabelText('Show brief answer'));
  expect(screen.getByText('Short answer.')).toBeTruthy();
});

test('APP-A4-2 a Brief request answered in Standard says so and is not labelled Brief', async () => {
  await render(<Harness initial={{ ...base, text: 'Standard answer.', isProcedural: false, steps: [], detail: 'brief', responseDetail: 'standard', detailFallback: 'unverified_figures' }} />);
  expect(screen.getByText('Standard answer.')).toBeTruthy();
  expect(screen.getByText(/could not be matched to the manual, so the Standard answer is shown/)).toBeTruthy();
  expect(screen.queryByText('Brief answer')).toBeNull();
});

test('APP-A4-3 a Detailed answer is labelled and opens on the full text', async () => {
  await render(<Harness initial={{ ...base, text: 'Long answer.', responseDetail: 'detailed' }} />);
  expect(screen.getByText('Detailed answer')).toBeTruthy();
  expect(screen.getByText('Long answer.')).toBeTruthy();
  expect(screen.getByLabelText('Show full answer')).toBeTruthy();
});

test('APP-A4-4 a Standard answer has no label and opens on the procedure, as before', async () => {
  await render(<Harness initial={{ ...base, responseDetail: 'standard' }} />);
  expect(screen.queryByText(/ answer$/)).toBeNull();
  expect(screen.getByText('First description.')).toBeTruthy();
});

test('APP-A4-5 a Brief answer offers the Standard answer as Full; copy and selection follow the view', async () => {
  const onCopy = jest.fn(); const onSelectText = jest.fn();
  await render(<Harness initial={{ ...base, fullText: 'The complete answer.' }} onCopy={onCopy} onSelectText={onSelectText} />);

  expect(screen.getByText('Short answer.')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Show full answer'));
  expect(screen.getByText('The complete answer.')).toBeTruthy();
  expect(screen.queryByText('Short answer.')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Copy answer'));
  expect(onCopy.mock.calls[0][0].text).toBe('The complete answer.');
  await fireEvent.press(screen.getByLabelText('Select text to copy or reply to'));
  expect(onSelectText.mock.calls[0][1]).toBe('The complete answer.');

  await fireEvent.press(screen.getByLabelText('Show brief answer'));
  expect(screen.getByText('Short answer.')).toBeTruthy();
});

test('APP-A4-6 a Brief answer with no guided steps still shows the Brief / Full switch', async () => {
  await render(<Harness initial={{ ...base, isProcedural: false, steps: [], fullText: 'The complete answer.' }} />);
  expect(screen.getByLabelText('Show brief answer')).toBeTruthy();
  expect(screen.getByLabelText('Show full answer')).toBeTruthy();
  expect(screen.queryByLabelText('Show procedure answer')).toBeNull();
});
