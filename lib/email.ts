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

const RH_EMAIL = process.env.RH_NOTIFICATION_EMAIL;

// Charte email : police Verdana, texte en #073763 (bleu nuit IRIS).
const EMAIL_FONT = "Verdana, Geneva, sans-serif";
const EMAIL_TEXT_COLOR = "#073763";

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

async function sendEmail(params: { to: string; subject: string; html: string }) {
  const t = getTransporter();
  if (!t) {
    console.warn(
      '[email] SMTP non configuré (SMTP_HOST/SMTP_USER/SMTP_PASS manquants) — email non envoyé:',
      params.subject,
      '->',
      params.to,
    );
    return;
  }
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
  } catch (err) {
    console.error('[email] échec d\'envoi SMTP:', params.subject, '->', params.to, err);
  }
}

/** Habillage HTML commun à tous les emails — police Verdana, texte #073763. */
function emailShell(title: string, bodyHtml: string): string {
  return `
  <div style="font-family: ${EMAIL_FONT}; background: #f8fafc; padding: 32px 16px;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: #1a3969; padding: 24px 32px;">
        <span style="font-family: ${EMAIL_FONT}; color: #ffffff; font-weight: 700; font-size: 18px; letter-spacing: -0.01em;">${SITE_NAME}</span>
      </div>
      <div style="padding: 32px; font-family: ${EMAIL_FONT};">
        <h1 style="font-family: ${EMAIL_FONT}; font-size: 20px; color: ${EMAIL_TEXT_COLOR}; margin: 0 0 16px;">${title}</h1>
        ${bodyHtml}
      </div>
      <div style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e5e7eb;">
        <p style="font-family: ${EMAIL_FONT}; font-size: 12px; color: ${EMAIL_TEXT_COLOR}; margin: 0;">
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