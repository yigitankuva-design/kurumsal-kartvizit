const sanitizeHtml = require('sanitize-html');

function biyografiTemizle(biyografi) {
  if (!biyografi) return null;
  const temiz = sanitizeHtml(biyografi, {
    allowedTags: ['b', 'i', 'br', 'p', 'a', 'strong', 'em'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
  });
  return temiz || null;
}

module.exports = { biyografiTemizle };
