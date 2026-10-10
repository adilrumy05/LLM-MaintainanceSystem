// A small animation in the shape /api/animate returns. The text is made up.
export const animation = {
  title: 'Connect the cable',
  parts: [
    { id: 'cover', label: 'control board cover', shape: 'cover' },
    { id: 'screw', label: 'screw', shape: 'screw' },
    { id: 'board', label: 'control board', shape: 'board' },
    { id: 'cable', label: 'cable', shape: 'cable' },
    { id: 'holder', label: 'holder', shape: 'clamp' },
  ],
  facts: [
    { id: 'f1', type: 'prerequisite', page: 56, text: 'Switch off the power supply before wiring.' },
    { id: 'f2', type: 'action', page: 56, text: 'Remove the control board cover from the control board.', verb: 'remove', verbText: 'remove', direction: 'away', object: 'the control board cover' },
    { id: 'f3', type: 'action', page: 56, text: 'Loosen the screw.', verb: 'loosen', verbText: 'loosen', direction: null, object: 'the screw' },
    { id: 'f4', type: 'connection', page: 56, text: 'Outdoor unit terminal 1 connects to indoor unit terminal 1', from: { unit: 'outdoor unit', terminal: '1' }, to: { unit: 'indoor unit', terminal: '1' } },
    { id: 'f5', type: 'connection', page: 56, text: 'Outdoor unit terminal 2 connects to indoor unit terminal 2', from: { unit: 'outdoor unit', terminal: '2' }, to: { unit: 'indoor unit', terminal: '2' } },
    { id: 'f6', type: 'action', page: 56, text: 'Secure the cable onto the control board with the holder.', verb: 'attach', verbText: 'secure', direction: 'toward', object: 'the cable' },
    { id: 'f7', type: 'quantity', page: 56, text: 'Use a 1.5 mm2 cable.', subject: 'cable', value: '1.5', unit: 'mm$^{2}$' },
  ],
  steps: [
    { factIds: ['f1', 'f2', 'f3'], motions: [] },
    { factIds: ['f4', 'f5'], motions: [] },
    { factIds: ['f6', 'f7'], motions: [] },
  ],
  captions: [
    [{ type: 'prerequisite', page: 56, text: 'Switch off the power supply before wiring.' }, { type: 'action', page: 56, text: 'Remove the control board cover from the control board.' }],
    [{ type: 'connection', page: 56, text: 'Outdoor unit terminal 1 connects to indoor unit terminal 1' }],
    [{ type: 'action', page: 56, text: 'Secure the cable onto the control board with the holder.' }],
  ],
  missingDetails: ['Wire colours are not in the extracted text.'],
};
