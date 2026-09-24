# Spécification MVP — Visite technique par voix et photos

Date : 2026-09-24  
Statut : cadrage fonctionnel en cours

## Décisions produit validées

- Le produit cible est une application autonome ; Notion ne sera pas utilisé pour l'exploitation.
- La visite est documentée avec plusieurs notes vocales courtes.
- Le gestionnaire qui réalise la visite valide les constats, le compte rendu et les tâches.
- Les tâches sont gérées dans l'application cible.
- Le compte rendu final destiné au conseil syndical est produit au format PDF.
- Le PDF est téléchargé après validation puis envoyé depuis la messagerie habituelle du gestionnaire.
- La saisie terrain fonctionne hors connexion et se synchronise ultérieurement.
- Une observation peut être saisie par texte, par note vocale ou avec les deux.
- Les photos peuvent être prises dans l'application ou choisies dans la photothèque du téléphone.

## 1. Problème à résoudre

Une visite d'immeuble génère de nombreuses observations dispersées entre étages, parties communes, accès et parkings. Le gestionnaire doit pouvoir les relever rapidement sans rédiger un rapport sur place, tout en conservant la localisation et les photos correspondant à chaque problème.

Après la visite, il faut éviter une seconde saisie manuelle pour préparer le compte rendu au conseil syndical et créer les tâches du syndic.

## 2. Utilisateur principal

Dans le MVP, le gestionnaire de copropriété réalise la visite, contrôle les propositions de l'IA, valide le compte rendu et confirme les tâches.

Le modèle de données doit néanmoins permettre l'ajout futur d'autres rôles sans modifier la logique des visites existantes.

## 3. Parcours terrain

### 3.1 Préparation

1. Sélectionner la copropriété.
2. Créer une visite avec sa date et son type.
3. Charger le parcours de l'immeuble dans l'ordre de visite.
4. Afficher les actions ouvertes et les points à contrôler issus de la visite précédente.

### 3.2 Circuit de visite

Le parcours standard commence au point le plus haut et descend jusqu'au rez-de-chaussée, puis continue si nécessaire vers les sous-sols et les parkings.

Ordre indicatif :

1. dernier étage ;
2. étages intermédiaires et paliers ;
3. cages d'escalier et ascenseurs ;
4. rez-de-chaussée et hall ;
5. sas, accès et locaux communs ;
6. sous-sols, caves et parkings ;
7. abords ou espaces extérieurs, s'ils entrent dans la visite.

L'ordre doit être configurable selon l'immeuble.

### 3.3 Relevé d'une observation

Pour chaque point nécessitant une attention ou une action :

1. indiquer le lieu courant ;
2. écrire un message, dicter une note vocale courte ou combiner les deux ;
3. prendre une ou plusieurs photos dans l'application ou les choisir dans la photothèque ;
4. enregistrer immédiatement la capture sur le téléphone, même hors connexion ;
5. laisser l'application la synchroniser lorsque le réseau le permet ;
6. laisser l'IA proposer un ou plusieurs constats après synchronisation ;
7. vérifier ou corriger chaque constat ;
8. décider s'il doit apparaître dans le compte rendu et/ou générer une tâche.

Exemples de contrôles :

- encombrement des paliers ;
- dégâts des eaux ou traces d'humidité ;
- peinture à reprendre ;
- portes et serrures ;
- ferme-portes et grooms ;
- éclairage et installations électriques visibles ;
- boutons-poussoirs ;
- sas et contrôles d'accès ;
- état des places et circulations de parking ;
- tout élément susceptible de déclencher une action du syndic.

### 3.4 Clôture de la visite

1. Vérifier les zones parcourues et celles qui n'ont pas été contrôlées.
2. Relire les constats proposés par l'IA.
3. Corriger les lieux, catégories, descriptions et niveaux de priorité.
4. Fusionner les doublons éventuels.
5. Valider les constats.
6. Générer le brouillon de compte rendu et les tâches proposées.

## 4. Unité centrale : le constat

Un constat est une observation atomique et vérifiable. Il ne doit décrire qu'un seul problème ou point de contrôle.

Champs proposés :

| Champ | Usage |
| --- | --- |
| Intitulé | Résumé court et factuel |
| Visite | Visite d'origine |
| Copropriété | Immeuble concerné |
| Lieu | Étage, palier, sas, parking ou équipement |
| Catégorie | Propreté, sinistre, peinture, accès, électricité, sécurité, autre |
| Description factuelle | Ce qui a été observé, sans extrapolation |
| Photos | Éléments visuels associés |
| Extrait vocal | Source brute ou lien vers la capture |
| Note écrite | Texte saisi directement par le gestionnaire |
| Transcription brute | Texte issu de la voix |
| Incidence | Information, surveillance ou action nécessaire |
| Priorité proposée | Basse, moyenne, haute ou urgente |
| Recommandation | Proposition de suite à donner |
| Validation | À vérifier, validé ou rejeté |
| Visible dans le CR | Oui/non |
| Génère une tâche | Oui/non |

## 5. Modèle de données de l'application

Le produit utilise sa propre base de données. Les objets du prototype Notion servent de référence fonctionnelle, mais ne sont pas des dépendances techniques.

### Lieux / Zones

Décrit le parcours propre à chaque copropriété : étage, palier, escalier, ascenseur, hall, sas, local, sous-sol, parking et extérieur.

Champs essentiels : nom, copropriété, type de zone, niveau, ordre de visite, actif/inactif.

### Captures

Conserve la matière brute transmise pendant la visite : note écrite, audio, transcription, photos, heure et lieu courant.

Cette base permet de séparer la matière originale des constats reformulés par l'IA.

