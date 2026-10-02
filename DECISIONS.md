# Registre des décisions

## 2026-09-30 — PWA installable comme client principal

Décision : VISTA est développé comme une Progressive Web App mobile-first installable sur l'écran d'accueil.

Conséquences :

- le gestionnaire lance VISTA depuis une icône, sans rechercher un lien à chaque visite ;
- l'application s'ouvre en mode autonome et reste responsive sur téléphone, tablette et ordinateur ;
- le texte, les notes vocales et les photos sont conservés localement avant synchronisation ;
- la diffusion initiale ne dépend ni de l'App Store, ni de Google Play, ni d'Expo Go ;
- un assistant accompagne l'installation sur iPhone et Android ;
- une encapsulation native pourra être envisagée plus tard sans reconstruire le modèle métier.

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

- Backend de synchronisation, stockage privé et fournisseur d'authentification de production.
- Périmètre des données à reprendre depuis le prototype Notion.

## 2026-09-30 — Hébergement Render pour le pilote

Décision : la PWA pilote est construite comme un site statique React/Vite et publiée sur le compte Render déjà administré par l'entreprise.

Conséquences :

- aucun compte OpenAI n'est nécessaire pour ouvrir la version de test ;
- Render sert uniquement les fichiers publics de l'application pendant le pilote ;
- les données saisies restent locales à l'appareil tant que le backend n'est pas connecté ;
- l'authentification métier devra être ajoutée avant toute synchronisation de données réelles ;
- la PWA reste portable vers un autre hébergeur grâce à son build statique standard.

## 2026-10-01 — Saisie centrée sur la voix et fiche copropriété

La barre de saisie suit une messagerie mobile : micro permanent, menu « + » pour la prise ou l'import de photos, flèche vers la droite pour enregistrer. Le texte reste utilisable seul ; avec des médias, il sert de titre ou commentaire facultatif. Les icônes utilisent Lucide React. Le composeur suit le viewport visible, avec contenu défilant séparément et sans espace fixe réservé au clavier.

Le modèle cible permet de configurer une copropriété et ses bâtiments, niveaux, espaces et équipements pour générer son parcours. La fiche sera éditable sur mobile avec des formulaires simples. Une visite conserve une copie de son parcours, afin de préserver l'historique lors d'un changement de configuration. Le modèle proposé et ses étapes de livraison sont décrits dans [MODELE-COPROPRIETES.md](MODELE-COPROPRIETES.md). Cette configuration n'est pas encore implémentée dans la démo.

## 2026-10-02 — Refonte du parcours terrain

Le brief `vista-refonte-ux/refonte-ux.md` remplace le choix visuel du 1er octobre :
menu photo à gauche, micro lorsque le brouillon est vide, coche d'ajout lorsqu'il
contient du contenu. Pour conserver la combinaison texte + voix + photos, le menu
propose aussi l'ajout ou le remplacement d'une note vocale.

La navigation entre zones est libre. Les brouillons texte, audio et photo sont
conservés par zone dans IndexedDB. Les brouillons non ajoutés restent distincts
des constats ; ils sont signalés au contrôle de fin, sans bloquer la clôture.

Les constats ont une gravité et une option de création d'action. Une modification
garde le même identifiant ; une suppression peut être annulée pendant 5 secondes.
Le dernier constat supprimé remet sa zone à contrôler. Les motifs de non-accès
restent facultatifs.

La clôture est transactionnelle, crée les actions sélectionnées avec un identifiant
stable et passe la visite en lecture seule. Une réouverture est explicite. Une
nouvelle clôture préserve les actions déjà faites, leur intervenant et leur échéance,
et retire les actions ouvertes qui ne sont plus sélectionnées.

La démo n'annonce aucun envoi automatique de compte rendu : synchronisation, IA,
PDF, comptes utilisateurs et configuration des copropriétés restent hors de ce lot.
La police Figtree est auto-hébergée et précachée pour le mode hors ligne.
Le téléchargement et la publication GitHub/Render ont été autorisés par l'utilisateur.

### Accès de copropriété et repères de gravité

Une fiche `properties` distincte de la visite conserve le contact du gardien,
son téléphone, les codes d'accès et les informations utiles. Ces renseignements
restent éditables après clôture et ne sont pas effacés lors du reset de la visite
de démonstration. La démo conserve une seule copropriété affichée ; le magasin
utilise des identifiants de copropriété pour préparer le futur portefeuille.

Le suivi des actions est toujours affiché sur l'accueil, y compris à zéro. Les
actions déjà ouvertes sont distinguées des actions sélectionnées dans une visite
non clôturée. Les pastilles de zone et les segments de progression prennent la
gravité maximale de leurs constats : rouge urgent, ocre à planifier, bleu pour info.
Vert reste réservé à « Rien à signaler » et orange clair à « Non accessible ».

Les accès sont stockés localement, sans chiffrement applicatif ni contrôle des
rôles dans la démo. Avant l'utilisation de codes réels en production, prévoir les
droits de consultation et une protection adaptée des appareils et du stockage.
