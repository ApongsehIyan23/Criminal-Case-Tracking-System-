const sgMail = require('@sendgrid/mail');
const { INVITATION_HOURS } = require('../constants');

function createSendgridMailer({ sendgridApiKey, sendgridSender }) {
  const configured = Boolean(sendgridApiKey && sendgridSender);
  if (configured) sgMail.setApiKey(sendgridApiKey);
  return {
    configured,
    async send(message) {
      if (!configured) throw new Error('SendGrid is not configured.');
      await sgMail.send({
        ...message,
        from: sendgridSender,
        // Click tracking would rewrite the activation link and pass the token through a third party.
        trackingSettings: { clickTracking: { enable: false, enableText: false } },
      });
    },
  };
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Bilingual message: the recipient's preferred language comes first.
function invitationEmail({ to, fullName, link, language }) {
  const blocks = {
    EN: {
      greeting: `Hello ${fullName},`,
      body: 'An account has been created for you on the Criminal Case Tracking System (CCTS).',
      action: 'Activate your account and set your password',
      note: `This link works once and expires in ${INVITATION_HOURS} hours.`,
    },
    FR: {
      greeting: `Bonjour ${fullName},`,
      body: 'Un compte a été créé pour vous sur le système de suivi des affaires pénales (CCTS).',
      action: 'Activez votre compte et définissez votre mot de passe',
      note: `Ce lien est à usage unique et expire dans ${INVITATION_HOURS} heures.`,
    },
  };
  const order = language === 'FR' ? ['FR', 'EN'] : ['EN', 'FR'];
  const text = order
    .map((l) => `${blocks[l].greeting}\n\n${blocks[l].body}\n\n${blocks[l].action}:\n${link}\n\n${blocks[l].note}`)
    .join('\n\n----------\n\n');
  const html = order
    .map((l) => `<p>${escapeHtml(blocks[l].greeting)}</p><p>${escapeHtml(blocks[l].body)}</p>`
      + `<p><a href="${escapeHtml(link)}">${escapeHtml(blocks[l].action)}</a></p><p>${escapeHtml(blocks[l].note)}</p>`)
    .join('<hr>');
  return { to, subject: 'CCTS: Activate your account / Activez votre compte', text, html };
}

module.exports = { createSendgridMailer, invitationEmail };
