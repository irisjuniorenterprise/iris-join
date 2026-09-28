// components/ui/PageHero.tsx
//
// Hero des pages candidature / entretien.
// Le parcours de recrutement (candidature → entretien → réponse) est le
// fil conducteur : l'étape de la page courante est mise en avant, les
// deux premières étapes restent cliquables pour naviguer entre les pages.
import Link from 'next/link';
import styles from './PageHero.module.css';

type CurrentStep = 'candidature' | 'entretien';

type PageHeroProps = {
  /** Étape du parcours correspondant à la page affichée. */
  current: CurrentStep;
  title: string;
  description: string;
};

const STEPS = [
  { key: 'candidature', label: 'Candidature', hint: 'Formulaire en ligne', href: '/candidature' },
  { key: 'entretien', label: 'Entretien', hint: 'Choix du créneau', href: '/entretien' },
  { key: 'reponse', label: 'Réponse', hint: "Décision de l'équipe", href: null },
] as const;

export default function PageHero({ current, title, description }: PageHeroProps) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);

  return (
    <section className={styles.hero}>
      {/* Anneaux décoratifs (motif « iris ») : un seul arc orange, le reste en filigrane. */}
      <svg className={styles.rings} viewBox="0 0 600 600" aria-hidden="true" focusable="false">
        <circle cx="300" cy="300" r="120" />
        <circle cx="300" cy="300" r="200" />
        <circle cx="300" cy="300" r="280" />
        <path className={styles.ringArc} d="M 400 126.8 A 200 200 0 0 1 497 334.7" pathLength={1} />
        <circle className={styles.ringDot} cx="497" cy="334.7" r="5" />
      </svg>

      <div className="container">
        <div className={styles.body}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lead}>{description}</p>
        </div>
      </div>

      <div className={styles.railBar}>
        <div className="container">
          <nav aria-label="Parcours de recrutement">
            <ol className={styles.rail}>
              {STEPS.map((step, index) => {
                const state = index === currentIndex ? 'current' : index < currentIndex ? 'done' : 'next';
                const content = (
                  <>
                    <span className={styles.track}>
                      <span className={styles.node}>{index + 1}</span>
                      {index < STEPS.length - 1 && (
                        <span className={styles.line} aria-hidden="true">
                          <span className={styles.lineFill} />
                        </span>
                      )}
                    </span>
                    <span className={styles.labels}>
                      <span className={styles.label}>{step.label}</span>
                      <span className={styles.hint}>{step.hint}</span>
                    </span>
                  </>
                );

                return (
                  <li
                    key={step.key}
                    className={styles.item}
                    data-state={state}
                    data-filled={index < currentIndex ? 'true' : 'false'}
                  >
                    {state === 'current' ? (
                      <span className={styles.step} aria-current="step">
                        {content}
                      </span>
                    ) : step.href ? (
                      <Link href={step.href} className={styles.step}>
                        {content}
                      </Link>
                    ) : (
                      <span className={styles.step}>{content}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        </div>
      </div>
    </section>
  );
}