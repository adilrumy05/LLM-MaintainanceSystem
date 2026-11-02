import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getSession } from './api';
import { imageCaption } from '../utils/imageCaption';

// "Doesn't match my unit" under a step's manual picture. Testers saw pictures
// that were inverted, showed parts in other places, or parts their unit does
// not have. Each report goes to Alerts beside the existing issue reports, so
// admins see it, with enough to find the picture in the manual.
export async function reportImageMismatch({ imageUrl, document, page, model, stepTitle }) {
  let user = null;
  try { user = JSON.parse((await AsyncStorage.getItem('user')) || 'null'); } catch { user = null; }
  await addDoc(collection(db, 'Alerts'), {
    type: 'report',
    title: "Picture doesn't match the unit",
    message: `${imageCaption({ document, page, model }).replace(' Your unit may look different.', '')}`
      + (stepTitle ? ` · Step: ${String(stepTitle).slice(0, 80)}` : ''),
    imageUrl,
    document: document || null,
    page: page ?? null,
    model: model || null,
    sessionId: getSession(),
    userEmail: user?.email || 'unknown',
    role: user?.role || 'beginner',
    status: 'Pending Review',
    statusColor: '#ea580c',
    statusBg: '#fff7ed',
    createdAt: serverTimestamp(),
  });
}
