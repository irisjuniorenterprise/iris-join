'use client';
// components/admin/ImportRowEditor.tsx
//
// Éditeur d'une ligne du rapport d'import : l'admin corrige les valeurs lues
// dans le fichier (ex. un e-mail mal écrit) puis « Applique et revalide ».
// Le composant ne valide rien lui-même : il renvoie seulement les champs
// modifiés ; la validation reste celle du serveur (mêmes règles que le
// formulaire public), appelée par ImportCandidaturesDialog.
import { useId, useState, type FormEvent } from 'react';
import styles from './ImportRowEditor.module.css';

export type ImportFieldDef = {
  key: string;
  label: string;
  /** Liste fermée (menu déroulant). */
  options?: readonly string[];
  /** Texte long (zone de texte). */
  long?: boolean;
  hint?: string;
};

type Props = {
  fields: ImportFieldDef[];
  /** Valeurs actuelles de la ligne (fichier + corrections déjà appliquées). */
  values: Record<string, string>;
  /** Raisons du refus / remarques de la dernière analyse, rappelées pendant la saisie. */
  notes: string[];
  /** Une analyse est en cours : la saisie est verrouillée. */
  busy: boolean;
  /** La ligne a déjà des corrections (affiche « Rétablir »). */
  hasCorrections: boolean;
  /** Renvoie uniquement les champs dont la valeur a changé. */
  onApply: (changes: Record<string, string>) => void;
  /** Annule toutes les corrections de cette ligne (retour aux valeurs du fichier). */
  onReset: () => void;
  onCancel: () => void;
};

export default function ImportRowEditor({
  fields,
  values,
  notes,
  busy,
  hasCorrections,
  onApply,
  onReset,
  onCancel,
}: Props) {
  const baseId = useId();
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...values }));

  const changes: Record<string, string> = {};
  for (const field of fields) {
    const next = draft[field.key] ?? '';
    if (next.trim() !== (values[field.key] ?? '').trim()) changes[field.key] = next;
  }
  const changed = Object.keys(changes).length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (changed && !busy) onApply(changes);
  }

  function set(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form className={styles.editor} onSubmit={submit} noValidate aria-label="Corriger les données de la ligne">
      {notes.length > 0 && (
        <ul className={styles.notes} aria-label="À corriger">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      <fieldset className={styles.grid} disabled={busy}>
        {fields.map((field) => {
          const id = `${baseId}-${field.key}`;
          const value = draft[field.key] ?? '';
          const isChanged = field.key in changes;
          const wide = field.long || field.key === 'nomPrenom';
          return (
            <div key={field.key} className={`${styles.field} ${wide ? styles.wide : ''}`}>
              <label htmlFor={id}>
                {field.label}
                {isChanged && <span className={styles.edited}> · modifié</span>}
              </label>

              {field.options ? (
                <select id={id} value={value} onChange={(e) => set(field.key, e.target.value)}>
                  <option value="">—</option>
                  {/* Valeur lue dans le fichier mais absente de la liste : on la garde visible. */}
                  {value && !field.options.includes(value) && <option value={value}>{value} (non reconnu)</option>}
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.long ? (
                <textarea id={id} rows={3} value={value} onChange={(e) => set(field.key, e.target.value)} />
              ) : (
                <input
                  id={id}
                  type="text"
                  value={value}
                  onChange={(e) => set(field.key, e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              )}

              {field.hint && <small>{field.hint}</small>}
            </div>
          );
        })}
      </fieldset>

      <div className={styles.actions}>
        <button type="submit" className="btn btn-primary" disabled={!changed || busy}>
          {busy ? 'Validation…' : 'Appliquer et revalider'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
        {hasCorrections && (
          <button type="button" className={styles.resetBtn} onClick={onReset} disabled={busy}>
            Rétablir les valeurs du fichier
          </button>
        )}
      </div>
    </form>
  );
}