'use client';
// components/ui/RecruitmentStatus.tsx
//
// Badge « Recrutement … » de la page d'accueil. Il suit la période du
// formulaire de candidature configurée par l'admin (mêmes dates que la
// page /candidature et que les routes API), et non plus des variables
// d'environnement : les deux affichages ne peuvent plus se contredire.
//
// Le serveur fournit la période et l'heure du rendu (`serverNow`) pour un
// premier rendu identique à l'hydratation ; dès le montage, le badge se
// recalcule avec l'heure réelle du navigateur, puis chaque minute et au
// retour sur l'onglet (passage à « dernier jour », ouverture, fermeture).
import { useEffect, useState } from 'react';
import {
  daysUntilClose,
  formatServiceDateTime,
  getServiceStatus,
  type ServiceWindow,
} from '@/lib/service-window';

const REFRESH_MS = 60_000;

export default function RecruitmentStatus({
  serviceWindow,
  serverNow,
}: {
  serviceWindow: ServiceWindow;
  serverNow: string;
}) {
  const [now, setNow] = useState(() => new Date(serverNow));

  useEffect(() => {
    const refresh = () => setNow(new Date());
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const status = getServiceStatus(serviceWindow, now);
  const isOpen = status.state === 'open';
  const days = daysUntilClose(serviceWindow, now);

  let label: string;
  if (status.state === 'not-started') {
    label = `Recrutement bientôt ouvert — ouverture le ${formatServiceDateTime(status.opensAt)}`;
  } else if (status.state === 'closed') {
    label = 'Recrutement actuellement fermé';
  } else if (days === null) {
    label = 'Recrutement ouvert';
  } else if (days > 1) {
    label = `Recrutement ouvert — encore ${days} jours`;
  } else {
    label = 'Recrutement ouvert — dernier jour';
  }

  return (
    <div className="status-badge" role="status" aria-live="polite">
      <span className={`status-dot ${isOpen ? '' : 'closed'}`} aria-hidden="true" />
      {label}
    </div>
  );
}