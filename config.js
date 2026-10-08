/* config.js — Configuration par défaut (phase 1, hors-ligne, sans serveur)
   =====================================================================
   IMPORTANT : ce fichier est chargé en <script> (pas de fetch) pour éviter
   les problèmes CORS en ouverture "double-clic".

   Vous pouvez :
   - Modifier le mot de passe par défaut
   - Modifier les infos évènement (nom, date, message ticket)
   - Ajouter / modifier / supprimer des catégories et des produits
   - Laisser logoBase64 vide et utiliser l'upload dans l'Admin

   Format :
   CONFIG_DEFAUT = {
     motDePasse: "asso2025",
     evenement: { nomAssociation, nomEvenement, dateEvenement, messageTicket, logoBase64 },
     categories: [
       { id, nom, icone, produits:[ {id, nom, prix, actif:true}, ... ] },
       ...
     ]
   }
*/

(function(){
  // Petit générateur d'ID stable (phase 1). L'app régénèrera des IDs si besoin.
  function id(prefix){
    return (prefix||"id") + "_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  window.CONFIG_DEFAUT = {
    motDePasse: "asso2025",
    evenement: {
      nomAssociation: "Association",
      nomEvenement: "Fête de l'association",
      // Date au format AAAA-MM-JJ (ex: "2026-06-15")
      dateEvenement: "",
      messageTicket: "Merci pour votre achat !",
      // Logo en base64 (data:image/...) — facultatif. Vous pouvez l'ajouter via l'Admin.
      logoBase64: ""
    },

    categories: [
      {
        id: "cat_boissons",
        nom: "Boissons",
        icone: "🥤",
        produits: [
          { id: id("p"), nom: "Bouteille d'eau", prix: 1.00, actif: true },
          { id: id("p"), nom: "Soda", prix: 2.00, actif: true },
          { id: id("p"), nom: "Bière", prix: 3.00, actif: true },
          { id: id("p"), nom: "Café", prix: 1.00, actif: true }
        ]
      },
      {
        id: "cat_sandwichs",
        nom: "Sandwichs",
        icone: "🥪",
        produits: [
          { id: id("p"), nom: "Jambon-beurre", prix: 4.00, actif: true },
          { id: id("p"), nom: "Merguez", prix: 4.50, actif: true },
          { id: id("p"), nom: "Végétarien", prix: 4.00, actif: true }
        ]
      },
      {
        id: "cat_friandises",
        nom: "Friandises",
        icone: "🍬",
        produits: [
          { id: id("p"), nom: "Crêpe", prix: 2.50, actif: true },
          { id: id("p"), nom: "Barbe à papa", prix: 2.00, actif: true },
          { id: id("p"), nom: "Gaufre", prix: 3.00, actif: true }
        ]
      },
      {
        id: "cat_autres",
        nom: "Autres",
        icone: "🍽️",
        produits: [
          { id: id("p"), nom: "Frites", prix: 3.00, actif: true },
          { id: id("p"), nom: "Chips", prix: 1.50, actif: true }
        ]
      }
    ]
  };
})();
