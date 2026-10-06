const { hasPermission } = require('../models/customrole.model');

// Usage: requirePermission('view_students')
const requirePermission = (permission) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  // super_admin and school_admin bypass custom permission checks
  if (['super_admin', 'school_admin'].includes(req.user.role)) return next();
  try {
    const allowed = await hasPermission(req.user.id, permission);
    if (!allowed) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { requirePermission };
