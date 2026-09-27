'use client';
// components/ui/RecruitmentStatus.tsx
import { useEffect, useState } from 'react';

export default function RecruitmentStatus({
  isOpen,
  daysLeft,
}: {
  isOpen: boolean;
  daysLeft: number;
}) {
  // Le calcul initial vient du serveur (SEO-friendly) ; on ne fait ici
  // que rafraîchir visuellement si l'utilisateur reste sur la page.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="status-badge" role="status" aria-live="polite">
      <span className={`status-dot ${isOpen ? '' : 'closed'}`} aria-hidden="true" />
      {isOpen
        ? daysLeft > 1
          ? `Recrutement ouvert — encore ${daysLeft} jours`
          : daysLeft === 1
            ? 'Recrutement ouvert — dernier jour'
            : 'Recrutement ouvert'
        : 'Recrutement actuellement fermé'}
    </div>
  );
}
