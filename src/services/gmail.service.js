let cache = { token: null, exp: 0 };

async function accessToken() {
  if (cache.token && Date.now() < cache.exp - 60000) return cache.token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Gmail token error ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cache.token;
}

const b64url = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sendViaGmail({ to, subject, html }) {
  const raw = [
    'From: Edunova <' + process.env.GMAIL_USER + '>',
    'To: ' + String(to).replace(/[\r\n]/g, ''),
    'Subject: =?UTF-8?B?' + Buffer.from(subject).toString('base64') + '?=',
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html).toString('base64').replace(/(.{76})/g, '$1\r\n'),
  ].join('\r\n');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (await accessToken()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: b64url(raw) }),
  });
  if (!r.ok) throw new Error('Gmail send error ' + r.status + ' ' + (await r.text()).slice(0, 300));
}

module.exports = { sendViaGmail };
