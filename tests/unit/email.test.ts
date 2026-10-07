import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }));

const ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'RH_NOTIFICATION_EMAIL'] as const;
const saved: Record<string, string | undefined> = {};

/** Recharge lib/email avec l'environnement donné (il est lu à l'import / à la première utilisation). */
async function loadEmail(env: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}) {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  return import('@/lib/email');
}

const SMTP = { SMTP_HOST: 'smtp.test', SMTP_USER: 'user', SMTP_PASS: 'pass', SMTP_FROM: 'IRIS <rh@test.tn>' };

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  mocks.sendMail.mockReset();
  mocks.sendMail.mockResolvedValue({ messageId: 'ok' });
  mocks.createTransport.mockReset();
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

const sentMail = () => mocks.sendMail.mock.calls[0][0] as { from: string; to: string; subject: string; html: string };

describe('isEmailConfigured', () => {
  it('faux sans SMTP', async () => {
    expect((await loadEmail()).isEmailConfigured()).toBe(false);
  });

  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const)('faux quand %s manque', async (missing) => {
    const env = { ...SMTP } as Record<string, string>;
    delete env[missing];
    expect((await loadEmail(env)).isEmailConfigured()).toBe(false);
  });

  it('vrai quand host, user et pass sont définis', async () => {
    expect((await loadEmail(SMTP)).isEmailConfigured()).toBe(true);
  });
});

describe('transport SMTP', () => {
  it('port 587 : connexion non sécurisée (STARTTLS)', async () => {
    const email = await loadEmail({ ...SMTP, SMTP_PORT: '587' });
    await email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi 12 octobre', '09:00');
    expect(mocks.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.test', port: 587, secure: false, auth: { user: 'user', pass: 'pass' } }),
    );
  });

  it('port 465 : connexion sécurisée', async () => {
    const email = await loadEmail({ ...SMTP, SMTP_PORT: '465' });
    await email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi 12 octobre', '09:00');
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }));
  });

  it('port 587 par défaut', async () => {
    const email = await loadEmail(SMTP);
    await email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi 12 octobre', '09:00');
    expect(mocks.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587 }));
  });

  it('réutilise le même transport entre deux envois', async () => {
    const email = await loadEmail(SMTP);
    await email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi', '09:00');
    await email.sendInterviewReminder('c@d.tn', 'Sami', 'Lundi', '09:30');
    expect(mocks.createTransport).toHaveBeenCalledTimes(1);
  });

  it("utilise SMTP_FROM comme expéditeur, à défaut SMTP_USER", async () => {
    let email = await loadEmail(SMTP);
    await email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi', '09:00');
    expect(sentMail().from).toBe('IRIS <rh@test.tn>');

    mocks.sendMail.mockClear();
    email = await loadEmail({ SMTP_HOST: 'h', SMTP_USER: 'user', SMTP_PASS: 'p' });
    await email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi', '09:00');
    expect(sentMail().from).toBe('user');
  });
});

