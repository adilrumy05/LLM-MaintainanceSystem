import { render, screen, fireEvent } from '@testing-library/react-native';

// chatActions imports decodeEntities from services/api, which loads AsyncStorage
// and Firebase at import time. Neither is needed to render a message.
jest.mock('../services/api', () => ({ decodeEntities: (s) => s }));

import BotMessage from '../components/BotMessage';

// Regression guard: the dashboard refactor dropped these buttons, which left a
// photo needing model confirmation with no way forward.

const base = { id: 'm1', from: 'bot', text: 'I read this as CS-S10TKH-1. Which model is it?', sources: [] };
const withActions = {
  ...base,
  actions: [{ type: 'confirm_model', model: 'CS-S10TKH' }, { type: 'retake' }],
};

test('APP-B0-1 renders reply actions and reports the one pressed', async () => {
  const onAction = jest.fn();
  await render(<BotMessage item={withActions} updateMessage={jest.fn()} onAction={onAction} />);

  expect(screen.getByText('CS-S10TKH')).toBeTruthy();
  expect(screen.getByText('Retake photo')).toBeTruthy();

  await fireEvent.press(screen.getByText('CS-S10TKH'));
  expect(onAction).toHaveBeenCalledWith({ type: 'confirm_model', model: 'CS-S10TKH' });
});

test('APP-B0-2 hides actions once one has been used', async () => {
  await render(<BotMessage item={{ ...withActions, actionsUsed: true }} updateMessage={jest.fn()} onAction={jest.fn()} />);
  expect(screen.queryByText('CS-S10TKH')).toBeNull();
});

test('APP-B0-3 disabled actions do not fire while a request is running', async () => {
  const onAction = jest.fn();
  await render(<BotMessage item={withActions} updateMessage={jest.fn()} onAction={onAction} actionsDisabled />);
  await fireEvent.press(screen.getByText('CS-S10TKH'));
  expect(onAction).not.toHaveBeenCalled();
});

test('APP-B0-4 a message without actions renders no action row', async () => {
  await render(<BotMessage item={base} updateMessage={jest.fn()} onAction={jest.fn()} />);
  expect(screen.queryByText('Retake photo')).toBeNull();
});
