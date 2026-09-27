// components/forms/CandidatureForm.tsx
'use client';

import Link from 'next/link';
import { Controller, useForm, type Control, type SubmitHandler, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icons } from '@/components/icons/Icons';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { DEPARTMENT_LABELS, type DepartmentKey } from '@/lib/interview';
import {
  AUTRE_ENGAGEMENT_OPTIONS,
  DEPARTEMENT_OPTIONS,
  FILIERES,
  MAX_DEPARTEMENTS_CHOISIS,
  NIVEAUX_ETUDES,
  NIVEAUX_LANGUE,
  PARTICIPATION_FORMATIONS,
  SOURCES_CONNAISSANCE,
  candidatureSchema,
  type CandidatureFormData,
} from '@/lib/candidature';
import styles from './CandidatureForm.module.css';
import choices from './CandidatureChoices.module.css';

type CandidatureFormProps = {
  /** Email vérifié via AuthGate — vide tant que la connexion n'est pas confirmée. */
  verifiedEmail: string;
};

const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

const niveauxEtudesOptions = toOptions(NIVEAUX_ETUDES);
const sourcesOptions = toOptions(SOURCES_CONNAISSANCE);
const niveauxLangueOptions = toOptions(NIVEAUX_LANGUE);
const participationOptions = toOptions(PARTICIPATION_FORMATIONS);

/* ============================================================
   GUIDE "BON À SAVOIR" — panneau non fixe (scrolle avec la page).
   Replié par défaut : un bouton affiche/masque toute la liste, et
   chaque point est lui-même un accordéon (flèche ▾) pour son détail.
   ============================================================ */

type GuideItem = {
  /** Section du formulaire concernée (1 à 5) ; null = info générale, non liée à une section précise. */
  section: 1 | 2 | 3 | 4 | 5 | null;
  icon: (props: { size?: number }) => ReactNode;
  title: string;
  text: string;
};

const GUIDE_ITEMS: GuideItem[] = [
  {
    section: 1,
    icon: ({ size = 18 }) => <Icons.Lock size={size} />,
    title: 'Email verrouillé',
    text: "il provient de votre connexion Google confirmée ci-dessus, non modifiable ici.",
  },
  {
    section: 1,
    icon: ({ size = 18 }) => <Icons.GraduationCap size={size} />,
    title: 'Filière et niveau',
    text: "indiquez votre filière ou spécialité (ex. Génie Informatique), puis votre année d'études en cours : 1ʳᵉ, 2ᵉ ou 3ᵉ année.",
  },
  {
    section: 2,
    icon: ({ size = 18 }) => <Icons.Building size={size} />,
    title: 'Département(s) souhaité(s)',
    text: "vous pouvez cliquer sur plusieurs pôles d'IRIS JE (Dev-Co, Marketing, Études, IT) dans l'ordre de votre préférence — seul le 1ᵉʳ cliqué détermine les créneaux d'entretien qui vous seront proposés.",
  },
  {
    section: 3,
    icon: ({ size = 18 }) => <Icons.Handshake size={size} />,
    title: 'Autre engagement',
    text: "si vous êtes déjà engagé(e) dans un club ou une association, dites-nous comment vous comptez concilier vos engagements : la précision est alors obligatoire.",
  },
  {
    section: null,
    icon: ({ size = 18 }) => <Icons.HelpCircle size={size} />,
    title: 'Bouton désactivé ?',
    text: "il reste bloqué tant que l'email n'est pas confirmé plus haut.",
  },
  {
    section: null,
    icon: ({ size = 18 }) => <Icons.Send size={size} />,
    title: 'Après l\u2019envoi',
    text: 'vous pourrez réserver votre créneau d\u2019entretien.',
  },
];

type FormGuideProps = {
  activeSection: number;
};

