import { render, screen, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';

// One voice button: tap to dictate into the box, press and hold for hands-free.
// Testers had two voice buttons and did not know which did what.

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../services/api', () => ({ transcribeAudio: jest.fn(async () => 'How do I check the filter?') }));
const mockRecording = { isRecording: false, error: null, startRecording: jest.fn(async () => true), stopRecording: jest.fn(async () => 'file://clip.m4a') };
jest.mock('../hooks/useVoiceRecording', () => ({ useVoiceRecording: () => mockRecording }));

import MicButton, { HOLD_HINT, HOLD_HINT_KEY } from '../components/MicButton';

beforeEach(() => {
  jest.clearAllMocks();
  AsyncStorage.getItem.mockResolvedValue(null);
});

const mic = () => screen.getByLabelText('Voice input');

test('tap twice dictates into the box', async () => {
  const onTranscript = jest.fn();
  await render(<MicButton onTranscript={onTranscript} onHandsFree={jest.fn()} />);
  await fireEvent.press(mic());
  await fireEvent.press(mic());
  expect(mockRecording.startRecording).toHaveBeenCalledTimes(1);
  expect(onTranscript).toHaveBeenCalledWith('How do I check the filter?');
});

test('press and hold starts hands-free, without mockRecording a dictation', async () => {
  const onHandsFree = jest.fn();
  await render(<MicButton onTranscript={jest.fn()} onHandsFree={onHandsFree} />);
  await fireEvent(mic(), 'longPress');
  expect(onHandsFree).toHaveBeenCalledTimes(1);
  expect(mockRecording.startRecording).not.toHaveBeenCalled();
});

test('a hold while dictating does not start hands-free', async () => {
  const onHandsFree = jest.fn();
  await render(<MicButton onTranscript={jest.fn()} onHandsFree={onHandsFree} />);
  await fireEvent.press(mic());
  await fireEvent(mic(), 'longPress');
  expect(onHandsFree).not.toHaveBeenCalled();
});

test('disabled: neither tap nor hold does anything', async () => {
  const onHandsFree = jest.fn();
  await render(<MicButton onTranscript={jest.fn()} onHandsFree={onHandsFree} disabled />);
  await fireEvent(mic(), 'longPress');
  expect(onHandsFree).not.toHaveBeenCalled();
});

test('the first tap explains the hold, once', async () => {
  await render(<MicButton onTranscript={jest.fn()} onHandsFree={jest.fn()} />);
  await fireEvent.press(mic());
  await act(async () => {});
  expect(Toast.show).toHaveBeenCalledWith(expect.objectContaining({ text1: HOLD_HINT }));
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(HOLD_HINT_KEY, '1');

  Toast.show.mockClear();
  AsyncStorage.getItem.mockResolvedValue('1');
  await fireEvent.press(mic());   // stops the first dictation
  await fireEvent.press(mic());   // starts another
  await act(async () => {});
  expect(Toast.show).not.toHaveBeenCalled();
});

test('without onHandsFree: no hint, and the hint text says tap only', async () => {
  await render(<MicButton onTranscript={jest.fn()} />);
  expect(mic().props.accessibilityHint).toBe('Tap to dictate a question.');
  await fireEvent.press(mic());
  await act(async () => {});
  expect(Toast.show).not.toHaveBeenCalled();
});

test('screen readers get a named hands-free action', async () => {
  const onHandsFree = jest.fn();
  await render(<MicButton onTranscript={jest.fn()} onHandsFree={onHandsFree} />);
  expect(mic().props.accessibilityActions).toContainEqual({ name: 'longpress', label: 'Start hands-free' });
  await fireEvent(mic(), 'accessibilityAction', { nativeEvent: { actionName: 'longpress' } });
  expect(onHandsFree).toHaveBeenCalledTimes(1);
});
