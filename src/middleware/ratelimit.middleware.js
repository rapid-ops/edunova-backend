const rateLimitLib = require('express-rate-limit');
const rateLimit = rateLimitLib.rateLimit || rateLimitLib;
const { ipKeyGenerator } = rateLimitLib;
const jwt = require('jsonwebtoken');
const skip = (req) => req.path === '/api/health' || req.path.startsWith('/api/schools/public') || req.path.startsWith('/api/schools/subdomain');
// Logged-in requests are counted per user (verified JWT); everything else per IP.
// An invalid or forged token never gets its own bucket: it falls back to the IP.
const userOrIp = (req) => {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) {
    try {
      const d = jwt.verify(h.slice(7), process.env.JWT_SECRET);
      if (d && d.id != null) return 'user:' + d.id;
    } catch (e) { /* fall through to IP */ }
  }
  return 'ip:' + ipKeyGenerator(req.ip);
};
const mk = (limit, error, s, keyGenerator) => rateLimit({
  ...(keyGenerator ? { keyGenerator } : {}), windowMs: 15 * 60 * 1000, limit, standardHeaders: true, legacyHeaders: false, skip: s, message: { error } });
const aiLimiter = rateLimit({ keyGenerator: userOrIp, windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'You have reached the limit of 30 questions for this hour. Please try again a little later.' } });
module.exports = {
  aiLimiter,
  recoveryLimiter: mk(5, 'Too many reset requests, try again in a few minutes'),
  resetLimiter: mk(10, 'Too many attempts, try again in a few minutes'),
  globalLimiter: mk(1500, 'Too many requests, please try again shortly', skip, userOrIp),
  loginLimiter: mk(10, 'Too many login attempts, try again later'),
  signupLimiter: mk(10, 'Too many signup attempts, try again later'),
  peopleLimiter: mk(120, 'You are adding people very quickly. Wait a few minutes and try again.', undefined, userOrIp),
  inviteLimiter: mk(60, 'Too many invitations sent. Wait a few minutes and try again.', undefined, userOrIp),
  importLimiter: mk(20, 'You have imported several files in a row. Wait a few minutes and try again.', undefined, userOrIp),
};
