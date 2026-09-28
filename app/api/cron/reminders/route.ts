// app/api/cron/reminders/route.ts
//
// Envoie le rappel d'entretien aux candidats dont l'entretien commence
// dans moins de 24h (voir REMINDER_LEAD_HOURS dans lib/interview.ts).
// C'est le SEUL e-mail envoyé au sujet d'un entretien : rien n'est envoyé
// à la réservation, au changement de créneau ou à l'annulation.
//
// Conçu pour être appelé périodiquement (toutes les 15-30 minutes) par un
// planificateur externe (Vercel Cron, cron-job.org, GitHub Actions…) :
//   GET /api/cron/reminders
//   Authorization: Bearer <CRON_SECRET>
//
// Chaque créneau réservé n'est renvoyé qu'une seule fois : claimDueReminders()
// marque le créneau AVANT l'envoi dans une transaction Firestore, donc deux
// exécutions qui se chevauchent ne dupliquent jamais un rappel. Si l'envoi
// échoue (SMTP indisponible), la marque est retirée pour réessayer au
// prochain passage.
import { NextResponse } from 'next/server';
import { claimDueReminders, getCandidatureNameByEmail, releaseReminderClaim } from '@/lib/slots-store';
import { formatDayLong } from '@/lib/interview';
import { isEmailConfigured, sendInterviewReminder } from '@/lib/email';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

function unauthorized() {
  return NextResponse.json({ ok: false, message: 'Non autorisé.' }, { status: 401, headers: NO_STORE });
}

async function run() {
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { ok: true, sent: 0, failed: 0, skipped: 'smtp-not-configured' },
      { headers: NO_STORE },
    );
  }

  const due = await claimDueReminders();
  let sent = 0;
  let failed = 0;

  for (const reminder of due) {
    try {
      const nomPrenom = (await getCandidatureNameByEmail(reminder.email)) || reminder.email;

      const ok = await sendInterviewReminder(
        reminder.email,
        nomPrenom,
        formatDayLong(reminder.date),
        reminder.time,
      );

      if (ok) {
        sent += 1;
      } else {
        failed += 1;
        await releaseReminderClaim(reminder.slotId);
      }
    } catch (err) {
      failed += 1;
      console.error('[cron/reminders] échec pour', reminder.slotId, err);
      await releaseReminderClaim(reminder.slotId).catch(() => {});
    }
  }

  return NextResponse.json(
    { ok: true, sent, failed, total: due.length },
    { headers: NO_STORE },
  );
}

/** Vercel Cron (et la plupart des planificateurs externes) appellent en GET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) return unauthorized();
  }
  return run();
}

/** Accepté aussi en POST pour les planificateurs qui préfèrent cette méthode. */
export async function POST(request: Request) {
  return GET(request);
}
