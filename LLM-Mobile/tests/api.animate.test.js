import AsyncStorage from '@react-native-async-storage/async-storage';
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn() }));
jest.mock('../firebaseConfig', () => ({ db: {}, auth: { currentUser: { getIdToken: jest.fn() } } }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), addDoc: jest.fn().mockResolvedValue({}), serverTimestamp: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
import { submitQuery, animateAnswer } from '../services/api';
import { auth } from '../firebaseConfig';
import { FEATURES } from '../constants/featureFlags';

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
const sent = (call = 0) => JSON.parse(global.fetch.mock.calls[call][1].body);

beforeEach(() => {
  jest.clearAllMocks(); FEATURES.ANIMATIONS = true;
  AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ uid: 'u1', role: 'beginner', email: 'u@example.com', token: 'saved-token' }));
  auth.currentUser.getIdToken.mockResolvedValue('fresh-token');
  global.fetch = jest.fn().mockResolvedValue(reply(200, { text: 'Answer', sources: [], animationRef: 'a'.repeat(32) }));
});
afterAll(() => { FEATURES.ANIMATIONS = false; });

test('animate is sent with a typed question when the toggle is on, and the reference comes back', async () => {
  const result = await submitQuery('How?', { animate: true });
  expect(sent().animate).toBe(true);
  expect(result.animationRef).toBe('a'.repeat(32));
});

test.each([
  ['the toggle is off', { animate: false }, true],
  ['the question is hands-free', { animate: true, voice: true }, true],
  ['the feature is switched off', { animate: true }, false],
])('animate is not sent when %s', async (_name, options, flag) => {
  FEATURES.ANIMATIONS = flag;
  await submitQuery('How?', options);
  expect(sent()).not.toHaveProperty('animate');
});

test('the animation request carries only the reference and a fresh token', async () => {
  global.fetch.mockResolvedValue(reply(200, { status: 'ready', animation: {
    title: 'Press &quot;CHECK&quot;', parts: [{ id: 'p', label: 'CHECK &amp; TIMER', shape: 'button' }], steps: [{ factIds: ['f1'] }],
    facts: [{ id: 'f1', type: 'action', text: 'Press &quot;CHECK&quot;.', object: 'CHECK', subject: null }],
    captions: [[{ type: 'action', page: 92, text: 'Press &quot;CHECK&quot;.' }]], missingDetails: [],
  } }));
  const result = await animateAnswer('b'.repeat(32));
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toMatch(/\/animate$/);
  expect(options.headers.Authorization).toBe('Bearer fresh-token');
  expect(JSON.parse(options.body)).toEqual({ animationRef: 'b'.repeat(32) });
  expect(result.status).toBe('ready');
  expect(result.animation.captions[0][0].text).toBe('Press "CHECK".');
  expect(result.animation.parts[0].label).toBe('CHECK & TIMER');
});

test('the token saved at sign-in is used when a fresh one cannot be had', async () => {
  auth.currentUser.getIdToken.mockRejectedValue(new Error('offline'));
  global.fetch.mockResolvedValue(reply(200, { status: 'unavailable', reason: 'expired', message: 'Ask again with animations on.', missing: [] }));
  const result = await animateAnswer('b'.repeat(32));
  expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer saved-token');
  expect(result).toMatchObject({ status: 'unavailable', reason: 'expired', message: 'Ask again with animations on.' });
});

test('with no token at all nothing is sent', async () => {
  auth.currentUser.getIdToken.mockResolvedValue(null);
  AsyncStorage.getItem.mockResolvedValue(null);
  expect((await animateAnswer('b'.repeat(32))).status).toBe('failed');
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([
  [401, { error: 'Invalid or expired session.' }, 'failed', /Sign in again/],
  [429, { error: 'Too many', code: 'rate_limited' }, 'failed', /Wait a minute/],
  [503, { error: 'Animations are switched off.', code: 'animations_disabled' }, 'unavailable', /switched off/],
  [500, { error: 'Internal server error.' }, 'failed', /Internal server error/],
])('HTTP %i becomes a message the card can show', async (status, body, expected, message) => {
  global.fetch.mockResolvedValue(reply(status, body));
  const result = await animateAnswer('b'.repeat(32));
  expect(result.status).toBe(expected);
  expect(result.message).toMatch(message);
});

test('a failed animation is passed on as failed', async () => {
  global.fetch.mockResolvedValue(reply(200, { status: 'failed', message: 'The animation could not be made. Try again.' }));
  expect(await animateAnswer('b'.repeat(32))).toEqual({ status: 'failed', message: 'The animation could not be made. Try again.' });
});
