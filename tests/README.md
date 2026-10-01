# Tests — IRIS JOIN

## Installation (modifications à faire dans le projet)

### 1. `package.json` — ajouter

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:emulator": "firebase emulators:exec --only firestore --project demo-iris-join \"vitest run tests/integration\"",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "vitest": "^2.1.9",
    "firebase-tools": "^15.0.0",
    "@playwright/test": "^1.50.0",
    "@axe-core/playwright": "^4.10.0"
  }
}
```

Ne touchez pas à vos dépendances existantes (`next`, `zod`, `firebase-admin`, `nodemailer`…) : les tests
utilisent celles du projet (vérifié avec zod 3 **et** zod 4). Node ≥ 20 requis.

### 2. `tsconfig.json` — recommandé

Pour que `next build` ne type-vérifie pas les tests, ajoutez à `"exclude"` :

```json
"exclude": ["node_modules", "tests", "vitest.config.mts", "playwright.config.ts"]
```

### 3. `.gitignore` — ajouter

```
playwright-report/
test-results/
```

### 4. Prérequis machine

- **Java 21+** pour l'émulateur Firestore (`java -version`), uniquement pour `npm run test:emulator`.
- **Chromium Playwright** : `npx playwright install chromium`, uniquement pour `npm run test:e2e`.

## Commandes

| Commande | Ce que ça lance | Prérequis |
|---|---|---|
| `npm test` | unitaires + routes API (333 tests, ~10 s) | aucun |
| `npm run test:emulator` | intégration Firestore (53 tests) | Java 21+ |
| `npm run test:e2e` | système : site réel + navigateur | Chromium |

`npm test` ignore automatiquement les tests d'intégration si l'émulateur n'est pas lancé.

## Organisation

```
tests/
├─ unit/          fonctions pures de lib/ (validation, dates, fenêtres, e-mails)
├─ api/           handlers de app/api/** appelés directement, stores mockés
├─ integration/   lib/*-store.ts sur l'émulateur Firestore (transactions, concurrence)
├─ e2e/           Playwright : parcours publics, protection des API, SEO, a11y
└─ helpers/       makeRequest(), faux Firestore pour les routes
```

## Ce qui est couvert

- **Validation** du formulaire (téléphone, nom sans `< > & " / \`, départements ordonnés, champs conditionnels…).
- **Dates** : les horaires ne dépendent jamais du fuseau de l'appareil (testé sous 5 fuseaux).
- **Fenêtres d'ouverture** (candidature / entretien) : bornes exactes, `null` = sans limite.
- **Droits d'accès** : les 10 handlers `/api/admin/*` sont testés contre visiteur anonyme, token invalide,
  compte non admin, e-mail non vérifié, `ADMIN_EMAILS` vide.
- **Confidentialité** : un brouillon de délibération ne fuit jamais vers le candidat ; aucun e-mail de
  résultat ne part avant publication.
- **Règles de réservation** : département imposé par la candidature (jamais par le client), un créneau =
  un candidat, une réservation par e-mail.
- **Rappels 24 h** : envoyés une seule fois, relâchés si le SMTP échoue.
- **E-mails** : gabarits, échappement HTML, SMTP absent / en panne.

## Constats pendant l'écriture des tests

1. `POST /api/candidature` plante (500) sur un corps non JSON au lieu de répondre 400. Le test est marqué
   `it.fails` : il passe tant que le bug existe. **Après correction** (`await request.json().catch(() => null)`),
   retirez `.fails`.
2. `/api/cron/reminders` est public si `CRON_SECRET` est vide : comportement documenté par un test, à éviter en production.
3. Test de détection dans `tests/integration/slots-store.test.ts` : « le même candidat sur deux créneaux en
   parallèle ». S'il échoue, c'est une vraie faille de double réservation (la règle repose sur une requête
   dans la transaction).

## Étape suivante (non incluse)

Parcours E2E **connectés** (candidat réserve un créneau, admin publie un résultat) : il faut brancher
l'émulateur Firebase Auth côté client (`connectAuthEmulator` dans `lib/firebase.ts`, activé par une
variable `NEXT_PUBLIC_USE_AUTH_EMULATOR`) puis scripter la connexion dans Playwright.
