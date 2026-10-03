// app/resultats/page.tsx
import type { Metadata } from 'next';
import { buildMetadata } from '@/lib/metadata';
import ResultatsGate from '@/components/resultats/ResultatsGate';
import PageHero from '@/components/ui/PageHero';
import { HeroEyebrow, HeroSeal, SuspenseDots } from '@/components/resultats/ResultHero';

// Page personnelle (résultat d'un candidat) : hors des moteurs de recherche.
export const metadata: Metadata = {
  ...buildMetadata({
    title: 'Mon résultat',
    description: "Consultez la décision de l'équipe IRIS Junior Entreprise pour votre candidature.",
    path: '/resultats',
  }),
  robots: { index: false, follow: false },
};

export default function ResultatsPage() {
  return (
    <>
      <PageHero
        current="reponse"
        eyebrow={<HeroEyebrow />}
        aside={<HeroSeal />}
        title={
          <>
            Votre <span className="text-accent-orange">résultat</span>
            <SuspenseDots />
          </>
        }
        description="Connectez-vous pour consulter la décision de l'équipe IRIS JE concernant votre candidature."
      />
      <section style={{ paddingTop: '2.5rem' }}>
        <div className="container" style={{ maxWidth: '820px' }}>
          <ResultatsGate />
        </div>
      </section>
    </>
  );
}