function FormGuide({ activeSection }: FormGuideProps) {
  // État pour ouvrir/fermer les détails de chaque item
  const [openItems, setOpenItems] = useState<Record<number, boolean>>({});
  // État pour afficher ou masquer toute la liste (repliée par défaut)
  const [isListVisible, setIsListVisible] = useState(false);

  const toggleListVisibility = () => {
    setIsListVisible((prev) => !prev);
  };

  return (
    <div className={styles.formGuide}>
      <div className={styles.formGuideHeader}>
        <div className={styles.formGuideObjective}>
          <span className={styles.formGuideObjectiveIcon} aria-hidden="true">
            <Icons.Info size={20} />
          </span>
          <p>
            <strong>Bon à savoir</strong> avant de remplir votre candidature.
          </p>
        </div>

        <button
          type="button"
          className={`${styles.formGuideToggle} ${isListVisible ? styles.expanded : ''}`}
          onClick={toggleListVisibility}
          aria-expanded={isListVisible}
        >
          <Icons.ChevronDown size={16} className={styles.formGuideToggleIcon} />
          {isListVisible ? 'Voir moins' : 'Afficher plus'}
        </button>
      </div>

      {/* La liste n'est rendue que si isListVisible est true */}
      {isListVisible && (
        <ol className={styles.formGuideList}>
          {GUIDE_ITEMS.map((item, index) => {
            const GuideIcon = item.icon;
            const isActive = item.section !== null && item.section === activeSection;
            const isOpen = !!openItems[index];
            const detailId = `cand-guide-detail-${index}`;

            return (
              <li
                style={{ listStyleType: 'none' }}
                key={item.title}
                className={`${styles.formGuideItem} ${isActive ? styles.formGuideItemActive : ''} ${
                  isOpen ? styles.formGuideItemOpen : ''
                }`}
              >
                <button
                  type="button"
                  className={styles.formGuideItemHeader}
                  aria-expanded={isOpen}
                  aria-controls={detailId}
                  onClick={() =>
                    setOpenItems((prev) => ({ ...prev, [index]: !prev[index] }))
                  }
                >
                  <span className={styles.formGuideItemIcon} aria-hidden="true">
                    <GuideIcon size={18} />
                  </span>
                  <span className={styles.formGuideItemTitle}>{item.title}</span>
                  <Icons.ChevronDown size={16} className={styles.formGuideItemChevron} />
                </button>

                <div className={styles.formGuideItemBody} id={detailId}>
                  <div>
                    <p className={styles.formGuideItemText}>{item.text}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ============================================================
   GROUPE DE CHOIX UNIQUE (boutons radio en cartes)
   Correspond aux questions « Choix multiple » du document
   (au sens Google Forms : une seule réponse possible).
   ============================================================ */

type ChoiceFieldName =
  | 'niveauEtudes'
  | 'sourceConnaissance'
  | 'niveauFrancais'
  | 'niveauAnglais'
  | 'participationFormations'
  | 'autreEngagement';

type ChoiceGroupProps = {
  name: ChoiceFieldName;
  label: string;
  icon: ReactNode;
  options: readonly { value: string; label: string }[];
  register: UseFormRegister<CandidatureFormData>;
  invalid: boolean;
  /** "stack" : une option par ligne (libellés longs). */
  layout?: 'grid' | 'stack';
  helper?: string;
};

function ChoiceGroup({
  name,
  label,
  icon,
  options,
  register,
  invalid,
  layout = 'grid',
  helper,
}: ChoiceGroupProps) {
  const labelId = `cand-${name}-label`;

  return (
    <div
      className={`${styles.field} ${invalid ? choices.groupInvalid : ''}`}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-required="true"
      aria-invalid={invalid}
    >
      <span id={labelId} className={choices.groupLabel}>
        {icon}
        <span>{label} *</span>
      </span>

      <div className={`${choices.grid} ${layout === 'stack' ? choices.stack : ''}`}>
        {options.map((option) => (
          <label key={option.value} className={choices.option}>
            <input
              type="radio"
              value={option.value}
              {...register(name)}
              className={choices.radio}
            />
            <span className={choices.box}>
              <span className={choices.dot} aria-hidden="true" />
              <span className={choices.optionText}>{option.label}</span>
            </span>
          </label>
        ))}
      </div>

      {helper && <small className={styles.helper}>{helper}</small>}
      {invalid && <p className={styles.error}>Veuillez choisir une réponse</p>}
    </div>
  );
}

/* ============================================================
   DÉPARTEMENTS SOUHAITÉS (choix multiple, classé par ordre de
   préférence) — le document dit « Choix multiple », mais un seul
   département compte réellement pour l'affectation aux créneaux
   d'entretien : celui cliqué en premier. Chaque carte cliquée
   affiche son rang (1, 2…) ; un second clic la retire du classement
   et fait remonter les suivantes d'un rang.
   ============================================================ */

type OrderedDepartmentPickerProps = {
  control: Control<CandidatureFormData>;
  invalid: boolean;
};

function OrderedDepartmentPicker({ control, invalid }: OrderedDepartmentPickerProps) {
  const labelId = 'cand-departements-label';

  return (
    <Controller
      name="departements"
      control={control}
      render={({ field }) => {
        const selected = field.value ?? [];

        function toggle(value: DepartmentKey) {
          if (selected.includes(value)) {
            field.onChange(selected.filter((v) => v !== value));
          } else if (selected.length < MAX_DEPARTEMENTS_CHOISIS) {
            field.onChange([...selected, value]);
          }
        }

        return (
          <div
            className={`${styles.field} ${invalid ? choices.groupInvalid : ''}`}
            role="group"
            aria-labelledby={labelId}
            aria-required="true"
            aria-invalid={invalid}
          >
            <span id={labelId} className={choices.groupLabel}>
              <Icons.Building size={18} />
              <span>Département(s) souhaité(s) au sein d’IRIS Junior Entreprise *</span>
            </span>

            <div className={choices.grid}>
              {DEPARTEMENT_OPTIONS.map((option) => {
                const rank = selected.indexOf(option.value);
                const isSelected = rank !== -1;

                return (
                  <button
                    type="button"
                    key={option.value}
                    className={choices.optionButton}
                    onClick={() => toggle(option.value)}
                    onBlur={field.onBlur}
                    aria-pressed={isSelected}
                  >
                    <span className={`${choices.box} ${isSelected ? choices.boxSelected : ''}`}>
                      <span className={choices.orderBadge} aria-hidden="true">
                        {isSelected ? rank + 1 : ''}
                      </span>
                      <span className={choices.optionText}>{option.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <small className={styles.helper}>
              Cliquez dans l’ordre de votre préférence — vous pouvez en choisir plusieurs. Seul le 1ᵉʳ
              détermine vos créneaux d’entretien.
            </small>
            {invalid && <p className={styles.error}>Choisissez au moins un département</p>}
          </div>
        );
      }}
    />
  );
}

/* ============================================================
   FORMULAIRE
   ============================================================ */

export default function CandidatureForm({ verifiedEmail }: CandidatureFormProps) {
  const { getIdToken } = useAuth();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [srStatus, setSrStatus] = useState('');
  const [activeSection, setActiveSection] = useState(1);

  // Une seule candidature autorisée par adresse e-mail. Dès que l'e-mail
  // est confirmé (AuthGate), on vérifie auprès du serveur si un dossier
  // existe déjà pour cette adresse, AVANT de laisser la personne remplir
  // tout le formulaire pour rien. `status` :
  //  - 'idle'     : e-mail pas encore confirmé, rien à vérifier
  //  - 'checking' : requête de vérification en cours
  //  - 'none'     : pas de candidature existante → formulaire affiché
  //  - 'exists'   : candidature déjà envoyée → message affiché à la place
  //  - 'error'    : vérification indisponible → on affiche quand même le
  //                 formulaire (on ne bloque pas un candidat légitime à
  //                 cause d'un souci réseau) ; le serveur revérifie de
  //                 toute façon le doublon à l'envoi (POST → 409).
  const [duplicateCheck, setDuplicateCheck] = useState<{
    status: 'idle' | 'checking' | 'none' | 'exists' | 'error';
    submittedAt?: string | null;
    departement?: DepartmentKey | null;
  }>({ status: 'idle' });

  // Ref (et non un state) pour ne pas provoquer de re-render, et pour
  // survivre au montage/démontage/remontage synthétique du Strict Mode
  // de React 18 en dev — évite l'affichage du toast en double.
  const guideHintShown = useRef(false);

  // Toast d'indice affiché une seule fois au premier chargement : le
  // panneau "Bon à savoir" est replié par défaut, ce toast signale aux
  // user intéressés qu'ils peuvent cliquer "Afficher plus" puis les
  // flèches ▾ pour voir le détail de chaque point.
  useEffect(() => {
    if (guideHintShown.current) return;
    guideHintShown.current = true;
    showToast(
      'Cliquez sur « Afficher plus » pour voir les points du panneau « Bon à savoir », puis sur les flèches ▾ pour en lire les détails.',
      'info',
      { title: 'Astuce', duration: 9000 },
    );
  }, [showToast]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<CandidatureFormData>({
    resolver: zodResolver(candidatureSchema),
    // Les questions à choix unique n'ont volontairement pas de valeur
    // par défaut : aucune carte n'est présélectionnée.
    defaultValues: {
      nomPrenom: '',
      telephone: '',
      filiere: undefined,
      departements: [],
      organisationTemps: '',
      motivation: '',
      domaine: '',
      remarques: '',
      consentement: false,
    },
  });

  // La précision « comment concilier vos engagements » n'apparaît (et
  // n'est obligatoire) que si le candidat répond « Oui ».
  const autreEngagement = watch('autreEngagement');

  useEffect(() => {
    setSrStatus('');
  }, [verifiedEmail]);

  // Vérifie l'existence d'une candidature pour l'e-mail confirmé.
  useEffect(() => {
    if (!verifiedEmail) {
      setDuplicateCheck({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setDuplicateCheck({ status: 'checking' });

    (async () => {
      try {
        const idToken = await getIdToken();
        if (!idToken) {
          if (!cancelled) setDuplicateCheck({ status: 'error' });
          return;
        }

        const res = await fetch('/api/candidature', {
          method: 'GET',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const body = await res.json().catch(() => null);
        if (cancelled) return;

        if (!res.ok || !body?.ok) {
          setDuplicateCheck({ status: 'error' });
          return;
        }

        setDuplicateCheck(
          body.exists
            ? { status: 'exists', submittedAt: body.submittedAt ?? null, departement: body.departement ?? null }
            : { status: 'none' },
        );
      } catch (err) {
        console.error('[candidature] échec de la vérification de doublon', err);
        if (!cancelled) setDuplicateCheck({ status: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [verifiedEmail, getIdToken]);

  const onSubmit: SubmitHandler<CandidatureFormData> = async (data) => {
    if (!verifiedEmail) {
      showToast("Confirmez votre adresse e-mail ci-dessus avant d'envoyer.", 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const idToken = await getIdToken();
      if (!idToken) {
        showToast(
          "Impossible de récupérer votre session Google. Reconnectez-vous puis réessayez.",
          'error',
        );
        return;
      }

      const res = await fetch('/api/candidature', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(data),
      });

      const responseBody = await res.json().catch(() => null);

      if (!res.ok || !responseBody?.ok) {
        console.error('[candidature] échec de la soumission', res.status, responseBody);

        // Cas 409 : une candidature existe déjà pour cet e-mail (détectée
        // côté serveur — par ex. deux onglets ouverts en même temps).
        // On bascule sur le même message professionnel que la vérification
        // préalable, plutôt qu'un simple toast d'erreur générique.
        if (res.status === 409 || responseBody?.code === 'ALREADY_SUBMITTED') {
          const msg =
            responseBody?.message ??
            'Une candidature a déjà été envoyée avec cette adresse e-mail.';
          setDuplicateCheck({ status: 'exists', submittedAt: null, departement: null });
          showToast(msg, 'error');
          setSrStatus(msg);
          return;
        }

        // Cas 400 : Zod a rejeté un ou plusieurs champs côté serveur.
        const fieldErrors = responseBody?.errors?.fieldErrors as
          | Record<string, string[]>
          | undefined;
        if (fieldErrors && Object.keys(fieldErrors).length > 0) {
          const details = Object.entries(fieldErrors)
            .map(([field, msgs]) => `${field} : ${msgs?.[0] ?? 'valeur invalide'}`)
            .join(' · ');
          showToast(`Champ(s) invalide(s) — ${details}`, 'error');
          setSrStatus(`Champ(s) invalide(s) — ${details}`);
          return;
        }

        const msg =
          responseBody?.message ??
          `L'envoi a échoué (code ${res.status}). Ouvrez la console du navigateur pour le détail.`;
        showToast(msg, 'error');
        setSrStatus(msg);
        return;
      }

      showToast('Candidature envoyée ! Vous pouvez réserver votre entretien.', 'success');
      setSrStatus('Candidature envoyée avec succès.');
      reset();
      // Empêche un renvoi immédiat depuis cet onglet : bascule sur le
      // même écran "déjà candidat" que verrait quelqu'un qui revient
      // plus tard avec la même adresse e-mail.
      setDuplicateCheck({
        status: 'exists',
        submittedAt: new Date().toISOString(),
        departement: data.departements[0] ?? null,
      });
    } catch (err) {
      console.error('[candidature] erreur réseau/inattendue', err);
      showToast("L'envoi a échoué (problème réseau). Vérifiez votre connexion.", 'error');
      setSrStatus("L'envoi a échoué. Problème réseau.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Vérification en cours : on évite d'afficher le (long) formulaire
  // tant qu'on ne sait pas s'il y a lieu de le montrer.
  if (verifiedEmail && (duplicateCheck.status === 'checking' || duplicateCheck.status === 'idle')) {
    return (
      <div className={styles.checkingCard}>
        <span className={styles.spinner} aria-hidden="true" />
        <p>Vérification de votre dossier…</p>
      </div>
    );
  }

  // Une candidature existe déjà pour cette adresse : on affiche un
  // message clair et on n'affiche pas le formulaire, plutôt que de
  // laisser la personne le remplir pour se faire refuser à l'envoi.
  if (verifiedEmail && duplicateCheck.status === 'exists') {
    const submittedDate = duplicateCheck.submittedAt ? new Date(duplicateCheck.submittedAt) : null;
    const formattedDate =
      submittedDate && !Number.isNaN(submittedDate.getTime())
        ? submittedDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;
    const departementLabel = duplicateCheck.departement
      ? DEPARTMENT_LABELS[duplicateCheck.departement]
      : null;

    return (
      <div className={styles.alreadySubmitted} role="status">
        <span className={styles.alreadySubmittedIcon}>
          <Icons.Check size={28} />
        </span>

        <h3 className={styles.alreadySubmittedTitle}>Candidature déjà enregistrée</h3>

        <p className={styles.alreadySubmittedText}>
          Une candidature est déjà associée à l&rsquo;adresse{' '}
          <strong>{verifiedEmail}</strong>
          {formattedDate ? <> — envoyée le {formattedDate}</> : null}
          {departementLabel ? (
            <>
              {' '}
              pour le département <strong>{departementLabel}</strong>
            </>
          ) : null}
          . Un seul dossier est accepté par candidat : il n&rsquo;est pas possible de le
          renvoyer ou de le modifier depuis ce formulaire.
        </p>

        <div className={styles.alreadySubmittedActions}>
          <Link href="/entretien" className="btn btn-primary">
            Réserver mon créneau d&rsquo;entretien
          </Link>
        </div>

        <p className={styles.alreadySubmittedHelper}>
          Une erreur dans votre dossier ? Contactez l&rsquo;équipe recrutement.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={styles.form}
      noValidate
      aria-labelledby="candidature-form-title"
    >
      <FormGuide activeSection={activeSection} />

      {/* GROUPE 1 : Informations personnelles (Q1 à Q5) */}
      <fieldset
        className={styles.fieldset}
        style={{ '--i': 0 } as CSSProperties}
        onMouseEnter={() => setActiveSection(1)}
        onFocus={() => setActiveSection(1)}
      >
        <legend className={styles.legend}>
          <Icons.User size={18} />
          Informations personnelles
        </legend>

        <div className={styles.field}>
          <div className={styles.inputWrapper}>
            <Icons.User size={20} className={styles.inputIcon} />
            <input
              id="cand-nomPrenom"
              type="text"
              autoComplete="name"
              {...register('nomPrenom')}
              className={`${styles.input} ${errors.nomPrenom ? styles.invalid : ''}`}
              placeholder=" "
              aria-invalid={!!errors.nomPrenom}
            />
            <label htmlFor="cand-nomPrenom" className={styles.floatingLabel}>
              Nom et prénom *
            </label>
          </div>
          {errors.nomPrenom && <p className={styles.error}>{errors.nomPrenom.message}</p>}
        </div>

        {/* Email verrouillé : provient de la connexion Google vérifiée
            (AuthGate), jamais saisi librement — c'est ce qui garantit
            que l'adresse est authentique. */}
        <div className={styles.field}>
          <div className={styles.inputWrapper}>
            <Icons.Mail size={20} className={styles.inputIcon} />
            <input
              id="cand-email"
              type="email"
              value={verifiedEmail}
              readOnly
              disabled
              className={styles.input}
              placeholder=" "
            />
            <label htmlFor="cand-email" className={styles.floatingLabel}>
              Adresse e-mail (vérifiée) *
            </label>
          </div>
          {!verifiedEmail && (
            <small className={styles.helper}>
              Confirmez votre e-mail ci-dessus pour le renseigner ici automatiquement.
            </small>
          )}
        </div>

        <div className={styles.field}>
          <div className={styles.inputWrapper}>
            <Icons.Phone size={20} className={styles.inputIcon} />
            <input
              id="cand-telephone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              {...register('telephone')}
              className={`${styles.input} ${errors.telephone ? styles.invalid : ''}`}
              placeholder=" "
              aria-invalid={!!errors.telephone}
            />
            <label htmlFor="cand-telephone" className={styles.floatingLabel}>
              Numéro de téléphone *
            </label>
          </div>
          <small className={styles.helper}>8 chiffres, sans espace</small>
          {errors.telephone && <p className={styles.error}>{errors.telephone.message}</p>}
        </div>

        <div className={styles.field}>
          <div className={styles.inputWrapper}>
            <Icons.GraduationCap size={20} className={styles.inputIcon} />
            <select
              id="cand-filiere"
              {...register('filiere')}
              className={`${styles.input} ${styles.select} ${errors.filiere ? styles.invalid : ''}`}
              aria-invalid={!!errors.filiere}
              defaultValue=""
            >
              <option value="">Choisir votre filière…</option>
              {FILIERES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <label htmlFor="cand-filiere" className={styles.floatingLabel}>
              Filière / Spécialité *
            </label>
            <Icons.ChevronDown size={18} className={styles.selectChevron} />
          </div>
          {errors.filiere && <p className={styles.error}>{errors.filiere.message}</p>}
        </div>

        <ChoiceGroup
          name="niveauEtudes"
          label="Niveau d’études"
          icon={<Icons.Layers size={18} />}
          options={niveauxEtudesOptions}
          register={register}
          invalid={!!errors.niveauEtudes}
        />
      </fieldset>

      {/* GROUPE 2 : Votre candidature (Q6 à Q9) */}
      <fieldset
        className={styles.fieldset}
        style={{ '--i': 1 } as CSSProperties}
        onMouseEnter={() => setActiveSection(2)}
        onFocus={() => setActiveSection(2)}
      >
        <legend className={styles.legend}>
          <Icons.Briefcase size={18} />
          Votre candidature
        </legend>

        <OrderedDepartmentPicker control={control} invalid={!!errors.departements} />

        <ChoiceGroup
          name="sourceConnaissance"
          label="Comment avez-vous connu IRIS Junior Entreprise ?"
          icon={<Icons.Megaphone size={18} />}
          options={sourcesOptions}
          register={register}
          invalid={!!errors.sourceConnaissance}
        />

        <ChoiceGroup
          name="niveauFrancais"
          label="Quel est votre niveau en français ?"
          icon={<Icons.BadgeFR size={18} />}
          options={niveauxLangueOptions}
          register={register}
          invalid={!!errors.niveauFrancais}
        />

        <ChoiceGroup
          name="niveauAnglais"
          label="Quel est votre niveau en anglais ?"
          icon={<Icons.BadgeEN size={18} />}
          options={niveauxLangueOptions}
          register={register}
          invalid={!!errors.niveauAnglais}
        />
      </fieldset>

      {/* GROUPE 3 : Disponibilité et engagement (Q10 à Q12) */}
      <fieldset
        className={styles.fieldset}
        style={{ '--i': 2 } as CSSProperties}
        onMouseEnter={() => setActiveSection(3)}
        onFocus={() => setActiveSection(3)}
      >
        <legend className={styles.legend}>
          <Icons.Clock size={18} />
          Disponibilité et engagement
        </legend>

        <ChoiceGroup
          name="participationFormations"
          label="Êtes-vous prêt(e) à participer régulièrement aux formations et événements proposés par IRIS ?"
          icon={<Icons.Calendar size={18} />}
          options={participationOptions}
          register={register}
          invalid={!!errors.participationFormations}
          layout="stack"
        />

        <ChoiceGroup
          name="autreEngagement"
          label="Êtes-vous actuellement engagé(e) dans un autre club, association ou organisation ?"
          icon={<Icons.Handshake size={18} />}
          options={AUTRE_ENGAGEMENT_OPTIONS}
          register={register}
          invalid={!!errors.autreEngagement}
        />

        {autreEngagement === 'oui' && (
          <div className={`${styles.field} ${choices.reveal}`}>
            <div className={`${styles.inputWrapper} ${styles.textareaWrapper}`}>
              <Icons.Edit size={20} className={styles.inputIcon} />
              <textarea
                id="cand-organisationTemps"
                rows={4}
                {...register('organisationTemps')}
                className={`${styles.input} ${styles.textarea} ${errors.organisationTemps ? styles.invalid : ''}`}
                placeholder=" "
                aria-invalid={!!errors.organisationTemps}
              />
              <label htmlFor="cand-organisationTemps" className={styles.floatingLabel}>
                Comment comptez-vous concilier vos engagements ? *
              </label>
            </div>
            <small className={styles.helper}>
              Comment organiserez-vous votre temps entre IRIS Junior Entreprise et vos autres engagements ?
            </small>
            {errors.organisationTemps && (
              <p className={styles.error}>{errors.organisationTemps.message}</p>
            )}
          </div>
        )}
      </fieldset>

      {/* GROUPE 4 : Motivation (Q13 à Q15) */}
      <fieldset
        className={styles.fieldset}
        style={{ '--i': 3 } as CSSProperties}
        onMouseEnter={() => setActiveSection(4)}
        onFocus={() => setActiveSection(4)}
      >
        <legend className={styles.legend}>
          <Icons.Heart size={18} />
          Votre motivation
        </legend>

        <div className={styles.field}>
          <div className={`${styles.inputWrapper} ${styles.textareaWrapper}`}>
            <Icons.Sparkles size={20} className={styles.inputIcon} />
            <textarea
              id="cand-motivation"
              rows={3}
              {...register('motivation')}
              className={`${styles.input} ${styles.textarea} ${errors.motivation ? styles.invalid : ''}`}
              placeholder=" "
              aria-invalid={!!errors.motivation}
            />
            <label htmlFor="cand-motivation" className={styles.floatingLabel}>
              Principale motivation pour rejoindre IRIS *
            </label>
          </div>
          <small className={styles.helper}>Une ou deux phrases suffisent</small>
          {errors.motivation && <p className={styles.error}>{errors.motivation.message}</p>}
        </div>

        <div className={styles.field}>
          <div className={styles.inputWrapper}>
            <Icons.Target size={20} className={styles.inputIcon} />
            <input
              id="cand-domaine"
              type="text"
              {...register('domaine')}
              className={`${styles.input} ${errors.domaine ? styles.invalid : ''}`}
              placeholder=" "
              aria-invalid={!!errors.domaine}
            />
            <label htmlFor="cand-domaine" className={styles.floatingLabel}>
              Domaine que vous souhaitez principalement développer *
            </label>
          </div>
          {errors.domaine && <p className={styles.error}>{errors.domaine.message}</p>}
        </div>

        <div className={styles.field}>
          <div className={`${styles.inputWrapper} ${styles.textareaWrapper}`}>
            <Icons.Message size={20} className={styles.inputIcon} />
            <textarea
              id="cand-remarques"
              rows={3}
              {...register('remarques')}
              className={`${styles.input} ${styles.textarea} ${errors.remarques ? styles.invalid : ''}`}
              placeholder=" "
              aria-invalid={!!errors.remarques}
            />
            <label htmlFor="cand-remarques" className={styles.floatingLabel}>
              Remarques ou informations complémentaires
            </label>
          </div>
          <small className={styles.helper}>Facultatif</small>
          {errors.remarques && <p className={styles.error}>{errors.remarques.message}</p>}
        </div>
      </fieldset>

      {/* GROUPE 5 : Confidentialité */}
      <fieldset
        className={styles.fieldset}
        style={{ '--i': 4 } as CSSProperties}
        onMouseEnter={() => setActiveSection(5)}
        onFocus={() => setActiveSection(5)}
      >
        <legend className={styles.legend}>
          <Icons.Shield size={18} />
          Confidentialité
        </legend>

        <div className={styles.checkboxField}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              {...register('consentement')}
              className={styles.checkbox}
              aria-invalid={!!errors.consentement}
            />
            <span className={styles.checkboxText}>
              J&rsquo;accepte que mes données soient utilisées dans le cadre de ce processus de recrutement.
              <br />
              <small>
                Voir notre{' '}
                <a href="https://irisje.com/fr/confidentialite" className={styles.link} target="_blank" rel="noopener noreferrer">
                  politique de confidentialité
                </a>
                .
              </small>
            </span>
          </label>
          {errors.consentement && <p className={styles.error}>{errors.consentement.message}</p>}
        </div>
      </fieldset>

      <button
        type="submit"
        className={`btn btn-primary ${styles.submitButton}`}
        disabled={isSubmitting || !verifiedEmail}
        title={!verifiedEmail ? "Confirmez votre e-mail ci-dessus avant d'envoyer" : undefined}
      >
        {isSubmitting ? (
          <>
            <span className={styles.spinner}></span>
            Envoi en cours…
          </>
        ) : (
          <>
            <Icons.Send size={18} />
            Envoyer ma candidature
          </>
        )}
      </button>

      {/* Annoncé aux lecteurs d'écran sans dupliquer visuellement le
          toast déjà affiché — évite les gros encadrés permanents qui
          alourdissaient la page après soumission. */}
      <p className="sr-only" role="status" aria-live="polite">
        {srStatus}
      </p>
    </form>
  );
}