// lib/email.ts
//
// Envoi d'emails transactionnels via SMTP (nodemailer). Module côté
// serveur uniquement (routes API) — ne jamais importer depuis un
// composant client (nodemailer ne fonctionne pas dans le navigateur).
//
// Toutes les fonctions échouent silencieusement (log + return) plutôt que
// de lever une exception : un email de confirmation qui échoue ne doit
// jamais faire échouer la candidature ou la réservation elle-même (déjà
// enregistrées en base à ce stade). On log pour pouvoir suivre le taux
// d'échec, mais la réponse HTTP renvoyée à l'utilisateur reste un succès.

import nodemailer, { type Transporter } from 'nodemailer';
import { SITE_NAME, SITE_URL } from './config';
import type { ResultStatus } from './deliberation';

const RH_EMAIL = process.env.RH_NOTIFICATION_EMAIL;

// Charte email : police Verdana, texte en #073763 (bleu nuit IRIS).
const EMAIL_FONT = "Verdana, Geneva, sans-serif";
const EMAIL_TEXT_COLOR = "#073763";

// E-mails de résultats : même police (Verdana), texte en #1a3969.
const RESULT_TEXT_COLOR = "#1a3969";

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
  );
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!isEmailConfigured()) return null;
  if (transporter) return transporter;

  const port = Number(process.env.SMTP_PORT ?? 587);

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Envoie un e-mail et indique s'il est parti. Ne lève jamais d'exception
 * (log + false) : l'appelant décide quoi faire d'un échec.
 */
async function sendEmailStrict(params: { to: string; subject: string; html: string }): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    console.warn(
      '[email] SMTP non configuré (SMTP_HOST/SMTP_USER/SMTP_PASS manquants) — email non envoyé:',
      params.subject,
      '->',
      params.to,
    );
    return false;
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    return true;
  } catch (err) {
    console.error('[email] échec d\'envoi SMTP:', params.subject, '->', params.to, err);
    return false;
  }
}

/** Version « silencieuse » : l'échec est loggé mais jamais remonté. */
async function sendEmail(params: { to: string; subject: string; html: string }) {
  await sendEmailStrict(params);
}

/** Échappe le texte saisi par un humain avant de l'insérer dans du HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Habillage HTML commun à tous les emails — police Verdana, texte #073763. */
function emailShell(title: string, bodyHtml: string, textColor: string = EMAIL_TEXT_COLOR): string {
  return `
  <div style="font-family: ${EMAIL_FONT}; background: #f8fafc; padding: 32px 16px;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: #1a3969; padding: 24px 32px;">
        <span style="font-family: ${EMAIL_FONT}; color: #ffffff; font-weight: 700; font-size: 18px; letter-spacing: -0.01em;">${SITE_NAME}</span>
      </div>
      <div style="padding: 32px; font-family: ${EMAIL_FONT};">
        <h1 style="font-family: ${EMAIL_FONT}; font-size: 20px; color: ${textColor}; margin: 0 0 16px;">${title}</h1>
        ${bodyHtml}
      </div>
      <div style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e5e7eb;">
        <p style="font-family: ${EMAIL_FONT}; font-size: 12px; color: ${textColor}; margin: 0;">
          IRIS Junior Entreprise — ENIS Sfax · <a href="${SITE_URL}" style="color: #5ab8de;">${SITE_URL.replace('https://', '')}</a>
        </p>
      </div>
    </div>
  </div>`;
}

export async function sendCandidatureConfirmation(to: string, nomPrenom: string, departement: string) {
  await sendEmail({
    to,
    subject: 'Candidature bien reçue — IRIS Junior Entreprise',
    html: emailShell(
      'Candidature bien reçue ✅',
      `
      <p style="font-family: ${EMAIL_FONT}; color: ${EMAIL_TEXT_COLOR}; line-height: 1.6;">Bonjour ${nomPrenom},</p>
      <p style="font-family: ${EMAIL_FONT}; color: ${EMAIL_TEXT_COLOR}; line-height: 1.6;">
        Nous avons bien reçu votre candidature pour le département <strong>${departement}</strong>.
        Notre équipe RH va l'étudier dans les prochains jours.
      </p>
      <p style="font-family: ${EMAIL_FONT}; color: ${EMAIL_TEXT_COLOR}; line-height: 1.6;">
        Prochaine étape : réservez votre créneau d'entretien dès maintenant, en quelques clics.
      </p>
      <a href="${SITE_URL}/entretien" style="display: inline-block; margin-top: 8px; padding: 12px 24px; background: #ff6633; color: #ffffff; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 14px; font-family: ${EMAIL_FONT};">
        Réserver mon entretien
      </a>
      `,
    ),
  });
}

