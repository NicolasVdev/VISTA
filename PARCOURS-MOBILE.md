# Parcours mobile — Mode visite

Date : 2026-09-24  
Statut : spécification d'interface initiale

## Écran principal

L'écran de visite ressemble à une conversation organisée par lieu. Chaque capture apparaît comme un message horodaté comprenant du texte, un audio, des photos ou une combinaison de ces éléments.

```text
┌──────────────────────────────────┐
│ Résidence Exemple       Hors ligne│
│ 5e étage — palier        3/12     │
├──────────────────────────────────┤
│ [Photo] Éclairage défectueux      │
│ 🎙 00:18                    ✓ local│
│                                   │
│ Traces d'humidité côté cour       │
│ [Photo] [Photo]          ⏳ attente│
├──────────────────────────────────┤
│ Écrire une observation…           │
│ [＋ Photos]      [🎙 Maintenir] [↑] │
├──────────────────────────────────┤
│ ← Étage précédent   Étage suivant →│
└──────────────────────────────────┘
```

## Composer une observation

Le compositeur propose en permanence :

- un champ texte utilisant le clavier du téléphone ;
- un bouton pour enregistrer une note vocale courte ;
- un bouton `Photos` ouvrant deux choix : `Prendre une photo` et `Choisir dans la photothèque` ;
- une action d'enregistrement local immédiat.

Le texte et la voix ne sont pas exclusifs. Le gestionnaire peut, par exemple, dicter le constat puis ajouter une précision écrite.

## États visibles d'une capture

| État | Affichage attendu |
| --- | --- |
| Brouillon | Modification possible, pas encore enregistré |
| Enregistrée localement | Disponible hors connexion |
| En attente réseau | Présente dans la file de synchronisation |
| Transfert en cours | Progression visible |
| Synchronisée | Réception confirmée par le serveur |
| Traitement IA | Transcription ou analyse en cours |
| À vérifier | Constats proposés disponibles |
| Erreur | Cause visible et bouton `Réessayer` |

## Gestion des photos

### Prendre une photo dans l'application

La photo est reliée immédiatement à la capture et enregistrée dans l'espace local de l'application. Elle n'est pas ajoutée automatiquement à la photothèque personnelle.

### Utiliser l'application photo du téléphone

Le gestionnaire peut quitter temporairement l'application, prendre ses photos avec l'appareil photo habituel, revenir dans la capture puis les sélectionner dans la photothèque.

### Avant synchronisation

Le gestionnaire peut visualiser, retirer ou ajouter des photos. La suppression locale définitive n'est permise qu'après confirmation de leur synchronisation ou après abandon volontaire de la capture.

## Changement de lieu

Le lieu courant reste toujours visible. Avant de passer à l'étage suivant, l'application vérifie qu'aucune capture n'est restée en brouillon. Le changement de lieu n'attend pas la fin des transferts.

## Fin de visite hors connexion

La visite peut être clôturée localement. L'application affiche alors :

- les zones visitées ;
- les zones non accessibles ;
- les captures encore en attente de synchronisation ;
- un avertissement indiquant que le compte rendu ne pourra être généré qu'après synchronisation et traitement complets.

