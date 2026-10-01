// components/layout/Header.tsx
import Image from 'next/image';
import Link from 'next/link';
import { Icons } from '@/components/icons/Icons';
import { PARENT_SITE_URL } from '@/lib/config';

export default function Header() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand">
          <Image src="/logo-join.svg" alt="IRIS Junior Entreprise" width={75} height={75} />
          {/* <span className="brand-mark">IRIS JOIN</span> */}
        </Link>
        <a href={PARENT_SITE_URL} className="back-to-site">
          <Icons.ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} />
          Retour au site IRIS JE
        </a>
      </div>
    </header>
  );
}
