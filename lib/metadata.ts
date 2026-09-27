// lib/metadata.ts
import type { Metadata } from 'next';
import {
  SITE_NAME,
  SITE_URL,
  TWITTER_HANDLE,
  DEFAULT_OG_IMAGE,
} from './config';

type MetaOptions = {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: 'website' | 'article';
};

/**
 * Construit les métadonnées SEO d'une page : title/description, canonical,
 * OpenGraph (consommé aussi par LinkedIn, qui n'a pas de balises propres
 * et lit og:title / og:description / og:image) et Twitter Card.
 */
export function buildMetadata({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  type = 'website',
}: MetaOptions): Metadata {
  const url = `${SITE_URL}${path === '/' ? '' : path}`;
  const absoluteImage = image.startsWith('http') ? image : `${SITE_URL}${image}`;

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [
        {
          url: absoluteImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: 'fr_FR',
      type,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [absoluteImage],
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
    },
  };
}

/**
 * JSON-LD Organization — renforce la présence de marque dans les résultats
 * de recherche (Knowledge Panel, liens sitelinks) et sur LinkedIn/Google.
 */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'IRIS Junior Entreprise',
    url: 'https://irisje.com',
    logo: `${SITE_URL}/logo-iris.png`,
    sameAs: [
      'https://www.linkedin.com/company/iris-junior-creation/',
      'https://github.com/irisjuniorentreprise',
    ],
  };
}

/**
 * JSON-LD JobPosting — éligible aux Google Jobs / rich results tant que
 * la période de recrutement est ouverte. À générer dynamiquement avec les
 * vraies dates d'ouverture/fermeture.
 */
export function jobPostingJsonLd({
  title,
  description,
  datePosted,
  validThrough,
}: {
  title: string;
  description: string;
  datePosted: string;
  validThrough: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title,
    description,
    datePosted,
    validThrough,
    employmentType: 'VOLUNTEER',
    hiringOrganization: {
      '@type': 'Organization',
      name: 'IRIS Junior Entreprise',
      sameAs: 'https://irisje.com',
      logo: `${SITE_URL}/logo-iris.png`,
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Sfax',
        addressCountry: 'TN',
      },
    },
  };
}
