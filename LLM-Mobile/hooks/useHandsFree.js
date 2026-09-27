// hooks/useHandsFree.js
//
// Hands-free mode, Version A: independent spoken questions, answered aloud.
//
//   off ─▶ listening ─▶ transcribing ─▶ thinking ─▶ speaking ─┐
//            ▲                                                │
//            └────────────────────────────────────────────────┘
//   stop · error · leave screen · background ─▶ off
//
// Each question is self-contained: the backend receives no conversation
// history, so this is not a multi-turn conversation and must not be described
// as one.
//
// Rules this hook enforces:
//  - The microphone is never recording while an answer is being spoken, or the
//    app would transcribe its own voice.
//  - One turn at a time. Every async step checks it still belongs to the
//    current turn; a reply that arrives after stop() is discarded, never spoken.
//  - "repeat" replays the stored spoken text. It never re-asks the model, which
//    could give a different answer to the same question.
//  - Audio mode is only switched to playback AFTER the network fetch completes,
//    preventing Android from cancelling in-flight requests.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Speech from 'expo-speech';
import { useVoiceRecording } from './useVoiceRecording';
import { transcribeAudio } from '../services/api';
import { createEndpointer } from '../utils/endpointing';

const TICK_MS = 100;
const MAX_EMPTY_TURNS = 2;

const STOP_COMMAND = /^(stop|stop listening|exit|exit hands[- ]?free|end hands[- ]?free|turn off hands[- ]?free)$/;
const REPEAT_COMMAND = /^(repeat|repeat that|repeat the answer|repeat last answer|say that again|again|what did you say)$/;

const normalise = (text) => text.toLowerCase().replace(/[^a-z\s-]/g, '').replace(/\s+/g, ' ').trim();

/**
 * @param {object} params
 * @param {(text: string) => Promise<{ speak: string, stopAfter?: boolean }>} params.ask
 *   Sends the transcribed question and returns what to say back. The caller
 *   owns chat messages; this hook owns audio.
 * @param {(notice: string) => void} [params.onNotice]  short status for the UI
 */
