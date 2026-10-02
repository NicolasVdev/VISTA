# VISTA PWA

Application terrain installable de visites techniques d'immeubles.

## Fonctionnalités de cette version

- installation sur l'écran d'accueil avec icône VISTA ;
- affichage autonome et responsive ;
- parcours de visite de la toiture au sous-sol ;
- constats regroupant texte, note vocale et plusieurs photos ;
- plusieurs notes vocales courtes ;
- prise de photo ou import multiple depuis la photothèque ;
- conservation locale dans IndexedDB ;
- navigation libre et accès direct aux zones, avec brouillons texte/audio/photos conservés par zone ;
- gravité des constats, modification du même constat, suppression avec annulation pendant 5 secondes ;
- statuts : constat, rien à signaler ou non accessible, avec motif facultatif ;
- reprise de la visite après fermeture de l'application ;
- cache applicatif hors connexion ;
- clôture impossible tant qu'une zone reste à contrôler ;
- contrôle de fin, confirmation de clôture, lecture seule et réouverture ;
- création des actions de suivi à la clôture, sans doublons après réouverture ;
- filtres des actions, intervenant, échéance et statut fait/à faire.
- accès de copropriété éditables : gardien, téléphone appelable, codes et consignes ;
- suivi des actions toujours visible sur l'accueil, avec les urgences ;
- pastilles et progression colorées selon la gravité maximale des constats ;
- police Figtree hébergée et précachée dans l'application ;
- nouvelles visites avec résidence, adresse, gestionnaire et date ;
- parcours indépendant par visite : ajout, renommage, ordre et suppression des zones vides ;
- historique local des visites, sans modification des parcours précédents ;
- PDF relu, téléchargeable avec photos légendées, statuts et actions ;
- sauvegarde ZIP avec données structurées, médias originaux et brouillons ;
- partage du fichier lorsque le navigateur propose le partage de fichiers.

La synchronisation serveur, l'authentification et la transcription IA ne sont pas encore connectées. Les audios doivent être écoutés et leur texte complété manuellement pour le PDF. Aucun envoi automatique de mail : télécharger le PDF, le vérifier puis le joindre depuis sa messagerie habituelle. Les tests physiques iPhone/Android restent à faire avant le pilote.

## Développement

Prérequis : Node.js 22 ou version ultérieure et pnpm.

```bash
pnpm install
pnpm dev
```

Ouvrir ensuite l'adresse locale affichée par Vite, généralement `http://localhost:5173`.

## Contrôles

```bash
pnpm lint
pnpm build
pnpm test
```

`pnpm test` vérifie le build statique. Il exécute également les tests navigateur
si Playwright est installé (sinon ils sont signalés comme ignorés). Pour utiliser
le runtime fourni par Codex sans ajouter de dépendance au projet, définir
`VISTA_PLAYWRIGHT_ROOT` vers son dossier `node_modules` et `VISTA_BROWSER_PATH`
vers un exécutable Chrome/Chromium. Les tests utilisent un profil isolé et un
serveur local temporaire, jamais les données du navigateur personnel.

La base IndexedDB passe de la version 2 à la version 3 sans effacement : elle
ajoute les stores `actions` et `drafts`. Les anciens constats ont la gravité
« Pour info » et ne créent pas d’action par défaut. Les constats et les statuts
d’une visite clôturée sont protégés dans la couche données. Seule une réouverture
explicite permet de les modifier. Les actions restent modifiables après clôture.

La version 4 ajoute `properties`, indépendant des visites, et leur identifiant de
copropriété. Les anciens `accessNotes` sont repris en informations utiles. Le reset
de la visite démo conserve cette fiche.

La version 5 ajoute la sélection de visite (`settings`). Les parcours personnalisés sont des instantanés : ils ne sont pas recréés à partir de la trame démo au redémarrage. Une zone contenant des constats, actions ou brouillons ne peut pas être supprimée. Une nouvelle visite reprend la fiche copropriété si son nom et son adresse correspondent exactement (hors casse). Le reset démo ne supprime pas les visites réelles. La configuration complète d'un portefeuille de copropriétés reste un futur lot.

Les exports sont produits localement grâce à pdf-lib et JSZip, précachés avec leurs licences dans `public/vendor/`. Le PDF ne contient pas les audios ni les brouillons ; les audios sans texte bloquent sa préparation. Les photos exportées sont redimensionnées et converties en JPEG, sans modifier les originaux. Une photo non décodable (par exemple certains HEIC) provoque une erreur explicite : importer une version JPEG/PNG. Le ZIP conserve les fichiers originaux, mais son import dans l'application reste à implémenter. Les accès privés et contacts sont exclus des deux exports.

Attention : les données restent sur ce navigateur et cet appareil. Elles ne seront pas accessibles automatiquement depuis le PC au retour au bureau. Exporter la sauvegarde et le PDF depuis le téléphone, puis transférer les fichiers. Ne pas effacer les données du navigateur avant cette sauvegarde.

Les codes d'accès et les contacts sont des données sensibles : ils restent dans
le navigateur local, sans chiffrement applicatif ni droits utilisateurs pour ce
pilote. Ne pas utiliser des codes réels sur un appareil partagé. Aucun code ni
contact réel n'est inclus dans le dépôt.

Les brouillons non ajoutés ne figurent ni dans les constats ni dans les actions.
Le contrôle de fin les signale ; ils restent disponibles si la visite est rouverte.

## Installation sur téléphone

- iPhone : ouvrir l'adresse HTTPS dans Safari, puis `Partager` → `Sur l'écran d'accueil` → `Ajouter`.
- Android : utiliser le bouton `Installer VISTA` ou l'option d'installation du navigateur.

Le microphone, l'appareil photo et la photothèque nécessitent l'autorisation du gestionnaire et une origine HTTPS en dehors de `localhost`.

## Déploiement Render

La PWA est construite comme un site statique portable. Le fichier [`../render.yaml`](../render.yaml) décrit le service Render :

- build depuis le sous-dossier `web/` avec pnpm ;
- publication du dossier `web/dist` ;
- HTTPS et CDN gérés par Render ;
- déploiement automatique à chaque commit sur la branche connectée.

Cette phase pilote ne contient aucun secret ni stockage serveur. Les données de visite restent dans IndexedDB sur l'appareil utilisé.
