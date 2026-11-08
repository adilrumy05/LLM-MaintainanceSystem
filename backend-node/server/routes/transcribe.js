// server/routes/transcribe.js
const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const { toFile } = require('openai');
const fs = require('fs');
const router = express.Router();
const path = require('path');
const upload = multer({
  dest: path.join(__dirname, '..', '..', 'uploads', 'audio'),
});

// Built on first use, not at import time.
//
// The OpenAI SDK throws if apiKey is undefined. Constructing the client at
// module scope meant `require`-ing this file blew up whenever OPENAI_API_KEY
// was unset — and server.js requires it at the top level, so the entire backend
// failed to start. It also broke four Jest suites at import, contradicting the
// "runs fully offline with no credentials required" promise in jest.config.js.
//
// Deferring construction keeps the failure where it belongs: on the one route
// that actually needs the key, as a 500 with a clear message.
let openai = null;
function getOpenAI() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set — voice transcription is unavailable.');
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// The language Whisper writes in. Left to detect it, Whisper heard some
// Malaysian-accented English as Malay and wrote the question in Malay ("hello
// hello ujian 1 2 3"), so it is told to expect English. TRANSCRIBE_LANGUAGE
// (an ISO-639-1 code) changes it; "auto" goes back to detection.
const transcribeLanguage = () => {
  const lang = (process.env.TRANSCRIBE_LANGUAGE || 'en').trim().toLowerCase();
  return lang === 'auto' ? null : /^[a-z]{2}$/.test(lang) ? lang : 'en';
};

// Spelling hints for the words technicians use. Whisper treats the prompt as
// earlier speech, so it is a plain list rather than an instruction.
const TRANSCRIBE_PROMPT =
  'Air conditioner maintenance: indoor unit, outdoor unit, air filter, drain pan, '
  + 'drain hose, front grille, PCB, compressor, refrigerant, error code H11, Panasonic, Toshiba.';

router.post('/transcribe', upload.single('audio'), async (req, res) => {
  console.log('[transcribe] request received, file:', req.file?.originalname, req.file?.size);
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file received' });
  }
  try {
    const fileForOpenAI = await toFile(fs.createReadStream(req.file.path), 'audio.m4a');
    const transcription = await getOpenAI().audio.transcriptions.create({
      file: fileForOpenAI,
      model: 'whisper-1',
      ...(transcribeLanguage() ? { language: transcribeLanguage() } : {}),
      prompt: TRANSCRIBE_PROMPT,
    });
    res.json({ text: transcription.text });
  } catch (err) {
    console.error('[transcribe] error:', err.message);
    res.status(500).json({ error: 'Transcription failed', detail: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});
module.exports = router;