import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import usePreferences from '../hooks/usePreferences';
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

beforeEach(() => { jest.clearAllMocks(); AsyncStorage.getItem.mockResolvedValue(null); AsyncStorage.setItem.mockResolvedValue(); });

test('loads and persists per user, preserving unrelated settings', async () => {
  AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ detail: 'detailed', anotherSetting: true }));
  const { result } = await renderHook(() => usePreferences({ uid: 'u1' }));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.detail).toBe('detailed');
  await act(async () => result.current.setDetail('detailed'));
  await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith('prefs_u1', JSON.stringify({ detail: 'detailed', anotherSetting: true })));
});

test('Animate is off until turned on, and turning it on records that the notice was read', async () => {
  const { result } = await renderHook(() => usePreferences({ uid: 'u1' }));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current).toMatchObject({ animate: false, animateIntroSeen: false });
  await act(async () => result.current.setAnimate(true));
  expect(result.current).toMatchObject({ animate: true, animateIntroSeen: true, detail: 'standard' });
  await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith('prefs_u1', JSON.stringify({ animate: true, animateIntroSeen: true })));
  await act(async () => result.current.setAnimate(false));
  expect(result.current).toMatchObject({ animate: false, animateIntroSeen: true });
});

test('missing and corrupt preferences fall back to Standard', async () => {
  AsyncStorage.getItem.mockResolvedValue('{invalid');
  const { result } = await renderHook(() => usePreferences({ email: 'a@example.com' }));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.detail).toBe('standard'); expect(result.current.error).toBeTruthy();
});

test('late preference load cannot leak between accounts', async () => {
  let resolveOld;
  AsyncStorage.getItem.mockImplementation(key => key === 'prefs_old' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve('{"detail":"detailed"}'));
  const { result, rerender } = await renderHook(({ uid }) => usePreferences({ uid }), { initialProps: { uid: 'old' } });
  await rerender({ uid: 'new' });
  await waitFor(() => expect(result.current.detail).toBe('detailed'));
  await act(async () => resolveOld('{"detail":"standard"}'));
  expect(result.current.detail).toBe('detailed');
  await act(async () => result.current.setDetail('standard'));
  await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith('prefs_new', '{"detail":"standard"}'));
});

test('failed storage still keeps the current session choice and reports it', async () => {
  AsyncStorage.setItem.mockRejectedValue(new Error('storage full'));
  const { result } = await renderHook(() => usePreferences({ uid: 'u1' }));
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => result.current.setDetail('detailed'));
  await waitFor(() => expect(result.current.error).toMatch(/Could not save/));
  expect(result.current.detail).toBe('detailed');
});
