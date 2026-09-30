# Architecture fonctionnelle du MVP

Date : 2026-09-30
Statut : PWA statique déployable sur Render, backend à connecter

## 1. Architecture générale

Le MVP est une application mobile-first indépendante de Notion.

```text
Application mobile-first
        │
        ├── API métier
        │     ├── base de données relationnelle
        │     ├── stockage sécurisé des audios, photos et documents
        │     └── file de traitements asynchrones
        │
        ├── transcription vocale
        ├── structuration IA des constats
        ├── génération du compte rendu
        └── gestion des tâches
```

## 2. Application terrain

Le client terrain principal est une PWA responsive et installable. Une fois ajoutée à l'écran d'accueil, elle s'ouvre en mode autonome depuis une icône VISTA, sans passage par un catalogue d'applications.

Le pilote frontend est généré comme un site statique React/Vite et publié sur Render depuis GitHub. Ce choix garde le client portable : le même build pourra être servi ultérieurement par un autre CDN sans modifier le parcours terrain. Render n'est pas encore le backend métier ; il héberge uniquement les fichiers de la PWA pendant cette phase.

Les captures sont écrites immédiatement dans IndexedDB. Elles constituent une file locale de brouillons jusqu'à confirmation de leur réception par le futur backend. La synchronisation se produit lorsque l'application est ouverte et retrouve le réseau ; elle ne doit pas dépendre d'une exécution prolongée en arrière-plan.

Fonctions essentielles :

- authentification du gestionnaire ;
- sélection d'une copropriété et création d'une visite ;
- affichage du parcours de haut en bas ;
- sélection du lieu courant ;
- rédaction d'une note texte au clavier ;
- enregistrement de plusieurs notes vocales courtes ;
- prise de photos sans ajout obligatoire à la photothèque ;
- sélection de photos existantes dans la photothèque ;
- affichage de l'état des transferts ;
- reprise d'un transfert interrompu ;
- validation des constats, du compte rendu et des tâches.

La même application sert au terrain et à la relecture au bureau. Les écrans s'adaptent au téléphone, à la tablette et à l'ordinateur.

### Preuve de concept obligatoire

Avant de figer la pile mobile :

1. enregistrer plusieurs notes vocales sur iPhone et Android ;
2. conserver localement les audios et photos avant transfert ;
3. interrompre puis reprendre un envoi ;
4. verrouiller l'écran pendant et après une capture ;
5. tester une coupure réseau dans un sous-sol ;
6. confirmer qu'aucun média n'est perdu.

## 3. Services du système

### Stockage local et file d'attente

Le téléphone conserve durablement les visites en cours, les captures et les médias tant que le serveur n'a pas confirmé leur réception. Chaque capture reçoit un identifiant local stable afin d'éviter les doublons lors des nouvelles tentatives.

La file d'attente doit survivre à la fermeture de l'application et reprendre sans intervention lorsque les conditions le permettent. L'utilisateur peut également relancer manuellement un transfert en erreur.

### API métier

Gère les utilisateurs, copropriétés, lieux, visites, captures, constats, comptes rendus et tâches. Toutes les opérations sensibles passent par cette API.

### Base de données

Une base relationnelle est adaptée aux liens forts entre visite, lieu, capture, constat et tâche. Les fichiers lourds n'y sont pas enregistrés directement : seuls leurs identifiants, métadonnées et droits d'accès y figurent.

### Stockage de fichiers

Stockage privé pour :

- notes vocales ;
- photographies ;
- miniatures ;
- comptes rendus générés.

L'accès aux fichiers doit être temporaire et contrôlé par l'application.

### Traitements asynchrones

La transcription et l'analyse IA ne doivent pas bloquer l'interface. Une capture suit un cycle explicite :

`brouillon local → en attente réseau → transfert en cours → synchronisée → transcription → analyse → à valider → validée`

Un échec doit être visible et relançable sans recréer la capture.

## 4. Modèle de données logique

