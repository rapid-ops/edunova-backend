const clean = s => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, 200);

// Sends mail through a Google Apps Script web app over HTTPS (Render free tier blocks SMTP)
async function sendMail({ to, subject, body, replyTo }) {
  const url = process.env.MAIL_WEBHOOK_URL, secret = process.env.MAIL_WEBHOOK_SECRET;
  if (!url || !secret || typeof fetch !== 'function') { console.log('mail not configured: set MAIL_WEBHOOK_URL and MAIL_WEBHOOK_SECRET'); return false; }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret, to: clean(to), subject: clean(subject), body: String(body || '').slice(0, 5000), replyTo: clean(replyTo) }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const txt = (await r.text()).trim();
    if (txt !== 'ok') console.log('mail webhook said:', txt.slice(0, 100));
    return txt === 'ok';
  } catch (e) { console.log('mail failed:', e.message); return false; }
}

module.exports = { sendMail };
