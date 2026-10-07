const { log } = require('../models/auditlog.model');
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const auditMiddleware = (req, res, next) => {
  if (!WRITE_METHODS.includes(req.method) || !req.user?.id) return next();
  const oldJson = res.json.bind(res);
  res.json = function (data) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const entity = req.path.split('/').filter(Boolean)[0] || 'unknown';
        const entityId = data && typeof data === 'object' ? (Object.values(data)[0] as any)?.id || null : null;
        log({ school_id: req.user.school_id || null, user_id: req.user.id, action: `${req.method} ${req.path}`, entity, entity_id: entityId, meta: { body: req.body, params: req.params } }).catch(() => {});
      } catch (_) {}
    }
    return oldJson(data);
  };
  next();
};
module.exports = auditMiddleware;
