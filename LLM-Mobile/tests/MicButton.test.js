import { render, screen, fireEvent } from '@testing-library/react-native';

// One voice button. A tap opens a small panel to choose Dictate or Hands-free,
// so nobody has to remember a tip; holding still goes straight to hands-free.

jest.mock('../services/api', () => ({ transcribeAudio: jest.fn(async () => 'How do I check the filter?') }));
const mockRecording = { isRecording: false, error: null, startRecording: jest.fn(async () => true), stopRecording: jest.fn(async () => 'file://clip.m4a') };
jest.mock('../hooks/useVoiceRecording', () => ({ useVoiceRecording: () => mockRecording }));

import MicButton from '../components/MicButton';

beforeEach(() => jest.clearAllMocks());
const mic = () => screen.getByLabelText('Voice input');

test('a tap offers Dictate and Hands-free', async () => {
  await render(<MicButton onTranscript={jest.fn()} onHandsFree={jest.fn()} />);
  await fireEvent.press(mic());
  expect(screen.getByText('Dictate')).toBeTruthy();
  expect(screen.getByText('Hands-free')).toBeTruthy();
  expect(mockRecording.startRecording).not.toHaveBeenCalled();
});

test('Dictate records; the next tap stops and fills the box', async () => {
  const onTranscript = jest.fn();
  await render(<MicButton onTranscript={onTranscript} onHandsFree={jest.fn()} />);
  await fireEvent.press(mic());
  await fireEvent.press(screen.getByLabelText('Dictate'));
  expect(mockRecording.startRecording).toHaveBeenCalledTimes(1);
  await fireEvent.press(mic());
  expect(onTranscript).toHaveBeenCalledWith('How do I check the filter?');
});

test('Hands-free in the panel starts hands-free', async () => {
  const onHandsFree = jest.fn();
  await render(<MicButton onTranscript={jest.fn()} onHandsFree={onHandsFree} />);
  await fireEvent.press(mic());
  await fireEvent.press(screen.getByLabelText('Hands-free'));
  expect(onHandsFree).toHaveBeenCalledTimes(1);
  expect(mockRecording.startRecording).not.toHaveBeenCalled();
});

test('tapping outside the panel closes it without doing anything', async () => {
  const onHandsFree = jest.fn();
  await render(<MicButton onTranscript={jest.fn()} onHandsFree={onHandsFree} />);
  await fireEvent.press(mic());
  await fireEvent.press(screen.getByLabelText('Close voice options'));
  expect(screen.queryByText('Dictate')).toBeNull();
  expect(onHandsFree).not.toHaveBeenCalled();
  expect(mockRecording.startRecording).not.toHaveBeenCalled();
});

test('press and hold still goes straight to hands-free', async () => {
  const onHandsFree = jest.fn();
  await render(<MicButton onTranscript={jest.fn()} onHandsFree={onHandsFree} />);
  await fireEvent(mic(), 'longPress');
  expect(onHandsFree).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Dictate')).toBeNull();
});

test('a hold while dictating does not start hands-free', async () => {
  const onHandsFree = jest.fn();
  await render(<MicButton onTranscript={jest.fn()} onHandsFree={onHandsFree} />);
  await fireEvent.press(mic());
  await fireEvent.press(screen.getByLabelText('Dictate'));
  await fireEvent(mic(), 'longPress');
  expect(onHandsFree).not.toHaveBeenCalled();
});

test('disabled: neither tap nor hold does anything', async () => {
  const onHandsFree = jest.fn();
  await render(<MicButton onTranscript={jest.fn()} onHandsFree={onHandsFree} disabled />);
  await fireEvent(mic(), 'longPress');
  expect(onHandsFree).not.toHaveBeenCalled();
  expect(screen.queryByText('Dictate')).toBeNull();
});

test('without onHandsFree, a tap dictates straight away', async () => {
  await render(<MicButton onTranscript={jest.fn()} />);
  expect(mic().props.accessibilityHint).toBe('Tap to dictate a question.');
  await fireEvent.press(mic());
  expect(screen.queryByText('Hands-free')).toBeNull();
  expect(mockRecording.startRecording).toHaveBeenCalledTimes(1);
});

test('screen readers get a named hands-free action', async () => {
  const onHandsFree = jest.fn();
  await render(<MicButton onTranscript={jest.fn()} onHandsFree={onHandsFree} />);
  expect(mic().props.accessibilityActions).toContainEqual({ name: 'longpress', label: 'Start hands-free' });
  await fireEvent(mic(), 'accessibilityAction', { nativeEvent: { actionName: 'longpress' } });
  expect(onHandsFree).toHaveBeenCalledTimes(1);
});
