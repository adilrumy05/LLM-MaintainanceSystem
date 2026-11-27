// hooks/useVoiceRecording.web.js
//
// Web implementation of the same interface as useVoiceRecording.js.
// Capture: getUserMedia + MediaRecorder. Metering: AnalyserNode RMS -> dBFS.

import { useCallback, useEffect, useRef, useState } from 'react';

const PREFERRED_TYPES = [
  'audio/webm;codecs=opus', // Chrome, Edge, Firefox
  'audio/webm',
  'audio/mp4',              // Safari
  'audio/ogg;codecs=opus',
];
const MIN_DB = -90;
const METER_MS = 100;

const pickMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
};

export function useVoiceRecording({ metering = false } = {}) {
  // Hands-free (metering) keeps the mic stream open between turns so the
  // browser doesn't re-prompt every question. Dictation releases it each time.
  const keepWarm = metering;

  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const bufferRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [durationMillis, setDurationMillis] = useState(0);
  const [meter, setMeter] = useState(undefined);
  const [permissionGranted, setPermissionGranted] = useState(null);
  const [error, setError] = useState(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    bufferRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  const acquireStream = useCallback(async () => {
    const live = streamRef.current?.getTracks().some((t) => t.readyState === 'live');
    if (live) return streamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone is not available here. The page must be served over https.');
    }
    streamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false, // AGC would drift the noise floor the endpointer measures
      },
    });
    return streamRef.current;
  }, []);

  const ensurePermission = useCallback(async () => {
    try {
      await acquireStream();
      setPermissionGranted(true);
      return true;
    } catch (e) {
      setError(e.message || 'Could not request microphone permission');
      setPermissionGranted(false);
      return false;
    }
  }, [acquireStream]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('This browser does not support audio recording.');
      }
      const stream = await acquireStream();
      setPermissionGranted(true);

      if (metering) {
        if (!ctxRef.current) {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          ctxRef.current = new Ctx();
          const analyser = ctxRef.current.createAnalyser();
          analyser.fftSize = 2048;
          ctxRef.current.createMediaStreamSource(stream).connect(analyser);
          analyserRef.current = analyser;
          bufferRef.current = new Float32Array(analyser.fftSize);
        }
        await ctxRef.current.resume().catch(() => {});
      }

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      rec.start(250);
      recorderRef.current = rec;
      startedAtRef.current = Date.now();
      setIsRecording(true);

      clearTimer();
      timerRef.current = setInterval(() => {
        setDurationMillis(Date.now() - startedAtRef.current);
        const analyser = analyserRef.current;
        if (!metering || !analyser) return;
        analyser.getFloatTimeDomainData(bufferRef.current);
        let sum = 0;
        for (let i = 0; i < bufferRef.current.length; i++) sum += bufferRef.current[i] ** 2;
        const rms = Math.sqrt(sum / bufferRef.current.length);
        setMeter(Math.max(MIN_DB, 20 * Math.log10(rms || 1e-9)));
      }, METER_MS);
      return true;
    } catch (e) {
      setError(e.message || 'Could not start recording');
      if (!keepWarm) release();
      return false;
    }
  }, [acquireStream, metering, keepWarm, release]);

  const stopRecording = useCallback(async () => {
    clearTimer();
    const rec = recorderRef.current;
    recorderRef.current = null;
    setIsRecording(false);
    setMeter(undefined);
    if (!rec) return null;

    try {
      const blob = await new Promise((resolve) => {
        const finish = () => resolve(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }));
        if (rec.state === 'inactive') return finish();
        rec.onstop = finish;
        rec.stop();
      });
      if (!keepWarm) release();
      return blob.size > 0 ? URL.createObjectURL(blob) : null;
    } catch (e) {
      setError(e.message || 'Could not stop recording');
      if (!keepWarm) release();
      return null;
    }
  }, [keepWarm, release]);

  // Nothing to switch on web: the browser has no earpiece/speaker routing split.
  const prepareForPlayback = useCallback(async () => {}, []);

  useEffect(() => () => {
    clearTimer();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    release();
  }, [release]);

  return {
    isRecording,
    durationMillis,
    metering: meter,
    permissionGranted,
    error,
    startRecording,
    stopRecording,
    ensurePermission,
    prepareForPlayback,
    release,
  };
}