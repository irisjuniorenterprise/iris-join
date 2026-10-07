// lib/email.ts
//
// Envoi d'emails transactionnels via SMTP (nodemailer). Module côté
// serveur uniquement (routes API) — ne jamais importer depuis un
// composant client (nodemailer ne fonctionne pas dans le navigateur).
//
// Les e-mails « candidature reçue » et « notification RH » échouent
// silencieusement (log + return) : un échec d'envoi ne doit jamais faire
// échouer la candidature déjà enregistrée. Le rappel d'entretien et les
// e-mails de résultat renvoient au contraire un booléen (l'appelant doit
// savoir s'ils sont partis).
//
// E-mails d'entretien : UNIQUEMENT le rappel 24 h avant (sendInterviewReminder).

import nodemailer, { type Transporter } from 'nodemailer';
import { LINKEDIN_URL, SITE_URL } from './config';
import type { ResultStatus } from './deliberation';
import { EMAIL_ICON_ATTACHMENTS, iconCid, type EmailIconName } from './email-icons';

const RH_EMAIL = process.env.RH_NOTIFICATION_EMAIL;

// Charte email : e-mails « lettre » sur fond blanc, sans en-tête ni carte,
// signés par la Responsable RH (voir emailShell / signatureHtml plus bas).
// Police Verdana, texte en #073763 (bleu nuit IRIS).
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
      // Icônes de la signature, embarquées (cid:) : jamais d'image cassée.
      attachments: EMAIL_ICON_ATTACHMENTS,
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

/* ------------------------------------------------------------------ */
/* Signature (pied de page) — toujours celle de la RH                    */
/* ------------------------------------------------------------------ */

/**
 * Tous les e-mails partent au nom de la RH (l'administrateur qui déclenche
 * l'envoi agit pour la RH). Valeurs modifiables par variables d'environnement
 * (voir .env.example). Une variable vide ou absente = valeur par défaut ci-dessous.
 *
 * Images : les icônes (réseaux sociaux, adresse, téléphone, site) sont
 * EMBARQUÉES dans l'e-mail (pièces jointes inline, voir lib/email-icons.ts) ;
 * le logo est servi par le site (public/logo-iris.png, URL absolue en https).
 */
const SIGNATURE = {
  name: process.env.EMAIL_SIGNATURE_NAME || 'Hiba SALEM',
  role: process.env.EMAIL_SIGNATURE_ROLE || 'Responsable Ressources Humaines et Formations',
  org: process.env.EMAIL_SIGNATURE_ORG || 'IRIS Junior Création',
  office: process.env.EMAIL_SIGNATURE_OFFICE || 'Bureau exécutif 2025 – 2026',
  address: process.env.EMAIL_SIGNATURE_ADDRESS || 'Route Soukra Km 3.5 – 3038 Sfax',
  phoneLabel: process.env.EMAIL_SIGNATURE_PHONE || '(+216 ) 28 250 549',
  website: process.env.EMAIL_SIGNATURE_WEBSITE || 'https://www.iris-junior-entreprise.com',
  logoUrl: process.env.EMAIL_LOGO_URL || `${SITE_URL}/logo-iris.png`,
  // Réseaux sociaux : l'icône est toujours affichée ; elle n'est cliquable
  // que si l'URL est renseignée.
  facebookUrl: process.env.EMAIL_FACEBOOK_URL || '',
  linkedinUrl: process.env.EMAIL_LINKEDIN_URL || LINKEDIN_URL,
  instagramUrl: process.env.EMAIL_INSTAGRAM_URL || '',
};

/** Source d'une icône embarquée : référence « cid: » vers la pièce jointe inline. */
const iconSrc = (name: EmailIconName) => `cid:${iconCid(name)}`;

