// components/layout/LoadingScreen.tsx
//
// Écran de chargement plein-page, à la charte IRIS JOIN. Utilisé par
// app/loading.tsx (affiché automatiquement par Next.js pendant le
// chargement d'une page ou de ses données), et réutilisable tel quel
// dans n'importe quel autre état de chargement plein écran.
import Image from 'next/image';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/config';
import styles from './LoadingScreen.module.css';

type Props = {
  /** Message annoncé aux lecteurs d'écran (et affiché si fourni). */
  label?: string;
  /** Occupe toute la hauteur de l'écran (pour un usage hors layout, sans Header/Footer). */
  full?: boolean;
};

export default function LoadingScreen({ label = 'Chargement en cours', full = false }: Props) {
  return (
    <div className={styles.screen} data-full={full} role="status" aria-live="polite">
      <div className={styles.card}>
        <div className={styles.markWrap} aria-hidden="true">
          <span className={styles.glow} />
          <span className={styles.ring} />
          <Image
            src="/logo-iris-s.png"
            alt=""
            width={60}
            height={60}
            priority
            className={styles.mark}
          />
        </div>

        <div className={styles.text}>
          <p className={styles.wordmark}>{SITE_NAME}</p>
          <p className={styles.tagline}>{SITE_TAGLINE}</p>
        </div>

        <div className={styles.barTrack} aria-hidden="true">
          <span className={styles.barFill} />
        </div>

        <span className={styles.srOnly}>{label}…</span>
      </div>
    </div>
  );
}