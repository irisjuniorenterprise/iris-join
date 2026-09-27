// app/page.tsx
import Link from 'next/link';
import Image from 'next/image';
import Script from 'next/script';
import { Icons } from '@/components/icons/Icons';
import RecruitmentStatus from '@/components/ui/RecruitmentStatus';
import { isRecruitmentOpen, daysUntilClose, getRecruitmentWindow } from '@/lib/recruitment';
import { jobPostingJsonLd } from '@/lib/metadata';

const benefits = [
  {
    icon: Icons.Handshake,
    title: 'Projets clients réels',
    description: "Vous travaillez sur de vrais mandats, pour de vraies entreprises, pas des exercices fictifs.",
  },
  {
    icon: Icons.GraduationCap,
    title: 'Montée en compétences',
    description: 'Formations internes, mentorat par les anciens, retours concrets sur votre travail.',
  },
  {
    icon: Icons.Handshake,
    title: 'Un vrai réseau',
    description: "Entreprises partenaires, alumni IRIS JE, et le reste du réseau des Junior-Entreprises tunisiennes.",
  },
  {
    icon: Icons.Crown,
    title: 'Responsabilités concrètes',
    description: 'Gestion de projet, relation client, prise de décision — dès votre première mission.',
  },
];

export default function HomePage() {
  const open = isRecruitmentOpen();
  const daysLeft = daysUntilClose();
  const { opensAt, closesAt } = getRecruitmentWindow();

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
            <RecruitmentStatus isOpen={open} daysLeft={daysLeft} />

            <h1>
              Ne postulez pas juste à un club. Rejoignez{' '}
              <span className="text-accent-orange">une entreprise</span>.
            </h1>

            <p className="hero-lead">
              IRIS Junior Entreprise recrute ses futurs consultants IT, Marketing
              et Études. Déposez votre candidature en ligne et choisissez
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
                <span className="hero-meta-value">15 min</span>
                <span className="hero-meta-label">pour candidater</span>
              </div>
              <div className="hero-meta-item">
                <span className="hero-meta-value">48h</span>
                <span className="hero-meta-label">délai de réponse moyen</span>
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

          <div className="journey">
            <div className="journey-step">
              <span className="journey-step-index">Étape 1</span>
              <h3>Candidature en ligne</h3>
              <p>
                Renseignez votre profil et votre motivation pour le
                département de votre choix. Cinq minutes suffisent.
              </p>
              <span className="journey-connector" aria-hidden="true">
                <Icons.ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
              </span>
            </div>
            <div className="journey-step">
              <span className="journey-step-index">Étape 2</span>
              <h3>Réservation d&rsquo;entretien</h3>
              <p>
                Choisissez vous-même votre créneau dans l&rsquo;agenda des
                entretiens, selon vos disponibilités.
              </p>
              <span className="journey-connector" aria-hidden="true">
                <Icons.ChevronDown size={18} style={{ transform: 'rotate(-90deg)' }} />
              </span>
            </div>
            <div className="journey-step">
              <span className="journey-step-index">Étape 3</span>
              <h3>Entretien &amp; intégration</h3>
              <p>
                Rencontrez l&rsquo;équipe, échangez sur vos motivations, et
                recevez la décision sous 48h en moyenne.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--surface)' }}>
        <div className="container">
          <div className="section-heading">
            <h2>Quatre départements, un seul formulaire</h2>
            <p>Choisissez le département qui correspond à vos compétences.</p>
          </div>

          <div className="dept-grid">
            <div className="dept-card dept-card--it">
              <h3>IT</h3>
              <p>Développement, data, systèmes — projets clients concrets</p>
            </div>
            <div className="dept-card dept-card--marketing">
              <h3>Marketing</h3>
              <p>Stratégie, communication, growth pour nos clients</p>
            </div>
            <div className="dept-card dept-card--etudes">
              <h3>Études</h3>
              <p>Conseil, analyse, gestion de projet</p>
            </div>
            <div className="dept-card dept-card--commercial">
              <h3>Développement commercial</h3>
              <p>Vente, prospection, relation client pour nos projets</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="section-heading">
            <h2>Pourquoi nous rejoindre</h2>
            <p>Ce que vous gagnez concrètement en devenant membre actif d&rsquo;IRIS JE.</p>
          </div>

          <div className="benefits-grid">
            {benefits.map((b) => (
              <div className="benefit-card" key={b.title}>
                <span className="benefit-icon">
                  <b.icon size={22} />
                </span>
                <h3>{b.title}</h3>
                <p>{b.description}</p>
              </div>
            ))}
          </div>
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
            Prêt·e à postuler&nbsp;?
          </h2>
          <p className="hero-lead" style={{ textAlign: 'center', margin: '0 auto' }}>
            La candidature prend 15 minutes. La réservation d&rsquo;entretien, 30 secondes de plus.
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