import { render, screen, fireEvent, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Fixes from the first round of user testing (Nov 2026): follow-ups carry the
// previous answer, "Explain more simply", tap-to-enlarge pictures with a source
// caption, and a wait message with the real time waited.

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn() }));
jest.mock('../firebaseConfig', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), addDoc: jest.fn().mockResolvedValue({}), serverTimestamp: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

import { submitQuery } from '../services/api';
import { previousExchange, SIMPLER_QUESTION } from '../utils/followUp';
import { imageCaption } from '../utils/imageCaption';
import BotMessage from '../components/BotMessage';
import ExpandableImage from '../components/ExpandableImage';
import WaitStatus from '../components/WaitStatus';

const chat = [
  { id: 'u1', from: 'user', text: 'How do I remove the filter?' },
  { id: 'b1', from: 'bot', text: 'Open the panel [[p:21]].', isProcedural: true },
  { id: 'u2', from: 'user', text: 'And the drain pan?' },
  { id: 'b2', from: 'bot', text: 'Lift the pan out [[p:22]].', isProcedural: false },
  { id: 'b3', from: 'bot', text: 'Error: Could not reach the server.', actions: [{ type: 'retry' }] },
];

describe('previousExchange', () => {
  test('the latest answer and the question before it, skipping errors', () => {
    expect(previousExchange(chat)).toEqual({ question: 'And the drain pan?', answer: 'Lift the pan out [[p:22]].' });
  });
  test('a chosen answer', () => {
    expect(previousExchange(chat, 'b1')).toEqual({ question: 'How do I remove the filter?', answer: 'Open the panel [[p:21]].' });
  });
  test('nothing before the first answer, or for a non-answer', () => {
    expect(previousExchange([chat[0]])).toBeNull();
    expect(previousExchange(chat, 'b3')).toBeNull();
    expect(previousExchange(undefined)).toBeNull();
  });
  test('a long answer is cut to 4,000 characters', () => {
    const long = [{ id: 'u', from: 'user', text: 'q' }, { id: 'b', from: 'bot', text: 'x'.repeat(5000), isProcedural: false }];
    expect(previousExchange(long).answer).toHaveLength(4000);
  });
});

describe('submitQuery sends previous', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ uid: 'u1', role: 'beginner', email: 'u@example.com' }));
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'ok', sources: [] }) });
  });
  const sent = () => JSON.parse(global.fetch.mock.calls[0][1].body);
  const previous = { question: 'q', answer: 'a' };

  test('with a typed follow-up', async () => {
    await submitQuery('simpler please', { previous });
    expect(sent().previous).toEqual(previous);
  });
  test.each([
    ['a quote', { quote: { text: 'passage' } }],
    ['a photo', { images: ['abc'] }],
    ['hands-free', { voice: true }],
  ])('not with %s', async (_label, options) => {
    await submitQuery('q', { previous, ...options });
    expect(sent()).not.toHaveProperty('previous');
  });
  test('not when there is none', async () => {
    await submitQuery('q', {});
    expect(sent()).not.toHaveProperty('previous');
  });
});

describe('imageCaption', () => {
  test('names the confirmed model', () => {
    expect(imageCaption({ model: 'CS-S10TKH', document: 'x.pdf', page: 56 })).toBe('From the CS-S10TKH manual, p.56. Your unit may look different.');
  });
  test('otherwise the manual file, tidied', () => {
    expect(imageCaption({ document: 'CS-E7JKEW_SM_PNAAW016053C9.pdf', page: 55 })).toBe('From CS-E7JKEW SM PNAAW016053C9, p.55. Your unit may look different.');
  });
  test('with nothing known', () => {
    expect(imageCaption({})).toBe('From the manual. Your unit may look different.');
  });
});

