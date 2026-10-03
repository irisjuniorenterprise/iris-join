// components/resultats/ResultHero.tsx
//
// Éléments créatifs du hero de la page « Mon résultat », injectés dans
// PageHero (qui garde la mise en page commune aux autres pages) :
//  - HeroEyebrow : pastille de statut au-dessus du titre ;
//  - SuspenseDots : trois points qui s'allument un à un après « résultat » ;
//  - HeroSeal    : sceau « iris » à droite du titre (grands écrans) : anneaux,
//                  arc orange en orbite et cadenas dont l'anse se soulève
//                  régulièrement, comme si la décision allait s'ouvrir.
// Composants statiques (aucun état) : utilisables depuis un Server Component.
import styles from './ResultHero.module.css';

export function HeroEyebrow() {
  return (
    <span className={styles.eyebrow}>
      <span className={styles.eyebrowDot} aria-hidden="true" />
      Décision de l&rsquo;équipe IRIS JE
    </span>
  );
}

export function SuspenseDots() {
  return (
    <span className={styles.dots} aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

export function HeroSeal() {
  return (
    <div className={styles.seal}>
      <svg className={styles.sealRings} viewBox="0 0 400 400" focusable="false">
        <circle cx="200" cy="200" r="90" />
        <circle cx="200" cy="200" r="140" />
        <circle cx="200" cy="200" r="190" />
      </svg>

      <svg className={`${styles.sealRings} ${styles.sealOrbit}`} viewBox="0 0 400 400" focusable="false">
        <path className={styles.orbitArc} d="M 289.6 98.4 A 140 140 0 0 1 339 252" />
        <circle className={styles.orbitDot} cx="339" cy="252" r="7" />
      </svg>

      <span className={styles.disc}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" focusable="false">
          {/* Anse : se soulève puis se referme. */}
          <path
            className={styles.shackle}
            d="M8 11V7.5a4 4 0 0 1 8 0V11"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="16" r="1.4" fill="var(--secondary)" />
        </svg>
      </span>
    </div>
  );
}