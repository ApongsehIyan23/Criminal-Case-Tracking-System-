const crypto = require('crypto');
const express = require('express');
const { ROLES, INVITATION_HOURS, MAX_BATCH_SIZE } = require('../../constants');
const { ApiError } = require('../../errors');
const { logAudit } = require('../../services/audit');
const { invitationEmail } = require('../../services/email');
const { parsePagination, pageEnvelope } = require('../../pagination');
const { isValidEmail, isUuid } = require('../../validation');

const STATUS_FILTERS = ['ACTIVE', 'INVITATION_PENDING'];
// The role names shown on screen, so a search for one in either language matches.
const ROLE_LABELS = {
  SYSTEM_ADMINISTRATOR: ['System Administrator', 'Administrateur système'],
  JUDICIAL_POLICE_OFFICER: ['Judicial Police Officer', 'Officier de police judiciaire'],
  EXAMINING_MAGISTRATE: ['Examining Magistrate', "Juge d'instruction"],
};

function newToken() {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: crypto.createHash('sha256').update(token).digest('hex') };
}

function parseAccount(input) {
  const account = {
    fullName: typeof input?.fullName === 'string' ? input.fullName.trim() : '',
    email: typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '',
    role: input?.role,
    organizationalUnitId: input?.organizationalUnitId || null,
    preferredLanguage: input?.preferredLanguage || 'EN',
  };
  const errors = {};
  if (!account.fullName) errors.fullName = 'FULL_NAME_REQUIRED';
  else if (account.fullName.length > 150) errors.fullName = 'FULL_NAME_TOO_LONG';
  if (!account.email) errors.email = 'EMAIL_REQUIRED';
  else if (!isValidEmail(account.email)) errors.email = 'EMAIL_INVALID';
  if (!Object.values(ROLES).includes(account.role)) errors.role = 'ROLE_REQUIRED';
  if (account.organizationalUnitId && !isUuid(account.organizationalUnitId)) {
    errors.organizationalUnitId = 'UNIT_INVALID';
  }
  if (!['EN', 'FR'].includes(account.preferredLanguage)) errors.preferredLanguage = 'LANGUAGE_INVALID';
  return { account, errors };
}

const batchError = (status, rows) => new ApiError(status, 'VALIDATION_FAILED', { rows });

