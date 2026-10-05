'use client';
// components/layout/Footer.tsx
//
// Structure inspirée du footer du site vitrine IRIS JE (grille mobile
// 3 colonnes compactes, bloc marque + réseaux sociaux en dessous, icônes
// SVG réelles). Adapté pour IRIS JOIN : mono-langue (pas de next-intl/RTL),
// liens propres à l'app (candidater/réserver) + liens vers le site vitrine.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { PARENT_SITE_URL, LINKEDIN_URL } from '@/lib/config';
import { DEFAULT_FOOTER_LINKS, type FooterLinks } from '@/lib/footer-links';

const socialIcons = {
  linkedin: (
    <svg viewBox="0 0 24 24">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.15 1.45-2.15 2.94v5.67H9.34V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13zM7.12 20.45H3.55V9h3.57v11.45z" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24">
      <path d="M13.5 21v-7.94h2.66l.4-3.1h-3.06V8.05c0-.9.25-1.51 1.54-1.51h1.64V3.77c-.28-.04-1.26-.12-2.38-.12-2.36 0-3.97 1.44-3.97 4.08v2.27H7.66v3.1h2.67V21h3.17z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24">
      <path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2zm0 5.94a2.34 2.34 0 1 1 0-4.68 2.34 2.34 0 0 1 0 4.68zM17.5 8.27a.84.84 0 1 1-1.68 0 .84.84 0 0 1 1.68 0z" />
      <path d="M16.6 3.5H7.4a3.9 3.9 0 0 0-3.9 3.9v9.2a3.9 3.9 0 0 0 3.9 3.9h9.2a3.9 3.9 0 0 0 3.9-3.9V7.4a3.9 3.9 0 0 0-3.9-3.9zm2.62 13.1a2.63 2.63 0 0 1-2.62 2.62H7.4a2.63 2.63 0 0 1-2.62-2.62V7.4A2.63 2.63 0 0 1 7.4 4.78h9.2a2.63 2.63 0 0 1 2.62 2.62v9.2z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24">
      <path d="M12 2.2c-5.52 0-10 4.48-10 10 0 4.42 2.87 8.17 6.84 9.5.5.1.68-.22.68-.48 0-.24-.01-.86-.01-1.69-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.46-1.11-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.96 0-1.1.39-1.99 1.03-2.7-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.4 9.4 0 0 1 5 0c1.9-1.3 2.74-1.03 2.74-1.03.55 1.38.2 2.4.1 2.65.64.71 1.03 1.6 1.03 2.7 0 3.86-2.34 4.71-4.57 4.96.36.31.68.92.68 1.85 0 1.34-.01 2.42-.01 2.75 0 .26.18.58.69.48A10.01 10.01 0 0 0 22 12.2c0-5.52-4.48-10-10-10z" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24">
      <path d="M16.6 5.4a4.5 4.5 0 0 1-3.18-1.83V14.9a4.65 4.65 0 1 1-4-4.6v2.36a2.3 2.3 0 1 0 1.62 2.2V2.6h2.3a4.5 4.5 0 0 0 3.26 4.13V9a6.8 6.8 0 0 1-3.26-1.04v.01-.01z" />
    </svg>
  ),
};

type FooterProps = {
  /** Liens du parcours candidat à afficher (décidés côté serveur par SiteFooter). */
  links?: FooterLinks;
};

export default function Footer({ links = DEFAULT_FOOTER_LINKS }: FooterProps) {
  const [year, setYear] = useState(2026);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-col">
            <h3>Candidater</h3>
            <ul>
              <li>
                <Link href="/">Accueil</Link>
              </li>
              {links.candidature && (
                <li>
                  <Link href="/candidature">Déposer ma candidature</Link>
                </li>
              )}
              {links.entretien && (
                <li>
                  <Link href="/entretien">Réserver un entretien</Link>
                </li>
              )}
              {links.resultats && (
                <li>
                  <Link href="/resultats">Consulter mon résultat</Link>
                </li>
              )}
            </ul>
          </div>

          <div className="footer-col">
            <h3>IRIS Junior Entreprise</h3>
            <ul>
              <li>
                <a href={PARENT_SITE_URL}>Site officiel</a>
              </li>
              <li>
                <a href={`${PARENT_SITE_URL}/fr/a-propos`}>À propos</a>
              </li>
              <li>
                <a href={`${PARENT_SITE_URL}/fr/contact`}>Contact</a>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h3>Légal</h3>
            <ul>
              <li>
                <a href={`${PARENT_SITE_URL}/fr/mentions-legales`}>Mentions légales</a>
              </li>
              <li>
                <a href={`${PARENT_SITE_URL}/fr/confidentialite`}>Confidentialité</a>
              </li>
              <li>
                <a href={`${PARENT_SITE_URL}/fr/cgu`}>CGU</a>
              </li>
            </ul>
          </div>

          <div className="footer-brand">
            <Image
              className="footer-logo"
              src="/logo-s-no-bg.png"
              alt="IRIS Junior Entreprise"
              width={80}
              height={80}
            />
            <div className="social-links">
              <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                {socialIcons.linkedin}
              </a>
              <a
                href="https://www.facebook.com/IRIS.Junior"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
              >
                {socialIcons.facebook}
              </a>
              <a
                href="https://www.instagram.com/iris.junior.creation/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
              >
                {socialIcons.instagram}
              </a>
              <a
                href="https://github.com/irisjuniorenterprise"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
              >
                {socialIcons.github}
              </a>
              <a
                href="https://www.tiktok.com/@iris.junior.entreprise"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
              >
                {socialIcons.tiktok}
              </a>
            </div>
          </div>
        </div>

        <div className="footer-divider"></div>
        <div className="footer-bottom">
          <p>&copy; {year} IRIS Junior Entreprise — Portail IRIS JOIN</p>
        </div>
      </div>
    </footer>
  );
}