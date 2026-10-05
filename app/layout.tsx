// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Montserrat } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import Header from '@/components/layout/Header';
import SiteFooter from '@/components/layout/SiteFooter';
import Providers from './providers';
import { buildMetadata, organizationJsonLd } from '@/lib/metadata';
import { SITE_NAME } from '@/lib/config';

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#1a3969',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  ...buildMetadata({
    title: `${SITE_NAME} — Postulez et réservez votre entretien`,
    description:
      "Candidatez à IRIS Junior Entreprise et réservez directement votre créneau d'entretien. Le portail de recrutement officiel d'IRIS JE, ENIS Sfax.",
    path: '/',
  }),
  title: {
    default: `${SITE_NAME} — Postulez et réservez votre entretien`,
    template: `%s | ${SITE_NAME}`,
  },
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon' }],
    apple: '/logo-iris-s.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={montserrat.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script id="org-jsonld" type="application/ld+json" strategy="beforeInteractive">
          {JSON.stringify(organizationJsonLd())}
        </Script>
        <a href="#main" className="skip-link">
          Aller au contenu principal
        </a>
        <Providers>
          <Header />
          <main id="main">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
