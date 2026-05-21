const { db } = require('../config/firebaseAdmin');
const { FieldValue } = require('firebase-admin/firestore');

async function runPriorityAdjustmentAgent(alert, query, role, userId, userEmail, sessionId, sources) {
  if (!alert || alert.level !== 'critical') return null;

  if (!db) {
    console.warn('[PRIORITY AGENT] Skipped - Firebase not configured');
    return null;
  }

  try {
    const now = FieldValue.serverTimestamp();

    const taskRef = await db.collection('maintenance_tasks').add({
      title: `[AUTO] ${alert.title}`,
      description: `Auto-escalated task. Query: "${query}". Reason: ${alert.reason}`,
      priority: 'high',
      assignedRole: 'expert',
      status: 'pending',
      createdBy: 'priority-agent',
      createdAt: now,
      linkedSessionId: sessionId || null,
      alertLevel: alert.level,
      alertReason: alert.reason,
      sources: sources || [],
    });

    const alertRef = await db.collection('Alerts').add({
      type: 'priority',
      icon: '🚩',
      title: `Priority Escalation: ${alert.title}`,
      message: `Critical safety procedure detected. Reason: ${alert.reason}. Query: "${query.slice(0, 80)}"`,
      status: 'Auto-Escalated',
      statusColor: '#ea580c',
      statusBg: '#ffedd5',
      userEmail: userEmail || userId || 'system',
      role,
      sources: sources || [],
      createdAt: now,
      linkedTaskId: taskRef.id,
    });

    console.log(`[PRIORITY AGENT] Task: ${taskRef.id} | Alert: ${alertRef.id}`);
    return { taskId: taskRef.id, priorityAlertId: alertRef.id };
  } catch (err) {
    console.error('[PRIORITY AGENT] Firestore write failed:', err);
    return null;
  }
}

module.exports = { runPriorityAdjustmentAgent };
