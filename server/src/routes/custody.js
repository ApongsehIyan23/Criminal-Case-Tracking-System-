// Available to every signed-in role.
const express = require('express');

function createCustodyRouter({ db, custody }) {
  const router = express.Router();

  // Called by the browser when the app loads, and periodically while it is open.
  router.post('/custody/sync', async (req, res) => {
    res.json(await custody.sync());
  });

  // The signed-in user's in-app custody alerts for suspects still in custody.
  router.get('/notifications', async (req, res) => {
    const rows = await db.query(
      `SELECT n.notification_id AS "notificationId", n.case_id AS "caseId", n.created_at AS "createdAt",
              t.current_expires_at AS "expiresAt", s.full_name AS "suspectName", c.status AS "caseStatus"
         FROM notifications_log n
         JOIN custody_countdown_timers t ON t.timer_id::text = n.payload->>'timerId'
         JOIN case_participants p ON p.participant_id = t.participant_id
         JOIN persons s ON s.person_id = p.person_id
         JOIN criminal_case_files c ON c.case_id = p.case_id
        WHERE n.channel = 'IN_APP' AND n.notification_type = 'CUSTODY_EXPIRY_WARNING'
          AND n.recipient_address = $1 AND t.status IN ('ACTIVE','EXTENDED','EXPIRED')
        ORDER BY t.current_expires_at
        LIMIT 50`,
      [req.user.email],
    );
    res.json({ items: rows.rows, serverNow: new Date().toISOString() });
  });

  return router;
}

module.exports = { createCustodyRouter };
