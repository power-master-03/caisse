LISEZ-MOI — Caisse Asso (phase 1, hors-ligne, double-clic)
===========================================================

1) Lancer l'application
-----------------------
- Décompressez l'archive.
- Ouvrez le dossier "caisse-asso".
- Double-cliquez sur "index.html".
Aucun serveur n'est nécessaire. (Pas de fetch -> pas de CORS.)

2) Connexion
------------
- Mot de passe par défaut : asso2025
- Choisissez la caisse : Caisse 1 (C1) ou Caisse 2 (C2)
La session est mémorisée dans localStorage (reconnexion sans perte).

3) Caisse / Tickets 80mm
------------------------
- Les produits sont organisés par catégories (onglets horizontaux).
- + / - pour modifier la quantité.
- 1 consommation = 1 ticket :
  Exemple : 2 sandwichs + 1 eau => 3 tickets imprimés (un par unité).
- Le bouton "VALIDER" :
  - génère un numéro de commande unique (ex: C1-0001),
  - enregistre la commande dans la base locale,
  - ouvre la fenêtre d'impression (window.print),
  - réinitialise la commande pour le client suivant.

Imprimante 80mm :
- Dans le navigateur, sélectionnez l'imprimante thermique 80mm.
- Le CSS contient @media print + @page (80mm).
- Activez si besoin l'impression "sans marges" côté driver.

4) Admin
--------
Dans l'onglet Admin vous pouvez :
- Modifier les paramètres évènement : nom association, nom évènement, date, message bas de ticket
- Uploader un logo (stocké en base64 dans localStorage)
- Changer le mot de passe
- Ajouter / modifier / supprimer / activer-désactiver des produits (par catégorie)

Note : l'ajout/suppression de catégories se fait en phase 1 via config.js.
(Phase 2 : synchronisation multi-caisses via Supabase.)

5) Statistiques
---------------
- KPIs : CA total, nb commandes, nb tickets, CA par caisse
- Ventes par produit
- Répartition par caisse
- Export CSV (Excel)
- Sauvegarde JSON + restauration JSON (pratique avant changement d'ordinateur)
- Bouton "Vider la base (commandes)" : remet à zéro uniquement l'historique des commandes.

6) Anti-perte / données locales
-------------------------------
Tout est stocké dans localStorage :
- session, mot de passe
- paramètres évènement + produits
- panier en cours (anti-perte si onglet fermé / coupure)
- commandes + compteurs par caisse

Important : localStorage est propre à CHAQUE navigateur/appareil.
Si vous utilisez 2 appareils (2 caisses), les statistiques ne seront pas fusionnées en phase 1.
Phase 2 : Supabase permettra la centralisation/synchronisation.

Bon évènement !
