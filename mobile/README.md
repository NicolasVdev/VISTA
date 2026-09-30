# VISTA Mobile

> Prototype historique Expo/React Native. Le développement actif a été déplacé vers la PWA du dossier [`web/`](../web/README.md) le 30 septembre 2026.

Prototype mobile Expo/React Native du mode visite VISTA.

## Fonctions présentes

- parcours ordonné d'un immeuble de haut en bas ;
- changement de zone ;
- observation écrite ;
- note vocale courte ;
- photo prise sur le moment ou choisie dans la photothèque ;
- stockage local persistant ;
- file de synchronisation simulée ;
- fermeture de visite avec contrôle des zones restantes.

Le backend, la transcription IA et la génération du PDF ne sont pas encore connectés. Les états de synchronisation permettent de tester le parcours avant ces intégrations.

## Lancer le prototype

```bash
pnpm install
pnpm start
```

Scanner ensuite le QR code avec Expo Go sur un téléphone compatible.

Le téléphone et l'ordinateur doivent être connectés au même réseau local. Les autorisations du microphone, de l'appareil photo et de la photothèque sont demandées au premier usage.

## Vérifier le typage

```bash
pnpm typecheck
```

Une exportation Android de contrôle peut être lancée avec :

```bash
pnpm exec expo export --platform android
```
