// /api/transcribe: the recording is sent to Whisper told to expect English.
// Left to detect the language, Whisper wrote some Malaysian-accented English
// questions in Malay. OpenAI is mocked: nothing here calls out.

const request = require('supertest');
const express = require('express');

jest.mock('openai', () => {
  const create = jest.fn();
  const OpenAI = jest.fn(() => ({ audio: { transcriptions: { create } } }));
  OpenAI.toFile = jest.fn(async () => 'audio-file');
  OpenAI.create = create;
  return OpenAI;
});
const { create } = require('openai');

const app = express();
app.use('/api', require('../../server/routes/transcribe'));
const send = () => request(app).post('/api/transcribe').attach('audio', Buffer.from('fake audio'), 'clip.m4a');

beforeEach(() => {
  create.mockReset().mockResolvedValue({ text: 'How do I check the indoor unit?' });
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.TRANSCRIBE_LANGUAGE;
});

test('asks Whisper for English by default, with maintenance spelling hints', async () => {
  const res = await send();
  expect(res.status).toBe(200);
  expect(res.body.text).toBe('How do I check the indoor unit?');
  const sent = create.mock.calls[0][0];
  expect(sent).toMatchObject({ model: 'whisper-1', language: 'en' });
  expect(sent.prompt).toMatch(/indoor unit/);
});

test('TRANSCRIBE_LANGUAGE sets another language', async () => {
  process.env.TRANSCRIBE_LANGUAGE = 'ms';
  await send();
  expect(create.mock.calls[0][0].language).toBe('ms');
});

test('TRANSCRIBE_LANGUAGE=auto goes back to detection', async () => {
  process.env.TRANSCRIBE_LANGUAGE = 'auto';
  await send();
  expect(create.mock.calls[0][0]).not.toHaveProperty('language');
});

test('an invalid value falls back to English', async () => {
  process.env.TRANSCRIBE_LANGUAGE = 'english please';
  await send();
  expect(create.mock.calls[0][0].language).toBe('en');
});

test('no audio is a 400', async () => {
  const res = await request(app).post('/api/transcribe');
  expect(res.status).toBe(400);
  expect(create).not.toHaveBeenCalled();
});

test('a Whisper failure is a 500 with a message', async () => {
  create.mockRejectedValueOnce(new Error('upstream down'));
  const res = await send();
  expect(res.status).toBe(500);
  expect(res.body.error).toBe('Transcription failed');
});
