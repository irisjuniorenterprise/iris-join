// components/ui/PageHero.tsx
//
// Mini-hero des pages candidature/entretien — aligné sur le hero principal
// de la home : glow à dominante orange, ombre portée sur le titre, mot
// clé du titre en orange (secondary). `title` accepte du JSX pour pouvoir
// mettre en avant un mot avec <span className="text-accent-orange">.
import type { ComponentType, ReactNode } from 'react';

type PageHeroProps = {
  icon: ComponentType<{ size?: number }>;
  title: ReactNode;
  description: string;
};

export default function PageHero({ icon: Icon, title, description }: PageHeroProps) {
  return (
    <section className="page-hero">
      <div className="container">
        <div className="page-hero-inner">
          <span className="page-hero-icon-wrap">
            <span className="page-hero-icon-glow" aria-hidden="true"></span>
            <span className="page-hero-icon">
              <Icon size={26} />
            </span>
          </span>
          <div>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </div>
      </div>
    </section>
  );
}