const { esc } = require('../utils/escape');
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = 'Edunova <no-reply@edunova.app>';

const header = (schoolName) => `
  <div style="background:#2563eb;padding:24px;text-align:center">
    <h1 style="color:#fff;margin:0;font-family:sans-serif">EDUNOVA</h1>
    <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px">${schoolName || 'Edunova'}</p>
  </div>`;

const footer = `<div style="padding:16px;text-align:center;font-size:11px;color:#9ca3af;font-family:sans-serif">
  © Edunova • <a href="#" style="color:#9ca3af">Unsubscribe</a></div>`;

const wrap = (body, schoolName) =>
  `<div style="max-width:520px;margin:0 auto;background:#f9fafb;font-family:sans-serif">
    ${header(schoolName)}<div style="padding:24px">${body}</div>${footer}</div>`;

const templates = {
  welcome: (d) => ({
    subject: `Welcome to ${d.school_name} on Edunova`,
    html: wrap(`<h2 style="color:#1f2937">Hi ${d.name}! 👋</h2>
      <p style="color:#4b5563">Your account has been created on Edunova.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px;color:#6b7280">Email</td><td style="padding:6px;font-weight:600">${d.email}</td></tr>
        <tr><td style="padding:6px;color:#6b7280">Password</td><td style="padding:6px;font-weight:600">${d.password}</td></tr>
      </table>
      <a href="https://edunova-frontend-gkaj.vercel.app" style="display:block;margin-top:20px;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center;font-weight:600">Login to Edunova</a>`, d.school_name),
  }),
  fee_notice: (d) => ({
    subject: `Fee Notice: NGN${d.amount} due for ${d.student_name}`,
    html: wrap(`<h2 style="color:#1f2937">Fee Payment Required</h2>
      <p style="color:#4b5563">A fee has been assigned to <strong>${d.student_name}</strong>.</p>
      <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:16px;border-radius:4px;margin:16px 0">
        <p style="margin:0;font-size:14px;color:#1e40af"><strong>${d.description}</strong></p>
        <p style="margin:8px 0 0;font-size:24px;font-weight:700;color:#2563eb">NGN${Number(d.amount).toLocaleString()}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#6b7280">Due: ${d.due_date}</p>
      </div>
      <a href="https://edunova-frontend-gkaj.vercel.app/payment" style="display:block;background:#2563eb;color:#fff;text-decoration:none;padding:12px;border-radius:8px;text-align:center;font-weight:600">Pay Now</a>`, d.school_name),
  }),
  payment_receipt: (d) => ({
    subject: `Payment Confirmed - NGN${d.amount} received`,
    html: wrap(`<div style="background:#dcfce7;border-radius:8px;padding:20px;text-align:center;margin-bottom:16px">
        <p style="font-size:32px;margin:0">✅</p>
        <h2 style="color:#16a34a;margin:8px 0">Payment Confirmed</h2>
        <p style="font-size:28px;font-weight:700;color:#15803d;margin:0">NGN${Number(d.amount).toLocaleString()}</p>
      </div>
      <table style="width:100%;font-size:13px;color:#4b5563">
        <tr><td style="padding:4px">Student</td><td style="padding:4px;font-weight:600">${d.student_name}</td></tr>
        <tr><td style="padding:4px">Description</td><td style="padding:4px">${d.description}</td></tr>
        <tr><td style="padding:4px">Reference</td><td style="padding:4px;font-family:monospace">${d.reference}</td></tr>
        <tr><td style="padding:4px">Date</td><td style="padding:4px">${new Date().toLocaleString()}</td></tr>
      </table>`, d.school_name),
  }),
  result: (d) => ({
    subject: `Your result for ${d.assessment_title} is ready`,
    html: wrap(`<h2 style="color:#1f2937">Result Available 📊</h2>
      <p style="color:#4b5563">Hi <strong>${d.student_name}</strong>, your result for <strong>${d.assessment_title}</strong> is ready.</p>
      <div style="background:#eff6ff;border-radius:8px;padding:16px;text-align:center;margin:16px 0">
        <p style="font-size:36px;font-weight:700;color:#2563eb;margin:0">${d.score}/${d.total}</p>
        <p style="color:#6b7280;margin:4px 0 0">Score</p>
      </div>`, d.school_name),
  }),
  announcement: (d) => ({
    subject: `${d.school_name}: ${d.title}`,
    html: wrap(`<h2 style="color:#1f2937">📢 ${d.title}</h2>
      <p style="color:#4b5563;line-height:1.6">${d.body}</p>`, d.school_name),
  }),
  account_suspended: (d) => ({
    subject: `Account Suspended`,
    html: wrap(`<h2>Account Suspended</h2><p>${d.reason || 'Your account has been suspended.'}</p>`, d.school_name),
  }),
  account_approved: (d) => ({
    subject: `Your account at ${d.school_name} is approved`,
    html: wrap(`<h2>Account Approved</h2><p>Hi ${esc(d.name)}, your school administrator approved your account. You can sign in now.</p>
      <a href="https://edunova-frontend-gkaj.vercel.app/auth/login" style="display:block;margin-top:20px;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center;font-weight:600">Sign in to Edunova</a>`, esc(d.school_name)),
  }),
  account_rejected: (d) => ({
    subject: 'Your registration was not approved',
    html: wrap(`<h2>Registration Not Approved</h2><p>Hi ${esc(d.name)}, your registration at ${esc(d.school_name)} was not approved.</p>
      <p><strong>Reason:</strong> ${esc(d.reason)}</p>
      <p>Contact your school if you think this is a mistake.</p>`, esc(d.school_name)),
  }),
  account_reactivated: (d) => ({
    subject: 'Your account has been reactivated',
    html: wrap(`<h2>Account Reactivated</h2><p>Hi ${d.name || ''}, your account is active again. You can sign in now.</p>`, d.school_name),
  }),
  password_reset: (d) => ({
    subject: 'Reset your Edunova password',
    html: wrap(`<h2 style="color:#1f2937">Reset your password</h2>
      <p style="color:#4b5563">Hi ${esc(d.name)}, we received a request to reset your password. The link works for 1 hour and can be used once.</p>
      <a href="${esc(d.link)}" style="display:block;margin-top:20px;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center;font-weight:600">Reset password</a>
      <p style="color:#6b7280;font-size:12px;margin-top:16px">If you did not ask for this, ignore this email. Your password will not change.</p>
      <p style="color:#9ca3af;font-size:11px;word-break:break-all">${esc(d.link)}</p>`, 'Edunova'),
  }),
  invite: (d) => ({
    subject: `${d.school_name} has added you to Edunova`,
    html: wrap(`<h2 style="color:#1f2937">Hi ${esc(d.name)}</h2>
      <p style="color:#4b5563">${esc(d.school_name)} has created your Edunova account. Tap the button to choose your password. The link works for 7 days and can be used once.</p>
      <a href="${esc(d.link)}" style="display:block;margin-top:20px;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center;font-weight:600">Choose my password</a>
      <p style="color:#6b7280;font-size:12px;margin-top:16px">If you were not expecting this email, you can ignore it.</p>
      <p style="color:#9ca3af;font-size:11px;word-break:break-all">${esc(d.link)}</p>`, esc(d.school_name)),
  }),
};

async function sendEmail(to, template, data) {
  if (!RESEND_KEY) console.warn('RESEND_API_KEY not set, email skipped');
  if (!RESEND_KEY || !to || /@no-email\.invalid$/i.test(String(to))) return false;
  const tmpl = templates[template];
  if (!tmpl) return false;
  const { subject, html } = tmpl(data);
  try {
    if (process.env.GMAIL_REFRESH_TOKEN) { const sent = await require('./gmail.service').sendViaGmail({ to, subject, html }); return sent !== false; }
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!resp.ok) { console.error('Resend error', resp.status, (await resp.text()).slice(0, 300)); return false; }
    return true;
  } catch (err) {
    console.error('Email error:', err.message);
    return false;
  }
}

module.exports = { sendEmail };
