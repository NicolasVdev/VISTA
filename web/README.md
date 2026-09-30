# VISTA PWA

Application terrain installable de visites techniques d'immeubles.

## Fonctionnalités de cette version

- installation sur l'écran d'accueil avec icône VISTA ;
- affichage autonome et responsive ;
- parcours de visite de la toiture au sous-sol ;
- observations regroupant texte, note vocale et plusieurs photos ;
- plusieurs notes vocales courtes ;
- prise de photo ou import multiple depuis la photothèque ;
- conservation locale dans IndexedDB ;
- statut obligatoire pour chaque zone : observation, rien à signaler ou non accessible ;
- reprise de la visite après fermeture de l'application ;
- cache applicatif hors connexion ;
- clôture impossible tant qu'une zone reste à contrôler ;
- écran de synthèse préparant la future génération du compte rendu.

La synchronisation serveur, l'authentification, la transcription IA et le PDF ne sont pas encore connectés.

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
