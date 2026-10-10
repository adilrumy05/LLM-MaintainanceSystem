import AsyncStorage from '@react-native-async-storage/async-storage';
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn() }));
jest.mock('../firebaseConfig', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), addDoc: jest.fn().mockResolvedValue({}), serverTimestamp: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
import { submitQuery } from '../services/api';
import { FEATURES } from '../constants/featureFlags';

beforeEach(() => {
  jest.clearAllMocks(); FEATURES.EFFORT_LEVELS = true;
  AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ uid: 'u1', role: 'beginner', email: 'u@example.com', token: 'test-token' }));
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'Short', responseDetail: 'brief', sources: [] }) });
});
afterEach(() => { FEATURES.EFFORT_LEVELS = true; });
const sent = () => JSON.parse(global.fetch.mock.calls[0][1].body);

test('sends Brief alongside photo, equipment and quoted-passage context', async () => {
  const result = await submitQuery('Explain', { detail: 'brief', images: ['photo'], confirmedModel: 'MODEL', docGroup: 'manual', quote: { text: 'passage', messageId: 'm1' } });
  expect(sent()).toMatchObject({ detail: 'brief', images: ['photo'], confirmedModel: 'MODEL', docGroup: 'manual', quote: { text: 'passage', messageId: 'm1' } });
  expect(result.responseDetail).toBe('brief');
});
test.each([{}, { detail: 'standard' }, { detail: 'brief', voice: true }])('keeps existing default/voice contract %p', async options => {
  await submitQuery('Explain', options); expect(sent()).not.toHaveProperty('detail');
});
test('feature off omits detail on the wire', async () => {
  FEATURES.EFFORT_LEVELS = false; await submitQuery('Explain', { detail: 'detailed' }); expect(sent()).not.toHaveProperty('detail');
});
test('returns fallback metadata unchanged', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ text: 'Full', responseDetail: 'standard', detailFallback: 'unverified_figures' }) });
  expect((await submitQuery('Explain', { detail: 'brief' })).detailFallback).toBe('unverified_figures');
});