export function useHandsFree({ ask, onNotice }) {
  const recording = useVoiceRecording({ metering: true });
  const [phase, setPhase] = useState('off');
  const [level, setLevel] = useState(null);
  const [floor, setFloor] = useState(null);

  const activeRef = useRef(false);
  const recordingRef = useRef(false);
  const turnRef = useRef(0);
  const endpointerRef = useRef(null);
  const tickRef = useRef(null);
  const meteringRef = useRef(null);
  const lastSpokenRef = useRef(null);
  const emptyTurnsRef = useRef(0);
  const askRef = useRef(ask);
  const noticeRef = useRef(onNotice);
  askRef.current = ask;
  noticeRef.current = onNotice;
  meteringRef.current = recording.metering;

  const notice = (msg) => noticeRef.current?.(msg);
  const isCurrent = (turn) => activeRef.current && turnRef.current === turn;

  // Stops the recorder at most once, whichever path gets there first.
  // preparePlayback: only switch audio mode to playback when explicitly requested,
  // AFTER any network fetch has completed, to avoid Android cancelling requests.
  const stopRecorder = async ({ preparePlayback = false } = {}) => {
    if (!recordingRef.current) return null;
    recordingRef.current = false;
    const uri = await recording.stopRecording().catch(() => null);
    if (preparePlayback) {
      await recording.prepareForPlayback().catch(() => {});
    }
    return uri;
  };

  const clearTick = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    endpointerRef.current = null;
  };

  const stop = useCallback(async (reason) => {
    const wasActive = activeRef.current;
    activeRef.current = false;
    turnRef.current += 1;
    clearTick();
    Speech.stop().catch(() => {});
    await stopRecorder({ preparePlayback: true });
    setPhase('off');
    setLevel(null);
    setFloor(null);
    if (wasActive && reason) notice(reason);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.stopRecording, recording.prepareForPlayback]);

  const speak = useCallback(async (text, turn, { then = 'listen' } = {}) => {
    if (!isCurrent(turn)) return;
    setPhase('speaking');
    // Switch to playback mode here — only reached after all fetches are done.
    await recording.prepareForPlayback();
    if (!isCurrent(turn)) return;
    Speech.speak(text, {
      onDone: () => {
        if (!isCurrent(turn)) return;
        if (then === 'stop') stop();
        else listenRef.current(turn);
      },
      onError: () => {
        if (isCurrent(turn)) stop('Could not play audio. Hands-free stopped.');
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.prepareForPlayback, stop]);

  const finishTurn = useCallback(async (turn) => {
    clearTick();
    if (!isCurrent(turn)) return;
    setPhase('transcribing');

    // Stop the recorder but do NOT switch to playback yet — switching audio
    // mode on Android cancels in-flight network requests. Playback mode is set
    // inside speak(), only after both fetches (transcribe + query) are done.
    const uri = await stopRecorder({ preparePlayback: false });
    if (!isCurrent(turn)) return;

    let text = '';
    try {
      text = uri ? (await transcribeAudio(uri))?.trim() || '' : '';
    } catch (e) {
      if (isCurrent(turn)) await speak('Sorry, I could not transcribe that. Hands-free is stopping.', turn, { then: 'stop' });
      return;
    }
    if (!isCurrent(turn)) return;

    if (!text) {
      emptyTurnsRef.current += 1;
      if (emptyTurnsRef.current >= MAX_EMPTY_TURNS) {
        await stop('Did not catch anything twice. Hands-free paused.');
      } else {
        listenRef.current(turn);
      }
      return;
    }
    emptyTurnsRef.current = 0;

    const command = normalise(text);
    if (STOP_COMMAND.test(command)) {
      await stop('Hands-free stopped.');
      return;
    }
    if (REPEAT_COMMAND.test(command)) {
      await speak(lastSpokenRef.current || 'There is nothing to repeat yet.', turn);
      return;
    }

    setPhase('thinking');
    let reply;
    try {
      reply = await askRef.current(text);
    } catch (e) {
      reply = { speak: 'Something went wrong getting the answer. Hands-free is stopping.', stopAfter: true };
    }

    // A late reply after stop, or after a newer turn started, is dropped.
    if (!isCurrent(turn)) return;
    if (!reply?.speak) {
      if (reply?.stopAfter) await stop();
      else listenRef.current(turn);
      return;
    }

    if (!reply.stopAfter) lastSpokenRef.current = reply.speak;
    // speak() switches to playback mode — safe now because both fetches are done.
    await speak(reply.speak, turn, { then: reply.stopAfter ? 'stop' : 'listen' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.stopRecording, speak, stop]);

  const listen = useCallback(async (previousTurn) => {
    if (!activeRef.current) return;
    if (previousTurn !== undefined && turnRef.current !== previousTurn) return;
    const turn = ++turnRef.current;

    const started = await recording.startRecording();
    recordingRef.current = Boolean(started);
    if (!isCurrent(turn)) {
      await stopRecorder();
      return;
    }
    if (!started) {
      await stop(recording.error || 'Could not start the microphone. Hands-free stopped.');
      return;
    }

    setPhase('listening');
    const endpointer = createEndpointer();
    endpointerRef.current = endpointer;
    tickRef.current = setInterval(() => {
      if (endpointerRef.current !== endpointer) return;
      const result = endpointer.push(meteringRef.current, Date.now());
      setLevel(result.level);
      setFloor(result.floor);
      if (result.event === 'end') {
        finishTurn(turn);
      } else if (result.event === 'no_speech') {
        stop('No speech heard. Hands-free paused.');
      }
    }, TICK_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.startRecording, recording.stopRecording, recording.error, finishTurn, stop]);

  // speak() and finishTurn() call listen(), which is defined after them.
  const listenRef = useRef(listen);
  listenRef.current = listen;

  const start = useCallback(async () => {
    if (activeRef.current) return;
    const granted = recording.permissionGranted ?? (await recording.ensurePermission());
    if (!granted) {
      notice('Microphone access is off. Allow it in Settings to use hands-free.');
      return;
    }
    activeRef.current = true;
    emptyTurnsRef.current = 0;
    listenRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.permissionGranted, recording.ensurePermission]);

  /** Tap-to-finish: end the current utterance now instead of waiting for silence. */
  const finishNow = useCallback(() => {
    if (phase === 'listening') finishTurn(turnRef.current);
  }, [phase, finishTurn]);

  // Leaving the app stops everything. Backgrounded audio would otherwise keep
  // recording or speaking with nobody looking at the screen.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && activeRef.current) stop('Hands-free stopped when the app went to the background.');
    });
    return () => sub.remove();
  }, [stop]);

  // Unmount stops audio. Runs once; stop() reads refs, so a stale closure is safe.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => () => { stopRef.current(); }, []);

  return {
    phase,
    active: phase !== 'off',
    level,
    floor,
    start,
    stop,
    finishNow,
  };
}