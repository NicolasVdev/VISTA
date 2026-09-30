# VISTA PWA

Application terrain installable de visites techniques d'immeubles.

## Fonctionnalités de cette version

- installation sur l'écran d'accueil avec icône VISTA ;
- affichage autonome et responsive ;
- parcours de visite de la toiture au sous-sol ;
- observations écrites ;
- plusieurs notes vocales courtes ;
- prise de photo ou import depuis la photothèque ;
- conservation locale dans IndexedDB ;
- cache applicatif hors connexion ;
- écran de clôture préparant la future génération du compte rendu.

La synchronisation serveur, l'authentification, la transcription IA et le PDF ne sont pas encore connectés.

## Développement

Prérequis : Node.js 22 ou version ultérieure et pnpm.

```bash
pnpm install
pnpm dev
```

Ouvrir ensuite `http://localhost:3000`.

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
