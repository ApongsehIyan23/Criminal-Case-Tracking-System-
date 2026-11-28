const express = require('express');
const { ROLES } = require('./constants');
const { ApiError } = require('./errors');
const { createAuthMiddleware } = require('./middleware/auth');
const { createAuditRouter } = require('./routes/admin/auditLogs');
const { createCaseRouter } = require('./routes/cases');
const { createCustodyRouter } = require('./routes/custody');
const { createMandateRouter } = require('./routes/cases/mandates');
const { createMagistrateRouter } = require('./routes/magistrate');
const { createCustodyService } = require('./services/custody');
const { createSystemRouter } = require('./routes/admin/system');
const { createUserRouter } = require('./routes/admin/users');
const { createAuthRouter } = require('./routes/auth');

// Dependencies are passed in so tests can substitute the mailer and Neon client.
function createApp({ db, config, mailer, neon, storage }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // one proxy (Vercel) in front, for the client IP

  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  const auth = createAuthMiddleware({ db, config });
  app.use('/api/auth', createAuthRouter({ db, config, auth, mailer }));

  const admin = express.Router();
  admin.use(auth.authenticate, auth.requireRole(ROLES.ADMIN));
  admin.use('/audit-logs', createAuditRouter({ db }));
  admin.use('/system', createSystemRouter({ db, mailer, neon, storage }));
  admin.use(createUserRouter({ db, config, mailer }));
  app.use('/api/admin', admin);

  const custody = createCustodyService({ db, mailer, config });
  // The ruling routes come first; everything else under /api/cases is police only.
  app.use('/api/cases', auth.authenticate, createMandateRouter({ db, storage, auth }),
    auth.requireRole(ROLES.POLICE), createCaseRouter({ db, storage, custody }));
  app.use('/api/magistrate', auth.authenticate, auth.requireRole(ROLES.MAGISTRATE),
    createMagistrateRouter({ db, storage, custody }));
  const shared = createCustodyRouter({ db, custody });
  app.use(['/api/custody', '/api/notifications'], auth.authenticate);
  app.use('/api', shared);

  app.use('/api', () => { throw new ApiError(404, 'NOT_FOUND'); });

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.code, ...err.extra });
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(err.status).json({ error: 'BAD_REQUEST' });
    }
    console.error(err);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  });

  return app;
}

module.exports = { createApp };
