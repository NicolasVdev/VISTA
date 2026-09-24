# Registre des décisions

## 2026-09-24 — Captation vocale

Décision : le MVP utilise plusieurs notes vocales courtes pendant la visite.

Conséquence : chaque capture est rattachée au lieu courant et aux photos prises dans la même séquence. Une note pourra produire plusieurs constats, mais ne devra pas couvrir une portion trop large de l'immeuble.

## 2026-09-24 — Produit autonome

Décision : l'objectif est d'abandonner Notion au profit d'un développement applicatif.

Conséquences :

- l'application possède sa propre base de données ;
- les audios, photos et comptes rendus sont stockés hors de Notion ;
- les tâches sont créées et suivies dans l'application ;
- Notion ne fait pas partie de l'architecture d'exécution ;
- une migration initiale des données utiles pourra être étudiée séparément.

## 2026-09-24 — Validation humaine

Décision : le gestionnaire qui réalise la visite valide les constats, le compte rendu et les tâches avant leur utilisation ou leur envoi.

Conséquence : le MVP ne nécessite pas de circuit d'approbation à plusieurs niveaux. Il doit toutefois conserver la trace de la validation et permettre une évolution future des rôles.

## 2026-09-24 — Format du compte rendu

Décision : le compte rendu validé est généré au format PDF.

Conséquences :

- les constats structurés restent la source de vérité dans la base de données ;
- une mise en page versionnée est générée à partir de ces données ;
- le PDF constitue la version figée destinée au conseil syndical ;
- toute régénération crée une nouvelle version sans écraser le document précédemment validé ;
- le besoin éventuel de PDF/A pour l'archivage à long terme sera évalué séparément.

## 2026-09-24 — Diffusion du compte rendu

Décision : le MVP ne réalise pas l'envoi d'email.

Parcours retenu :

1. l'application prépare le brouillon du compte rendu ;
2. le gestionnaire le vérifie et le corrige, notamment à son retour au bureau ;
3. il valide la version finale ;
4. l'application génère le PDF téléchargeable ;
5. le gestionnaire l'envoie avec la solution de messagerie déjà utilisée par le cabinet.

L'envoi direct depuis l'application est conservé dans le backlog comme fonctionnalité ultérieure.

## 2026-09-24 — Utilisation hors connexion

Décision : le mode visite doit rester utilisable lorsque le téléphone n'a pas de réseau.

Conséquences :

- les textes, audios, photos et métadonnées sont d'abord conservés localement ;
- chaque capture possède un état de synchronisation visible ;
- les transferts reprennent lorsque la connexion revient ;
- aucune capture ne doit être perdue si l'application est fermée ou le téléphone verrouillé ;
- le gestionnaire peut terminer sa visite avant la synchronisation complète.

## 2026-09-24 — Modes de saisie d'une observation

Décision : l'interface propose une saisie comparable à une messagerie mobile.

Pour chaque observation, le gestionnaire peut :

- écrire un message ;
- enregistrer une note vocale courte ;
- combiner texte et voix si nécessaire ;
- prendre une photo depuis l'application ;
- sélectionner une ou plusieurs photos déjà présentes dans la photothèque.

Une photo prise dans l'application n'a pas besoin d'être ajoutée automatiquement à la photothèque personnelle. Une photo prise avec l'application photo du téléphone peut être jointe ultérieurement depuis la photothèque.

## Décisions encore ouvertes

- Pile technique, hébergement et fournisseur d'authentification.
- Validation ou rejet de l'option React Native avec Expo après une preuve de concept terrain.
- Périmètre des données à reprendre depuis le prototype Notion.