export async function sendReservationConfirmation(
  to: string,
  dateLabel: string,
  time: string,
  department: string,
) {
  await sendEmail({
    to,
    subject: `Entretien confirmé — ${dateLabel} à ${time}`,
    html: emailShell(
      'Entretien confirmé 📅',
      `
      <p style="font-family: ${EMAIL_FONT}; color: ${EMAIL_TEXT_COLOR}; line-height: 1.6;">Votre entretien est confirmé :</p>
      <div style="background: #f6fafd; border: 1px solid rgba(26,57,105,0.12); border-radius: 12px; padding: 16px 20px; margin: 16px 0;">
        <p style="font-family: ${EMAIL_FONT}; margin: 4px 0; color: ${EMAIL_TEXT_COLOR}; font-weight: 700;">${dateLabel} à ${time}</p>
        <p style="font-family: ${EMAIL_FONT}; margin: 4px 0; color: ${EMAIL_TEXT_COLOR}; font-size: 14px;">Département : ${department}</p>
      </div>
      <p style="font-family: ${EMAIL_FONT}; color: ${EMAIL_TEXT_COLOR}; line-height: 1.6; font-size: 14px;">
        Merci d'arriver 5 minutes en avance. En cas d'empêchement, contactez l'équipe IRIS JE au plus vite.
      </p>
      `,
    ),
  });
}

/**
 * Envoyé par l'administration quand le créneau d'un candidat est modifié
 * (changement demandé par e-mail, ou déplacement d'un créneau réservé).
 */
export async function sendReservationChanged(
  to: string,
  dateLabel: string,
  time: string,
  department: string,
  previous?: { dateLabel: string; time: string },
) {
  await sendEmail({
    to,
    subject: `Entretien mis à jour — ${dateLabel} à ${time}`,
    html: emailShell(
      'Entretien mis à jour 📅',
      `
      <p style="font-family: ${EMAIL_FONT}; color: ${EMAIL_TEXT_COLOR}; line-height: 1.6;">Votre créneau d'entretien a été mis à jour par l'équipe IRIS JE.</p>
      ${
        previous
          ? `<p style="font-family: ${EMAIL_FONT}; color: ${EMAIL_TEXT_COLOR}; line-height: 1.6; font-size: 14px; opacity: 0.75;">Ancien créneau : <span style="text-decoration: line-through;">${previous.dateLabel} à ${previous.time}</span></p>`
          : ''
      }
      <div style="background: #f6fafd; border: 1px solid rgba(26,57,105,0.12); border-radius: 12px; padding: 16px 20px; margin: 16px 0;">
        <p style="font-family: ${EMAIL_FONT}; margin: 4px 0; color: ${EMAIL_TEXT_COLOR}; font-weight: 700;">Nouveau créneau : ${dateLabel} à ${time}</p>
        <p style="font-family: ${EMAIL_FONT}; margin: 4px 0; color: ${EMAIL_TEXT_COLOR}; font-size: 14px;">Département : ${department}</p>
      </div>
      <p style="font-family: ${EMAIL_FONT}; color: ${EMAIL_TEXT_COLOR}; line-height: 1.6; font-size: 14px;">
        Merci d'arriver 5 minutes en avance. En cas d'empêchement, contactez l'équipe IRIS JE au plus vite.
      </p>
      `,
    ),
  });
}

/** Envoyé par l'administration quand une réservation est annulée. */
export async function sendReservationCancelled(to: string, dateLabel: string, time: string) {
  await sendEmail({
    to,
    subject: `Entretien annulé — ${dateLabel} à ${time}`,
    html: emailShell(
      'Entretien annulé',
      `
      <p style="font-family: ${EMAIL_FONT}; color: ${EMAIL_TEXT_COLOR}; line-height: 1.6;">
        Votre entretien prévu le <strong>${dateLabel} à ${time}</strong> a été annulé par l'équipe IRIS JE.
      </p>
      <p style="font-family: ${EMAIL_FONT}; color: ${EMAIL_TEXT_COLOR}; line-height: 1.6;">
        Vous pouvez réserver un nouveau créneau depuis votre espace :
      </p>
      <a href="${SITE_URL}/entretien" style="display: inline-block; margin-top: 8px; padding: 12px 24px; background: #ff6633; color: #ffffff; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 14px; font-family: ${EMAIL_FONT};">
        Réserver un créneau
      </a>
      `,
    ),
  });
}

