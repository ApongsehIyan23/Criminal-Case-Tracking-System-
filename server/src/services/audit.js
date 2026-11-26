const net = require('net');
const { AUDIT_ACTIONS } = require('../constants');

const SYSTEM_ACTOR = Object.freeze({ userId: null, email: 'SYSTEM', role: 'SYSTEM' });
const ANONYMOUS_ACTOR = Object.freeze({ userId: null, email: 'ANONYMOUS', role: 'ANONYMOUS' });

// The only write path to audit_logs. There is deliberately no update or delete.
async function logAudit(db, { actor, actionType, details = null, ip = null, caseId = null }) {
  if (!AUDIT_ACTIONS.includes(actionType)) throw new Error(`Unknown audit action type: ${actionType}`);
  await db.query(
    `INSERT INTO audit_logs (case_id, actor_id, actor_email, actor_role, action_type, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      caseId,
      actor.userId,
      actor.email,
      actor.role,
      actionType,
      details === null ? null : JSON.stringify(details),
      ip && net.isIP(ip) ? ip : null,
    ],
  );
}

module.exports = { logAudit, SYSTEM_ACTOR, ANONYMOUS_ACTOR };
