// server/routes/transcribe.js
const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const { toFile } = require('openai');
const fs = require('fs');
const router = express.Router();
const upload = multer({ dest: 'uploads/audio/' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  console.log('[transcribe] request received, file:', req.file?.originalname, req.file?.size);
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file received' });
  }
  try {
    const fileForOpenAI = await toFile(fs.createReadStream(req.file.path), 'audio.m4a');
    const transcription = await openai.audio.transcriptions.create({
      file: fileForOpenAI,
      model: 'whisper-1',
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