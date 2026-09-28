'use client';
// components/entretien/EntretienGate.tsx
//
// `status` vient du serveur (voir app/entretien/page.tsx, qui lit la
// période de disponibilité de la réservation d'entretien configurée par
// l'admin). Si la réservation n'est pas encore ouverte ou a fermé, on
// affiche une bannière à la place de la connexion/du sélecteur de
// créneaux — SlotPicker gère déjà lui-même son affichage en .form-card
// pour ses propres états ("candidature requise", etc.), on reprend le
// même enveloppement ici pour la bannière de disponibilité.
//
// Quand la période est CLOSE, un candidat qui a déjà réservé peut quand même
// se connecter pour retrouver son entretien et son compte à rebours
// (composant MyInterview) — c'est le cas typique du jour J.
import AuthGate from '@/components/forms/AuthGate';
import SlotPicker from '@/components/forms/SlotPicker';
import MyInterview from '@/components/entretien/MyInterview';
import ServiceWindowNotice from '@/components/ui/ServiceWindowNotice';
import type { ServiceStatus } from '@/lib/service-window';

type Props = {
  status: ServiceStatus;
};

export default function EntretienGate({ status }: Props) {
  if (status.state !== 'open') {
    return (
      <>
        <div className="form-card">
          <ServiceWindowNotice status={status} serviceLabel="La réservation d'entretien" />
        </div>

        {status.state === 'closed' && (
          <div style={{ marginTop: '1.25rem' }}>
            <AuthGate actionLabel="consulter votre entretien réservé">
              {(verifiedEmail) => (verifiedEmail ? <MyInterview verifiedEmail={verifiedEmail} /> : null)}
            </AuthGate>
          </div>
        )}
      </>
    );
  }

  return (
    <AuthGate actionLabel="la réservation de votre entretien">
      {(verifiedEmail) => <SlotPicker verifiedEmail={verifiedEmail} />}
    </AuthGate>
  );
}