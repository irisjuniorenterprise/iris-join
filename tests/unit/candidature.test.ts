import { describe, expect, it } from 'vitest';
import {
  FILIERES,
  NIVEAUX_ETUDES,
  NIVEAUX_LANGUE,
  PARTICIPATION_FORMATIONS,
  SOURCES_CONNAISSANCE,
  candidatureSchema,
  departementPrincipal,
} from '@/lib/candidature';

const valid = {
  nomPrenom: 'Ahmed Ben Salah',
  telephone: '22123456',
  filiere: FILIERES[0],
  niveauEtudes: NIVEAUX_ETUDES[1],
  departements: ['it', 'marketing'],
  sourceConnaissance: SOURCES_CONNAISSANCE[0],
  niveauFrancais: NIVEAUX_LANGUE[2],
  niveauAnglais: NIVEAUX_LANGUE[1],
  participationFormations: PARTICIPATION_FORMATIONS[0],
  autreEngagement: 'non',
  organisationTemps: '',
  motivation: 'Je veux apprendre sur de vrais projets',
  domaine: 'Développement web',
  remarques: '',
  consentement: true,
};

/** Chemins des champs en erreur après validation de `{...valid, ...patch}`. */
function failingFields(patch: Record<string, unknown>): string[] {
  const result = candidatureSchema.safeParse({ ...valid, ...patch });
  if (result.success) return [];
  return result.error.issues.map((i) => i.path.join('.'));
}

