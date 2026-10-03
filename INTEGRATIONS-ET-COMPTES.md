# Connexions et identité — préparation, pas encore de comptes connectés

## Identité

Pour le pilote local, saisir explicitement le gestionnaire à chaque nouvelle visite. Ce champ est l'auteur déclaré du document, pas un utilisateur connecté. Éviter un « Bonjour Prénom » qui donne cette illusion. Un reset de démo ne déconnecte personne : il n'existe pas encore de session.

Pour un usage professionnel partagé, retenir une authentification réelle avec organisation, utilisateurs et droits : administrateur, gestionnaire, lecture autorisée. Les visites référenceront un `managerId` et conserveront aussi le nom historique du validateur. Ne pas remplacer cette protection par un simple prénom, surtout pour les codes d'accès, coordonnées ou photos. La synchronisation et les droits nécessitent un backend ; un écran de login seul ne protège pas IndexedDB.

## Ports dans le code

`web/app/lib/integrations.ts` définit les opérations calendrier (création/mise à jour, annulation), GED (dépôt privé d'un PDF identifié) et annuaire copropriété (lecture des seules coordonnées non sensibles du bâtiment). Les adaptateurs concrets restent à implémenter. Aucun bouton ne prétend connecter un compte et aucun appel externe n'est lancé.

Pour les connecteurs Google/Microsoft ou métier :

- authentification et jetons OAuth côté serveur uniquement ; pas de secret dans le frontend ;
- sélection explicite du compte, du calendrier et de la destination GED ;
- permissions minimales, révocation et déconnexion ;
- lien durable `organisation + visiteId + fournisseur + externalId`, avec unicité pour éviter les doublons et mises à jour concurrentes ;
- date, durée et rappels explicites ; adapter les fuseaux et les limites à chaque fournisseur ;
- aperçu avant tout envoi externe, état en cours/réussi/erreur, reprise idempotente ;
- ne jamais envoyer les codes d'accès ou contacts dans le titre/la description d'un événement ;
- GED privée avec droits vérifiés : associer la version de PDF, résidence et visite ;
- annuaire de copropriétaires, mails et accès : périmètre et autorisation séparés, pas d'import global implicite ;
- pas de synchronisation bidirectionnelle silencieuse : définir qui est maître de la date, de l'annulation et de la fiche copropriété ;
- aucune notification PWA garantie sans prise en charge et autorisation sur le téléphone ; les rappels d'agenda constituent un canal distinct.

Avant le raccordement réel : identifier le logiciel du syndic, obtenir sa documentation/API et les droits de l'organisation. Vérifier les documentations officielles Google/Microsoft, les permissions et la disponibilité des opérations. Pour le pilote, un import calendrier peut être une première étape, mais ce n'est pas une synchronisation API.

## Une source, plusieurs demandes

Un constat reste le support brut d'une note, d'un texte et de photos. Plusieurs actions peuvent référencer son `observationId` et avoir chacune description, priorité, intervenant, échéance et état. L'utilisateur scinde et vérifie ces demandes ; la segmentation IA sera une proposition à valider, pas une découpe automatique par ponctuation. Les actions scindées restent distinctes après réouverture/clôture. Si le constat original est modifié, leurs textes ne sont pas réécrits silencieusement : le gestionnaire doit les relire.

Si une note couvre plusieurs étages, elle ne doit pas être attribuée automatiquement à plusieurs lieux au hasard. Une future étape de structuration permettra de créer plusieurs constats, de choisir leur zone et les photos pertinentes, tout en gardant une référence à la capture originale.
