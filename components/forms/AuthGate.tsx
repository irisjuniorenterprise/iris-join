"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { Icons } from "@/components/icons/Icons";
import styles from "./AuthGate.module.css";

type AuthGateProps = {
  children: (verifiedEmail: string) => ReactNode;
  /** Personnalise le texte affiché avant connexion (ex. "l'envoi du formulaire" / "la réservation"). */
  actionLabel?: string;
};

export default function AuthGate({
  children,
  actionLabel = "l'envoi du formulaire",
}: AuthGateProps) {
  const { user, loading, configured, signInWithGoogle, signOut, error } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const verifiedEmail = user && confirmed ? user.email ?? "" : "";

  useEffect(() => {
    setExpanded(false);
  }, [user?.uid, confirmed]);

  let authPanel: ReactNode = null;

  if (!configured) {
    authPanel = (
      <div className={styles.gate}>
        <div className={styles.card}>
          <Icons.Alert size={28} />
          <p>
            La configuration Firebase est manquante. Renseignez les
            variables d&rsquo;environnement (voir .env.example) pour activer
            la connexion.
          </p>
        </div>
      </div>
    );
  } else if (loading) {
    authPanel = (
      <div className={styles.gate}>
        <div className={styles.cardCompactCenter}>
          <span className={styles.spinner} aria-hidden="true" />
          <p>Vérification de la connexion…</p>
        </div>
      </div>
    );
  } else if (!user) {
    authPanel = expanded ? (
      <div className={styles.gate}>
        <div className={styles.card}>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={() => setExpanded(false)}
            aria-expanded="true"
            aria-controls="auth-gate"
          >
            Réduire
            <Icons.ChevronDown size={16} className={styles.chevronUp} />
          </button>

          <div className={styles.iconBadge}>
            <Icons.Lock size={26} />
          </div>
          <h3 className={styles.title}>Connexion requise pour {actionLabel}</h3>
          <p className={styles.text}>
            Connectez-vous avec votre compte Google : cela permet de
            vérifier votre adresse e-mail et d&rsquo;éviter les candidatures
            ou réservations frauduleuses. Aucune autre information de votre
            compte n&rsquo;est utilisée.
          </p>
          <button
            type="button"
            className={styles.googleButton}
            onClick={signInWithGoogle}
          >
            <Icons.Google size={20} />
            Se connecter avec Google
          </button>
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      </div>
    ) : (
      <div className={styles.gate}>
        <div className={styles.compactBar}>
          <div className={styles.compactInfo}>
            <span className={styles.compactIconBadge}>
              <Icons.Lock size={16} />
            </span>
            <span className={styles.compactText}>
              Connexion requise avant {actionLabel}
            </span>
          </div>
          <div className={styles.compactActions}>
            <button
              type="button"
              className={styles.googleButtonCompact}
              onClick={signInWithGoogle}
            >
              <Icons.Google size={18} />
              Se connecter avec Google
            </button>
            <button
              type="button"
              className={styles.expandButton}
              onClick={() => setExpanded(true)}
              aria-expanded="false"
              aria-controls="auth-gate"
            >
              Pourquoi&nbsp;?
              <Icons.ChevronDown size={16} />
            </button>
          </div>
          {error && <p className={styles.errorCompact} role="alert">{error}</p>}
        </div>
      </div>
    );
  } else if (!confirmed) {
    authPanel = expanded ? (
      <div className={styles.gate}>
        <div className={styles.card}>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={() => setExpanded(false)}
            aria-expanded="true"
            aria-controls="auth-gate"
          >
            Réduire
            <Icons.ChevronDown size={16} className={styles.chevronUp} />
          </button>

          <div className={styles.iconBadge}>
            <Icons.Mail size={26} />
          </div>
          <h3 className={styles.title}>Confirmez votre adresse e-mail</h3>
          <p className={styles.text}>
            Vous êtes connecté(e) avec l&rsquo;adresse suivante. Elle sera
            associée à {actionLabel}. Confirmez-la pour continuer.
          </p>
          <div className={styles.emailPill}>
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" className={styles.avatar} />
            ) : (
              <Icons.UserCircle size={22} />
            )}
            <span>{user.email}</span>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.confirmButton}
              onClick={() => setConfirmed(true)}
            >
              <Icons.Check size={18} />
              Oui, c&rsquo;est bien mon e-mail
            </button>
            <button type="button" className={styles.switchButton} onClick={signOut}>
              <Icons.LogOut size={18} />
              Ce n&rsquo;est pas moi, se déconnecter
            </button>
          </div>
        </div>
      </div>
    ) : (
      <div className={styles.gate}>
        <div className={styles.compactBar}>
          <div className={styles.compactInfo}>
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" className={styles.compactAvatar} />
            ) : (
              <span className={styles.compactIconBadge}>
                <Icons.UserCircle size={16} />
              </span>
            )}
            <span className={styles.compactText}>{user.email}</span>
            <span className={styles.compactBadge}>À confirmer</span>
          </div>
          <div className={styles.compactActions}>
            <button
              type="button"
              className={styles.confirmButtonCompact}
              onClick={() => setConfirmed(true)}
            >
              <Icons.Check size={16} />
              Confirmer
            </button>
            <button
              type="button"
              className={styles.expandButton}
              onClick={() => setExpanded(true)}
              aria-expanded="false"
              aria-controls="auth-gate"
            >
              Détails
              <Icons.ChevronDown size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  } else {
    authPanel = (
      <div className={styles.verifiedBanner}>
        <Icons.Check size={18} />
        <span>
          Vérifié(e) : <strong>{verifiedEmail}</strong>
        </span>
        <button
          type="button"
          className={styles.changeLink}
          onClick={() => {
            setConfirmed(false);
            signOut();
          }}
        >
          Changer de compte
        </button>
      </div>
    );
  }

  return (
    <>
      <div id="auth-gate">{authPanel}</div>
      {children(verifiedEmail)}
    </>
  );
}