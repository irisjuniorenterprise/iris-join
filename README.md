# IRIS JOIN

Portail de recrutement d'IRIS Junior Entreprise : candidature en ligne + réservation d'entretien. Projet Next.js **séparé** du site vitrine `irisje`, pensé pour être déployé indépendamment (ex. `join.irisje.com`).

## Emails transactionnels (SMTP)

L'envoi d'emails (confirmation de candidature, confirmation d'entretien, notification RH) passe par **SMTP** (via `nodemailer`), pas par un service tiers type Resend/SendGrid — vous pouvez donc utiliser n'importe quelle boîte mail existante (Gmail, Outlook, OVH, un compte pro `@irisje.com`, etc.).

Variables à remplir dans `.env.local` (voir `.env.example`) :

```
SMTP_HOST=smtp.gmail.com        # ou smtp.office365.com, ssl0.ovh.net, etc.
SMTP_PORT=587                    # 587 (STARTTLS) ou 465 (SSL direct)
SMTP_USER=votre-adresse@gmail.com
SMTP_PASS=...                    # mot de passe d'application, PAS votre mot de passe habituel
SMTP_FROM="IRIS JOIN <recrutement@irisje.com>"
RH_NOTIFICATION_EMAIL=rh@irisje.com   # optionnel : reçoit une notif à chaque candidature
```

⚠️ Pour Gmail/Outlook, il faut générer un **mot de passe d'application** (pas le mot de passe du compte) : Gmail → Compte Google → Sécurité → Validation en 2 étapes (à activer si besoin) → Mots de passe des applications. Sans ça, l'envoi SMTP est bloqué par le fournisseur.

Si `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` ne sont pas définis, les emails sont simplement ignorés (log console) sans faire échouer la candidature/réservation — pratique en développement.

## Stockage des données (Firestore)

Toutes les réponses soumises sont déjà persistées dans Firestore, exclusivement via le serveur (Firebase Admin SDK) :

- **`candidatures`** — un document par candidat (clé logique : email vérifié). Contient tous les champs du formulaire + `email`, `createdAt`, `updatedAt`. Un candidat qui renvoie le formulaire met à jour son document existant plutôt que d'en créer un doublon.
- **`slots`** — les créneaux d'entretien. Chaque créneau réservé passe à `booked: true` et enregistre `bookedByEmail`.

Pour consulter ces données : console Firebase → Firestore Database → onglet Data. Aucun back-office n'est fourni dans cette version (voir la section "À faire" ci-dessous) — la console Firebase sert de back-office minimal en attendant.

## Configuration Firebase (obligatoire)

IRIS JOIN utilise Firebase pour deux choses distinctes :

- **Firebase Auth (Google Sign-In)**, côté navigateur — vérifie que la personne qui candidate/réserve possède réellement l'adresse email annoncée. C'est ce qui "sécurise" le formulaire : impossible de soumettre avec un email qu'on ne contrôle pas.
- **Firestore, via Firebase Admin SDK**, côté serveur uniquement (routes API) — stocke candidatures et créneaux. Le navigateur n'accède jamais directement à Firestore (voir `firestore.rules`, qui bloque tout accès client).

### Étapes

1. Créer un projet sur [console.firebase.google.com](https://console.firebase.google.com)
2. **Authentication** → Sign-in method → activer **Google**
3. **Firestore Database** → créer une base (mode production), puis déployer `firestore.rules` (`firebase deploy --only firestore:rules` avec la CLI Firebase, ou copier-coller dans la console)
4. **Paramètres du projet → Vos applications** → ajouter une app Web → copier les clés dans `.env.local` (`NEXT_PUBLIC_FIREBASE_*`)
5. **Paramètres du projet → Comptes de service** → Générer une nouvelle clé privée → copier `project_id`/`client_email`/`private_key` dans `.env.local` (`FIREBASE_*`, sans le préfixe `NEXT_PUBLIC_`)
6. **Authentication → Settings → Authorized domains** → ajouter votre domaine de déploiement (ex. `join.irisje.com`), sinon la connexion Google échoue en production

```bash
cp .env.example .env.local   # puis remplir les valeurs
npm install
npm run dev
```

## Ce qui est fait

- Landing page avec statut de recrutement en direct (ouvert/fermé + compte à rebours)
- **Connexion Google obligatoire** (`AuthGate`) avant de candidater ou réserver : garantit l'authenticité de l'email, empêche le spam/les doublons
- Formulaire de candidature (`/candidature`) — validation Zod + react-hook-form, email verrouillé sur l'identité Firebase vérifiée, persistance Firestore (une candidature par email, mise à jour si renvoyée)
- Réservation de créneau d'entretien (`/entretien`) — sélecteur par jour/heure, réservation atomique (transaction Firestore anti-double-réservation), exige une candidature déposée au préalable
- Toutes les routes API vérifient le **ID token Firebase** côté serveur (`lib/firebase-admin.ts`) — l'email n'est jamais pris depuis les données envoyées par le client
- SEO complet : OpenGraph, Twitter Cards, JSON-LD `Organization` + `JobPosting` (éligible Google Jobs), sitemap.xml et robots.txt dynamiques
- Charte graphique IRIS reprise à l'identique (couleurs, Montserrat)
- Assets réutilisés du site vitrine : logos (`public/`), bibliothèque d'icônes (`components/icons/Icons.tsx`), et le formulaire de candidature repris/adapté de `RecruitmentForm.tsx`

## ⚠️ À faire avant la mise en production

1. **Vérifier la délivrabilité SMTP en production** — testez un envoi réel (candidature test) et surveillez les logs serveur pour d'éventuels rejets (SPF/DKIM manquants sur votre domaine d'envoi, quotas du fournisseur SMTP, etc.). Voir la section "Emails transactionnels" ci-dessus.
2. **Image OG dédiée** — `lib/config.ts` pointe temporairement vers le logo. Créer un vrai visuel 1200×630 pour l'aperçu de partage (LinkedIn/Twitter/WhatsApp).
3. **Dates de recrutement** — configurables via `NEXT_PUBLIC_RECRUITMENT_OPEN` / `NEXT_PUBLIC_RECRUITMENT_CLOSE` (voir `lib/recruitment.ts`).
4. **i18n** — ce projet est en français uniquement. Si besoin de fr/en/ar comme le site vitrine, reprendre la config `next-intl` du projet `irisje`.
5. **Back-office RH** — pas d'espace admin pour consulter les candidatures ou gérer les créneaux dans cette version ; à ce stade, la console Firebase (Firestore) sert de back-office minimal. Un vrai espace admin (protégé par un rôle Firebase Auth) est la prochaine étape naturelle.
6. **Grille de créneaux réelle** — `lib/slots-store.ts` initialise Firestore avec des créneaux de démonstration (12–14 octobre 2026) au premier appel si la collection est vide. À adapter aux vraies dates/disponibilités de l'équipe RH, ou à peupler depuis un futur back-office.

## Structure

```
app/
  layout.tsx          # SEO global, JSON-LD Organization
  page.tsx             # Landing (hero + parcours + départements)
  candidature/page.tsx
  entretien/page.tsx
  api/                  # candidature, créneaux, réservation
components/
  layout/               # Header, Footer
  forms/                # CandidatureForm, SlotPicker
  ui/                   # RecruitmentStatus
  icons/                # Icons.tsx (repris du site vitrine)
lib/
  config.ts             # constantes de marque/URL
  metadata.ts            # helpers SEO (OG, Twitter, JSON-LD)
  recruitment.ts          # fenêtre de recrutement
  slots-store.ts          # store créneaux (placeholder)
```
