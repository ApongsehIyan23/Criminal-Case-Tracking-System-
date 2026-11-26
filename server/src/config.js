require('./loadEnv');

function loadConfig(env = process.env) {
  const missing = ['DATABASE_URL', 'JWT_SECRET', 'APP_BASE_URL'].filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  if (env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.');

  return {
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    appBaseUrl: env.APP_BASE_URL.replace(/\/+$/, ''),
    sendgridApiKey: env.SENDGRID_API_KEY || '',
    sendgridSender: env.SENDGRID_VERIFIED_SENDER || '',
    neonApiKey: env.NEON_API_KEY || '',
    neonProjectId: env.NEON_PROJECT_ID || '',
    neonBranchId: env.NEON_BRANCH_ID || '',
    port: Number(env.PORT) || 3001,
  };
}

module.exports = { loadConfig };
