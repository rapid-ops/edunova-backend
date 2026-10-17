const approvalBlock = (user) => {
  const s = user && user.approval_status;
  if (s === 'pending') return { error: 'Your account is awaiting approval from your school administrator', code: 'PENDING_APPROVAL' };
  if (s === 'rejected') {
    const reason = user.rejection_reason || null;
    return { error: reason ? 'Your registration was not approved: ' + reason : 'Your registration was not approved', code: 'REJECTED', reason };
  }
  return null;
};
module.exports = { approvalBlock };
