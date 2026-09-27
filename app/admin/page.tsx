// app/admin/page.tsx
//
// Espace administration : candidatures, entretiens réservés et gestion des
// créneaux. Page non indexée ; l'accès réel est contrôlé côté serveur par
// les routes /api/admin/* (variable ADMIN_EMAILS).
import type { Metadata } from 'next';
import AdminDashboard from '@/components/admin/AdminDashboard';
import PageHero from '@/components/ui/PageHero';
import { Icons } from '@/components/icons/Icons';

export const metadata: Metadata = {
  title: 'Administration',
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <>
      <PageHero
        icon={Icons.Shield}
        title={<>Espace <span className="text-accent-orange">administration</span></>}
        description="Consultez les candidatures, suivez les entretiens réservés et gérez les créneaux disponibles."
      />
      <section style={{ paddingTop: '2.5rem' }}>
        <div className="container" style={{ maxWidth: '1240px' }}>
          <AdminDashboard />
        </div>
      </section>
    </>
  );
}
