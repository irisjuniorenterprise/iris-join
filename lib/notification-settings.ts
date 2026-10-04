// lib/notification-settings.ts
//
// Réglages des notifications par e-mail pilotées par l'administration.
// Types et valeurs par défaut uniquement (aucune dépendance serveur) :
// importable par les composants client comme par les routes API.

export type NotificationSettings = {
  /**
   * Envoyer au candidat un e-mail de confirmation dès que sa candidature est
   * enregistrée. Activé par défaut (comportement historique).
   */
  candidatureEmail: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  candidatureEmail: true,
};
