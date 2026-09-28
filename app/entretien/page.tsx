// app/entretien/page.tsx
import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/metadata';
import { getServiceWindowStates } from '@/lib/settings-store';
import EntretienGate from '@/components/entretien/EntretienGate';
import PageHero from '@/components/ui/PageHero';

// Même raison que app/candidature/page.tsx : la disponibilité dépend de
// l'heure actuelle et d'un réglage admin, donc pas de mise en cache statique.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: "Réserver mon entretien",
  description:
    "Choisissez votre créneau d'entretien IRIS Junior Entreprise directement en ligne, sans échange d'emails.",
  path: '/entretien',
});

export default async function EntretienPage() {
  const { entretien } = await getServiceWindowStates();

  return (
    <>
      <PageHero
        current="entretien"
        title="Réservez votre entretien"
        description="Sélectionnez un jour puis un créneau libre. Vous recevrez une confirmation par email avec les détails pratiques."
      />
      <section style={{ paddingTop: '2.5rem' }}>
        <div className="container" style={{ maxWidth: '820px' }}>
          <EntretienGate status={entretien.status} />
        </div>
      </section>
    </>
  );
}