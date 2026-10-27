const checks = (p) => ({
  length: typeof p === 'string' && p.length >= 8,
  upper: /[A-Z]/.test(p || ''),
  number: /\d/.test(p || ''),
  special: /[^A-Za-z0-9\s]/.test(p || ''),
});
// Rules for choosing a NEW password. Existing passwords are never checked against this.
const passwordError = (p) => {
  if (typeof p !== 'string' || !p) return 'Enter a password';
  if (p.length > 72) return 'Password must be 72 characters or fewer';
  const c = checks(p);
  if (!c.length) return 'Password must be at least 8 characters';
  if (!c.upper) return 'Add at least one capital letter';
  if (!c.number) return 'Add at least one number';
  if (!c.special) return 'Add at least one special character, like ! or @';
  return null;
};
module.exports = { passwordError, passwordChecks: checks };