### Constats

Contient les observations structurées et validées. Une capture peut produire plusieurs constats ; un constat peut générer zéro ou une action dans le MVP.

### Comptes rendus

Conserve le brouillon, les versions validées, le validateur ainsi que les dates de génération, validation et téléchargement.

## 6. Traitement de la voix et des photos

### Entrées du MVP

Chaque capture accepte une note écrite, une note vocale courte ou les deux. Elle est rattachée au lieu courant et aux photos ajoutées dans la même séquence.

Les photos peuvent provenir de l'appareil photo intégré à l'application ou de la photothèque du téléphone. Une note vocale continue couvrant toute la visite n'entre pas dans le MVP.

### Fonctionnement hors connexion

Une capture est considérée comme enregistrée dès qu'elle est durablement stockée sur le téléphone. La synchronisation vers le serveur est une étape distincte. L'utilisateur voit si chaque élément est local, en attente, en transfert, synchronisé ou en erreur.

### Sortie attendue de l'IA

Pour chaque capture, l'IA doit proposer une liste structurée :

- lieu identifié ;
- constat factuel ;
- catégorie ;
- incidence ;
- priorité suggérée ;
- recommandation ;
- besoin ou non de créer une tâche ;
- informations manquantes ou incertaines.

L'IA ne doit jamais présenter comme certain un lieu, une cause de sinistre ou une responsabilité qu'elle n'a pas pu établir.

## 7. Les deux sorties métier

### 7.1 Compte rendu au conseil syndical

Le compte rendu doit être lisible, regroupé par lieu et limité aux informations validées.

Les données structurées de la visite restent la source de vérité. Après validation du gestionnaire, l'application génère un PDF figé et versionné. Une nouvelle génération ne remplace jamais silencieusement une version déjà validée.

Dans le MVP, l'application ne transmet pas elle-même le document au conseil syndical. Elle permet de prévisualiser, corriger, valider puis télécharger le PDF. Le gestionnaire effectue ensuite l'envoi depuis sa solution de messagerie habituelle.

Structure proposée :

1. informations sur la visite ;
2. synthèse générale ;
3. constats par étage et zone ;
4. photos utiles ;
5. actions envisagées ;
6. points en attente de décision ou de complément.

### 7.2 Tâches du syndic

Chaque tâche proposée doit comprendre :

- un intitulé commençant par un verbe d'action ;
- la copropriété et le lieu ;
- le constat source ;
- la priorité ;
- le responsable ;
- l'échéance ;
- le statut ;
- les photos ou preuves utiles.

La création définitive des tâches nécessite une validation humaine.

## 8. User stories du MVP

### US-01 — Suivre le parcours de l'immeuble

En tant que gestionnaire, je veux parcourir les zones dans un ordre de haut en bas afin de ne rien oublier.

### US-02 — Capturer rapidement un problème

En tant que gestionnaire, je veux dicter une observation et ajouter des photos sans rédiger sur place.

### US-03 — Obtenir des constats structurés

En tant que gestionnaire, je veux que l'IA transforme mes captures en constats courts, localisés et modifiables.

### US-04 — Contrôler les erreurs de l'IA

En tant que gestionnaire, je veux voir la transcription et les photos sources afin de valider ou corriger chaque constat.

### US-05 — Produire le compte rendu

En tant que gestionnaire, je veux générer un brouillon de compte rendu à partir des seuls constats validés.

### US-06 — Créer les tâches

En tant que gestionnaire, je veux transformer les constats nécessitant une action en tâches complètes et traçables.

## 9. Critères d'acceptation du MVP

- [ ] Une visite peut être associée à une copropriété et à un parcours ordonné.
- [ ] L'utilisateur peut sélectionner ou changer le lieu courant pendant la visite.
- [ ] Une capture accepte au moins une note vocale et plusieurs photos.
- [ ] Une capture peut être composée uniquement d'un texte, uniquement d'un audio ou des deux.
- [ ] Des photos peuvent être prises dans l'application ou sélectionnées dans la photothèque.
- [ ] Une photo prise dans l'application peut rester propre à la visite sans être ajoutée à la photothèque personnelle.
- [ ] La visite et les captures restent utilisables sans réseau.
- [ ] La synchronisation reprend sans perte après le retour de la connexion ou le redémarrage de l'application.
- [ ] La transcription brute reste consultable après le traitement IA.
- [ ] Une capture peut produire plusieurs constats distincts.
- [ ] Chaque constat reste relié à sa voix et à ses photos sources.
- [ ] L'utilisateur peut modifier, valider ou rejeter chaque constat.
- [ ] Seuls les constats validés alimentent le compte rendu et les tâches.
- [ ] Le compte rendu est organisé par étage ou zone.
- [ ] Aucune tâche n'est créée définitivement sans validation humaine.
- [ ] Le gestionnaire ayant effectué la visite peut valider les deux sorties sans circuit d'approbation supplémentaire.
- [ ] Les tâches sont consultables et suivies dans l'application sans dépendance à Notion.
- [ ] Une zone non visitée est identifiable à la clôture.
- [ ] Le parcours principal est utilisable sur téléphone.

## 10. Hors périmètre du premier MVP

- Diagnostic technique automatique à partir des photos seules.
- Attribution juridique d'une responsabilité.
- Envoi automatique du compte rendu sans validation.
- Envoi d'email depuis l'application.
- Commande automatique d'un prestataire.
- Synchronisation continue avec Notion.
- Circuit d'approbation à plusieurs niveaux.

## 11. Décisions restantes

1. Quelles données du prototype Notion doivent être reprises dans la nouvelle application ?
2. Quelle pile technique et quel hébergement seront retenus ?
