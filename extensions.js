/* Comores Express : extensions (à charger APRÈS les scripts existants de index.html).
   - Multi-sièges + date de départ (fonctionne aussi sans backend)
   - Si config.js contient la clé Supabase : comptes (code e-mail), rôles, trajets/billets partagés,
     temps réel, suivi GPS du chauffeur, notifications de retard, squelettes de chargement. */
(function () {
  'use strict';
  const CFG = window.COMORES_CONFIG || {};
  const CLOUD = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const plusJours = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
  const fmtDate = s => s.split('-').reverse().slice(0, 2).join('/');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const saveLocal = () => {
    localStorage.setItem('comores_trajets', JSON.stringify(trajets));
    localStorage.setItem('comores_billets', JSON.stringify(mesBillets));
  };

  function notif(msg) {
    let el = $('toastX');
    if (!el) {
      el = document.createElement('div'); el.id = 'toastX'; el.setAttribute('role', 'status');
      el.className = 'fixed bottom-16 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-4 py-2 rounded-lg shadow-lg z-[60] max-w-[90%] text-center';
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.display = 'block';
    clearTimeout(el._t); el._t = setTimeout(() => (el.style.display = 'none'), 4000);
  }
  async function alerteSysteme(msg) {
    notif(msg);
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification('Comores Express', { body: msg, icon: 'icons/icon-192.png', tag: 'statut' });
      }
    } catch (e) { /* ignoré */ }
  }

  /* ---------- Bannière hors-ligne ---------- */
  const ban = document.createElement('div');
  ban.className = 'hidden fixed top-0 inset-x-0 bg-yellow-400 text-gray-900 text-[11px] font-bold text-center py-1 z-[70]';
  ban.textContent = 'Mode hors ligne : données affichées = dernière synchronisation';
  document.body.appendChild(ban);
  const majReseau = () => ban.classList.toggle('hidden', navigator.onLine);
  addEventListener('online', () => { majReseau(); if (CLOUD && sb) chargerTrajets(); });
  addEventListener('offline', majReseau); majReseau();

  /* ====================== MULTI-SIÈGES + DATE ====================== */
  const sieges = new Set();
  let occupes = null;           // sièges pris pour la date choisie
  const nSel = () => Math.max(1, sieges.size);

  function peindre() {
    document.querySelectorAll('#grilleSieges button').forEach(btn => {
      const n = parseInt(btn.textContent.replace(/\D/g, ''), 10);
      const pris = occupes && occupes.has(n);
      btn.disabled = !!pris;
      btn.className = 'p-2 text-xs font-bold rounded-lg border transition ' + (pris
        ? 'bg-red-100 text-red-400 border-red-200 cursor-not-allowed'
        : sieges.has(n) ? 'bg-blue-600 text-white border-blue-600 shadow'
          : 'bg-white text-gray-700 border-gray-300 hover:border-blue-500');
      btn.onclick = pris ? null : () => window.choisirSiege(n, btn);
    });
    const info = $('infoSieges');
    if (info) info.textContent = sieges.size ? `${sieges.size} siège(s) : ${[...sieges].sort((a, b) => a - b).map(s => 'S' + s).join(', ')}` : 'Touchez un ou plusieurs sièges libres (6 max).';
    window.recalculerPrixModal();
  }
  async function rafraichirSieges() {
    if (!trajetEnCours) return;
    const date = $('dateDepart').value;
    if (CLOUD && sb) {
      try {
        const { data, error } = await sb.from('sieges_occupes').select('siege').eq('trajet_id', trajetEnCours.id).eq('date_depart', date);
        if (error) throw error;
        occupes = new Set(data.map(r => r.siege));
      } catch (e) { occupes = new Set(trajetEnCours.placesReservees); notif('Disponibilité non vérifiée (réseau).'); }
    } else occupes = new Set(trajetEnCours.placesReservees);
    [...sieges].forEach(s => occupes.has(s) && sieges.delete(s));
    peindre();
  }

  const _om = window.ouvrirModal;
  window.ouvrirModal = function (id) {
    sieges.clear(); occupes = null; _om(id);
    if (!$('dateDepart')) {
      $('grilleSieges').insertAdjacentHTML('beforebegin',
        '<div class="mb-2"><label class="block text-[11px] font-semibold text-gray-500 mb-1">Date du départ</label>' +
        '<input type="date" id="dateDepart" class="w-full border rounded-lg p-2 text-xs"><p id="infoSieges" class="text-[11px] text-gray-500 mt-1"></p></div>');
      $('dateDepart').addEventListener('change', rafraichirSieges);
    }
    const d = $('dateDepart'); d.min = today(); d.max = plusJours(60); d.value = today();
    rafraichirSieges();
  };
  window.choisirSiege = function (n) {
    if (occupes && occupes.has(n)) return;
    if (sieges.has(n)) sieges.delete(n);
    else if (sieges.size < 6) sieges.add(n); else notif('6 sièges maximum par réservation.');
    peindre();
  };
  const _rp = window.recalculerPrixModal;
  window.recalculerPrixModal = function () {
    _rp();
    const el = $('prixTotalFinal'); if (!el || !trajetEnCours) return;
    const m = el.innerText.match(/^[\d\s.,\u00a0\u202f]+/); if (!m) return;
    const unit = parseInt(m[0].replace(/\D/g, ''), 10), n = nSel();
    if (n > 1) el.innerText = `${(unit * n).toLocaleString()} KMF (${n} × ${unit.toLocaleString()})`;
  };

  const _vr = window.validerReservation;
  window.validerReservation = async function () {
    const t = trajetEnCours; if (!t) return;
    const liste = [...sieges].sort((a, b) => a - b);
    if (!liste.length) return notif('Choisissez au moins un siège.');
    const date = $('dateDepart').value;
    if (!date || date < today()) return notif('Choisissez une date valide.');
    const mode = document.querySelector('input[name="optionPaiement"]:checked').value;
    const phone = $('clientPhone').value.replace(/[\s-]/g, ''), ref = $('refTransaction').value.trim();
    if (mode === 'maintenant' && (!phone || !ref)) return notif('Renseignez le téléphone et la référence Mobile Money.');
    if (mode === 'maintenant' && !/^\d{7}$/.test(phone)) return notif('Numéro invalide (7 chiffres, ex : 3320000).');
    if (CLOUD) return reserverCloud(t, liste, date, mode, phone, ref);

    const _al = window.alert; window.alert = () => {}; let ok = 0;
    try {
      for (const s of liste) {
        const avant = mesBillets.length; siegeChoisi = s; trajetEnCours = t;
        _vr();
        if (mesBillets.length === avant) break;
        const b = mesBillets[0]; b.date = date; b.route = b.route.replace(/ · .*$/, '') + ' · ' + fmtDate(date); ok++;
      }
    } finally { window.alert = _al; }
    saveLocal(); if (typeof afficherMesBillets === 'function') afficherMesBillets();
    notif(ok ? `${ok} siège(s) réservé(s) pour le ${fmtDate(date)}.` : 'Réservation impossible : vérifiez vos informations.');
  };

  /* ====================== CLOUD (SUPABASE) ====================== */
  let sb = null, user = null, profil = null; const marqueurs = {};

  function lireScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  const mapTrajet = (r, occ) => ({
    id: r.id, chauffeurId: r.chauffeur_id, depart: r.depart, arrivee: r.arrivee, heure: r.heure, categorie: r.categorie,
    distanceKm: Number(r.distance_km) || 0, duree: r.duree || '', prix: r.prix, placesReservees: occ || [],
    statut: r.statut, retardMinutes: r.retard_minutes, motifRetard: r.motif_retard,
    chauffeur: { nom: r.chauffeur_nom || 'Chauffeur', tel: '', vehicule: r.vehicule || '—', plaque: r.plaque || '—', note: r.note ?? 5 }
  });
  const mapBillet = r => {
    const t = trajets.find(x => x.id === r.trajet_id);
    return {
      id: r.id, trajetId: r.trajet_id, date: r.date_depart,
      route: (t ? `${t.depart} → ${t.arrivee}` : 'Trajet #' + r.trajet_id) + ' · ' + fmtDate(r.date_depart),
      heure: t ? t.heure : '', prix: r.prix, siege: r.siege, paiement: r.paiement, statut: r.statut,
      bagage: r.bagage, escale: r.escale || '',
      chauffeur: t ? { ...t.chauffeur, tel: r.chauffeur_tel || '' } : { nom: '—', tel: r.chauffeur_tel || '', vehicule: '—', plaque: '—', note: 5 }
    };
  };

  function squelette() {
    const l = $('listeTrajets'); if (!l) return;
    l.innerHTML = '<div class="animate-pulse space-y-3">' + '<div class="h-24 bg-gray-200 rounded-xl"></div>'.repeat(3) + '</div>';
  }
  function erreurReseau() {
    const l = $('listeTrajets'); if (!l) return;
    l.innerHTML = '<div class="bg-white rounded-xl p-4 text-xs text-center text-gray-600">Impossible de charger les trajets, vérifiez votre connexion.' +
      '<br><button onclick="chargerTrajets()" class="mt-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold">Réessayer</button></div>';
  }
  window.chargerTrajets = chargerTrajets;
  async function chargerTrajets() {
    if (!sb) return;
    squelette();
    try {
      const [tr, oc] = await Promise.all([
        sb.from('trajets_publics').select('*').order('heure'),
        sb.from('sieges_occupes').select('trajet_id,siege').eq('date_depart', today())
      ]);
      if (tr.error) throw tr.error;
      const occ = {}; (oc.data || []).forEach(o => (occ[o.trajet_id] = occ[o.trajet_id] || []).push(o.siege));
      trajets = tr.data.map(r => mapTrajet(r, occ[r.id]));
      saveLocal(); afficherTrajets(trajets);
      if (user) await chargerBillets();
    } catch (e) {
      console.error(e);
      const cache = JSON.parse(localStorage.getItem('comores_trajets') || 'null');
      if (cache && cache.length) { trajets = cache; afficherTrajets(trajets); notif('Hors ligne : dernières données affichées.'); } else erreurReseau();
    }
  }
  async function chargerBillets() {
    const { data, error } = await sb.from('billets').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error);
    mesBillets = data.filter(b => !b.annule).map(mapBillet); saveLocal();
    if (typeof afficherMesBillets === 'function') afficherMesBillets();
  }

  async function reserverCloud(t, liste, date, mode, phone, ref) {
    if (!user) { notif('Connectez-vous pour réserver.'); return ouvrirAuth(); }
    const prov = (document.querySelector('input[name="providerMobile"]:checked') || {}).value || '';
    const { data, error } = await sb.rpc('reserver_places', {
      p_trajet: t.id, p_date: date, p_sieges: liste, p_mode: mode, p_provider: prov, p_telephone: phone, p_reference: ref,
      p_bagage: $('optionBagage').checked, p_escale: $('optionEscale').value || '',
      p_promo: ($('promoCode') && $('promoCode').value.trim()) || ''
    });
    if (error) { notif(error.message); return rafraichirSieges(); }
    mesBillets = data.map(mapBillet).concat(mesBillets); saveLocal();
    fermerModal(); afficherTrajets(trajets); afficherMesBillets();
    notif(`${data.length} siège(s) réservé(s) pour le ${fmtDate(date)}.` + (mode === 'maintenant' ? ' Paiement en cours de vérification.' : ''));
  }

  /* ---- Auth (code à usage unique par e-mail) ---- */
  function ouvrirAuth() {
    if (!$('authModal')) {
      document.body.insertAdjacentHTML('beforeend',
        '<div id="authModal" class="fixed inset-0 bg-black/60 hidden items-center justify-center p-4 z-[65]"><div class="bg-white rounded-2xl p-5 w-full max-w-sm text-xs space-y-3">' +
        '<div class="flex justify-between items-center"><h3 class="font-bold text-sm">Connexion</h3><button onclick="fermerAuth()" aria-label="Fermer" class="text-gray-400 text-lg">✕</button></div>' +
        '<div id="authEtape1" class="space-y-2"><p class="text-gray-500">Entrez votre e-mail : vous recevrez un code de connexion.</p>' +
        '<input id="authEmail" type="email" autocomplete="email" placeholder="vous@exemple.com" class="w-full border rounded-lg p-2">' +
        '<button onclick="authEnvoyer()" class="w-full bg-blue-600 text-white font-bold py-2 rounded-lg">Recevoir le code</button></div>' +
        '<div id="authEtape2" class="hidden space-y-2"><input id="authCode" inputmode="numeric" maxlength="10" placeholder="Code reçu" class="w-full border rounded-lg p-2 tracking-widest text-center">' +
        '<button onclick="authVerifier()" class="w-full bg-blue-600 text-white font-bold py-2 rounded-lg">Se connecter</button></div>' +
        '<div id="authProfil" class="hidden space-y-2"><input id="pfNom" placeholder="Nom complet" class="w-full border rounded-lg p-2">' +
        '<input id="pfTel" inputmode="numeric" placeholder="Téléphone (7 chiffres)" class="w-full border rounded-lg p-2">' +
        '<div id="pfChauf" class="hidden space-y-2"><input id="pfVeh" placeholder="Véhicule" class="w-full border rounded-lg p-2"><input id="pfPlaque" placeholder="Plaque" class="w-full border rounded-lg p-2"></div>' +
        '<button onclick="authProfilSauver()" class="w-full bg-green-600 text-white font-bold py-2 rounded-lg">Enregistrer</button>' +
        '<button onclick="authDeconnexion()" class="w-full border border-red-300 text-red-600 py-2 rounded-lg">Se déconnecter</button>' +
        '<button onclick="authSupprimer()" class="w-full text-[11px] text-gray-400 underline">Demander la suppression de mon compte</button></div>' +
        '</div></div>');
    }
    const modal = $('authModal');
    $('authEtape1').classList.toggle('hidden', !!user); $('authEtape2').classList.add('hidden');
    $('authProfil').classList.toggle('hidden', !user);
    if (user && profil) {
      $('pfNom').value = profil.nom || ''; $('pfTel').value = profil.telephone || '';
      $('pfChauf').classList.toggle('hidden', profil.role === 'passager');
      $('pfVeh').value = profil.vehicule || ''; $('pfPlaque').value = profil.plaque || '';
    }
    modal.classList.remove('hidden'); modal.classList.add('flex');
  }
  window.ouvrirAuth = ouvrirAuth;
  window.fermerAuth = () => { const m = $('authModal'); m.classList.add('hidden'); m.classList.remove('flex'); };
  window.authEnvoyer = async () => {
    const email = $('authEmail').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return notif('E-mail invalide.');
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) return notif(error.message);
    $('authEtape1').classList.add('hidden'); $('authEtape2').classList.remove('hidden'); notif('Code envoyé. Vérifiez vos e-mails.');
  };
  window.authVerifier = async () => {
    const { error } = await sb.auth.verifyOtp({ email: $('authEmail').value.trim(), token: $('authCode').value.trim(), type: 'email' });
    if (error) return notif('Code incorrect ou expiré.');
    notif('Connecté.');
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  };
  window.authProfilSauver = async () => {
    const tel = $('pfTel').value.replace(/[\s-]/g, '');
    if (tel && !/^\d{7}$/.test(tel)) return notif('Téléphone : 7 chiffres.');
    const maj = { nom: $('pfNom').value.trim(), telephone: tel };
    if (profil && profil.role !== 'passager') { maj.vehicule = $('pfVeh').value.trim(); maj.plaque = $('pfPlaque').value.trim(); }
    const { error } = await sb.from('profiles').update(maj).eq('id', user.id);
    if (error) return notif(error.message);
    profil = { ...profil, ...maj }; majBoutonCompte(); fermerAuth(); notif('Profil enregistré.');
  };
  window.authDeconnexion = async () => { await sb.auth.signOut(); window._adminOK = false; fermerAuth(); location.reload(); };
  window.authSupprimer = () => {
    const sujet = encodeURIComponent('Suppression de mon compte Comores Express');
    location.href = `mailto:${CFG.CONTACT_EMAIL || 'contact@exemple.com'}?subject=${sujet}&body=${encodeURIComponent('Compte : ' + (user && user.email))}`;
  };

  function majBoutonCompte() {
    const b = $('btnCompte'); if (!b) return;
    b.innerHTML = user ? `<i class="fa-solid fa-user"></i> ${esc((profil && profil.nom) || user.email.split('@')[0]).slice(0, 12)}` : '<i class="fa-solid fa-right-to-bracket"></i> Connexion';
  }
  async function majSession() {
    if (user) {
      const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
      profil = data || null;
      await chargerBillets();
      if (profil && !profil.nom) ouvrirAuth();
    } else { profil = null; }
    majBoutonCompte();
  }

  /* ---- Rôles & actions chauffeur ---- */
  const _tm = window.toggleModeAdmin;
  window.toggleModeAdmin = function () {
    if (!CLOUD) return _tm();
    if ($('vueAdmin').classList.contains('hidden')) {
      if (!user) { notif('Connectez-vous d\'abord.'); return ouvrirAuth(); }
      if (!profil || !['chauffeur', 'admin'].includes(profil.role)) return notif('Espace réservé aux chauffeurs validés. Contactez l\'administrateur.');
      window._adminOK = true;
    }
    _tm();
  };
  const pousserMesTrajets = async () => {
    for (const t of trajets.filter(x => x.chauffeurId === (user && user.id))) {
      const { error } = await sb.from('trajets').update({ statut: t.statut, retard_minutes: t.retardMinutes, motif_retard: t.motifRetard }).eq('id', t.id);
      if (error) notif('Mise à jour refusée : ' + error.message);
    }
  };
  ['signalerRetard', 'changerStatutTrajet'].forEach(nom => {
    const f = window[nom]; if (typeof f !== 'function') return;
    window[nom] = function () { const r = f.apply(this, arguments); if (CLOUD && user) setTimeout(pousserMesTrajets, 100); return r; };
  });
  const _ag = window.afficherGestionChauffeur;
  window.afficherGestionChauffeur = function () {
    if (!CLOUD || !user) return _ag();
    const tous = trajets; trajets = tous.filter(t => t.chauffeurId === user.id);
    try { _ag(); } finally { trajets = tous; }
  };
  const _at = window.ajouterTrajet;
  window.ajouterTrajet = async function (e) {
    if (!CLOUD) return _at(e);
    const avant = new Set(trajets.map(t => t.id)); _at(e);
    for (const t of trajets.filter(x => !avant.has(x.id))) {
      const { data, error } = await sb.from('trajets').insert({
        chauffeur_id: user.id, depart: t.depart, arrivee: t.arrivee, heure: t.heure, categorie: t.categorie,
        distance_km: t.distanceKm, duree: t.duree, prix: t.prix
      }).select('id').single();
      if (error) { notif('Publication refusée : ' + error.message); trajets = trajets.filter(x => x !== t); } else { t.id = data.id; t.chauffeurId = user.id; }
    }
    saveLocal(); afficherTrajets(trajets);
  };
  const _ab = window.annulerBillet;
  if (typeof _ab === 'function') window.annulerBillet = async function (id) {
    const avant = mesBillets.length; const r = _ab.apply(this, arguments);
    if (CLOUD && mesBillets.length < avant) {
      const { error } = await sb.rpc('annuler_billet', { p_id: id });
      if (error) notif(error.message); else chargerTrajets();
    }
    return r;
  };

  /* ---- Suivi GPS (chauffeur) + marqueurs (passagers) ---- */
  let watchId = null, dernierEnvoi = 0;
  function basculerGPS() {
    const btn = $('btnGPS');
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; btn.textContent = '📍 Partager ma position'; return notif('Partage arrêté.'); }
    const miens = trajets.filter(t => t.chauffeurId === user.id && t.statut === 'En cours');
    if (!miens.length) return notif('Aucun de vos trajets n\'est « En cours ».');
    if (!navigator.geolocation) return notif('GPS indisponible sur cet appareil.');
    watchId = navigator.geolocation.watchPosition(pos => {
      if (Date.now() - dernierEnvoi < 5000) return; dernierEnvoi = Date.now();
      miens.forEach(t => sb.from('positions').upsert({ trajet_id: t.id, lat: pos.coords.latitude, lng: pos.coords.longitude, vitesse: pos.coords.speed || 0, updated_at: new Date().toISOString() }));
    }, err => { notif('GPS : ' + err.message); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    btn.textContent = '⏹ Arrêter le partage'; notif('Position partagée avec vos passagers.');
  }
  function majMarqueur(p) {
    if (!p || typeof map === 'undefined' || !map || typeof L === 'undefined') return;
    const pos = [p.lat, p.lng];
    if (marqueurs[p.trajet_id]) marqueurs[p.trajet_id].setLatLng(pos);
    else marqueurs[p.trajet_id] = L.marker(pos, { icon: L.divIcon({ html: '<div style="font-size:24px">🚐</div>', className: '', iconSize: [28, 28] }) }).addTo(map).bindPopup('Votre véhicule');
    const info = $('carteInfo'); if (info) info.textContent = 'Véhicule en direct 🟢';
  }

  function abonnements() {
    sb.channel('rt-trajets').on('postgres_changes', { event: '*', schema: 'public', table: 'trajets' }, p => {
      const n = p.new, o = p.old;
      if (p.eventType === 'UPDATE' && mesBillets.some(b => b.trajetId === n.id) && (o.statut !== n.statut || o.retard_minutes !== n.retard_minutes)) {
        alerteSysteme(n.retard_minutes > 0 && n.statut === 'En retard'
          ? `Retard de ${n.retard_minutes} min sur ${n.depart} → ${n.arrivee}. ${n.motif_retard || ''}`
          : `Votre trajet ${n.depart} → ${n.arrivee} est maintenant : ${n.statut}`);
      }
      chargerTrajets();
    }).subscribe();
    sb.channel('rt-positions').on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, p => majMarqueur(p.new)).subscribe();
    sb.from('positions').select('*').then(r => (r.data || []).forEach(majMarqueur));
  }

  async function initCloud() {
    // Bouton compte dans l'en-tête
    const adm = $('btnModeAdmin');
    const w = document.createElement('div'); w.className = 'flex gap-2'; adm.parentNode.insertBefore(w, adm);
    w.insertAdjacentHTML('beforeend', '<button id="btnCompte" onclick="ouvrirAuth()" class="text-xs bg-blue-800 border border-blue-400 px-3 py-1.5 rounded-lg flex items-center gap-1.5"></button>');
    w.appendChild(adm);
    $('vueAdmin').insertAdjacentHTML('afterbegin', '<button id="btnGPS" class="w-full bg-green-600 text-white text-xs font-bold py-2 rounded-lg mb-3">📍 Partager ma position</button>');
    $('btnGPS').onclick = basculerGPS;
    majBoutonCompte();
    try {
      await lireScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js');
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data } = await sb.auth.getSession(); user = (data.session && data.session.user) || null;
      sb.auth.onAuthStateChange((ev, s) => { const avant = user && user.id; user = (s && s.user) || null; if ((user && user.id) !== avant) { majSession(); if (user && $('authModal')) fermerAuth(); } });
      await majSession(); await chargerTrajets(); abonnements();
    } catch (e) { console.error(e); notif('Service en ligne indisponible : mode hors ligne.'); }
  }
  if (CLOUD) initCloud();
})();
