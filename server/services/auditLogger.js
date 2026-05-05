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

module.exports = { logAuditRecord };