describe('sendInterviewReminder', () => {
  it('renvoie false (sans planter) quand le SMTP n’est pas configuré', async () => {
    const email = await loadEmail();
    await expect(email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi 12 octobre', '09:00')).resolves.toBe(false);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('envoie le rappel avec la date et l’heure', async () => {
    const email = await loadEmail(SMTP);
    await expect(email.sendInterviewReminder('ali@test.tn', 'Ali Ben Salah', 'Lundi 12 octobre', '09:30')).resolves.toBe(
      true,
    );
    const mail = sentMail();
    expect(mail.to).toBe('ali@test.tn');
    expect(mail.subject).toMatch(/Rappel/);
    expect(mail.html).toContain('Ali Ben Salah');
    expect(mail.html).toContain('Lundi 12 octobre');
    expect(mail.html).toContain('09:30');
  });

  it('renvoie false quand l’envoi échoue (le cron pourra réessayer)', async () => {
    mocks.sendMail.mockRejectedValue(new Error('SMTP down'));
    const email = await loadEmail(SMTP);
    await expect(email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi', '09:00')).resolves.toBe(false);
  });

  it('échappe le HTML du nom', async () => {
    const email = await loadEmail(SMTP);
    await email.sendInterviewReminder('a@b.tn', '<img src=x onerror=alert(1)>', 'Lundi', '09:00');
    expect(sentMail().html).not.toContain('<img src=x');
    expect(sentMail().html).toContain('&lt;img');
  });
});

describe('sendResultEmail', () => {
  it.each([
    ['accepted', /^\[Résultat - candidature\]$/, /Bienvenue chez IRIS/],
    ['rejected', /^\[Résultat - candidature\]$/, /pas en mesure de retenir/],
    ['absent', /^\[Entretien - absence\]$/, /pas pu vous présenter/],
  ] as const)('gabarit « %s »', async (status, subject, body) => {
    const email = await loadEmail(SMTP);
    const ok = await email.sendResultEmail('a@b.tn', 'Ali', 'IT', status);
    expect(ok).toBe(true);
    expect(sentMail().subject).toMatch(subject);
    expect(sentMail().html).toMatch(body);
    expect(sentMail().html).toContain('IT');
    expect(sentMail().html).toContain('/resultats');
  });

  it('ajoute le message personnalisé, échappé, avec retours à la ligne', async () => {
    const email = await loadEmail(SMTP);
    await email.sendResultEmail('a@b.tn', 'Ali', 'IT', 'accepted', '<b>Bravo</b>\nRendez-vous lundi');
    const html = sentMail().html;
    expect(html).toContain('&lt;b&gt;Bravo&lt;/b&gt;<br>Rendez-vous lundi');
    expect(html).not.toContain('<b>Bravo</b>');
  });

  it('n’ajoute aucun encadré quand le message est vide ou blanc', async () => {
    const email = await loadEmail(SMTP);
    await email.sendResultEmail('a@b.tn', 'Ali', 'IT', 'accepted', '   ');
    expect(sentMail().html).not.toContain('NB :');
  });

  it('échappe le nom et le département', async () => {
    const email = await loadEmail(SMTP);
    await email.sendResultEmail('a@b.tn', '<script>x</script>', '<i>IT</i>', 'rejected');
    expect(sentMail().html).not.toContain('<script>');
    expect(sentMail().html).not.toContain('<i>IT</i>');
  });

  it('utilise la charte : police Verdana et texte #1a3969', async () => {
    const email = await loadEmail(SMTP);
    await email.sendResultEmail('a@b.tn', 'Ali', 'IT', 'accepted');
    expect(sentMail().html).toContain('Verdana');
    expect(sentMail().html).toContain('#1a3969');
  });

  it('affiche le message personnalisé précédé de « NB : »', async () => {
    const email = await loadEmail(SMTP);
    await email.sendResultEmail('a@b.tn', 'Ali', 'IT', 'accepted', 'Rendez-vous lundi');
    expect(sentMail().html).toContain('NB :');
  });

  it('renvoie false quand le SMTP est absent ou en erreur (l’admin doit le savoir)', async () => {
    expect(await (await loadEmail()).sendResultEmail('a@b.tn', 'Ali', 'IT', 'accepted')).toBe(false);

    mocks.sendMail.mockRejectedValue(new Error('boom'));
    const email = await loadEmail(SMTP);
    expect(await email.sendResultEmail('a@b.tn', 'Ali', 'IT', 'accepted')).toBe(false);
  });
});

describe('style des e-mails (lettre sur fond blanc, signée RH)', () => {
  it('embarque les 6 icônes en pièces jointes inline (cid), jamais en lien externe', async () => {
    const email = await loadEmail(SMTP);
    await email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi', '09:00');
    const mail = mocks.sendMail.mock.calls[0][0] as {
      html: string;
      attachments: { cid: string; contentType: string; contentDisposition: string; content: Buffer }[];
    };
    const cids = mail.attachments.map((a) => a.cid).sort();
    expect(cids).toEqual(
      ['icon-facebook', 'icon-globe', 'icon-instagram', 'icon-linkedin', 'icon-phone', 'icon-pin'].map((n) => `${n}@iris`),
    );
    for (const a of mail.attachments) {
      expect(a.contentType).toBe('image/png');
      expect(a.contentDisposition).toBe('inline');
      expect(a.content.subarray(1, 4).toString()).toBe('PNG');
      expect(mail.html).toContain(`src="cid:${a.cid}"`);
    }
    expect(mail.html).not.toMatch(/\/email\/icon-/);
  });

  it('chaque e-mail : fond blanc, sans en-tête ni carte, signature de la RH', async () => {
    const email = await loadEmail({ ...SMTP, RH_NOTIFICATION_EMAIL: 'rh@iris.tn' });
    await email.sendCandidatureConfirmation('a@b.tn', 'Ali', 'IT');
    await email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi', '09:00');
    await email.sendResultEmail('a@b.tn', 'Ali', 'IT', 'accepted');
    await email.notifyRhNewCandidature('a@b.tn', 'Ali', 'IT');

    expect(mocks.sendMail).toHaveBeenCalledTimes(4);
    for (const [mail] of mocks.sendMail.mock.calls as [{ subject: string; html: string }][]) {
      expect(mail.subject).toMatch(/^\[[^\]]+\]/);
      expect(mail.html).toContain('background: #ffffff');
      expect(mail.html).not.toContain('<h1');
      expect(mail.html).not.toContain('border-radius: 16px');
      expect(mail.html).toContain('Hiba SALEM');
      expect(mail.html).toContain('Responsable Ressources Humaines et Formations');
      expect(mail.html).toContain('IRIS Junior Création');
      expect(mail.html).toContain('www.iris-junior-entreprise.com');
      expect(mail.html).toContain('src="cid:icon-pin@iris"');
      expect(mail.html).toContain('src="cid:icon-instagram@iris"');
    }
  });

  it('logo : /logo-iris.png par défaut, EMAIL_LOGO_URL si défini', async () => {
    let email = await loadEmail(SMTP);
    await email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi', '09:00');
    expect(sentMail().html).toMatch(/<img src="https:\/\/[^"]+\/logo-iris\.png"/);

    mocks.sendMail.mockClear();
    process.env.EMAIL_LOGO_URL = 'https://x.tn/logo.png';
    email = await loadEmail(SMTP);
    await email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi', '09:00');
    delete process.env.EMAIL_LOGO_URL;
    expect(sentMail().html).toContain('<img src="https://x.tn/logo.png"');
  });

  it('une variable de signature vide retombe sur la valeur par défaut', async () => {
    process.env.EMAIL_SIGNATURE_OFFICE = '';
    const email = await loadEmail(SMTP);
    await email.sendInterviewReminder('a@b.tn', 'Ali', 'Lundi', '09:00');
    delete process.env.EMAIL_SIGNATURE_OFFICE;
    expect(sentMail().html).toContain('Bureau exécutif 2025 – 2026');
  });
});

describe('e-mails « silencieux »', () => {
  it('sendCandidatureConfirmation n’échoue jamais, même si le SMTP est en panne', async () => {
    mocks.sendMail.mockRejectedValue(new Error('SMTP down'));
    const email = await loadEmail(SMTP);
    await expect(email.sendCandidatureConfirmation('a@b.tn', 'Ali', 'IT')).resolves.toBeUndefined();
  });

  it('sendCandidatureConfirmation contient le département et le lien de réservation', async () => {
    const email = await loadEmail(SMTP);
    await email.sendCandidatureConfirmation('a@b.tn', 'Ali', 'Marketing');
    expect(sentMail().html).toContain('Marketing');
    expect(sentMail().html).toContain('/entretien');
  });

  it('notifyRhNewCandidature ne fait rien sans RH_NOTIFICATION_EMAIL', async () => {
    const email = await loadEmail(SMTP);
    await email.notifyRhNewCandidature('a@b.tn', 'Ali', 'IT');
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('notifyRhNewCandidature écrit à l’équipe RH quand l’adresse est définie', async () => {
    const email = await loadEmail({ ...SMTP, RH_NOTIFICATION_EMAIL: 'rh@iris.tn' });
    await email.notifyRhNewCandidature('ali@test.tn', 'Ali', 'IT');
    expect(sentMail().to).toBe('rh@iris.tn');
    expect(sentMail().subject).toContain('Ali');
    expect(sentMail().html).toContain('ali@test.tn');
  });
});