describe('candidatureSchema', () => {
  it('accepte une candidature complète et valide', () => {
    expect(candidatureSchema.safeParse(valid).success).toBe(true);
  });

  it('rogne les espaces autour du nom et des textes', () => {
    const result = candidatureSchema.parse({ ...valid, nomPrenom: '  Ahmed Ben Salah  ', motivation: '  Motivé !  ' });
    expect(result.nomPrenom).toBe('Ahmed Ben Salah');
    expect(result.motivation).toBe('Motivé !');
  });

  describe('nomPrenom', () => {
    it.each(['ab', '  a ', ''])('refuse un nom trop court (%j)', (nom) => {
      expect(failingFields({ nomPrenom: nom })).toContain('nomPrenom');
    });

    it('refuse plus de 100 caractères', () => {
      expect(failingFields({ nomPrenom: 'a'.repeat(101) })).toContain('nomPrenom');
      expect(failingFields({ nomPrenom: 'a'.repeat(100) })).not.toContain('nomPrenom');
    });

    // Le nom est repris tel quel dans les e-mails : ces caractères ne doivent jamais passer.
    it.each(['<script>', 'A & B', 'Ahmed "Le" Grand', 'a/b c', 'a\\b c', 'x>y z'])(
      'refuse les caractères HTML/chemin dangereux (%s)',
      (nom) => {
        expect(failingFields({ nomPrenom: nom })).toContain('nomPrenom');
      },
    );

    it('accepte accents, tirets et apostrophes', () => {
      expect(failingFields({ nomPrenom: "Amel Ben Hadj-Youssef d'Hammamet" })).toEqual([]);
    });
  });

  describe('telephone', () => {
    it.each(['22123456', '00000000', '99999999'])('accepte %s', (tel) => {
      expect(failingFields({ telephone: tel })).not.toContain('telephone');
    });

    it.each(['2212345', '221234567', '2212345a', '+21622123456', '22 123 456', ''])('refuse %j', (tel) => {
      expect(failingFields({ telephone: tel })).toContain('telephone');
    });
  });

  describe('listes fermées', () => {
    it('refuse une filière inconnue', () => {
      expect(failingFields({ filiere: 'XX' })).toContain('filiere');
    });

    it.each(FILIERES)('accepte la filière %s', (f) => {
      expect(failingFields({ filiere: f })).toEqual([]);
    });

    it('refuse un niveau d’études inconnu', () => {
      expect(failingFields({ niveauEtudes: '4e année' })).toContain('niveauEtudes');
    });

    it('refuse une source, un niveau de langue ou une participation inconnus', () => {
      expect(failingFields({ sourceConnaissance: 'Autre' })).toContain('sourceConnaissance');
      expect(failingFields({ niveauFrancais: 'Natif' })).toContain('niveauFrancais');
      expect(failingFields({ niveauAnglais: 'Natif' })).toContain('niveauAnglais');
      expect(failingFields({ participationFormations: 'Peut-être' })).toContain('participationFormations');
    });
  });

  describe('departements', () => {
    it('exige au moins un département', () => {
      expect(failingFields({ departements: [] })).toContain('departements');
    });

    it('refuse un département inconnu', () => {
      expect(failingFields({ departements: ['rh'] })).toContain('departements.0');
    });

    it('refuse un département en double', () => {
      expect(failingFields({ departements: ['it', 'it'] })).toContain('departements');
    });

    it('accepte les 4 départements', () => {
      expect(failingFields({ departements: ['dev-co', 'marketing', 'etudes', 'it'] })).toEqual([]);
    });

    it('refuse plus de 4 départements', () => {
      expect(failingFields({ departements: ['it', 'marketing', 'etudes', 'dev-co', 'it'] })).not.toEqual([]);
    });

    it('departementPrincipal renvoie toujours le premier choix', () => {
      expect(departementPrincipal(['marketing', 'it'])).toBe('marketing');
      expect(departementPrincipal(['etudes'])).toBe('etudes');
    });
  });

  describe('autreEngagement / organisationTemps', () => {
    it('n’exige pas de précision quand la réponse est « non »', () => {
      expect(failingFields({ autreEngagement: 'non', organisationTemps: '' })).toEqual([]);
    });

    it('exige 10 caractères de précision quand la réponse est « oui »', () => {
      expect(failingFields({ autreEngagement: 'oui', organisationTemps: '' })).toContain('organisationTemps');
      expect(failingFields({ autreEngagement: 'oui', organisationTemps: 'a'.repeat(9) })).toContain(
        'organisationTemps',
      );
      expect(failingFields({ autreEngagement: 'oui', organisationTemps: 'a'.repeat(10) })).toEqual([]);
    });

    it('limite la précision à 1500 caractères', () => {
      expect(failingFields({ organisationTemps: 'a'.repeat(1501) })).toContain('organisationTemps');
    });
  });

  describe('textes libres', () => {
    it('motivation : 5 à 400 caractères', () => {
      expect(failingFields({ motivation: 'abcd' })).toContain('motivation');
      expect(failingFields({ motivation: 'abcde' })).not.toContain('motivation');
      expect(failingFields({ motivation: 'a'.repeat(400) })).not.toContain('motivation');
      expect(failingFields({ motivation: 'a'.repeat(401) })).toContain('motivation');
    });

    it('domaine : 2 à 150 caractères', () => {
      expect(failingFields({ domaine: 'a' })).toContain('domaine');
      expect(failingFields({ domaine: 'ab' })).not.toContain('domaine');
      expect(failingFields({ domaine: 'a'.repeat(151) })).toContain('domaine');
    });

    it('remarques : facultatif, 1500 caractères max', () => {
      expect(failingFields({ remarques: '' })).toEqual([]);
      expect(failingFields({ remarques: 'a'.repeat(1501) })).toContain('remarques');
    });
  });

  describe('consentement', () => {
    it('doit être explicitement true', () => {
      expect(failingFields({ consentement: false })).toContain('consentement');
      expect(failingFields({ consentement: 'true' })).toContain('consentement');
      expect(failingFields({ consentement: undefined })).toContain('consentement');
    });
  });

  it('ignore les champs inconnus (l’e-mail ne peut pas venir du corps de la requête)', () => {
    const result = candidatureSchema.parse({ ...valid, email: 'pirate@example.com', createdAt: 'x' });
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('createdAt');
  });

  it('refuse un champ obligatoire manquant', () => {
    const { telephone: _omit, ...without } = valid;
    expect(candidatureSchema.safeParse(without).success).toBe(false);
  });
});
