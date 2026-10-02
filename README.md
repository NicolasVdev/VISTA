# VISTA

**Visites, Inspections, Suivi Technique et Actions**

Projet professionnel visant à développer une application autonome de visite technique d'immeuble, à partir des enseignements du prototype Notion existant.

## Finalité

Permettre au gestionnaire de parcourir un immeuble de haut en bas, de dicter ses observations et de transmettre des photos, puis de produire après validation humaine :

1. une retranscription structurée de la visite ;
2. un compte rendu destiné au conseil syndical ;
3. les tâches à réaliser par le syndic.

## Principe directeur

Chaque observation doit rester reliée à quatre éléments :

`Visite + lieu exact + preuve brute (voix/photo) + action éventuelle`

L'IA prépare et classe. Le gestionnaire valide les constats, le compte rendu et les tâches avant toute diffusion.

## Cible produit validée

L'application remplace Notion pour l'usage opérationnel. Elle possède son propre système de données, de fichiers et de tâches. Notion n'est pas une dépendance de production ; il sert uniquement de prototype de référence et pourra éventuellement fournir les données d'une migration initiale.

Le gestionnaire qui effectue la visite est également responsable de la validation du compte rendu et des tâches proposées.

## Documents du projet

- [Spécification du MVP](SPEC-MVP.md)
- [Décisions produit](DECISIONS.md)
- [Architecture fonctionnelle](ARCHITECTURE-MVP.md)
- [Plan d'implémentation](PLAN-IMPLEMENTATION.md)
- [Parcours mobile](PARCOURS-MOBILE.md)
- [Préparation et consignes du pilote](BETA-PILOTE.md)

## Application active

La PWA mobile-first et installable se trouve dans [`web/`](web/README.md). Elle est conçue pour être ajoutée à l'écran d'accueil d'un iPhone ou d'un téléphone Android et s'ouvrir comme une application autonome.

La version pilote est une application React/Vite statique, préparée pour être publiée sur le compte Render de l'entreprise à partir du dépôt GitHub. Elle ne dépend plus d'OpenAI Sites pour son accès.

Le premier prototype Expo/React Native reste archivé dans [`mobile/`](mobile/README.md) pour conserver l'historique technique, mais il n'est plus la cible active.

## État au 2026-10-03 — bêta locale en préparation

- Parcours métier initial décrit.
- Notes vocales courtes validées comme mode de captation du MVP.
- Développement d'une application autonome validé ; Notion sera abandonné pour l'exploitation.
- Gestionnaire visiteur confirmé comme validateur des sorties.
- PDF téléchargé après vérification puis envoyé depuis la messagerie habituelle ; envoi intégré reporté.
- Mode visite hors connexion validé, avec synchronisation différée.
- Saisie texte ou vocale et ajout de photos depuis l'appareil photo ou la photothèque validés.
- Architecture fonctionnelle et plan de développement révisés.
- Premier prototype mobile réalisé avec Expo, puis abandonné comme cible principale.
- Pivot vers une PWA installable validé et implémenté.
- Parcours terrain, texte, voix, photos et brouillons locaux hors connexion disponibles dans la PWA.
- Visite, progression par zone et observations multimédias regroupées persistées dans IndexedDB.
- Reprise après fermeture et clôture bloquée tant qu'une zone n'est pas renseignée.
- Migration vers une PWA statique portable et configuration Render réalisées.
- Création de visites réelles et historique local, avec parcours personnalisable par visite.
- Compte rendu PDF avec photos et sauvegarde ZIP produits localement ; téléchargement puis envoi depuis sa messagerie.
- Build, lint et suite navigateur : 12 tests réussis, dont migration, parcours personnalisés, exports et fonctionnement hors connexion.
- Publication de ces changements et tests physiques iPhone/Android encore à faire.
- Transcription automatique, authentification et synchronisation encore absentes. Les notes vocales nécessitent une reprise textuelle manuelle pour le PDF ; la reprise téléphone/PC passe par le transfert des fichiers exportés.
- Prochaine étape : lever ces limites critiques pour le pilote, tester une visite complète sur le téléphone du gestionnaire et vérifier la réception de son compte rendu avant mardi 6 octobre.
