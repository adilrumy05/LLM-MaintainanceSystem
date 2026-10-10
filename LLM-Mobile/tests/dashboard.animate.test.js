import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue() }));
jest.mock('../app/_layout', () => ({ useUser: () => ({ user: { uid: 'u1', role: 'beginner' }, setUser: jest.fn() }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }), useFocusEffect: jest.fn() }));
jest.mock('../hooks/useRole', () => ({ useRole: () => ({ role: 'beginner', isJunior: true, isIntermediate: false }) }));
jest.mock('../hooks/useHandsFree', () => ({ useHandsFree: () => ({ active: false, stop: jest.fn(), start: jest.fn() }) }));
jest.mock('../components/MicButton', () => () => null);
jest.mock('../components/HandsFreeBar', () => () => null);
jest.mock('../services/photo', () => ({ capturePhotos: jest.fn(), MAX_PHOTOS: 4 }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue() }));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../firebaseConfig', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), addDoc: jest.fn(), serverTimestamp: jest.fn() }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, SafeAreaProvider: ({ children }) => children, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../services/reportPdf', () => ({ shareReportPdf: jest.fn() }));
jest.mock('../services/api', () => ({
  submitQuery: jest.fn(), animateAnswer: jest.fn(), decodeEntities: text => text || '', getFilters: jest.fn().mockResolvedValue({}),
  getSession: jest.fn(() => 'session-1'), setSession: jest.fn(), resetSession: jest.fn(() => 'session-2'),
  generateChatTitle: jest.fn().mockResolvedValue('New Chat'), generateReport: jest.fn(), logTimerEvent: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { submitQuery, animateAnswer } from '../services/api';
import Dashboard from '../app/dashboard';
import { FEATURES } from '../constants/featureFlags';
import { animation } from './fixtures/animation';

const REF = 'a'.repeat(32);
const ANSWER = {
  text: 'Remove the cover, then connect the cable.', sources: [], isProcedural: true, animationRef: REF,
  steps: [{ title: 'Remove the cover', description: 'Loosen the screw.', warning_level: 'none', tools_required: [] }],
};
const savedMessage = () => {
  const saved = AsyncStorage.setItem.mock.calls.filter(([key]) => key === 'chats_beginner').at(-1)[1];
  return JSON.parse(saved)[0].messages.at(-1);
};

async function openWith(prefs) {
  AsyncStorage.getItem.mockImplementation(key => Promise.resolve(key === 'prefs_u1' && prefs ? JSON.stringify(prefs) : null));
  await render(<Dashboard />);
  await fireEvent.press(screen.getByLabelText('Chat options'));
  await waitFor(() => expect(screen.getByRole('switch').props.accessibilityState.disabled).toBe(false));
  await fireEvent.press(screen.getByLabelText('Done'));
}
async function ask() {
  await fireEvent.changeText(screen.getByPlaceholderText('Ask a maintenance question...'), 'How do I connect the cable?');
  await fireEvent.press(screen.getByLabelText('Send question'));
}

beforeEach(() => { jest.clearAllMocks(); FEATURES.ANIMATIONS = true; submitQuery.mockResolvedValue(ANSWER); });
afterAll(() => { FEATURES.ANIMATIONS = false; });

test('the toggle is not shown while the feature is switched off', async () => {
  FEATURES.ANIMATIONS = false;
  await render(<Dashboard />);
  await fireEvent.press(screen.getByLabelText('Chat options'));
  expect(screen.getByText('Manual filter')).toBeTruthy();
  expect(screen.queryByRole('switch')).toBeNull();
});

test('off by default: the question is asked without animate and nothing is requested', async () => {
  await openWith(null);
  expect(screen.queryByText('Animate on')).toBeNull();
  await ask();
  await waitFor(() => expect(submitQuery).toHaveBeenCalled());
  expect(submitQuery.mock.calls[0][1].animate).toBe(false);
  expect(animateAnswer).not.toHaveBeenCalled();
});

test('turned on in Chat options, under its notice; then answers with steps get an animation that is saved with the message', async () => {
  animateAnswer.mockResolvedValue({ status: 'ready', animation });
  await openWith(null);
  await fireEvent.press(screen.getByLabelText('Chat options'));
  expect(screen.getByText(/An animation may not be produced/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('switch'));
  await fireEvent.press(screen.getByLabelText('Done'));
  expect(screen.getByText('Animate on')).toBeTruthy();
  await ask();
  await waitFor(() => expect(animateAnswer).toHaveBeenCalledWith(REF, expect.objectContaining({ signal: expect.anything() })));
  expect(submitQuery.mock.calls[0][1].animate).toBe(true);
  await waitFor(() => expect(screen.getByText('Step 1 of 3')).toBeTruthy());
  await waitFor(() => expect(savedMessage().animation).toMatchObject({ status: 'ready', ref: REF, animation: { title: 'Connect the cable' } }));
});

test('an answer that comes back without a reference gets no card and no request', async () => {
  submitQuery.mockResolvedValue({ text: 'The filter keeps the air clean.', sources: [], isProcedural: false });
  await openWith({ animate: true, animateIntroSeen: true });
  await ask();
  await waitFor(() => expect(screen.getByText('The filter keeps the air clean.')).toBeTruthy());
  expect(animateAnswer).not.toHaveBeenCalled();
  expect(screen.queryByText('Animation')).toBeNull();
});

test('Cancel stops waiting, and the result that arrives afterwards is dropped', async () => {
  let finish;
  animateAnswer.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await openWith({ animate: true, animateIntroSeen: true });
  await ask();
  await waitFor(() => expect(screen.getByLabelText('Cancel animation')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Cancel animation'));
  expect(screen.getByText('Animation cancelled.')).toBeTruthy();
  expect(animateAnswer.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => { finish({ status: 'ready', animation }); });
  expect(screen.getByText('Animation cancelled.')).toBeTruthy();
  expect(screen.queryByText('Step 1 of 3')).toBeNull();
});

test('not available is shown with what is missing; a failure can be retried with the same reference', async () => {
  animateAnswer.mockResolvedValueOnce({ status: 'failed', message: 'The animation could not be made. Try again.' });
  animateAnswer.mockResolvedValueOnce({ status: 'unavailable', message: 'The manual does not give enough detail to draw this.', missing: ['wire colours'] });
  await openWith({ animate: true, animateIntroSeen: true });
  await ask();
  await waitFor(() => expect(screen.getByLabelText('Retry animation')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Retry animation'));
  await waitFor(() => expect(screen.getByText(/does not give enough detail/)).toBeTruthy());
  expect(animateAnswer).toHaveBeenCalledTimes(2);
  expect(animateAnswer.mock.calls[1][0]).toBe(REF);
  expect(screen.getByText('• wire colours')).toBeTruthy();
});

// A stored 'generating' with no request running shows as interrupted: see
// AnimationCard.test.js. Nothing is running for a message when the app opens.