function createUserRouter({ db, config, mailer }) {
  const router = express.Router();

  // Stores a new token and queues its notice. Must run inside a transaction.
  async function issueInvitation(client, user, invitedBy) {
    const { token, hash } = newToken();
    const invitation = await client.query(
      `INSERT INTO account_invitations (user_id, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(hours => $4))
       RETURNING invitation_id, expires_at`,
      [user.userId, hash, invitedBy, INVITATION_HOURS],
    );
    const notice = await client.query(
      `INSERT INTO notifications_log (channel, notification_type, recipient_address, gateway_provider, payload)
       VALUES ('EMAIL', 'ACCOUNT_INVITATION', $1, 'SENDGRID', $2) RETURNING notification_id`,
      [user.email, JSON.stringify({ userId: user.userId, invitationId: invitation.rows[0].invitation_id })],
    );
    return { ...user, token, notificationId: notice.rows[0].notification_id };
  }

  // Sends after the transaction commits, so no link is mailed for a rolled-back account.
  async function deliver(pending, req) {
    let sent = true;
    try {
      await mailer.send(invitationEmail({
        to: pending.email,
        fullName: pending.fullName,
        language: pending.preferredLanguage,
        link: `${config.appBaseUrl}/activate?token=${pending.token}`,
      }));
    } catch (err) {
      sent = false;
      const reason = err.response?.body?.errors?.[0]?.message || err.message;
      console.error(`Invitation email failed: ${reason}`);
      await logAudit(db, {
        actor: req.user,
        actionType: 'INVITATION_EMAIL_FAILED',
        details: { userId: pending.userId, email: pending.email, reason },
        ip: req.ip,
      });
    }
    await db.query(
      `UPDATE notifications_log
          SET delivery_status = $2::varchar, sent_at = CASE WHEN $2::varchar = 'SENT' THEN now() END
        WHERE notification_id = $1`,
      [pending.notificationId, sent ? 'SENT' : 'FAILED'],
    );
    return { userId: pending.userId, email: pending.email, emailSent: sent };
  }

  router.post('/invitations', async (req, res) => {
    const input = req.body?.accounts;
    if (!Array.isArray(input) || input.length === 0) throw new ApiError(400, 'NO_ACCOUNTS');
    if (input.length > MAX_BATCH_SIZE) throw new ApiError(400, 'BATCH_TOO_LARGE', { max: MAX_BATCH_SIZE });

    const parsed = input.map(parseAccount);
    const seen = new Set();
    parsed.forEach(({ account, errors }) => {
      if (!errors.email && seen.has(account.email)) errors.email = 'EMAIL_DUPLICATED_IN_BATCH';
      seen.add(account.email);
    });
    const invalid = parsed
      .map(({ errors }, index) => ({ index, errors }))
      .filter((row) => Object.keys(row.errors).length);
    if (invalid.length) throw batchError(400, invalid);
    const accounts = parsed.map((p) => p.account);

    let pending;
    try {
      pending = await db.transaction(async (client) => {
        const taken = await client.query('SELECT email FROM users WHERE email = ANY($1)', [
          accounts.map((a) => a.email),
        ]);
        const takenEmails = new Set(taken.rows.map((r) => r.email));
        if (takenEmails.size) {
          throw batchError(409, accounts
            .map((a, index) => (takenEmails.has(a.email) ? { index, errors: { email: 'EMAIL_ALREADY_EXISTS' } } : null))
            .filter(Boolean));
        }

        const created = [];
        for (const [index, account] of accounts.entries()) {
          if (account.organizationalUnitId) {
            const unit = await client.query('SELECT 1 FROM organizational_units WHERE unit_id = $1', [
              account.organizationalUnitId,
            ]);
            if (!unit.rowCount) throw batchError(400, [{ index, errors: { organizationalUnitId: 'UNIT_INVALID' } }]);
          }
          const user = await client.query(
            `INSERT INTO users (email, full_name, role, organizational_unit_id, preferred_language)
             VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
            [account.email, account.fullName, account.role, account.organizationalUnitId, account.preferredLanguage],
          );
          const record = await issueInvitation(
            client,
            { ...account, userId: user.rows[0].user_id },
            req.user.userId,
          );
          await logAudit(client, {
            actor: req.user,
            actionType: 'ACCOUNT_INVITED',
            details: { userId: record.userId, email: record.email, role: record.role },
            ip: req.ip,
          });
          created.push(record);
        }
        return created;
      });
    } catch (err) {
      // Another request created the same email between the check and the insert.
      if (err.code === '23505') throw new ApiError(409, 'EMAIL_ALREADY_EXISTS');
      throw err;
    }

    const results = await Promise.all(pending.map((p) => deliver(p, req)));
    res.status(201).json({ created: results });
  });

  // The user directory: search by name, email or role, status tabs and pages.
  router.get('/users', async (req, res) => {
    const text = (value) => (typeof value === 'string' ? value.trim() : '');
    const search = text(req.query.search).slice(0, 200);
    const status = text(req.query.status);
    if (status && !STATUS_FILTERS.includes(status)) throw new ApiError(400, 'VALIDATION_FAILED');
    const { page, pageSize, offset } = parsePagination(req.query);

    const params = [];
    const clauses = ['TRUE'];
    if (search) {
      const needle = search.toLocaleLowerCase('fr');
      const roles = Object.keys(ROLE_LABELS)
        .filter((role) => ROLE_LABELS[role].some((label) => label.toLocaleLowerCase('fr').includes(needle)));
      const pattern = `$${params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`)}`;
      clauses.push(`(u.full_name ILIKE ${pattern} OR u.email ILIKE ${pattern} OR u.role = ANY($${params.push(roles)}))`);
    }
    // Tab counts follow the search, but not the chosen tab.
    const countSql = `SELECT u.status, count(*)::int AS n FROM users u WHERE ${clauses.join(' AND ')} GROUP BY u.status`;
    const countParams = [...params];
    if (status) clauses.push(`u.status = $${params.push(status)}`);

    const [rows, grouped] = await Promise.all([
      db.query(
        `SELECT u.user_id AS "userId", u.full_name AS "fullName", u.email, u.role, u.status,
                o.unit_name AS "unitName", u.created_at AS "createdAt",
                (SELECT max(i.expires_at) FROM account_invitations i
                  WHERE i.user_id = u.user_id AND i.used_at IS NULL) AS "invitationExpiresAt"
           FROM users u LEFT JOIN organizational_units o ON o.unit_id = u.organizational_unit_id
          WHERE ${clauses.join(' AND ')}
          ORDER BY u.created_at DESC, u.user_id
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, offset],
      ),
      db.query(countSql, countParams),
    ]);
    const counts = Object.fromEntries(STATUS_FILTERS.map((name) => [name, 0]));
    grouped.rows.forEach((row) => { counts[row.status] = row.n; });
    counts.ALL = grouped.rows.reduce((total, row) => total + row.n, 0);

    const filters = { ...(search ? { search } : {}), ...(status ? { status } : {}) };
    await logAudit(db, {
      actor: req.user,
      actionType: Object.keys(filters).length ? 'USER_DIRECTORY_SEARCHED' : 'USER_DIRECTORY_VIEWED',
      details: { ...filters, page, pageSize },
      ip: req.ip,
    });
    res.json({ ...pageEnvelope(rows.rows, counts[status || 'ALL'], page, pageSize), counts });
  });

  router.post('/users/:userId/resend-invitation', async (req, res) => {
    const { userId } = req.params;
    if (!isUuid(userId)) throw new ApiError(404, 'USER_NOT_FOUND');

    const pending = await db.transaction(async (client) => {
      const found = await client.query(
        `SELECT user_id AS "userId", email, full_name AS "fullName", role, status,
                preferred_language AS "preferredLanguage"
           FROM users WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const user = found.rows[0];
      if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
      if (user.status !== 'INVITATION_PENDING') throw new ApiError(409, 'INVITATION_NOT_PENDING');

      await client.query(
        `UPDATE account_invitations SET expires_at = now()
          WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()`,
        [userId],
      );
      const record = await issueInvitation(client, user, req.user.userId);
      await logAudit(client, {
        actor: req.user,
        actionType: 'INVITATION_RESENT',
        details: { userId: user.userId, email: user.email },
        ip: req.ip,
      });
      return record;
    });

    res.json(await deliver(pending, req));
  });

  router.get('/units', async (req, res) => {
    const units = await db.query(
      `SELECT unit_id AS "unitId", unit_code AS "unitCode", unit_name AS "unitName", unit_type AS "unitType"
         FROM organizational_units ORDER BY unit_type, unit_name`,
    );
    res.json({ units: units.rows });
  });

  return router;
}

module.exports = { createUserRouter };
