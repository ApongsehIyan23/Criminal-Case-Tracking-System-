// Custody timers are brought up to date whenever the app is loaded: there is no
// scheduler. Each timer gets one alert when 6 hours or less remain, sent by
// email and in-app to the case officer and the examining magistrates.
const { ROLES, CUSTODY_ALERT_HOURS, TIME_ZONE } = require('../constants');
const { logAudit, SYSTEM_ACTOR } = require('./audit');
const { custodyAlertEmail } = require('./email');

const OPEN_STATUSES = "('ACTIVE','EXTENDED')";
const MAX_EMAIL_ATTEMPTS = 3;

async function markExpired(db) {
  return db.transaction(async (client) => {
    const expired = await client.query(
      `UPDATE custody_countdown_timers t SET status = 'EXPIRED', updated_at = now()
         FROM case_participants p
        WHERE p.participant_id = t.participant_id
          AND t.status IN ${OPEN_STATUSES} AND t.current_expires_at <= now()
        RETURNING t.timer_id, p.case_id, t.current_expires_at`,
    );
    for (const row of expired.rows) {
      await logAudit(client, {
        actor: SYSTEM_ACTOR,
        actionType: 'CUSTODY_EXPIRED',
        caseId: row.case_id,
        details: { timerId: row.timer_id, expiredAt: row.current_expires_at },
      });
    }
    return expired.rowCount;
  });
}

// Records the alert for one timer. The row lock plus the existence check mean
// that concurrent page loads can never create a second alert.
async function claimAlert(db, timerId) {
  return db.transaction(async (client) => {
    const locked = await client.query(
      `SELECT t.timer_id, t.current_expires_at, p.case_id, p.participant_id, c.created_by
         FROM custody_countdown_timers t
         JOIN case_participants p USING (participant_id)
         JOIN criminal_case_files c USING (case_id)
        WHERE t.timer_id = $1 AND t.status IN ('ACTIVE','EXTENDED','EXPIRED')
          FOR UPDATE OF t`,
      [timerId],
    );
    const timer = locked.rows[0];
    if (!timer) return false;
    const existing = await client.query(
      `SELECT 1 FROM notifications_log
        WHERE case_id = $1 AND notification_type = 'CUSTODY_EXPIRY_WARNING' AND payload->>'timerId' = $2 LIMIT 1`,
      [timer.case_id, timerId],
    );
    if (existing.rowCount) return false;

    const recipients = await client.query(
      `SELECT email, role, preferred_language FROM users
        WHERE status = 'ACTIVE' AND (user_id = $1 OR role = $2)`,
      [timer.created_by, ROLES.MAGISTRATE],
    );
    if (!recipients.rowCount) return false;

    for (const recipient of recipients.rows) {
      const payload = JSON.stringify({
        timerId,
        participantId: timer.participant_id,
        expiresAt: timer.current_expires_at,
        recipientRole: recipient.role,
        language: recipient.preferred_language,
        attempts: 0,
      });
      await client.query(
        `INSERT INTO notifications_log
           (case_id, channel, notification_type, recipient_address, gateway_provider, payload, delivery_status, sent_at)
         VALUES ($1, 'IN_APP', 'CUSTODY_EXPIRY_WARNING', $2, 'CCTS', $3, 'DELIVERED', now()),
                ($1, 'EMAIL', 'CUSTODY_EXPIRY_WARNING', $2, 'SENDGRID', $3, 'QUEUED', NULL)`,
        [timer.case_id, recipient.email, payload],
      );
    }
    await logAudit(client, {
      actor: SYSTEM_ACTOR,
      actionType: 'CUSTODY_ALERT_SENT',
      caseId: timer.case_id,
      details: { timerId, expiresAt: timer.current_expires_at, recipients: recipients.rows.map((r) => r.email) },
    });
    return true;
  });
}

// Sends waiting emails. A row is claimed by counting the attempt first, so two
// requests cannot send it together. Failed sends are retried on later loads.
async function sendPendingEmails(db, mailer, appBaseUrl) {
  const claimed = await db.query(
    `UPDATE notifications_log SET delivery_status = 'QUEUED',
            payload = payload || jsonb_build_object(
              'attempts', (payload->>'attempts')::int + 1, 'attemptedAt', now())
      WHERE notification_id IN (
        SELECT notification_id FROM notifications_log
         WHERE channel = 'EMAIL' AND notification_type = 'CUSTODY_EXPIRY_WARNING'
           AND delivery_status IN ('QUEUED','FAILED') AND (payload->>'attempts')::int < $1
           AND (payload->>'attemptedAt' IS NULL
                OR (payload->>'attemptedAt')::timestamptz < now() - interval '5 minutes')
         FOR UPDATE SKIP LOCKED)
      RETURNING notification_id, case_id, recipient_address, payload`,
    [MAX_EMAIL_ATTEMPTS],
  );

  await Promise.all(claimed.rows.map(async (row) => {
    let sent = true;
    try {
      await mailer.send(custodyAlertEmail({
        to: row.recipient_address,
        caseId: row.case_id,
        expiresAt: new Date(row.payload.expiresAt),
        language: row.payload.language,
        link: appBaseUrl,
        timeZone: TIME_ZONE,
      }));
    } catch (err) {
      sent = false;
      const reason = err.response?.body?.errors?.[0]?.message || err.message;
      console.error(`Custody alert email failed: ${reason}`);
      await logAudit(db, {
        actor: SYSTEM_ACTOR,
        actionType: 'CUSTODY_ALERT_EMAIL_FAILED',
        caseId: row.case_id,
        details: { recipient: row.recipient_address, reason },
      });
    }
    await db.query(
      `UPDATE notifications_log
          SET delivery_status = $2::varchar, sent_at = CASE WHEN $2::varchar = 'SENT' THEN now() END
        WHERE notification_id = $1`,
      [row.notification_id, sent ? 'SENT' : 'FAILED'],
    );
  }));
}

function createCustodyService({ db, mailer, config }) {
  return {
    async sync() {
      const expired = await markExpired(db);
      const due = await db.query(
        `SELECT t.timer_id FROM custody_countdown_timers t
           JOIN case_participants p USING (participant_id)
          WHERE t.status IN ('ACTIVE','EXTENDED','EXPIRED')
            AND t.current_expires_at <= now() + make_interval(hours => $1)
            AND NOT EXISTS (SELECT 1 FROM notifications_log n
                             WHERE n.case_id = p.case_id AND n.notification_type = 'CUSTODY_EXPIRY_WARNING'
                               AND n.payload->>'timerId' = t.timer_id::text)`,
        [CUSTODY_ALERT_HOURS],
      );
      let alerted = 0;
      for (const row of due.rows) {
        if (await claimAlert(db, row.timer_id)) alerted += 1;
      }
      await sendPendingEmails(db, mailer, config.appBaseUrl);
      return { expired, alerted };
    },
  };
}

module.exports = { createCustodyService };
