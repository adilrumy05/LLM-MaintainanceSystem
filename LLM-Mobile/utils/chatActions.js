import { decodeEntities } from '../services/api';

export const actionsForOutcome = (result, hadPhoto) => {
  const retake   = hadPhoto ? [{ type: 'retake' }]    : [];
  const addPhoto = hadPhoto ? [{ type: 'add_photo' }] : [];
  switch (result.needsInput) {
    case 'ask_model':
      return [...(result.candidates || []).map(m => ({ type: 'confirm_model', model: decodeEntities(m) })), ...addPhoto];
    case 'conflict':
      return [...(result.readModel ? [{ type: 'use_photo_model', model: decodeEntities(result.readModel) }] : []), ...retake];
    case 'ask_photo':
    case 'no_manual':
      return retake;
    default:
      return [];
  }
};

export const actionLabel = (a) => {
  switch (a.type) {
    case 'confirm_model':   return a.model;
    case 'use_photo_model': return `Use ${a.model}`;
    case 'retake':          return 'Retake photo';
    case 'add_photo':       return 'Add a photo';
    case 'retry':           return 'Retry';
    default:                return 'OK';
  }
};