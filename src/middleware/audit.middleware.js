const { log } = require('../models/auditlog.model');
const WRITE = ['POST', 'PUT', 'PATCH', 'DELETE'];
const SKIP = /\/(auth\/login|auth\/google|mfa\/verify-login|mfa\/backup-code)(\/|$)/;
const SECRET = /pass|token|secret|key|code/i;
const clean = (o) => {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  Object.keys(o).slice(0, 30).forEach((k) => {
    const v = o[k];
    out[k] = SECRET.test(k) ? '[hidden]' : typeof v === 'string' ? v.slice(0, 200) : typeof v === 'object' ? '[object]' : v;
  });
  return out;
};
const int = (v) => (v !== null && v !== undefined && v !== '' && Number.isInteger(Number(v)) ? Number(v) : null);
module.exports = (req, res, next) => {
  if (!WRITE.includes(req.method)) return next();
  const send = res.json.bind(res);
  res.json = (data) => {
    try {
      if (req.user && req.user.id && res.statusCode < 300 && !SKIP.test(req.originalUrl)) {
        const url = req.originalUrl.split('?')[0];
        const first = data && typeof data === 'object' ? Object.values(data)[0] : null;
        Promise.resolve(log({
          school_id: req.user.school_id || null,
          user_id: req.user.id,
          action: (req.method + ' ' + url).slice(0, 200),
          entity: (url.split('/').filter(Boolean)[1] || 'unknown').slice(0, 100),
          entity_id: int(req.params && (req.params.id || req.params.user_id)) ?? int(first && first.id),
          meta: clean(req.body),
        })).catch(() => {});
      }
    } catch (e) {}
    return send(data);
  };
  next();
};
