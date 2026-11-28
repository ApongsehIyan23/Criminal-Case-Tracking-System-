const sgMail = require('@sendgrid/mail');
const { INVITATION_HOURS, PASSWORD_RESET_MINUTES } = require('../constants');

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

function passwordResetEmail({ to, fullName, link, language }) {
  const blocks = {
    EN: {
      greeting: `Hello ${fullName},`,
      body: 'A password reset was requested for your account on the Criminal Case Tracking System (CCTS).',
      action: 'Choose a new password',
      note: `This link works once and expires in ${PASSWORD_RESET_MINUTES} minutes. If you did not ask for it, ignore this email: your password stays the same.`,
    },
    FR: {
      greeting: `Bonjour ${fullName},`,
      body: 'Une réinitialisation du mot de passe a été demandée pour votre compte sur le système de suivi des affaires pénales (CCTS).',
      action: 'Choisissez un nouveau mot de passe',
      note: `Ce lien est à usage unique et expire dans ${PASSWORD_RESET_MINUTES} minutes. Si vous ne l'avez pas demandé, ignorez cet e-mail : votre mot de passe reste inchangé.`,
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
  return { to, subject: 'CCTS: Reset your password / Réinitialisez votre mot de passe', text, html };
}

// Carries the case number and deadline only: no personal details in email.
function custodyAlertEmail({ to, caseId, expiresAt, language, link, timeZone }) {
  const when = (locale) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone })
    .format(expiresAt);
  const passed = expiresAt.getTime() <= Date.now();
  const blocks = {
    EN: [passed ? `The custody limit for a suspect on case ${caseId} has passed.`
      : `A suspect on case ${caseId} is approaching the custody limit.`,
    `Deadline: ${when('en-GB')} (Cameroon time).`, 'Open CCTS to act on this case'],
    FR: [passed ? `Le délai de garde à vue d'un suspect dans l'affaire ${caseId} est dépassé.`
      : `Un suspect de l'affaire ${caseId} approche de la limite de garde à vue.`,
    `Échéance : ${when('fr-CM')} (heure du Cameroun).`, 'Ouvrez le CCTS pour traiter cette affaire'],
  };
  const order = language === 'FR' ? ['FR', 'EN'] : ['EN', 'FR'];
  return {
    to,
    subject: `CCTS: Custody deadline / Échéance de garde à vue - ${caseId}`,
    text: order.map((l) => `${blocks[l][0]}\n${blocks[l][1]}\n${blocks[l][2]}: ${link}`).join('\n\n----------\n\n'),
    html: order.map((l) => `<p>${escapeHtml(blocks[l][0])}</p><p>${escapeHtml(blocks[l][1])}</p>`
      + `<p><a href="${escapeHtml(link)}">${escapeHtml(blocks[l][2])}</a></p>`).join('<hr>'),
  };
}

module.exports = { createSendgridMailer, invitationEmail, passwordResetEmail, custodyAlertEmail };