describe('Explain more simply', () => {
  const answer = { id: 'b1', from: 'bot', text: 'Open the panel.', sources: [], isProcedural: false };
  test('shown under an answer and reports which one', async () => {
    const onExplainSimpler = jest.fn();
    await render(<BotMessage item={answer} updateMessage={jest.fn()} onExplainSimpler={onExplainSimpler} />);
    await fireEvent.press(screen.getByText('Explain more simply'));
    expect(onExplainSimpler).toHaveBeenCalledWith(answer);
  });
  test('not under a prompt or an error', async () => {
    await render(<BotMessage item={{ id: 'e', from: 'bot', text: 'Error: x', sources: [] }} updateMessage={jest.fn()} onExplainSimpler={jest.fn()} />);
    expect(screen.queryByText('Explain more simply')).toBeNull();
  });
  test('the question is plain', () => {
    expect(SIMPLER_QUESTION).toBe('Explain this more simply, for a beginner.');
  });
});

describe('pictures', () => {
  test('a picture opens full screen and closes', async () => {
    await render(<ExpandableImage uri="https://example.com/a.jpg" style={{ width: 10, height: 10 }} accessibilityLabel="Filter" />);
    await fireEvent.press(screen.getByLabelText('Filter. Tap to enlarge'));
    expect(screen.getByLabelText('Close picture')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Close picture'));
  });
  test('no picture, nothing drawn', async () => {
    await render(<ExpandableImage uri={null} />);
    expect(screen.queryByLabelText(/Tap to enlarge/)).toBeNull();
  });
  test('an inline figure is tappable and captioned with its manual and page', async () => {
    const item = {
      id: 'b1', from: 'bot', isProcedural: false, text: 'Remove the filter [[p:21]].',
      sources: [{ filename: 'CS-S10TKH.pdf', page: 21, images: [{ url: 'https://example.com/f.jpg', caption: 'Filter' }] }],
    };
    await render(<BotMessage item={item} updateMessage={jest.fn()} />);
    expect(screen.getByLabelText('Filter. Tap to enlarge')).toBeTruthy();
    expect(screen.getByText('From CS-S10TKH, p.21. Your unit may look different.')).toBeTruthy();
  });
});

describe('WaitStatus', () => {
  test('shows the seconds waited', async () => {
    jest.useFakeTimers();
    await render(<WaitStatus />);
    expect(screen.getByText(/Searching the manuals and writing your answer…/)).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(3000); });
    expect(screen.getByText(/· 3 s/)).toBeTruthy();
    jest.useRealTimers();
  });
});

describe('step picture', () => {
  const ProcedureViewer = require('../components/ProcedureViewer').default;
  const { addDoc } = require('firebase/firestore');
  const steps = [{
    title: 'Remove the filter', description: 'Slide it down and out.', warningLevel: 'none', toolsRequired: [],
    imageUrl: 'https://example.com/f.jpg', imageDocument: 'CS-S10TKH.pdf', imagePage: 21, imageModel: null,
  }];

  test('is tappable and captioned', async () => {
    await render(<ProcedureViewer steps={steps} state={null} onChange={jest.fn()} />);
    expect(screen.getByLabelText('Manual picture for Remove the filter. Tap to enlarge')).toBeTruthy();
    expect(screen.getByText('From CS-S10TKH, p.21. Your unit may look different.')).toBeTruthy();
  });

  test("\"Doesn't match my unit\" sends a report to Alerts once", async () => {
    AsyncStorage.getItem.mockResolvedValue(JSON.stringify({ email: 'u@example.com', role: 'beginner' }));
    await render(<ProcedureViewer steps={steps} state={null} onChange={jest.fn()} />);
    await fireEvent.press(screen.getByText("Doesn't match my unit"));
    expect(addDoc).toHaveBeenCalledWith(undefined, expect.objectContaining({
      type: 'report', title: "Picture doesn't match the unit", imageUrl: 'https://example.com/f.jpg',
      document: 'CS-S10TKH.pdf', page: 21, userEmail: 'u@example.com',
    }));
    expect(await screen.findByText('Reported. Thank you.')).toBeTruthy();
    expect(screen.queryByText("Doesn't match my unit")).toBeNull();
  });
});

