// components/ui/ServiceWindowNotice.tsx
//
// Bannière affichée à la place du formulaire (candidature ou entretien)
// quand le service n'est pas encore ouvert ou vient de fermer. Le statut
// est calculé côté serveur (voir lib/settings-store.ts) et transmis en
// prop : aucun flash de contenu, et la règle est aussi appliquée dans les
// routes API correspondantes (défense en profondeur).
import { Icons } from '@/components/icons/Icons';
import { formatServiceDateTime, type ServiceStatus } from '@/lib/service-window';
import styles from './ServiceWindowNotice.module.css';

type Props = {
  status: ServiceStatus;
  /** "Le formulaire de candidature" / "La réservation d'entretien" — utilisé dans les phrases. */
  serviceLabel: string;
};

export default function ServiceWindowNotice({ status, serviceLabel }: Props) {
  if (status.state === 'not-started') {
    return (
      <div className={styles.notice} role="status">
        <span className={styles.icon}>
          <Icons.Clock size={28} />
        </span>
        <h3 className={styles.title}>Pas encore ouvert</h3>
        <p className={styles.text}>
          {serviceLabel} n&rsquo;est pas encore disponible. Revenez à partir du{' '}
          <strong>{formatServiceDateTime(status.opensAt)}</strong>.
        </p>
      </div>
    );
  }

  if (status.state === 'closed') {
    return (
      <div className={styles.notice} role="status">
        <span className={`${styles.icon} ${styles.iconDanger}`}>
          <Icons.Lock size={28} />
        </span>
        <h3 className={styles.title}>Période terminée</h3>
        <p className={styles.text}>
          {serviceLabel} a fermé le <strong>{formatServiceDateTime(status.closesAt)+" "}</strong> et
          n&rsquo;accepte plus de nouvelles demandes.
        </p>
      </div>
    );
  }

  // status.state === 'open' : rien à afficher ici, le formulaire prend le relais.
  return null;
}