import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
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
jest.mock('../services/api', () => ({ submitQuery: jest.fn(), decodeEntities: text => text || '', getFilters: jest.fn().mockResolvedValue({}) }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { submitQuery } from '../services/api';
import Dashboard from '../app/dashboard';

beforeEach(() => { jest.clearAllMocks(); });

test('APP-A5-1 Retry keeps the original detail after the picker changes, and the Brief answer is saved', async () => {
  submitQuery.mockRejectedValueOnce(Object.assign(new Error('Temporary outage'), { retryable: true }));
  submitQuery.mockResolvedValueOnce({ text: 'Short explanation.', sources: [], isProcedural: false, responseDetail: 'brief' });
  await render(<Dashboard />);
  await waitFor(() => expect(screen.getByLabelText('Response detail: Standard').props.accessibilityState.disabled).toBe(false));
  await fireEvent.press(screen.getByLabelText('Response detail: Standard'));
  await fireEvent.press(screen.getByRole('radio', { name: 'Brief' }));
  await fireEvent.changeText(screen.getByPlaceholderText('Ask a maintenance question...'), 'Explain the filter');
  await fireEvent.press(screen.getByLabelText('Send question'));
  await waitFor(() => expect(screen.getByLabelText('Retry')).toBeTruthy());
  expect(submitQuery.mock.calls[0][1].detail).toBe('brief');
  await fireEvent.press(screen.getByLabelText('Response detail: Brief'));
  await fireEvent.press(screen.getByRole('radio', { name: 'Detailed' }));
  await fireEvent.press(screen.getByLabelText('Retry'));
  await waitFor(() => expect(submitQuery).toHaveBeenCalledTimes(2));
  expect(submitQuery.mock.calls[1][1].detail).toBe('brief');
  await waitFor(() => expect(screen.getByText('Short explanation.')).toBeTruthy());
  expect(screen.getByText('Brief answer')).toBeTruthy();
  expect(screen.getByLabelText('Response detail: Detailed')).toBeTruthy();
  const savedChats = AsyncStorage.setItem.mock.calls.filter(([key]) => key === 'chats_beginner').at(-1)[1];
  const savedMessage = JSON.parse(savedChats)[0].messages.at(-1);
  expect(savedMessage).toMatchObject({ text: 'Short explanation.', detail: 'brief', responseDetail: 'brief', procedureView: 'text' });
});
