const normPhone = (raw) => {
  let d = String(raw == null ? '' : raw).replace(/[\s\-().]/g, '');
  if (d.startsWith('+234')) d = d.slice(4);
  else if (d.startsWith('234') && d.length >= 13) d = d.slice(3);
  d = d.replace(/^0/, '');
  return /^[789]\d{9}$/.test(d) ? '+234' + d : null;
};
module.exports = { normPhone };
