const crypto = require('crypto');

function tokenHashOlustur({
  merchantId, userIp, merchantOid, email, paymentAmount, userBasket,
  noInstallment, maxInstallment, currency, testMode, merchantSalt, merchantKey,
}) {
  const hashStr = `${merchantId}${userIp}${merchantOid}${email}${paymentAmount}${userBasket}${noInstallment}${maxInstallment}${currency}${testMode}`;
  return crypto
    .createHmac('sha256', merchantKey)
    .update(hashStr + merchantSalt)
    .digest('base64');
}

function callbackHashDogrula({ merchantOid, status, totalAmount, merchantSalt, merchantKey, gelenHash }) {
  const hashStr = `${merchantOid}${merchantSalt}${status}${totalAmount}`;
  const hesaplanan = crypto
    .createHmac('sha256', merchantKey)
    .update(hashStr)
    .digest('base64');
  return hesaplanan === gelenHash;
}

module.exports = { tokenHashOlustur, callbackHashDogrula };
