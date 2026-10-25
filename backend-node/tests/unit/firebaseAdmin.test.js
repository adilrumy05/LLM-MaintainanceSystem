// The Firebase admin key can come from FIREBASE_SERVICE_ACCOUNT (Railway) as well
// as from serviceAccountKey.json (a laptop). Firebase itself is mocked: nothing
// here connects anywhere.

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(() => ({})),
  cert: jest.fn((account) => account),
  getApps: jest.fn(() => []),
}));
jest.mock('firebase-admin/firestore', () => ({ getFirestore: jest.fn(() => ({})) }));

const { loadServiceAccount, parseServiceAccount } = require('../../server/config/firebaseAdmin');

const ACCOUNT = {
  type: 'service_account',
  project_id: 'test-project',
  client_email: 'svc@test-project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
};

test('reads the key from FIREBASE_SERVICE_ACCOUNT as plain JSON', () => {
  expect(loadServiceAccount({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify(ACCOUNT) })).toEqual(ACCOUNT);
});

test('reads the key when the variable holds base64-encoded JSON', () => {
  const encoded = Buffer.from(JSON.stringify(ACCOUNT)).toString('base64');
  expect(loadServiceAccount({ FIREBASE_SERVICE_ACCOUNT: encoded })).toEqual(ACCOUNT);
});

test('turns escaped line breaks in the private key back into real ones', () => {
  const pasted = { ...ACCOUNT, private_key: ACCOUNT.private_key.replace(/\n/g, '\\n') };
  expect(parseServiceAccount(JSON.stringify(pasted)).private_key).toBe(ACCOUNT.private_key);
});

test('refuses a key that is missing a required field', () => {
  const { client_email: _omitted, ...incomplete } = ACCOUNT;
  expect(() => parseServiceAccount(JSON.stringify(incomplete))).toThrow(/client_email/);
});

test('refuses a variable that is not JSON', () => {
  expect(() => parseServiceAccount('not a key')).toThrow();
});

test('an empty variable is ignored, so the key file is used instead', () => {
  let result;
  try { result = loadServiceAccount({ FIREBASE_SERVICE_ACCOUNT: '   ' }); } catch (err) { result = err; }
  // Either the laptop's key file was found, or the "not found" error came from the
  // file lookup - in both cases the blank variable itself was not parsed.
  expect(result instanceof Error ? result.code : 'loaded-from-file').toMatch(/MODULE_NOT_FOUND|loaded-from-file/);
});
