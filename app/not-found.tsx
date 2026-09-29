// app/not-found.tsx
//
// Page 404 de IRIS JOIN. Fichier spécial du App Router : Next.js l'affiche
// pour toute URL inconnue (et pour les appels à notFound()), à l'intérieur du
// layout racine — Header, Footer et <main id="main"> sont donc déjà fournis.
//
// Composant serveur : aucun JavaScript côté navigateur. L'aigle animé vient de
// components/not-found/EagleAnimation (SVG + animations 100 % CSS).
import type { Metadata } from 'next';
import Link from 'next/link';
import EagleAnimation from '@/components/not-found/EagleAnimation';
import { Icons } from '@/components/icons/Icons';
import { PARENT_SITE_URL } from '@/lib/config';
import styles from './not-found.module.css';

export const metadata: Metadata = {
  title: 'Page introuvable',
  description:
    "La page que vous recherchez n'existe pas ou a été déplacée. Reprenez votre parcours de recrutement IRIS Junior Entreprise.",
};

// Mêmes étapes et mêmes libellés que le parcours affiché dans PageHero.
const PARCOURS = [
  {
    href: '/candidature',
    label: 'Candidature',
    hint: 'Formulaire en ligne',
    icon: Icons.FileText,
  },
  {
    href: '/entretien',
    label: 'Entretien',
    hint: 'Choix du créneau',
    icon: Icons.Calendar,
  },
  {
    href: '/resultats',
    label: 'Réponse',
    hint: "Décision de l'équipe",
    icon: Icons.FileCheck,
  },
] as const;

export default function NotFound() {
  return (
    <div className={styles.page}>
      {/* Anneaux décoratifs (motif « iris ») : un seul arc orange, le reste en filigrane. */}
      <svg
        className={styles.rings}
        viewBox="0 0 600 600"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="300" cy="300" r="120" />
        <circle cx="300" cy="300" r="200" />
        <circle cx="300" cy="300" r="280" />
        <path
          className={styles.ringArc}
          d="M 400 126.8 A 200 200 0 0 1 497 334.7"
          pathLength={1}
        />
        <circle className={styles.ringDot} cx="497" cy="334.7" r="5" />
      </svg>

      <div className={`container ${styles.inner}`}>
        <div className={styles.hero}>
          <div className={styles.content}>
            <h1 className={styles.title}>
              <span className={styles.srOnly}>Erreur 404 : </span>
              Notre aigle{' '}
              <span className={styles.highlight}>{"n'a pas atterri"}</span>
            </h1>

            <p className={styles.lead}>
              {"La page que vous recherchez a été modifiée ou n'existe plus."}
            </p>
            <p className={styles.hint}>
              {
                "Vérifiez l'adresse saisie ou repartez de l'accueil. Votre parcours de recrutement, lui, n'a pas bougé."
              }
            </p>

            <div className={styles.actions}>
              <Link href="/" className="btn btn-primary">
                <Icons.Home size={18} />
                {"Retour à l'accueil"}
              </Link>
              <Link href="/candidature" className="btn btn-outline">
                Déposer ma candidature
              </Link>
            </div>
          </div>

          {/* Le « 404 » en filigrane, l'aigle tourne autour. */}
          <div className={styles.visual}>
            <span className={styles.numeral} aria-hidden="true">
              404
            </span>
            <div className={styles.eagle}>
              <EagleAnimation />
            </div>
          </div>
        </div>

        <nav className={styles.path} aria-labelledby="nf-parcours">
          <h2 id="nf-parcours" className={styles.pathTitle}>
            Reprendre le parcours de recrutement
          </h2>
          <ul className={styles.pathList}>
            {PARCOURS.map(({ href, label, hint, icon: Icon }, index) => (
              <li key={href} className={styles.pathItem}>
                <Link href={href} className={styles.pathLink}>
                  <span className={styles.pathIcon}>
                    <Icon size={22} />
                  </span>
                  <span className={styles.pathText}>
                    <span className={styles.pathStep}>Étape {index + 1}</span>
                    <span className={styles.pathLabel}>{label}</span>
                    <span className={styles.pathHint}>{hint}</span>
                  </span>
                  <Icons.ChevronRight size={20} className={styles.pathArrow} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className={styles.help}>
          Un lien ne fonctionne pas ?{' '}
          <a href={`${PARENT_SITE_URL}/fr/contact`}>Écrivez-nous</a>
        </p>
      </div>
    </div>
  );
}
