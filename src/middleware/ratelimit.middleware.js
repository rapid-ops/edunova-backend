const rateLimit = require('express-rate-limit');
const skip = (req) => req.path === '/api/health' || req.path.startsWith('/api/schools/public') || req.path.startsWith('/api/schools/subdomain');
const mk = (limit, error, s) => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, skip: s, message: { error } });
module.exports = {
  recoveryLimiter: mk(5, 'Too many reset requests, try again in a few minutes'),
  resetLimiter: mk(10, 'Too many attempts, try again in a few minutes'),
  globalLimiter: mk(100, 'Too many requests, try again later', skip),
  loginLimiter: mk(10, 'Too many login attempts, try again later'),
  signupLimiter: mk(10, 'Too many signup attempts, try again later'),
};