/**
 * E-mail de résultat de délibération (accepté / non accepté / absent).
 * Envoyé par l'administration, à la demande. Renvoie true si l'e-mail est
 * bien parti (contrairement aux autres, l'admin doit savoir s'il a échoué).
 * Police Verdana, texte #1a3969.
 */
export async function sendResultEmail(
  to: string,
  nomPrenom: string,
  departement: string,
  status: ResultStatus,
  message?: string,
): Promise<boolean> {
  const c = RESULT_TEXT_COLOR;
  const p = `font-family: ${EMAIL_FONT}; color: ${c}; line-height: 1.6;`;
  const name = escapeHtml(nomPrenom);
  const dept = escapeHtml(departement);
  const note = message?.trim()
    ? `<div style="background: #f6fafd; border-left: 4px solid #5ab8de; border-radius: 8px; padding: 14px 18px; margin: 16px 0;">
        <p style="font-family: ${EMAIL_FONT}; color: ${c}; line-height: 1.6; margin: 0; font-size: 14px;">${escapeHtml(message.trim()).replace(/\n/g, '<br>')}</p>
      </div>`
    : '';
  const button = `<a href="${SITE_URL}/resultats" style="display: inline-block; margin-top: 8px; padding: 12px 24px; background: #ff6633; color: #ffffff; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 14px; font-family: ${EMAIL_FONT};">Voir mon résultat</a>`;

  const content: Record<ResultStatus, { subject: string; title: string; body: string }> = {
    accepted: {
      subject: 'Félicitations, vous êtes accepté(e) — IRIS Junior Entreprise',
      title: 'Félicitations ! 🎉',
      body: `
        <p style="${p}">Bonjour ${name},</p>
        <p style="${p}">
          Nous avons le plaisir de vous annoncer que votre candidature pour le département
          <strong>${dept}</strong> a été retenue. Bienvenue chez IRIS Junior Entreprise !
        </p>
        ${note}
        ${button}`,
    },
    rejected: {
      subject: 'Résultat de votre candidature — IRIS Junior Entreprise',
      title: 'Résultat de votre candidature',
      body: `
        <p style="${p}">Bonjour ${name},</p>
        <p style="${p}">
          Après délibération, nous ne sommes malheureusement pas en mesure de retenir votre candidature
          pour le département <strong>${dept}</strong> cette fois-ci.
        </p>
        <p style="${p}">
          Nous vous remercions sincèrement pour l'intérêt que vous portez à IRIS JE et pour le temps
          consacré à ce processus. Nous vous encourageons à retenter votre chance lors d'une prochaine campagne.
        </p>
        ${note}
        ${button}`,
    },
    absent: {
      subject: 'Votre entretien — IRIS Junior Entreprise',
      title: 'Entretien non effectué',
      body: `
        <p style="${p}">Bonjour ${name},</p>
        <p style="${p}">
          Nous avons constaté que vous n'avez pas pu vous présenter à votre entretien pour le département
          <strong>${dept}</strong>. Sans entretien, nous ne sommes pas en mesure d'étudier votre candidature plus avant.
        </p>
        <p style="${p} font-size: 14px;">
          Si vous pensez qu'il s'agit d'une erreur, contactez l'équipe IRIS JE par e-mail au plus vite.
        </p>
        ${note}
        ${button}`,
    },
  };

  const mail = content[status];
  return sendEmailStrict({
    to,
    subject: mail.subject,
    html: emailShell(mail.title, mail.body, c),
  });
}

/** Notification interne à l'équipe RH — silencieuse si RH_NOTIFICATION_EMAIL n'est pas défini. */
export async function notifyRhNewCandidature(email: string, nomPrenom: string, departement: string) {
  if (!RH_EMAIL) return;
  await sendEmail({
    to: RH_EMAIL,
    subject: `Nouvelle candidature — ${nomPrenom} (${departement})`,
    html: emailShell(
      'Nouvelle candidature reçue',
      `<p style="font-family: ${EMAIL_FONT}; color: ${EMAIL_TEXT_COLOR};">${nomPrenom} (${email}) a postulé pour le département <strong>${departement}</strong>.</p>`,
    ),
  });
}