function signatureHtml(color: string): string {
  const s = SIGNATURE;
  const tel = s.phoneLabel.replace(/[^\d+]/g, '');
  const siteLabel = s.website.replace(/^https?:\/\//, '');
  const SIG_FONT = 'Arial, Helvetica, sans-serif';
  const link = 'color: #1a5fd0; text-decoration: underline;';
  const text = `font-family: ${EMAIL_FONT}; color: ${color}; font-size: 15px; line-height: 1.4; margin: 0;`;

  const social = (name: EmailIconName, label: string, href: string) => {
    const img = `<img src="${iconSrc(name)}" alt="${label}" width="36" height="36" style="display: block; border: 0; width: 36px; height: 36px;">`;
    return `<td style="padding: 0 5px;">${href ? `<a href="${escapeHtml(href)}" style="text-decoration: none;">${img}</a>` : img}</td>`;
  };

  // Ligne « icône + texte » (adresse, téléphone, site).
  const row = (icon: EmailIconName, label: string, inner: string) => `
          <tr>
            <td style="padding: 6px 10px 6px 0; vertical-align: middle;">
              <img src="${iconSrc(icon)}" alt="${label}" width="20" height="20" style="display: block; border: 0; width: 20px; height: 20px;">
            </td>
            <td style="padding: 6px 0; vertical-align: middle;"><span style="${text}">${inner}</span></td>
          </tr>`;

  return `
    <p style="font-family: ${SIG_FONT}; color: ${color}; font-size: 18px; font-weight: 700; margin: 32px 0 4px;">${escapeHtml(s.name)}</p>
    <p style="font-family: ${SIG_FONT}; color: ${color}; font-size: 16px; margin: 0 0 24px;">${escapeHtml(s.role)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 56px 8px 24px; vertical-align: middle; text-align: center;" align="center">
          <img src="${escapeHtml(s.logoUrl)}" alt="${escapeHtml(s.org)}" width="130" style="display: block; border: 0; width: 130px; height: auto; margin: 0 auto 14px;">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="border-collapse: collapse; margin: 0 auto;">
            <tr>
              ${social('icon-facebook', 'Facebook', s.facebookUrl)}
              ${social('icon-linkedin', 'LinkedIn', s.linkedinUrl)}
              ${social('icon-instagram', 'Instagram', s.instagramUrl)}
            </tr>
          </table>
        </td>
        <td style="padding: 8px 0 8px 36px; border-left: 2px solid ${color}; vertical-align: middle;">
          <p style="${text} font-size: 17px; font-weight: 700; margin-bottom: 10px;">${escapeHtml(s.org)}</p>
          <p style="${text} margin-bottom: 22px;">${escapeHtml(s.office)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
            ${row('icon-location', 'Adresse', escapeHtml(s.address))}
            ${row('icon-phone', 'Téléphone', `<a href="tel:${tel}" style="${link}">${escapeHtml(s.phoneLabel)}</a>`)}
            ${row('icon-globe', 'Site web', `<a href="${escapeHtml(s.website)}" style="${link} font-size: 14px;">${escapeHtml(siteLabel)}</a>`)}
          </table>
        </td>
      </tr>
    </table>`;
}

/**
 * Habillage commun : un e-mail « lettre » — fond blanc, aucun en-tête ni carte,
 * texte aligné à gauche, puis la signature de la RH en pied de page.
 */
function emailShell(bodyHtml: string, textColor: string = EMAIL_TEXT_COLOR): string {
  return `
  <div style="font-family: ${EMAIL_FONT}; background: #ffffff; color: ${textColor}; font-size: 14px; line-height: 1.7; padding: 8px 0;">
    ${bodyHtml}
    ${signatureHtml(textColor)}
  </div>`;
}

/** Paragraphe de corps. */
function para(color: string, html: string): string {
  return `<p style="font-family: ${EMAIL_FONT}; color: ${color}; font-size: 14px; line-height: 1.7; margin: 0 0 16px;">${html}</p>`;
}

/** Ligne à puce « Libellé : lien » (comme « Lien de la réunion : [Lien] »). */
function linkBullet(color: string, label: string, href: string, text: string): string {
  return `<ul style="font-family: ${EMAIL_FONT}; color: ${color}; font-size: 14px; line-height: 1.7; margin: 0 0 16px; padding-left: 40px;">
      <li><strong style="text-decoration: underline;">${escapeHtml(label)}</strong> : <a href="${escapeHtml(href)}" style="color: #1a5fd0;">${escapeHtml(text)}</a></li>
    </ul>`;
}

/* ------------------------------------------------------------------ */
/* E-mails                                                              */
/* ------------------------------------------------------------------ */

export async function sendCandidatureConfirmation(to: string, nomPrenom: string, departement: string) {
  const c = EMAIL_TEXT_COLOR;
  await sendEmail({
    to,
    subject: '[Candidature - confirmation]',
    html: emailShell(
      `
      ${para(c, `Bonjour ${escapeHtml(nomPrenom.trim())},`)}
      ${para(
        c,
        `Nous avons bien reçu votre candidature pour le département <strong>${escapeHtml(departement)}</strong>.
        Notre équipe RH va l'étudier dans les prochains jours.`,
      )}
      ${para(c, `Prochaine étape : réservez votre créneau d'entretien dès maintenant, en quelques clics.`)}
      ${linkBullet(c, "Réservation de l'entretien", `${SITE_URL}/entretien`, 'Lien')}
      ${para(c, `Nous comptons sur votre présence, votre ponctualité et votre implication.`)}
      `,
      c,
    ),
  });
}

/**
 * Rappel d'entretien — le SEUL e-mail lié à l'entretien : envoyé une fois,
 * 24 h avant l'heure du créneau (voir app/api/cron/reminders/route.ts).
 * Aucun e-mail n'est envoyé à la réservation, au changement de créneau ni
 * à l'annulation. Renvoie true si l'e-mail est bien parti (le cron réessaiera sinon).
 */
export async function sendInterviewReminder(
  to: string,
  nomPrenom: string,
  dateLabel: string,
  time: string,
): Promise<boolean> {
  const c = RESULT_TEXT_COLOR;
  const name = escapeHtml(nomPrenom.trim());

  return sendEmailStrict({
    to,
    subject: '[Rappel - entretien]',
    html: emailShell(
      `
      ${para(c, `${name},`)}
      ${para(
        c,
        `Nous vous rappelons que votre entretien dans le cadre de votre candidature à IRIS Junior Entreprise
        est prévu le <strong>${escapeHtml(dateLabel)} à ${escapeHtml(time)}</strong>.`,
      )}
      ${para(c, `Nous vous remercions pour votre disponibilité et vous souhaitons une bonne préparation.`)}
      `,
      c,
    ),
  });
}

/**
 * E-mail de résultat de délibération (accepté / non accepté / absent).
 * Envoyé par l'administration (au nom de la RH), à la demande. Renvoie true
 * si l'e-mail est bien parti (contrairement aux autres, l'admin doit savoir
 * s'il a échoué). Police Verdana, texte #1a3969.
 *
 * `departmentChanged` : le candidat est accepté dans un autre département que
 * son 1er choix (`departement` est alors le département d'acceptation).
 *
 * Les objets ne révèlent pas la décision (elle s'affiche dans la boîte de
 * réception) : seul le candidat qui ouvre le message la découvre.
 */
export async function sendResultEmail(
  to: string,
  nomPrenom: string,
  departement: string,
  status: ResultStatus,
  message?: string,
  departmentChanged = false,
): Promise<boolean> {
  const c = RESULT_TEXT_COLOR;
  const name = escapeHtml(nomPrenom);
  const dept = escapeHtml(departement);
  const note = message?.trim()
    ? para(c, `<strong>NB :</strong> ${escapeHtml(message.trim()).replace(/\n/g, '<br>')}`)
    : '';
  const link = linkBullet(c, 'Mon résultat', `${SITE_URL}/resultats`, 'Lien');

  const content: Record<ResultStatus, { subject: string; body: string }> = {
    accepted: {
      subject: '[Résultat - candidature]',
      body: `
        ${para(c, `Bonjour ${name},`)}
        ${para(
          c,
          departmentChanged
            ? `Au vu de votre profil et de nos échanges lors de l'entretien, nous avons le plaisir de vous annoncer que vous êtes accepté(e) au sein du département <strong>${dept}</strong>. Bienvenue chez IRIS Junior Entreprise !`
            : `Nous avons le plaisir de vous annoncer que votre candidature pour le département <strong>${dept}</strong> a été retenue. Bienvenue chez IRIS Junior Entreprise !`,
        )}
        ${note}
        ${link}`,
    },
    rejected: {
      subject: '[Résultat - candidature]',
      body: `
        ${para(c, `Bonjour ${name},`)}
        ${para(
          c,
          `Après délibération, nous ne sommes malheureusement pas en mesure de retenir votre candidature
          pour le département <strong>${dept}</strong> cette fois-ci.`,
        )}
        ${para(
          c,
          `Nous vous remercions sincèrement pour l'intérêt que vous portez à IRIS JE et pour le temps
          consacré à ce processus. Nous vous encourageons à retenter votre chance lors d'une prochaine campagne.`,
        )}
        ${note}
        ${link}`,
    },
    absent: {
      subject: '[Entretien - absence]',
      body: `
        ${para(c, `Bonjour ${name},`)}
        ${para(
          c,
          `Nous avons constaté que vous n'avez pas pu vous présenter à votre entretien pour le département
          <strong>${dept}</strong>. Sans entretien, nous ne sommes pas en mesure d'étudier votre candidature plus avant.`,
        )}
        ${para(c, `Si vous pensez qu'il s'agit d'une erreur, contactez l'équipe IRIS JE par e-mail au plus vite.`)}
        ${note}
        ${link}`,
    },
  };

  const mail = content[status];
  return sendEmailStrict({
    to,
    subject: mail.subject,
    html: emailShell(mail.body, c),
  });
}

/** Notification interne à l'équipe RH — silencieuse si RH_NOTIFICATION_EMAIL n'est pas défini. */
export async function notifyRhNewCandidature(email: string, nomPrenom: string, departement: string) {
  if (!RH_EMAIL) return;
  const c = EMAIL_TEXT_COLOR;
  await sendEmail({
    to: RH_EMAIL,
    subject: `[Candidature - nouvelle] ${nomPrenom} (${departement})`,
    html: emailShell(
      `${para(
        c,
        `${escapeHtml(nomPrenom)} (${escapeHtml(email)}) a postulé pour le département <strong>${escapeHtml(departement)}</strong>.`,
      )}`,
      c,
    ),
  });
}