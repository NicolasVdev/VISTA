# Plan d'implémentation de l'application MVP

Date : 2026-09-24  
Statut : plan révisé après décision d'abandonner Notion

## Objectif

Construire et tester sur une copropriété pilote une application autonome couvrant la chaîne :

`notes vocales courtes + photos → transcription → constats validés → compte rendu CS + tâches syndic`

## Principes techniques

- Interface mobile-first utilisable pendant la visite.
- Base de données et stockage de fichiers propres à l'application.
- Traitements de transcription et d'IA exécutés en arrière-plan.
- Traçabilité complète entre capture brute, constat, compte rendu et tâche.
- Validation obligatoire par le gestionnaire visiteur.
- Aucune dépendance d'exécution à Notion.

## Phase 0 — Arbitrages techniques

### Tâches

- [x] Choisir le format du compte rendu : PDF versionné.
- [x] Choisir le mode de diffusion : téléchargement du PDF, puis envoi depuis la messagerie habituelle.
- [x] Définir le comportement réseau : capture hors connexion et synchronisation différée obligatoire.
- [x] Choisir la pile applicative : PWA React/TypeScript installable.
- [x] Choisir l'hébergement du frontend pilote : Render Static Site.
- [ ] Choisir l'hébergement du backend et des données de production.
- [ ] Définir les données à migrer depuis Notion.

Livrable : dossier de décisions techniques validé.

## Phase 1 — Fondation de l'application

### Tâches

- [x] Initialiser le dépôt et l'application PWA.
- [ ] Mettre en place l'authentification et la séparation par organisation.
- [ ] Créer le schéma relationnel initial.
- [ ] Mettre en place le stockage privé des audios, photos et documents.
- [ ] Créer l'API pour les copropriétés, lieux et visites.
- [ ] Ajouter le journal minimal des validations et téléchargements.

Livrable : utilisateur authentifié capable de créer une copropriété, son parcours et une visite.

## Phase 2 — Mode visite mobile

### Tâches

- [x] Afficher le parcours ordonné de haut en bas.
- [x] Permettre la sélection rapide du lieu courant.
- [x] Ajouter une zone de saisie texte comparable à une messagerie mobile.
- [x] Enregistrer plusieurs notes vocales courtes.
- [ ] Permettre de combiner texte et note vocale dans une capture.
- [x] Prendre une photo depuis l'application sans ajout obligatoire à la photothèque.
- [x] Sélectionner une photo existante dans la photothèque.
- [x] Stocker durablement les captures dans IndexedDB avant synchronisation.
- [ ] Transférer les médias avec progression, reprise et signalement d'erreur.
- [ ] Garantir la reprise après fermeture ou redémarrage de l'application.
- [ ] Marquer les zones comme visitées, sans observation, non accessibles ou restantes.
- [ ] Ajouter la clôture avec contrôle des oublis.

Livrable : visite complète réalisable sur téléphone, même si l'analyse IA n'est pas encore branchée.

## Phase 3 — Transcription et structuration IA

### Tâches

- [ ] Lancer la transcription après le transfert de l'audio.
- [ ] Accepter les captures textuelles sans lancer de transcription.
- [ ] Conserver et afficher la transcription brute.
- [ ] Segmenter chaque capture en constats atomiques.
- [ ] Proposer catégorie, incidence, priorité, recommandation et tâche éventuelle.
- [ ] Signaler les informations incertaines ou manquantes.
- [ ] Créer une interface de comparaison avec la voix et les photos sources.
- [ ] Permettre correction, validation, fusion et rejet.

Livrable : constats structurés et vérifiables, sans utilisation automatique avant validation.

## Phase 4 — Compte rendu et tâches

### Tâches

- [ ] Générer le brouillon du compte rendu par étage et zone.
- [ ] Sélectionner les photos pertinentes.
- [ ] Permettre la modification et la validation par le gestionnaire visiteur.
- [ ] Générer le PDF final à partir des données structurées et d'un modèle de mise en page.
- [ ] Conserver chaque version validée du PDF avec sa date et son validateur.
- [ ] Permettre le téléchargement de la version validée.
- [ ] Proposer les tâches issues des constats marqués `Action nécessaire`.
- [ ] Exiger responsable, priorité et échéance lorsque nécessaire.
- [ ] Suivre les tâches dans l'application.
- [ ] Conserver l'historique des versions et validations.

Livrable : compte rendu diffusable et liste d'actions opérationnelle sans Notion.

## Phase 5 — Pilote réel et migration minimale

### Tâches

- [ ] Importer une copropriété pilote et son parcours.
- [ ] Réaliser une visite réelle de haut en bas.
- [ ] Tester la captation dans les escaliers, sous-sols et parkings.
- [ ] Mesurer les erreurs de transcription et d'association des photos.
- [ ] Produire et faire relire le compte rendu.
- [ ] Vérifier la pertinence des tâches proposées.
- [ ] Corriger les principaux points de friction.
- [ ] Décider du périmètre de migration des autres données Notion.

Livrable : MVP validé ou liste priorisée des corrections avant déploiement.

## Backlog priorisé

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| P0 | Réaliser la preuve de concept mobile | Audio, photos et reprise de transfert validés sur iPhone et Android |
| P0 | Choisir l'architecture technique | Décision documentée après la preuve de concept |
| P0 | Concevoir le modèle relationnel | Toutes les entités et relations du MVP définies |
| P0 | Prototyper le parcours mobile | Une visite simulée peut être terminée sur téléphone |
| P0 | Fiabiliser le transfert voix/photos | Échec visible et reprise possible |
| P0 | Garantir la saisie hors connexion | Texte, voix et photos conservés après redémarrage |
| P1 | Construire la transcription | Texte brut rattaché à chaque audio |
| P1 | Construire la segmentation IA | Plusieurs constats possibles par capture |
| P1 | Construire la validation | Aucun constat non validé dans les sorties |
| P1 | Générer le compte rendu | Sections par zone et photos associées |
| P1 | Gérer les tâches dans l'application | Tâches liées aux constats et suivies par statut |
| P2 | Importer les données Notion utiles | Import contrôlé et rejouable |

## Mesures de réussite du pilote

Cibles proposées à valider :

- 100 % des constats validés reliés au bon lieu.
- 100 % des photos du compte rendu reliées à un constat.
- aucune tâche ni diffusion sans validation du gestionnaire visiteur.
- moins de 15 minutes de reprise manuelle après une visite standard.
- aucune zone obligatoire oubliée sans justification.
- compte rendu jugé exploitable après une seule relecture.
- aucun média perdu lors du pilote, y compris après une coupure réseau simulée.

## Dépendances externes à choisir

- service de transcription vocale ;
- modèle d'analyse et de génération structurée ;
- stockage d'objets ;
- fournisseur d'authentification ;
- hébergeur de l'application et de la base de données.

## Fonctionnalités ultérieures

- Envoi du compte rendu directement depuis l'application après confirmation.
- Modèles d'email personnalisables.
- Historique des destinataires et des envois.
- Relances ou notifications liées au compte rendu.

## Prochaine étape

Connecter l'authentification et le backend de synchronisation, puis transférer les textes, audios et photos de la file locale vers un stockage privé avant d'intégrer la transcription IA.