| Entité | Rôle | Relations principales |
| --- | --- | --- |
| Utilisateur | Gestionnaire authentifié | Organisation, visites, validations |
| Organisation | Cabinet ou syndic | Utilisateurs, copropriétés |
| Copropriété | Immeuble géré | Lieux, visites, tâches |
| Lieu | Étage, palier, sas, parking ou équipement | Copropriété, captures, constats |
| Visite | Session terrain datée | Copropriété, gestionnaire, captures, constats |
| Capture | Groupe voix + photos pris au même endroit | Visite, lieu, médias, constats |
| Média | Audio, photo ou document | Capture ou compte rendu |
| Constat | Observation structurée et validable | Capture, lieu, tâche éventuelle |
| Tâche | Action du syndic | Constat, copropriété, responsable |
| Compte rendu | Version générée et validée | Visite, constats, document final |
| Événement d'audit | Trace d'une action importante | Utilisateur et objet concerné |

## 5. Chaîne de traitement d'une capture

1. Le gestionnaire choisit le lieu courant.
2. Il écrit un message, enregistre une note vocale courte ou utilise les deux modes.
3. Il prend des photos dans l'application ou choisit des images dans la photothèque.
4. L'application conserve immédiatement et durablement la capture sur le téléphone.
5. Elle lance ou programme le transfert selon l'état du réseau.
6. Le serveur transcrit l'audio lorsqu'il existe.
7. L'IA analyse la note écrite, la transcription ou leur combinaison et les segmente en constats atomiques.
8. Elle propose catégorie, incidence, priorité, recommandation et création éventuelle d'une tâche.
9. Le gestionnaire compare les propositions avec les textes, l'audio et les photos sources.
10. Il corrige, valide ou rejette chaque constat.
11. Seuls les constats validés alimentent le compte rendu et les tâches.

## 6. Compte rendu et tâches

Le compte rendu et les tâches sont deux projections différentes des mêmes constats validés :

- le compte rendu informe le conseil syndical dans un langage clair ;
- les tâches organisent le travail interne du syndic avec responsable, priorité et échéance.

Une modification importante d'un constat doit permettre de régénérer ces sorties sans perdre l'historique de la version précédente.

### Génération du PDF

Le PDF est un livrable, pas la source de vérité. Le processus recommandé est :

1. lire les constats validés et leurs photos ;
2. produire une représentation intermédiaire structurée ;
3. appliquer un modèle de mise en page imprimable ;
4. générer le PDF ;
5. enregistrer son numéro de version, sa date, son empreinte et son validateur ;
6. conserver les versions précédentes.

Une mise en page HTML/CSS paginée permet de prévisualiser le document avant conversion et de réutiliser les mêmes données pour l'affichage dans l'application. Le format PDF/A pourra être envisagé ultérieurement si une exigence d'archivage à long terme le justifie.

### Diffusion dans le MVP

Après la visite, le gestionnaire ouvre le brouillon depuis l'application, le corrige, le valide puis télécharge le PDF. L'envoi est ensuite effectué dans la solution de messagerie habituelle du cabinet.

Le MVP ne contient donc ni intégration email, ni carnet de destinataires, ni suivi d'envoi. Ces éléments pourront être ajoutés ultérieurement sans modifier le modèle des visites et des comptes rendus.

## 7. Sécurité minimale

- authentification obligatoire ;
- séparation des données par organisation ;
- fichiers privés et liens temporaires ;
- chiffrement des communications ;
- journal des validations et téléchargements ;
- suppression et durée de conservation configurables ;
- aucune action externe ou diffusion sans confirmation du gestionnaire.

## 8. Place de Notion

Notion n'est pas appelé par l'application en production. Le prototype sert à :

- confirmer le vocabulaire et les objets métier ;
- identifier les données historiques utiles ;
- préparer, si nécessaire, un import initial vers la nouvelle base.

L'import Notion doit être un chantier isolé afin de ne pas imposer la structure du prototype au nouveau produit.

## 9. Références techniques consultées

- [MediaRecorder — MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) : enregistrement web largement disponible, avec variations possibles selon les fonctions et formats.
- [Background Synchronization API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) : disponibilité limitée selon les navigateurs.
- [Web App Manifest — MDN](https://developer.mozilla.org/docs/Web/Progressive_web_apps/Manifest) : installation et comportement autonome de la PWA.
- [IndexedDB — MDN](https://developer.mozilla.org/docs/Web/API/IndexedDB_API) : conservation locale structurée des brouillons et médias.
- [CSS Paged Media — W3C](https://www.w3.org/TR/css-page-3/) : modèle de mise en page paginée pour l'impression et la production de documents.
- [ISO 19005-2 — PDF/A-2](https://www.iso.org/standard/50655.html) : préservation à long terme de la représentation visuelle statique des documents.
