// Read-only by design: this router defines GET routes only.
const express = require('express');
const { AUDIT_ACTIONS, TIME_ZONE } = require('../../constants');
const { ApiError } = require('../../errors');
const { parsePagination, pageEnvelope } = require('../../pagination');
const { logAudit } = require('../../services/audit');
const { isValidDate } = require('../../validation');

const EXPORT_BATCH = 1000;

const SELECT_COLUMNS = `
  log_id AS "logId", created_at AS "createdAt", actor_email AS "actorEmail", actor_role AS "actorRole",
  action_type AS "actionType", case_id AS "caseId", details, host(ip_address) AS "ipAddress"`;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function parseFilters(query) {
  const filters = {
    search: text(query.search).slice(0, 200),
    actionType: text(query.actionType),
    from: text(query.from),
    to: text(query.to),
  };
  const fields = {};
  if (filters.actionType && !AUDIT_ACTIONS.includes(filters.actionType)) fields.actionType = 'ACTION_TYPE_INVALID';
  if (filters.from && !isValidDate(filters.from)) fields.from = 'DATE_INVALID';
  if (filters.to && !isValidDate(filters.to)) fields.to = 'DATE_INVALID';
  if (!fields.from && !fields.to && filters.from && filters.to && filters.from > filters.to) {
    fields.to = 'DATE_RANGE_INVALID';
  }
  if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION_FAILED', { fields });
  return filters;
}

// `asOf` freezes the result set so that new entries (including the one recording
// this very view) do not shift rows between pages.
function buildWhere(filters, asOf) {
  const params = [asOf];
  const clauses = ['created_at <= $1::timestamptz'];
  const add = (value) => `$${params.push(value)}`;

  if (filters.search) {
    const pattern = add(`%${filters.search.replace(/[\\%_]/g, '\\$&')}%`);
    clauses.push(`(actor_email ILIKE ${pattern} OR actor_role ILIKE ${pattern} OR action_type ILIKE ${pattern}
      OR case_id ILIKE ${pattern} OR details::text ILIKE ${pattern} OR host(ip_address) ILIKE ${pattern})`);
  }
  if (filters.actionType) clauses.push(`action_type = ${add(filters.actionType)}`);
  // Dates are whole days in Cameroon time; both ends are included.
  if (filters.from) clauses.push(`created_at >= (${add(filters.from)}::date)::timestamp AT TIME ZONE '${TIME_ZONE}'`);
  if (filters.to) clauses.push(`created_at < (${add(filters.to)}::date + 1)::timestamp AT TIME ZONE '${TIME_ZONE}'`);

  return { where: clauses.join(' AND '), params };
}

// Quotes every cell and neutralises values a spreadsheet would run as a formula.
function csvCell(value) {
  let cell = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}

const CSV_COLUMNS = ['createdAt', 'actorEmail', 'actorRole', 'actionType', 'caseId', 'details', 'ipAddress', 'logId'];
const CSV_HEADERS = {
  EN: ['Timestamp (UTC)', 'Actor email', 'Actor role', 'Action', 'Case ID', 'Details', 'IP address', 'Log ID'],
  FR: ['Horodatage (UTC)', "E-mail de l'auteur", "Rôle de l'auteur", 'Action', "Numéro d'affaire", 'Détails', 'Adresse IP', 'Identifiant'],
};

function createAuditRouter({ db }) {
  const router = express.Router();

  const databaseNow = async () => (await db.query('SELECT now()::text AS now')).rows[0].now;

  router.get('/action-types', (req, res) => res.json({ actionTypes: AUDIT_ACTIONS }));

  router.get('/', async (req, res) => {
    const filters = parseFilters(req.query);
    const { page, pageSize, offset } = parsePagination(req.query);
    const requested = text(req.query.asOf);
    if (requested && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/.test(requested)) {
      throw new ApiError(400, 'VALIDATION_FAILED');
    }
    const asOf = requested || (await databaseNow());
    const { where, params } = buildWhere(filters, asOf);

    const [rows, count] = await Promise.all([
      db.query(
        `SELECT ${SELECT_COLUMNS} FROM audit_logs WHERE ${where}
          ORDER BY created_at DESC, log_id DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, offset],
      ),
      db.query(`SELECT count(*)::int AS total FROM audit_logs WHERE ${where}`, params),
    ]);

    const used = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    await logAudit(db, {
      actor: req.user,
      actionType: Object.keys(used).length ? 'AUDIT_LOG_SEARCHED' : 'AUDIT_LOG_VIEWED',
      details: { ...used, page, pageSize },
      ip: req.ip,
    });
    res.json({ ...pageEnvelope(rows.rows, count.rows[0].total, page, pageSize), asOf });
  });

  // Exports the whole filtered set, in batches, regardless of the page on screen.
  router.get('/export', async (req, res) => {
    const filters = parseFilters(req.query);
    const language = req.query.lang === 'FR' ? 'FR' : 'EN';
    const asOf = await databaseNow();
    const { where, params } = buildWhere(filters, asOf);

    const fetchBatch = (cursor) => {
      const values = [...params];
      let after = '';
      if (cursor) {
        values.push(cursor.cursorTime, cursor.logId);
        after = ` AND (created_at, log_id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
      }
      return db.query(
        `SELECT ${SELECT_COLUMNS}, created_at::text AS "cursorTime" FROM audit_logs
          WHERE ${where}${after} ORDER BY created_at DESC, log_id DESC LIMIT ${EXPORT_BATCH}`,
        values,
      );
    };

    let batch = await fetchBatch(null);
    // Recorded before any data leaves, so an interrupted download is still logged.
    await logAudit(db, {
      actor: req.user,
      actionType: 'AUDIT_LOG_EXPORTED',
      details: Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
      ip: req.ip,
    });

    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="ccts-audit-logs-${asOf.slice(0, 10)}.csv"`);
    // Byte order mark so spreadsheet programs read French accents correctly.
    res.write(`﻿${CSV_HEADERS[language].map(csvCell).join(',')}\r\n`);
    while (batch.rows.length) {
      for (const row of batch.rows) {
        const record = {
          ...row,
          createdAt: row.createdAt.toISOString(),
          details: row.details ? JSON.stringify(row.details) : '',
        };
        res.write(`${CSV_COLUMNS.map((column) => csvCell(record[column])).join(',')}\r\n`);
      }
      if (batch.rows.length < EXPORT_BATCH) break;
      batch = await fetchBatch(batch.rows[batch.rows.length - 1]);
    }
    res.end();
  });

  return router;
}

module.exports = { createAuditRouter, csvCell };
