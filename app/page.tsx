// app/page.tsx
import Link from 'next/link';
import Image from 'next/image';
import Script from 'next/script';
import RecruitmentStatus from '@/components/ui/RecruitmentStatus';
import BenefitCards from '@/components/ui/BenefitCards';
import DepartmentCards from '@/components/ui/DepartmentCards';
import JourneySteps from '@/components/ui/JourneySteps';
import { getRecruitmentWindow } from '@/lib/recruitment';
import { getServiceWindows } from '@/lib/settings-store';
import { DEFAULT_SERVICE_WINDOWS, type ServiceWindow } from '@/lib/service-window';
import { jobPostingJsonLd } from '@/lib/metadata';

// La période de candidature est réglée par l'admin (Firestore) et dépend de
// l'heure : la page est calculée à chaque requête, comme /candidature, pour
// que le badge ci-dessous soit toujours cohérent avec le formulaire.
export const dynamic = 'force-dynamic';

async function loadCandidatureWindow(): Promise<ServiceWindow> {
  try {
    return (await getServiceWindows()).candidature;
  } catch (err) {
    // Réglages illisibles : on n'empêche pas l'affichage de l'accueil.
    console.warn('[accueil] lecture de la période de candidature impossible', err);
    return DEFAULT_SERVICE_WINDOWS.candidature;
  }
}

export default async function HomePage() {
  const candidatureWindow = await loadCandidatureWindow();
  const serverNow = new Date().toISOString();

  // Les données structurées (JobPosting) exigent des dates : à défaut de
  // période définie par l'admin, on retombe sur la fenêtre par défaut.
  const fallback = getRecruitmentWindow();
  const opensAt = candidatureWindow.opensAt ? new Date(candidatureWindow.opensAt) : fallback.opensAt;
  const closesAt = candidatureWindow.closesAt ? new Date(candidatureWindow.closesAt) : fallback.closesAt;

  return (
    <>
      <Script id="jobposting-jsonld" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify(
          jobPostingJsonLd({
            title: 'Membre actif — IRIS Junior Entreprise',
            description:
              "Rejoignez IRIS Junior Entreprise, la Junior-Entreprise de l'ENIS, et prenez part à de vrais projets clients tout en développant vos compétences.",
            datePosted: opensAt.toISOString(),
            validThrough: closesAt.toISOString(),
          }),
        )}
      </Script>

      <section className="hero" id="accueil">
        <div className="hero-inner container">
          <div className="hero-content">
            <RecruitmentStatus serviceWindow={candidatureWindow} serverNow={serverNow} />

            <h1>
              Ne postulez pas juste à un club. Rejoignez{' '}
              <span className="text-accent-orange">une junior entreprise</span>.
            </h1>

            <p className="hero-lead">
              IRIS Junior Entreprise recrute ses futurs consultants IT, Marketing,
              Études et Développement commercial. Déposez votre candidature en ligne et choisissez
              vous-même votre créneau d&rsquo;entretien, en quelques minutes.
              </p>

            <div className="hero-actions">
              <Link href="/candidature" className="btn btn-primary">
                Déposer ma candidature
              </Link>
              <Link href="/entretien" className="btn btn-ghost">
                Réserver un entretien
              </Link>
            </div>

            <div className="hero-meta">
              <div className="hero-meta-item">
                <span className="hero-meta-value">4</span>
                <span className="hero-meta-label">départements ouverts</span>
              </div>
              <div className="hero-meta-item">
                <span className="hero-meta-value">5 min</span>
                <span className="hero-meta-label">pour candidater</span>
              </div>
              <div className="hero-meta-item">
                <span className="hero-meta-value">30s</span>
                <span className="hero-meta-label">pour reserver un entretien</span>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="hero-glow" aria-hidden="true"></div>
            <Image
              className="hero-logo"
              src="/logo-s-no-bg.png"
              alt="IRIS Junior Entreprise"
              width={420}
              height={420}
              priority
            />
          </div>
        </div>

        <a href="#parcours" className="scroll-cue" aria-label="Voir la suite">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </a>
      </section>

      <section id="parcours">
        <div className="container">
          <div className="section-heading">
            <h2>Le parcours candidat, en trois étapes</h2>
            <p>
              Pas de dossier papier, pas d&rsquo;attente d&rsquo;email pour un
              créneau : tout se passe ici, du dépôt de candidature à la
              confirmation d&rsquo;entretien.
            </p>
          </div>

          <JourneySteps />
        </div>
      </section>

      <section style={{ background: 'var(--surface)' }}>
        <div className="container">
          <div className="section-heading">
            <h2>Quatre départements, un seul formulaire</h2>
            <p>Choisissez le département qui correspond à vos compétences.</p>
          </div>

          <DepartmentCards />
        </div>
      </section>

      <section>
        <div className="container">
          <div className="section-heading">
            <h2>Pourquoi nous rejoindre</h2>
            <p>Ce que vous gagnez concrètement en devenant membre actif d&rsquo;IRIS JE.</p>
          </div>

          <BenefitCards />
        </div>
      </section>

      <section className="hero" style={{ padding: '3.5rem 0' }}>
        <div
          className="container hero-inner"
          style={{
            textAlign: 'center',
            alignItems: 'center',
            gridTemplateColumns: '1fr',
            maxWidth: '700px',
            margin: '0 auto',
          }}
        >
          <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2.1rem)', margin: 0 }}>
            Prêt(e) à postuler&nbsp;?
          </h2>
          <p className="hero-lead" style={{ textAlign: 'center', margin: '0 auto' }}>
            La candidature prend 5 minutes. La réservation d&rsquo;entretien, 30 secondes de plus.
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <Link href="/candidature" className="btn btn-primary">
              Commencer ma candidature
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}