describe('answers from more than one manual', () => {
  const answer = (sources) => ({ id: 'b', from: 'bot', isProcedural: true, text: 'Steps.', sources });
  test('say so and ask for the unit', async () => {
    await render(<BotMessage item={answer([{ filename: 'A.pdf', page: 1 }, { filename: 'B.pdf', page: 2 }, { filename: 'A.pdf', page: 3 }])} updateMessage={jest.fn()} />);
    expect(screen.getByText(/This answer uses 2 different manuals/)).toBeTruthy();
  });
  test('one manual, no note', async () => {
    await render(<BotMessage item={answer([{ filename: 'A.pdf', page: 1 }, { filename: 'A.pdf', page: 3 }])} updateMessage={jest.fn()} />);
    expect(screen.queryByText(/different manuals/)).toBeNull();
  });
  test('not on a prompt without an answer', async () => {
    await render(<BotMessage item={{ id: 'p', from: 'bot', text: 'Which model?', sources: [{ filename: 'A.pdf' }, { filename: 'B.pdf' }] }} updateMessage={jest.fn()} />);
    expect(screen.queryByText(/different manuals/)).toBeNull();
  });
});

describe('iOS polish (Nov 2026)', () => {
  const { groupLabel, filenameForGroup } = require('../utils/imageCaption');
  const { StyleSheet } = require('react-native');

  test('captions name the manual by its model, not its file code', () => {
    expect(groupLabel('panasonic_aircon_CS-S10TKH')).toBe('Panasonic Aircon CS-S10TKH');
    expect(imageCaption({ group: 'panasonic_aircon_CS-S10TKH', document: 'CS-s10-13-18-24-28tkh_cu-s10.pdf', page: 56 }))
      .toBe('From the Panasonic Aircon CS-S10TKH manual, p.56. Your unit may look different.');
  });

  test('a file name is only shown under the model it belongs to', () => {
    const files = ['CS-E7JKEW_SM_PHAAM0810051C2', 'CS-PW24KE_service_manual_PHAAM0810057C2', 'CS-s10-13-18-24-28tkh_cu-s10-13-18-24-28tkh'];
    expect(filenameForGroup('panasonic_aircon_CS-PW24KE', files)).toBe('CS-PW24KE_service_manual_PHAAM0810057C2');
    expect(filenameForGroup('panasonic_aircon_E7JKEW', files)).toBe('CS-E7JKEW_SM_PHAAM0810051C2');
    expect(filenameForGroup('panasonic_aircon_CS-S10TKH', files)).toBe('');
  });

  test('a full-width picture gives its width to the tappable frame and fills it', async () => {
    await render(<ExpandableImage uri="https://example.com/a.jpg" style={{ width: '100%', height: 220, marginVertical: 10, borderRadius: 8 }} accessibilityLabel="Fig" />);
    const frame = StyleSheet.flatten(screen.getByLabelText('Fig. Tap to enlarge').props.style);
    expect(frame).toMatchObject({ width: '100%', marginVertical: 10 });
  });

  test('an inline figure is captioned with the manual model name', async () => {
    const item = {
      id: 'b1', from: 'bot', isProcedural: false, text: 'Remove the filter [[p:56]].',
      sources: [{ filename: 'CS-s10-13-18-24-28tkh_cu-s10.pdf', document_group_id: 'panasonic_aircon_CS-S10TKH', page: 56, images: [{ url: 'https://example.com/f.jpg', caption: 'Filter' }] }],
    };
    await render(<BotMessage item={item} updateMessage={jest.fn()} />);
    expect(screen.getByText('From the Panasonic Aircon CS-S10TKH manual, p.56. Your unit may look different.')).toBeTruthy();
  });
});
