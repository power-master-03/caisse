/* app.js — Caisse Asso (phase 1, hors-ligne, localStorage)
   =====================================================================
   Fonctionnalités :
   - Login + sélection caisse (C1 / C2) ; session persistée
   - Produits par catégories ; interface responsive
   - Commande : + / −, total ; 1 ticket par consommation
   - Validation : numéro unique (C1-0001...), enregistrement base locale, impression 80mm
   - Statistiques : CA, nb commandes, tickets, ventes par produit, répartition par caisse, export CSV
   - Admin : paramètres évènement, upload logo (base64), mot de passe, CRUD produits (par catégorie), activation/désactivation
   - Anti-perte : tout en localStorage (dont commande en cours)

   NOTE : Pas de fetch, tout est local, ouverture en double-clic.
*/

(function(){
  "use strict";

  // -------- Namespace localStorage --------
  const LS = {
    session:  "ca_session_v1",
    password: "ca_password_v1",
    config:   "ca_config_v1",     // paramètres évènement + catégories + produits (editable via admin)
    orders:   "ca_orders_v1",     // base locale commandes
    counters: "ca_counters_v1",   // compteur par caisse
    state:    "ca_state_v1"       // panier + vue + catégorie sélectionnée
  };

  // --------- Helpers ---------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function safeParse(str, fallback){
    try{ return JSON.parse(str); }catch(_){ return fallback; }
  }
  function loadLS(key, fallback){
    const v = localStorage.getItem(key);
    return (v===null || v===undefined) ? fallback : safeParse(v, fallback);
  }
  function saveLS(key, value){
    localStorage.setItem(key, JSON.stringify(value));
  }

  function eur(n){
    const v = Math.round((Number(n)||0)*100)/100;
    return v.toLocaleString("fr-FR", { style:"currency", currency:"EUR" });
  }
  function pad4(n){ return String(n).padStart(4,"0"); }
  function nowISO(){ return new Date().toISOString(); }
  function formatDateTimeFR(iso){
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit" });
  }
  function formatEventDate(yyyy_mm_dd){
    if(!yyyy_mm_dd) return "";
    const [y,m,d] = yyyy_mm_dd.split("-").map(Number);
    if(!y||!m||!d) return yyyy_mm_dd;
    const dt = new Date(y, m-1, d);
    return dt.toLocaleDateString("fr-FR", { year:"numeric", month:"long", day:"2-digit" });
  }
  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }
  function toast(msg, type="info"){
    const el = $("#toast");
    el.textContent = msg;
    el.style.borderColor =
      type==="danger" ? "rgba(255,78,106,.45)" :
      type==="ok"     ? "rgba(56,209,139,.40)" :
      type==="warn"   ? "rgba(255,204,102,.45)" :
                        "rgba(78,161,255,.45)";
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=> el.classList.remove("show"), 2600);
  }

  function downloadBlob(filename, blob){
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1500);
  }

  function genId(prefix="id"){
    // ID robuste (crypto si dispo)
    if (window.crypto && crypto.getRandomValues){
      const a = new Uint32Array(2);
      crypto.getRandomValues(a);
      return prefix + "_" + a[0].toString(16) + a[1].toString(16);
    }
    return prefix + "_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  // --------- Conversion config.js -> modèle interne ---------
  function normalizeFromDefaultConfig(cfgDef){
    // Transforme CONFIG_DEFAUT en structure interne:
    // config = { event:{orgName,eventName,eventDate,message,logoDataUrl}, categories:[{id,name,icon,products:[...]}] }
    const event = cfgDef?.evenement || {};
    const categories = (cfgDef?.categories || []).map(cat => ({
      id: cat.id || genId("cat"),
      name: cat.nom || "Catégorie",
      icon: cat.icone || "",
      products: (cat.produits || []).map(p => ({
        id: p.id || genId("p"),
        name: p.nom || "Produit",
        price: Number(p.prix||0),
        active: (p.actif!==false)
      }))
    }));

    return {
      event: {
        orgName: event.nomAssociation || "Association",
        eventName: event.nomEvenement || "Évènement",
        eventDate: event.dateEvenement || "",
        message: event.messageTicket || "Merci !",
        logoDataUrl: event.logoBase64 || ""
      },
      categories
    };
  }

  // --------- App state ---------
  const App = {
    session: { loggedIn:false, caisse:"C1" },
    password: "asso2025",
    config: null,      // normalized config
    orders: [],
    counters: { C1:1, C2:1 },
    state: { cart:{}, lastView:"caisse", selectedCategoryId:null },
    edit: { productId:null, categoryId:null }
  };

  function ensureDefaults(){
    if(!window.CONFIG_DEFAUT){
      alert("CONFIG_DEFAUT introuvable. Vérifiez config.js");
      return;
    }
    const normalized = normalizeFromDefaultConfig(window.CONFIG_DEFAUT);

    if(localStorage.getItem(LS.password)===null){
      saveLS(LS.password, window.CONFIG_DEFAUT.motDePasse || "asso2025");
    }
    if(localStorage.getItem(LS.config)===null){
      saveLS(LS.config, normalized);
    }
    if(localStorage.getItem(LS.orders)===null){
      saveLS(LS.orders, []);
    }
    if(localStorage.getItem(LS.counters)===null){
      saveLS(LS.counters, { C1:1, C2:1 });
    }
    if(localStorage.getItem(LS.session)===null){
      saveLS(LS.session, { loggedIn:false, caisse:"C1" });
    }
    if(localStorage.getItem(LS.state)===null){
      // catégorie par défaut = première catégorie (si existe)
      saveLS(LS.state, { cart:{}, lastView:"caisse", selectedCategoryId: normalized.categories[0]?.id || null });
    }
  }

  function loadAll(){
    App.password = loadLS(LS.password, window.CONFIG_DEFAUT?.motDePasse || "asso2025");
    App.config = loadLS(LS.config, normalizeFromDefaultConfig(window.CONFIG_DEFAUT));
    App.orders = loadLS(LS.orders, []);
    App.counters = loadLS(LS.counters, { C1:1, C2:1 });
    App.session = loadLS(LS.session, { loggedIn:false, caisse:"C1" });
    App.state = loadLS(LS.state, { cart:{}, lastView:"caisse", selectedCategoryId: App.config.categories[0]?.id || null });

    // Hardening: si catégorie sélectionnée inexistante -> première
    if(App.state.selectedCategoryId && !App.config.categories.some(c=>c.id===App.state.selectedCategoryId)){
      App.state.selectedCategoryId = App.config.categories[0]?.id || null;
      saveLS(LS.state, App.state);
    }
  }

  function persistState(){ saveLS(LS.state, App.state); }

  // --------- Views ---------
  const views = {
    login: $("#viewLogin"),
    caisse: $("#viewCaisse"),
    stats: $("#viewStats"),
    admin: $("#viewAdmin")
  };

  function setView(name){
    Object.entries(views).forEach(([k,el]) => el.classList.toggle("hidden", k!==name));
    App.state.lastView = name;
    persistState();
    refreshTopbar();
    if(name==="caisse") renderCaisse();
    if(name==="stats") renderStats();
    if(name==="admin") renderAdmin();
  }

  function requireLogin(){
    if(!App.session.loggedIn){
      setView("login");
      return false;
    }
    return true;
  }

  // --------- Topbar ---------
  function refreshTopbar(){
    const topbar = $("#topbar");
    const cfg = App.config?.event;
    if(App.session.loggedIn){
      topbar.classList.remove("hidden");
      $("#sessionPill").textContent = `Connecté • ${App.session.caisse}`;
      $("#brandTitle").textContent = cfg?.orgName || "Caisse Asso";
      $("#brandSub").textContent = cfg?.eventName || "Hors‑ligne • localStorage";
      $("#eventBadge").textContent = `${cfg?.eventName || "Évènement"} • ${formatEventDate(cfg?.eventDate) || "date à définir"}`;
      $("#orderNextBadge").textContent = `Prochaine commande : ${nextOrderNumber(App.session.caisse)}`;
    }else{
      topbar.classList.add("hidden");
      $("#sessionPill").textContent = "Non connecté";
    }
  }

  // --------- Products / cart ---------
  function getAllProductsFlat(){
    // Retourne [{id,name,price,active,categoryId,categoryName,categoryIcon}]
    const list = [];
    for(const cat of (App.config.categories||[])){
      for(const p of (cat.products||[])){
        list.push({
          id: p.id,
          name: p.name,
          price: Number(p.price||0),
          active: (p.active!==false),
          categoryId: cat.id,
          categoryName: cat.name,
          categoryIcon: cat.icon
        });
      }
    }
    return list;
  }

  function getActiveProductsByCategory(categoryId){
    const cat = App.config.categories.find(c=>c.id===categoryId);
    if(!cat) return [];
    return (cat.products||[]).filter(p=>p.active!==false).slice().sort((a,b)=>a.name.localeCompare(b.name,"fr"));
  }

  function cartQty(pid){ return Number(App.state.cart[pid]||0); }
  function setCartQty(pid, qty){
    qty = Math.max(0, Math.floor(Number(qty)||0));
    if(qty<=0) delete App.state.cart[pid];
    else App.state.cart[pid] = qty;
    persistState();
    renderCaisse();
  }
  function clearCart(){
    App.state.cart = {};
    persistState();
    renderCaisse();
  }

  function computeCartLines(){
    const byId = new Map(getAllProductsFlat().map(p=>[p.id,p]));
    const lines = [];
    let total = 0;
    let totalItems = 0;
    for(const [pid,qty] of Object.entries(App.state.cart||{})){
      const p = byId.get(pid);
      if(!p) continue;
      const q = Number(qty)||0;
      if(q<=0) continue;
      const sub = q * (Number(p.price)||0);
      total += sub;
      totalItems += q;
      lines.push({ productId: pid, name:p.name, price:Number(p.price||0), qty:q, sub, categoryId:p.categoryId });
    }
    lines.sort((a,b)=>a.name.localeCompare(b.name,"fr"));
    return { lines, total, totalItems };
  }

  // --------- Caisse rendering ---------
  function renderCategoryTabs(){
    const wrap = $("#categoryTabs");
    wrap.innerHTML = "";
    const cats = App.config.categories || [];
    for(const cat of cats){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab";
      btn.setAttribute("role","tab");
      const selected = (App.state.selectedCategoryId === cat.id) || (!App.state.selectedCategoryId && cats[0]?.id===cat.id);
      btn.setAttribute("aria-selected", selected ? "true":"false");
      btn.textContent = `${cat.icon ? cat.icon + " " : ""}${cat.name}`;
      btn.addEventListener("click", ()=>{
        App.state.selectedCategoryId = cat.id;
        persistState();
        renderCaisse();
      });
      wrap.appendChild(btn);
    }
  }

  function renderProductsGrid(){
    const catId = App.state.selectedCategoryId || App.config.categories[0]?.id;
    const list = getActiveProductsByCategory(catId);
    const grid = $("#productsGrid");
    grid.innerHTML = "";

    if(!catId || list.length===0){
      grid.innerHTML = `<div class="muted">Aucun produit dans cette catégorie.</div>`;
      return;
    }

    for(const p of list){
      const q = cartQty(p.id);
      const el = document.createElement("div");
      el.className = "product";
      el.innerHTML = `
        <div class="head">
          <div>
            <div class="name">${escapeHtml(p.name)}</div>
            <div class="muted small" style="margin-top:3px">1 ticket par unité</div>
          </div>
          <div class="price">${eur(p.price)}</div>
        </div>
        <div class="qty">
          <button class="btn btn-icon" data-act="minus" data-id="${p.id}" type="button">−</button>
          <div class="count">${q}</div>
          <button class="btn btn-icon primary" data-act="plus" data-id="${p.id}" type="button">+</button>
        </div>
      `;
      grid.appendChild(el);
    }

    $$("button[data-act]", grid).forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        const curr = cartQty(id);
        setCartQty(id, act==="plus" ? curr+1 : curr-1);
      });
    });
  }

  function renderCart(){
    const { lines, total, totalItems } = computeCartLines();

    const empty = $("#cartEmpty");
    const wrap = $("#cartTableWrap");
    const tbody = $("#cartTbody");
    tbody.innerHTML = "";

    if(lines.length===0){
      empty.classList.remove("hidden");
      wrap.classList.add("hidden");
    }else{
      empty.classList.add("hidden");
      wrap.classList.remove("hidden");
      for(const ln of lines){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(ln.name)}</td>
          <td class="right" style="font-family:var(--mono);font-weight:800">${ln.qty}</td>
          <td class="right" style="font-family:var(--mono)">${eur(ln.price)}</td>
          <td class="right" style="font-family:var(--mono);font-weight:900">${eur(ln.sub)}</td>
        `;
        tbody.appendChild(tr);
      }
    }

    $("#totalBig").textContent = eur(total);
    $("#totalTickets").textContent = `${totalItems} ticket${totalItems>1?"s":""}`;

    // Mobile bar
    $("#mobileTotal").textContent = eur(total);
    $("#mobileTickets").textContent = `${totalItems} ticket${totalItems>1?"s":""}`;

    $("#btnValidate").disabled = (lines.length===0);
    $("#btnClear").disabled = (lines.length===0);
    $("#btnValidateMobile").disabled = (lines.length===0);
    $("#btnClearMobile").disabled = (lines.length===0);
  }

  function renderCaisse(){
    if(!requireLogin()) return;
    refreshTopbar();
    renderCategoryTabs();
    renderProductsGrid();
    renderCart();
  }

  // --------- Orders / Tickets ---------
  function nextOrderNumber(caisse){
    const n = Number(App.counters[caisse]||1);
    return `${caisse}-${pad4(n)}`;
  }
  function incrementCounter(caisse){
    App.counters[caisse] = Number(App.counters[caisse]||1) + 1;
    saveLS(LS.counters, App.counters);
  }

  function buildTicketsHTML(order){
    const cfg = App.config.event;
    const eventDate = formatEventDate(cfg.eventDate);
    const logo = cfg.logoDataUrl;

    // 1 ticket par unité
    const units = [];
    for(const line of order.lines){
      for(let i=0;i<line.qty;i++){
        units.push({ name: line.name, price: line.price });
      }
    }

    return units.map((u, idx)=>{
      const logoHtml = logo ? `<img class="t-logo" src="${logo}" alt="Logo" />` : "";
      return `
        <div class="ticket">
          ${logoHtml}
          <div class="t-center t-event">${escapeHtml(cfg.orgName || "")}</div>
          <div class="t-center t-event">${escapeHtml(cfg.eventName || "")}</div>
          <div class="t-center t-date">${escapeHtml(eventDate || "")}</div>
          <div class="t-hr"></div>

          <div class="t-center t-product">${escapeHtml(u.name)}</div>

          <div class="t-hr"></div>
          <div class="t-meta">
            <div><b>Commande</b> : ${escapeHtml(order.orderNo)} (${idx+1}/${units.length})</div>
            <div><b>Date</b> : ${escapeHtml(formatDateTimeFR(order.createdAt))}</div>
            <div><b>Caisse</b> : ${escapeHtml(order.caisse)}</div>
            <div class="t-price"><b>Prix</b> : ${eur(u.price)}</div>
          </div>

          <div class="t-hr"></div>
          <div class="t-center t-message">${escapeHtml(cfg.message || "")}</div>
        </div>
      `;
    }).join("");
  }

  async function printOrderTickets(order){
    const area = $("#printArea");
    area.innerHTML = buildTicketsHTML(order);
    await new Promise(r=>setTimeout(r, 200));
    window.print();
    setTimeout(()=> area.innerHTML="", 500);
  }

  async function validateOrder(){
    if(!requireLogin()) return;

    const caisse = App.session.caisse || "C1";
    const { lines, total, totalItems } = computeCartLines();
    if(lines.length===0) return;

    const orderNo = nextOrderNumber(caisse);
    const createdAt = nowISO();

    // Snapshot prix au moment de la vente
    const order = {
      id: genId("o"),
      orderNo,
      caisse,
      createdAt,
      lines: lines.map(l => ({
        productId: l.productId,
        name: l.name,
        price: l.price,
        qty: l.qty,
        sub: l.sub
      })),
      total,
      totalItems
    };

    // Enregistre
    App.orders.push(order);
    saveLS(LS.orders, App.orders);

    // Compteur ++
    incrementCounter(caisse);

    // Impression (la commande reste enregistrée même si impression annulée)
    try{
      await printOrderTickets(order);
      toast(`Commande ${orderNo} validée + impression lancée.`, "ok");
    }catch(e){
      console.error(e);
      toast(`Commande ${orderNo} enregistrée, impression impossible.`, "warn");
    }

    // Client suivant
    clearCart();
    refreshTopbar();
  }

  // --------- Stats ---------
  function computeStats(){
    const orders = App.orders || [];
    let caTotal = 0;
    let nbOrders = orders.length;
    let nbItems = 0;

    const byCaisse = {
      C1:{orders:0, ca:0, items:0},
      C2:{orders:0, ca:0, items:0}
    };

    const byProduct = new Map(); // name -> {qty, ca}
    for(const o of orders){
      caTotal += Number(o.total||0);
      nbItems += Number(o.totalItems||0);

      const c = o.caisse || "C1";
      if(!byCaisse[c]) byCaisse[c] = {orders:0, ca:0, items:0};
      byCaisse[c].orders += 1;
      byCaisse[c].ca += Number(o.total||0);
      byCaisse[c].items += Number(o.totalItems||0);

      for(const ln of (o.lines||[])){
        const key = ln.name;
        const rec = byProduct.get(key) || { qty:0, ca:0 };
        rec.qty += Number(ln.qty||0);
        rec.ca += Number(ln.sub||0);
        byProduct.set(key, rec);
      }
    }

    const byProductArr = Array.from(byProduct.entries())
      .map(([name,rec])=>({name, qty:rec.qty, ca:rec.ca}))
      .sort((a,b)=> b.ca - a.ca);

    return { caTotal, nbOrders, nbItems, byCaisse, byProductArr };
  }

  function renderStats(){
    if(!requireLogin()) return;
    refreshTopbar();

    const st = computeStats();
    $("#kpiGrid").innerHTML = `
      <div class="box">
        <div class="muted">Chiffre d'affaires total</div>
        <div class="val">${eur(st.caTotal)}</div>
      </div>
      <div class="box">
        <div class="muted">Nombre de commandes</div>
        <div class="val">${st.nbOrders}</div>
      </div>
      <div class="box">
        <div class="muted">Consommations (tickets)</div>
        <div class="val">${st.nbItems}</div>
      </div>
      <div class="box">
        <div class="muted">CA par caisse</div>
        <div class="val" style="font-size:16px">
          C1: ${eur(st.byCaisse.C1?.ca||0)}<br/>
          C2: ${eur(st.byCaisse.C2?.ca||0)}
        </div>
      </div>
    `;

    const productChart = $("#productChart");
    const topProducts = st.byProductArr.slice(0, 8);
    const maxProductCA = Math.max(...topProducts.map(product => product.ca), 0);
    productChart.innerHTML = topProducts.length ? topProducts.map((product, index) => {
      const width = maxProductCA ? Math.max(3, product.ca / maxProductCA * 100) : 0;
      return `
        <div class="bar-row">
          <div class="bar-label" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</div>
          <div class="bar-track"><span class="bar-fill tone-${index % 4}" style="width:${width}%"></span></div>
          <div class="bar-value">${eur(product.ca)}</div>
        </div>
      `;
    }).join("") : `<div class="chart-empty">Aucune vente pour le moment.</div>`;

    const caisseChart = $("#caisseChart");
    const caisseValues = ["C1", "C2"].map(caisse => ({
      caisse,
      ca: Number(st.byCaisse[caisse]?.ca || 0)
    }));
    const maxCaisseCA = Math.max(...caisseValues.map(caisse => caisse.ca), 0);
    caisseChart.innerHTML = caisseValues.map((caisse, index) => {
      const width = maxCaisseCA ? Math.max(caisse.ca ? 3 : 0, caisse.ca / maxCaisseCA * 100) : 0;
      return `
        <div class="bar-row caisse-bar-row">
          <div class="bar-label">${caisse.caisse}</div>
          <div class="bar-track"><span class="bar-fill tone-${index + 1}" style="width:${width}%"></span></div>
          <div class="bar-value">${eur(caisse.ca)}</div>
        </div>
      `;
    }).join("");

    // Produit
    const tbodyP = $("#tbodyByProduct");
    tbodyP.innerHTML = "";
    if(st.byProductArr.length===0){
      tbodyP.innerHTML = `<tr><td colspan="3" class="muted">Aucune vente pour le moment.</td></tr>`;
    }else{
      for(const r of st.byProductArr){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><b>${escapeHtml(r.name)}</b></td>
          <td class="right" style="font-family:var(--mono);font-weight:900">${r.qty}</td>
          <td class="right" style="font-family:var(--mono);font-weight:900">${eur(r.ca)}</td>
        `;
        tbodyP.appendChild(tr);
      }
    }

    // Caisse
    const tbodyC = $("#tbodyByCaisse");
    tbodyC.innerHTML = "";
    ["C1","C2"].forEach(c=>{
      const r = st.byCaisse[c] || {orders:0,items:0,ca:0};
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${c}</b></td>
        <td class="right" style="font-family:var(--mono);font-weight:900">${r.orders}</td>
        <td class="right" style="font-family:var(--mono);font-weight:900">${r.items}</td>
        <td class="right" style="font-family:var(--mono);font-weight:900">${eur(r.ca)}</td>
      `;
      tbodyC.appendChild(tr);
    });

    // Orders list
    const tbodyO = $("#ordersTbody");
    tbodyO.innerHTML = "";
    const orders = (App.orders||[]).slice().sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||""));
    if(orders.length===0){
      tbodyO.innerHTML = `<tr><td colspan="5" class="muted">Aucune commande enregistrée.</td></tr>`;
    }else{
      for(const o of orders){
        const details = (o.lines||[]).map(ln=>`${ln.qty}× ${ln.name}`).join(", ");
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="font-family:var(--mono);font-weight:900">${escapeHtml(o.orderNo)}</td>
          <td>${escapeHtml(formatDateTimeFR(o.createdAt))}</td>
          <td><span class="badge">${escapeHtml(o.caisse)}</span></td>
          <td>${escapeHtml(details)}</td>
          <td class="right" style="font-family:var(--mono);font-weight:900">${eur(o.total)}</td>
        `;
        tbodyO.appendChild(tr);
      }
    }
  }

  function exportCSV(){
    const header = ["orderNo","createdAt","caisse","total","totalItems","details"];
    const rows = [header.join(";")];
    for(const o of (App.orders||[])){
      const details = (o.lines||[]).map(ln=>`${ln.qty}x ${ln.name} @${ln.price}`).join(" | ");
      const row = [
        o.orderNo,
        o.createdAt,
        o.caisse,
        (Number(o.total||0).toFixed(2)).replace(".",","),
        o.totalItems,
        `"${String(details).replaceAll('"','""')}"`
      ];
      rows.push(row.join(";"));
    }
    downloadBlob("export-commandes.csv", new Blob([rows.join("\n")], {type:"text/csv;charset=utf-8"}));
    toast("CSV exporté.", "ok");
  }

  function backupJSON(){
    const data = {
      version: 1,
      exportedAt: nowISO(),
      password: loadLS(LS.password, App.password),
      config: loadLS(LS.config, App.config),
      orders: loadLS(LS.orders, App.orders),
      counters: loadLS(LS.counters, App.counters),
      session: loadLS(LS.session, App.session),
      state: loadLS(LS.state, App.state)
    };
    downloadBlob("backup-caisse-asso.json", new Blob([JSON.stringify(data,null,2)], {type:"application/json"}));
    toast("Sauvegarde JSON téléchargée.", "ok");
  }

  async function restoreJSON(file){
    const text = await file.text();
    const data = safeParse(text, null);
    if(!data || typeof data!=="object"){ toast("Fichier JSON invalide.", "danger"); return; }
    if(!confirm("Restaurer cette sauvegarde ? Cela remplacera les données actuelles.")) return;

    if(data.password!==undefined) saveLS(LS.password, data.password);
    if(data.config) saveLS(LS.config, data.config);
    if(data.orders) saveLS(LS.orders, data.orders);
    if(data.counters) saveLS(LS.counters, data.counters);
    if(data.session) saveLS(LS.session, data.session);
    if(data.state) saveLS(LS.state, data.state);

    loadAll();
    toast("Restauration terminée.", "ok");
    if(App.session.loggedIn) setView(App.state.lastView || "caisse");
    else setView("login");
  }

  function wipeOrders(){
    if(!confirm("Vider toutes les commandes (statistiques) ? Cette action est irréversible.")) return;
    App.orders = [];
    saveLS(LS.orders, App.orders);
    toast("Commandes supprimées.", "ok");
    renderStats();
  }

  // --------- Admin ---------
  function renderAdmin(){
    if(!requireLogin()) return;
    refreshTopbar();

    // Config fields
    const ev = App.config.event;
    $("#cfgOrg").value = ev.orgName || "";
    $("#cfgEventName").value = ev.eventName || "";
    $("#cfgEventDate").value = ev.eventDate || "";
    $("#cfgMessage").value = ev.message || "";

    $("#cfgLogoPreview").src = ev.logoDataUrl || ("data:image/svg+xml;base64," + btoa(
      "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='80'><rect width='100%' height='100%' fill='#111'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#bbb' font-family='Arial' font-size='14'>Aucun logo</text></svg>"
    ));

    // Category selector
    const sel = $("#admCategory");
    sel.innerHTML = "";
    for(const c of (App.config.categories||[])){
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.icon ? c.icon+" " : ""}${c.name}`;
      sel.appendChild(opt);
    }

    // If editing, keep selection
    if(App.edit.categoryId) sel.value = App.edit.categoryId;
    else sel.value = App.config.categories[0]?.id || "";

    // Products table (all)
    const tbody = $("#productsTbody");
    tbody.innerHTML = "";
    const cats = (App.config.categories||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,"fr"));
    for(const cat of cats){
      const prods = (cat.products||[]).slice().sort((a,b)=>a.name.localeCompare(b.name,"fr"));
      for(const p of prods){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(cat.name)}</td>
          <td>
            <b>${escapeHtml(p.name)}</b>
            ${p.active===false ? `<div class="muted small">désactivé</div>` : ``}
          </td>
          <td class="right" style="font-family:var(--mono);font-weight:900">${eur(p.price)}</td>
          <td class="right">
            <button class="btn small" data-act="edit" data-cid="${cat.id}" data-id="${p.id}" type="button">Éditer</button>
            <button class="btn small" data-act="toggle" data-cid="${cat.id}" data-id="${p.id}" type="button">${p.active===false ? "Activer" : "Désactiver"}</button>
            <button class="btn small danger" data-act="del" data-cid="${cat.id}" data-id="${p.id}" type="button">Supprimer</button>
          </td>
        `;
        tbody.appendChild(tr);
      }
    }

    $$("button[data-act]", tbody).forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const act = btn.getAttribute("data-act");
        const cid = btn.getAttribute("data-cid");
        const pid = btn.getAttribute("data-id");
        const cat = App.config.categories.find(c=>c.id===cid);
        if(!cat) return;
        const p = cat.products.find(x=>x.id===pid);
        if(!p) return;

        if(act==="edit"){
          App.edit.productId = pid;
          App.edit.categoryId = cid;
          $("#admCategory").value = cid;
          $("#prodName").value = p.name;
          $("#prodPrice").value = Number(p.price||0).toFixed(2);
          updateAdminButtons();
          toast("Mode édition activé.", "info");
        }else if(act==="toggle"){
          p.active = (p.active===false) ? true : false;
          saveLS(LS.config, App.config);
          toast(p.active ? "Produit activé." : "Produit désactivé.", "ok");
          renderAdmin(); renderCaisse();
        }else if(act==="del"){
          if(!confirm(`Supprimer le produit "${p.name}" ?`)) return;
          // retire du panier
          delete App.state.cart[p.id];
          persistState();
          cat.products = cat.products.filter(x=>x.id!==pid);
          saveLS(LS.config, App.config);
          toast("Produit supprimé.", "ok");
          if(App.edit.productId===pid) cancelEditProduct();
          renderAdmin(); renderCaisse();
        }
      });
    });

    updateAdminButtons();
  }

  function updateAdminButtons(){
    const editing = !!App.edit.productId;
    $("#btnUpdateProduct").disabled = !editing;
    $("#btnCancelEdit").disabled = !editing;
    $("#btnAddProduct").disabled = editing;
  }

  function cancelEditProduct(){
    App.edit.productId = null;
    App.edit.categoryId = null;
    $("#prodName").value = "";
    $("#prodPrice").value = "";
    updateAdminButtons();
  }

  function addProduct(){
    const cid = $("#admCategory").value;
    const cat = App.config.categories.find(c=>c.id===cid);
    if(!cat){ toast("Catégorie invalide.", "warn"); return; }

    const name = ($("#prodName").value||"").trim();
    const price = Number($("#prodPrice").value);
    if(!name){ toast("Nom produit requis.", "warn"); return; }
    if(!(price>=0)){ toast("Prix invalide.", "warn"); return; }

    cat.products.push({ id: genId("p"), name, price: Math.round(price*100)/100, active:true });
    saveLS(LS.config, App.config);
    toast("Produit ajouté.", "ok");
    $("#prodName").value=""; $("#prodPrice").value="";
    renderAdmin(); renderCaisse();
  }

  function updateProduct(){
    const pid = App.edit.productId;
    const cid = App.edit.categoryId || $("#admCategory").value;
    const cat = App.config.categories.find(c=>c.id===cid);
    if(!cat){ toast("Catégorie invalide.", "warn"); return; }
    const p = cat.products.find(x=>x.id===pid);
    if(!p){ cancelEditProduct(); return; }

    const name = ($("#prodName").value||"").trim();
    const price = Number($("#prodPrice").value);
    if(!name){ toast("Nom produit requis.", "warn"); return; }
    if(!(price>=0)){ toast("Prix invalide.", "warn"); return; }

    p.name = name;
    p.price = Math.round(price*100)/100;
    saveLS(LS.config, App.config);

    toast("Produit mis à jour.", "ok");
    cancelEditProduct();
    renderAdmin(); renderCaisse();
  }

  function saveConfig(){
    const ev = App.config.event;
    ev.orgName = ($("#cfgOrg").value||"").trim();
    ev.eventName = ($("#cfgEventName").value||"").trim();
    ev.eventDate = $("#cfgEventDate").value || "";
    ev.message = ($("#cfgMessage").value||"").trim();
    saveLS(LS.config, App.config);
    toast("Paramètres enregistrés.", "ok");
    refreshTopbar();
  }

  function setPassword(newPass){
    saveLS(LS.password, newPass);
    App.password = newPass;
  }

  function changePassword(){
    const p = ($("#cfgNewPassword").value||"").trim();
    if(p.length<4){ toast("Mot de passe trop court (min 4).", "warn"); return; }
    setPassword(p);
    $("#cfgNewPassword").value="";
    toast("Mot de passe modifié.", "ok");
  }

  function removeLogo(){
    if(!confirm("Supprimer le logo ?")) return;
    App.config.event.logoDataUrl = "";
    saveLS(LS.config, App.config);
    renderAdmin();
    toast("Logo supprimé.", "ok");
  }

  function handleLogoFile(file){
    return new Promise((resolve,reject)=>{
      const reader = new FileReader();
      reader.onload = ()=> resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // --------- Login / logout / reset ---------
  function login(){
    const caisse = $("#loginCaisse").value;
    const pass = $("#loginPass").value;
    const expected = App.password;

    if(pass !== expected){
      toast("Mot de passe incorrect.", "danger");
      return;
    }
    App.session = { loggedIn:true, caisse };
    saveLS(LS.session, App.session);
    toast("Connexion OK.", "ok");
    setView(App.state.lastView && App.state.lastView!=="login" ? App.state.lastView : "caisse");
  }

  function logout(){
    if(!confirm("Se déconnecter ?")) return;
    App.session = { loggedIn:false, caisse: App.session?.caisse || "C1" };
    saveLS(LS.session, App.session);
    toast("Déconnecté.", "ok");
    setView("login");
  }

  function resetApp(){
    if(!confirm("Réinitialiser TOUTES les données (produits, commandes, mot de passe, paramètres, compteurs) ?\n\nAttention : irréversible.")) return;
    Object.values(LS).forEach(k => localStorage.removeItem(k));
    ensureDefaults();
    loadAll();
    toast("Application réinitialisée.", "ok");
    setView("login");
  }

  // --------- Events binding ---------
  function bindEvents(){
    // nav
    $("#navCaisse").addEventListener("click", ()=>{ if(requireLogin()) setView("caisse"); });
    $("#navStats").addEventListener("click", ()=>{ if(requireLogin()) setView("stats"); });
    $("#navAdmin").addEventListener("click", ()=>{ if(requireLogin()) setView("admin"); });
    $("#navLogout").addEventListener("click", logout);

    // login
    $("#btnLogin").addEventListener("click", login);
    $("#loginPass").addEventListener("keydown", (e)=>{ if(e.key==="Enter") login(); });
    $("#btnResetApp").addEventListener("click", resetApp);

    // caisse actions
    $("#btnClear").addEventListener("click", ()=>{
      if(!confirm("Vider la commande en cours ?")) return;
      clearCart();
      toast("Commande vidée.", "ok");
    });
    $("#btnValidate").addEventListener("click", ()=>{
      const { totalItems, total } = computeCartLines();
      if(!confirm(`Valider la commande (${totalItems} ticket(s)) pour ${eur(total)} ?`)) return;
      validateOrder();
    });

    // mobile
    $("#btnClearMobile").addEventListener("click", ()=>{
      if(!confirm("Vider la commande en cours ?")) return;
      clearCart();
      toast("Commande vidée.", "ok");
    });
    $("#btnValidateMobile").addEventListener("click", ()=>{
      const { totalItems, total } = computeCartLines();
      if(!confirm(`Valider la commande (${totalItems} ticket(s)) pour ${eur(total)} ?`)) return;
      validateOrder();
    });

    // stats
    $("#btnExportCSV").addEventListener("click", exportCSV);
    $("#btnWipeOrders").addEventListener("click", wipeOrders);
    $("#btnBackup").addEventListener("click", backupJSON);
    $("#btnRestore").addEventListener("click", ()=> $("#restoreFile").click());
    $("#restoreFile").addEventListener("change", async (e)=>{
      const file = e.target.files && e.target.files[0];
      if(file) await restoreJSON(file);
      e.target.value = "";
    });

    // admin config
    $("#btnSaveConfig").addEventListener("click", saveConfig);
    $("#btnChangePassword").addEventListener("click", changePassword);
    $("#btnRemoveLogo").addEventListener("click", removeLogo);
    $("#cfgLogoFile").addEventListener("change", async (e)=>{
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      if(file.size > 1024*1024*1.5){
        toast("Image trop volumineuse (max ~1,5 Mo).", "warn");
        e.target.value = "";
        return;
      }
      try{
        const dataUrl = await handleLogoFile(file);
        App.config.event.logoDataUrl = dataUrl;
        saveLS(LS.config, App.config);
        toast("Logo enregistré.", "ok");
        renderAdmin();
      }catch(err){
        console.error(err);
        toast("Erreur lecture logo.", "danger");
      }finally{
        e.target.value = "";
      }
    });

    // admin products
    $("#btnAddProduct").addEventListener("click", addProduct);
    $("#btnUpdateProduct").addEventListener("click", updateProduct);
    $("#btnCancelEdit").addEventListener("click", ()=>{
      cancelEditProduct();
      toast("Édition annulée.", "info");
      renderAdmin();
    });

    window.addEventListener("beforeunload", ()=> persistState());
  }

  // --------- Boot ---------
  function boot(){
    ensureDefaults();
    loadAll();
    bindEvents();

    // pré-sélection caisse sur login
    $("#loginCaisse").value = App.session?.caisse || "C1";

    refreshTopbar();

    if(App.session.loggedIn){
      setView(App.state.lastView && App.state.lastView!=="login" ? App.state.lastView : "caisse");
    }else{
      setView("login");
    }
  }

  boot();
})();
