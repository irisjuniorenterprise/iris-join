// app/candidature/page.tsx
import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/metadata';
import { getServiceWindowStates } from '@/lib/settings-store';
import CandidatureGate from '@/components/candidature/CandidatureGate';
import PageHero from '@/components/ui/PageHero';
import { Icons } from '@/components/icons/Icons';

// La disponibilité dépend de l'heure actuelle et d'un réglage modifiable
// par l'admin sans redéploiement : la page doit donc être recalculée à
// chaque requête plutôt que mise en cache statiquement.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Déposer ma candidature',
  description:
    "Postulez à IRIS Junior Entreprise : IT, Marketing, Études ou Développement commercial. Remplissez le formulaire de candidature en ligne en moins de 15 minutes.",
  path: '/candidature',
});

export default async function CandidaturePage() {
  const { candidature } = await getServiceWindowStates();

  return (
    <>
    <PageHero
      current="candidature"
      icon={Icons.FileText}
      title={
      <>
      Déposez votre <span className="text-accent-orange">candidature</span>
      </>
      }
      description="Remplissez ce formulaire pour postuler. Une fois envoyée, vous pourrez réserver votre créneau d'entretien immédiatement."
     />
      <section style={{ paddingTop: '2.5rem' }}>
        <div className="container" style={{ maxWidth: '760px' }}>
          <CandidatureGate status={candidature.status} />
        </div>
      </section>
    </>
  );
}