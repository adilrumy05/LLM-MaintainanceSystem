const { db } = require('../config/firebaseAdmin');
const { FieldValue } = require('firebase-admin/firestore');

async function logAuditRecord(query, text, sources, userId = "anonymous_user", sessionId) {
  if (!db) {
    console.warn('[AUDIT] Skipped — Firebase not configured');
    return null;
  }
  try {
    const finalSessionId = sessionId || `session-${Date.now()}`;
    const formattedTimestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    
    // The new message object
    const newMessage = {
      timestamp: formattedTimestamp,
      user_prompt: query,
      ai_response: text,
      sources_used: sources
    };

    const auditRef = db.collection('audit_logs').doc(finalSessionId);

    // Merge updates the base fields, arrayUnion safely appends the message
    await auditRef.set({
      log_id: finalSessionId,
      user_id: userId,
      action: "llm_chat_session", 
      status: "pending_review",
      last_updated: formattedTimestamp,
      messages: FieldValue.arrayUnion(newMessage) // Directly appends to Firebase array
    }, { merge: true });
    
    console.log(`[AUDIT SUCCESS] Updated session ${finalSessionId} in Firebase!`);

    return finalSessionId;
  } catch (error) {
    console.error("[AUDIT ERROR] Failed to save log:", error);
    throw error;
  }
}


// Records a completed procedure wait against the session.
//
// This is what turns the timer from a convenience into evidence: the audit
// trail can show that a manual-mandated wait was actually observed, and for
// how long, rather than relying on the technician's recollection. Stored
// alongside the messages on the same session document.
async function logTimerEvent(sessionId, event) {
  if (!db) {
    console.warn('[TIMER] Skipped — Firebase not configured');
    return null;
  }
  if (!sessionId) throw new Error('sessionId is required');

  const entry = {
    label: String(event?.label || 'Procedure wait').slice(0, 120),
    seconds: Number(event?.seconds) || 0,
    completed_at: event?.completed_at || new Date().toISOString(),
  };

  await db.collection('audit_logs').doc(sessionId).set(
    { timer_events: FieldValue.arrayUnion(entry), last_updated: entry.completed_at },
    { merge: true }
  );
  console.log(`[TIMER] Recorded "${entry.label}" (${entry.seconds}s) on ${sessionId}`);
  return entry;
}

module.exports = { logAuditRecord, logTimerEvent };
