const fs = require('fs');
const path = require('path');
const { db } = require('../config/firebaseAdmin');

const transcriptsDir = path.join(__dirname, '../../chat_transcripts');
if (!fs.existsSync(transcriptsDir)) {
  fs.mkdirSync(transcriptsDir);
}

// Added sessionId to the parameters
async function logAuditRecord(query, text, sources, userId = "anonymous_user", sessionId) {
  try {
    // If no session ID was provided, generate a fallback
    const finalSessionId = sessionId || `session-${Date.now()}`;
    const fileName = `transcript-${finalSessionId}.json`;
    const filePath = path.join(transcriptsDir, fileName);

    // --- STEP A: Read or Create the JSON Array ---
    let transcriptData = { messages: [] };
    
    // If the file already exists, read it so we don't overwrite the old chat!
    if (fs.existsSync(filePath)) {
      const rawData = fs.readFileSync(filePath);
      transcriptData = JSON.parse(rawData);
    }

    // Push the newest message into the array
    transcriptData.messages.push({
      timestamp: new Date().toISOString().replace('T', ' ').split('.')[0],
      user_prompt: query,
      ai_response: text,
      sources_used: sources
    });

    // Save the updated array back to the hard drive
    fs.writeFileSync(filePath, JSON.stringify(transcriptData, null, 2));

    // --- STEP B: The Firebase Session Document ---
    const formattedTimestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
    
    const auditRecord = {
      log_id: finalSessionId,
      user_id: userId,
      action: "llm_chat_session", 
      status: "pending_review",
      chat_pointer: `chat_transcripts/${fileName}`,
      last_updated: formattedTimestamp // Renamed to reflect that the session is ongoing
    };

    // --- STEP C: Merge into Database ---
    // { merge: true } tells Firebase: "If this session exists, just update the timestamp. If not, create it."
    await db.collection('audit_logs').doc(finalSessionId).set(auditRecord, { merge: true });
    
    console.log(`[AUDIT SUCCESS] Appended to ${fileName} and updated session ${finalSessionId} in Firebase!`);

    return fileName;
  } catch (error) {
    console.error("[AUDIT ERROR] Failed to save log:", error);
    throw error;
  }
}

module.exports = { logAuditRecord };