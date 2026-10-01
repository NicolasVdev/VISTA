# Copropriétés et parcours de visite

Décision de conception — 1er octobre 2026. Ce document décrit le modèle cible ; la démo conserve actuellement un parcours fixe.

## Usage proposé

Le gestionnaire crée une fiche de copropriété depuis le bureau ou le téléphone. Un assistant demande les bâtiments, les étages et sous-sols de chaque bâtiment, puis les équipements et espaces présents : toiture accessible, ascenseurs, jardins, parkings, caves et locaux communs. Il génère un parcours de haut en bas. Un aperçu permet de renommer, ajouter, désactiver et réordonner les zones sans code. Sur téléphone, privilégier des formulaires courts, des compteurs et des interrupteurs à un tableau de base de données.

Une copropriété à plusieurs bâtiments peut avoir des nombres d'étages différents et des espaces partagés. Un ascenseur est un équipement rattaché à un bâtiment, pas une zone à dupliquer à chaque étage. Un jardin ou parking commun est rattaché à la copropriété ou à un bâtiment selon son usage. Les zones générées ne remplacent pas les ajustements faits par le gestionnaire : demander confirmation avant une régénération.

## Modèle relationnel cible

Utiliser PostgreSQL pour les données structurées et un stockage privé de fichiers pour les photos, audios et PDF. Conserver IndexedDB pour la saisie hors connexion ; SQL seul ne résout pas ce besoin. Le fournisseur d'hébergement et d'authentification reste à choisir.

| Entité | Rôle |
| --- | --- |
| Organisation | Cabinet de syndic et périmètre d'accès |
| Copropriété | Nom, adresse, référence et organisation |
| Bâtiment | Copropriété, libellé et configuration des niveaux |
| Zone | Lieu réel, bâtiment facultatif, type, niveau et ordre |
| Équipement | Ascenseur, porte, éclairage ou autre élément lié à une zone ou un bâtiment |
| Modèle de contrôle | Liste de points proposés par type de zone ou équipement |
| Visite | Copropriété, gestionnaire, dates et état |
| Zone de visite | Copie du parcours au démarrage : libellé, ordre, contrôles et statut |
| Observation | Texte/commentaire, zone de visite et médias associés |
| Média | Référence de stockage privé et type de fichier |

Au lancement d'une visite, copier le parcours et les contrôles proposés dans des zones de visite. Modifier la fiche d'une copropriété ne doit pas réécrire les anciennes visites ni leurs comptes rendus. Une adaptation pendant la visite modifie cette copie ; une action explicite « appliquer aux prochaines visites » pourra mettre à jour le modèle de la copropriété.

## Livraison progressive

1. Fiche copropriété et assistant bâtiments/niveaux/espaces ; aperçu du parcours généré.
2. Modification mobile des zones et duplication d'une configuration existante.
3. Synchronisation privée par organisation et visites avec parcours figé.
4. Points de contrôle personnalisables et import des données utiles de Notion.

Ne pas générer les lieux réels avec l'IA : leur configuration doit rester vérifiable par le gestionnaire. L'IA interviendra ensuite sur les observations et les comptes rendus.
