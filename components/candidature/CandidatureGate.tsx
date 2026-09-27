'use client';
// components/candidature/CandidatureGate.tsx
//
// Composant client séparé de la page : un Server Component ne peut pas
// passer une fonction (children as render-prop) à un Client Component,
// donc toute la composition AuthGate + CandidatureForm doit vivre ici.
//
// Le tout est enveloppé dans .form-card (déjà définie dans globals.css,
// utilisée aussi par SlotPicker) : fond clair, coins arrondis, ombre et
// barre dégradée en haut — l'aspect "feuille de papier" demandé.
//
// `status` vient du serveur (voir app/candidature/page.tsx, qui lit la
// période de disponibilité configurée par l'admin) : si le formulaire
// n'est pas encore ouvert ou a fermé, on affiche une bannière à la place
// de la connexion/formulaire plutôt que de laisser la personne remplir
// quelque chose qui sera de toute façon refusé par l'API.
import AuthGate from '@/components/forms/AuthGate';
import CandidatureForm from '@/components/forms/CandidatureForm';
import ServiceWindowNotice from '@/components/ui/ServiceWindowNotice';
import type { ServiceStatus } from '@/lib/service-window';
import styles from './CandidatureGate.module.css';

type Props = {
  status: ServiceStatus;
};

export default function CandidatureGate({ status }: Props) {
  return (
    <div className="form-card">
      <h2 id="candidature-form-title" className={styles.cardTitle}>
        Formulaire de candidature
      </h2>

      {status.state !== 'open' ? (
        <ServiceWindowNotice status={status} serviceLabel="Le formulaire de candidature" />
      ) : (
        <AuthGate actionLabel="l'envoi de votre candidature">
          {(verifiedEmail) => <CandidatureForm verifiedEmail={verifiedEmail} />}
        </AuthGate>
      )}
    </div>
  );
}