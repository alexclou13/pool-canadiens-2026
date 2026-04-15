import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, getDocs, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const config = window.FIREBASE_CONFIG;
const byId = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));

if (!config) {
  window.alert("Ajoute ta configuration Firebase dans firebase-config.js");
  throw new Error("Firebase non configuré");
}
byId("setupWarning").classList.add("hidden");

const app = initializeApp(config);
const db = getFirestore(app);

const ROOT = "pool_multi_series_canadiens_2026_live";
const SETTINGS_DOC = doc(db, ROOT, "settings");
const PARTICIPANTS_COL = collection(db, ROOT, "participants", "items");
const PREDICTIONS_COL = collection(db, ROOT, "predictions", "items");
const SCORES_COL = collection(db, ROOT, "scores", "items");

let state = {
  settings: {
    adminPassword: "1234",
    team1: "Canadiens de Montréal",
    team2: "Adversaire",
    matchDate: "",
    deadline: "",
    matchNumber: 1,
    predictionsPublished: false,
    registrationDeadline: "",
    paymentDeadline: "",
    archivedCounter: 0
  },
  participants: [],
  predictions: [],
  scores: [],
  session: { role: null, participantId: null }
};

async function ensureDefaults() {
  const snap = await getDoc(SETTINGS_DOC);
  if (!snap.exists()) {
    await setDoc(SETTINGS_DOC, state.settings);
  }
}

async function loadInitial() {
  await ensureDefaults();
  const settingsSnap = await getDoc(SETTINGS_DOC);
  state.settings = { ...state.settings, ...(settingsSnap.data() || {}) };

  onSnapshot(SETTINGS_DOC, (snap) => {
    if (snap.exists()) {
      state.settings = { ...state.settings, ...(snap.data() || {}) };
      renderApp();
    }
  });

  onSnapshot(query(PARTICIPANTS_COL, orderBy("name")), (snap) => {
    state.participants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderApp();
  });

  onSnapshot(PREDICTIONS_COL, (snap) => {
    state.predictions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderApp();
  });

  onSnapshot(SCORES_COL, (snap) => {
    state.scores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderApp();
  });
}

function formatDateOnly(value){
  if(!value) return "-";
  const d = new Date(value + "T00:00");
  return isNaN(d) ? value : d.toLocaleDateString("fr-CA", {year:"numeric", month:"2-digit", day:"2-digit"});
}
function formatDateTime(value){
  if(!value) return "-";
  const d = new Date(value);
  return isNaN(d) ? value : d.toLocaleString("fr-CA", {year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit"});
}
function currentDeadlinePassed(){
  if(!state.settings.deadline) return false;
  return new Date() > new Date(state.settings.deadline);
}
function registrationDeadlinePassed(){
  if(!state.settings.registrationDeadline) return false;
  return new Date() > new Date(state.settings.registrationDeadline);
}
function getCurrentParticipant(){
  return state.participants.find(p => p.id === state.session.participantId);
}

async function signupParticipant(){
  const name = byId("signupName").value.trim();
  const password = byId("signupPassword").value.trim();
  const msg = byId("signupMsg");

  if(registrationDeadlinePassed()){
    byId("registrationClosedBanner").classList.remove("hidden");
    msg.textContent = "Les inscriptions sont fermées.";
    return;
  }
  if(!name || !password){
    msg.textContent = "Entre ton nom et ton mot de passe.";
    return;
  }
  const exists = state.participants.some(p => p.name.toLowerCase() === name.toLowerCase());
  if(exists){
    msg.textContent = "Ce nom est déjà utilisé.";
    return;
  }
  const id = crypto.randomUUID();
  await setDoc(doc(PARTICIPANTS_COL, id), {
    name, password, paid: false, totalPoints: 0, status: "pending"
  });
  byId("signupName").value = "";
  byId("signupPassword").value = "";
  msg.textContent = "Inscription envoyée. Attends l’approbation de l’administrateur avant de te connecter.";
}

function renderLoginParticipants(){
  const sel = byId("loginParticipant");
  sel.innerHTML = "";
  if(state.participants.length === 0){
    sel.innerHTML = '<option value="">Aucun participant créé</option>';
    return;
  }
  sel.innerHTML = '<option value="">Choisir un participant</option>' +
    state.participants.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
}

function loginParticipant(){
  const participantId = byId("loginParticipant").value;
  const password = byId("loginPassword").value;
  const p = state.participants.find(x => x.id === participantId);
  if(!p || p.password !== password){
    alert("Nom ou mot de passe incorrect.");
    return;
  }
  if(p.status !== "approved"){
    alert("Ton inscription est en attente d’approbation.");
    return;
  }
  state.session = { role:"participant", participantId:p.id };
  renderApp();
}

function loginAdmin(){
  const code = byId("adminPasswordLogin").value;
  if(code !== state.settings.adminPassword){
    alert("Code admin incorrect.");
    return;
  }
  state.session = { role:"admin", participantId:null };
  renderApp();
}
function logout(){
  state.session = { role:null, participantId:null };
  renderApp();
}

function updateCommonLabels(){
  byId("scoreTeam1Label").textContent = "Score exact " + state.settings.team1;
  byId("scoreTeam2Label").textContent = "Score exact " + state.settings.team2;
  byId("adminScore1Label").textContent = "Score exact " + state.settings.team1;
  byId("adminScore2Label").textContent = "Score exact " + state.settings.team2;

  const winnerSelect = byId("pickWinner");
  const officialWinner = byId("officialWinner");
  winnerSelect.innerHTML = "";
  officialWinner.innerHTML = "";
  [state.settings.team1, state.settings.team2].forEach(team => {
    winnerSelect.innerHTML += `<option value="${team}">${team}</option>`;
    officialWinner.innerHTML += `<option value="${team}">${team}</option>`;
  });

  byId("matchNumberLabel").textContent = state.settings.matchNumber || 1;
  byId("matchDateLabel").textContent = formatDateOnly(state.settings.matchDate);
  byId("deadlineLabel").textContent = formatDateTime(state.settings.deadline);
  byId("participantJackpotLabel").textContent = (state.participants.length * 10) + " $";
  byId("participantPredictionTitle").textContent = "Prédiction match # " + (state.settings.matchNumber || 1);
  byId("matchNumberBanner").textContent = state.settings.matchNumber || 1;
  byId("matchDateBanner").textContent = formatDateOnly(state.settings.matchDate);
  byId("deadlineBanner").textContent = formatDateTime(state.settings.deadline);
  byId("participantCount").textContent = state.participants.length;
  byId("jackpotLabel").textContent = (state.participants.length * 10) + " $";
  byId("adminMatchNumberLabel").textContent = state.settings.matchNumber || 1;
  byId("registrationDeadlineLabel").textContent = formatDateTime(state.settings.registrationDeadline);
  byId("paymentDeadlineLabel").textContent = state.settings.paymentDeadline ? formatDateOnly(state.settings.paymentDeadline) : "-";

  byId("adminTeam1").value = state.settings.team1 || "";
  byId("adminTeam2").value = state.settings.team2 || "";
  byId("adminMatchNumber").value = state.settings.matchNumber || 1;
  byId("adminMatchDate").value = state.settings.matchDate || "";
  byId("adminDeadline").value = state.settings.deadline || "";
  byId("adminPredictionsPublished").value = String(!!state.settings.predictionsPublished);
  byId("adminRegistrationDeadline").value = state.settings.registrationDeadline || "";
  byId("adminPaymentDeadline").value = state.settings.paymentDeadline || "";
}

async function saveMatchSettings(){
  await updateDoc(SETTINGS_DOC, {
    team1: byId("adminTeam1").value.trim() || "Canadiens de Montréal",
    team2: byId("adminTeam2").value.trim() || "Adversaire",
    matchNumber: Math.max(1, Number(byId("adminMatchNumber").value || 1)),
    matchDate: byId("adminMatchDate").value,
    deadline: byId("adminDeadline").value,
    predictionsPublished: byId("adminPredictionsPublished").value === "true",
    registrationDeadline: byId("adminRegistrationDeadline").value,
    paymentDeadline: byId("adminPaymentDeadline").value
  });
  alert("Paramètres du match sauvegardés.");
}

async function addParticipant(){
  const name = byId("newParticipantName").value.trim();
  const password = byId("newParticipantPassword").value.trim();
  const paid = byId("newParticipantPaid").value === "true";
  if(!name || !password){
    alert("Entre le nom et le mot de passe.");
    return;
  }
  const id = crypto.randomUUID();
  await setDoc(doc(PARTICIPANTS_COL, id), {
    name, password, paid, totalPoints: 0, status: "approved"
  });
  byId("newParticipantName").value = "";
  byId("newParticipantPassword").value = "";
}

async function approveParticipant(id){
  await updateDoc(doc(PARTICIPANTS_COL, id), { status: "approved" });
}
async function rejectParticipant(id){
  await deleteDoc(doc(PARTICIPANTS_COL, id));
}
async function togglePaid(id){
  const p = state.participants.find(x => x.id === id);
  if(!p) return;
  await updateDoc(doc(PARTICIPANTS_COL, id), { paid: !p.paid });
}
async function deleteParticipant(id){
  if(!confirm("Supprimer ce participant ?")) return;
  await deleteDoc(doc(PARTICIPANTS_COL, id));
}
async function editParticipant(id){
  const p = state.participants.find(x => x.id === id);
  if(!p) return;
  const newName = prompt("Nom du participant :", p.name);
  if(newName === null) return;
  const newPwd = prompt("Mot de passe :", p.password);
  if(newPwd === null) return;
  const paid = confirm("Participant payé ? OK = Oui / Annuler = Non");
  await updateDoc(doc(PARTICIPANTS_COL, id), {
    name: newName.trim() || p.name,
    password: newPwd.trim() || p.password,
    paid
  });
}

async function savePrediction(){
  if(state.session.role !== "participant") return;
  if(!state.settings.predictionsPublished){
    byId("participantSaveMsg").textContent = "Les prédictions ne sont pas encore publiées par l’administrateur.";
    return;
  }
  if(currentDeadlinePassed()){
    byId("participantSaveMsg").textContent = "Les prédictions sont fermées.";
    return;
  }
  const p = getCurrentParticipant();
  if(!p) return;

  await setDoc(doc(PREDICTIONS_COL, p.id), {
    participantId: p.id,
    participantName: p.name,
    winner: byId("pickWinner").value.trim(),
    gwg: byId("pickGWG").value.trim(),
    score1: byId("pickScore1").value === "" ? "" : Number(byId("pickScore1").value),
    score2: byId("pickScore2").value === "" ? "" : Number(byId("pickScore2").value),
    savedAt: new Date().toISOString()
  });
  byId("participantSaveMsg").textContent = "Prédiction enregistrée.";
}

async function calculatePoints(){
  const officialWinner = byId("officialWinner").value.trim();
  const officialGWG = byId("officialGWG").value.trim().toLowerCase();
  const score1 = byId("officialScore1").value;
  const score2 = byId("officialScore2").value;
  if(score1 === "" || score2 === "" || !officialWinner){
    alert("Entre le résultat officiel complet.");
    return;
  }

  const batch = [];
  for (const p of state.participants) {
    const pred = state.predictions.find(x => x.participantId === p.id);
    let points = 0;
    let detail = { winner:0, exactScore:0, gwg:0 };
    if(pred){
      if((pred.winner || "").trim().toLowerCase() === officialWinner.toLowerCase()){ detail.winner = 1; points += 1; }
      if(Number(pred.score1) === Number(score1) && Number(pred.score2) === Number(score2)){ detail.exactScore = 2; points += 2; }
      if((pred.gwg || "").trim().toLowerCase() === officialGWG){ detail.gwg = 3; points += 3; }
    }
    batch.push(setDoc(doc(SCORES_COL, p.id), {
      participantId: p.id, participantName: p.name, points, detail
    }));
  }
  await Promise.all(batch);
  byId("calcMsg").textContent = "Points calculés pour le match en cours.";
}

async function archiveCurrentMatch(){
  if(state.scores.length === 0){
    alert("Calcule les points avant d’archiver.");
    return;
  }
  for (const s of state.scores) {
    const p = state.participants.find(x => x.id === s.participantId);
    if (p) {
      await updateDoc(doc(PARTICIPANTS_COL, p.id), { totalPoints: Number(p.totalPoints || 0) + Number(s.points || 0) });
    }
  }
  for (const p of state.predictions) await deleteDoc(doc(PREDICTIONS_COL, p.id));
  for (const s of state.scores) await deleteDoc(doc(SCORES_COL, s.id));
  byId("officialScore1").value = "";
  byId("officialScore2").value = "";
  byId("officialGWG").value = "";
  alert("Match archivé au classement cumulatif.");
}

async function changeAdminPassword(){
  const np = byId("newAdminPassword").value.trim();
  if(!np){ alert("Entre un nouveau code admin."); return; }
  await updateDoc(SETTINGS_DOC, { adminPassword: np });
  byId("newAdminPassword").value = "";
  alert("Code admin changé.");
}

function renderPendingParticipants(){
  const table = byId("pendingParticipantsTable");
  const rows = state.participants.filter(p => p.status === "pending").map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${p.paid ? '<span class="success">Payé</span>' : '<span class="danger-text">Non payé</span>'}</td>
      <td>
        <div class="row-actions">
          <button onclick="approveParticipant('${p.id}')">Approuver</button>
          <button class="secondary" onclick="togglePaid('${p.id}')">${p.paid ? 'Mettre non payé' : 'Mettre payé'}</button>
          <button class="secondary" onclick="rejectParticipant('${p.id}')">Refuser</button>
        </div>
      </td>
    </tr>`).join("");
  table.innerHTML = `<tr><th>Nom</th><th>Paiement</th><th>Action</th></tr>${rows || '<tr><td colspan="3" class="small">Aucune demande</td></tr>'}`;
}

function renderParticipantsTable(){
  const rows = state.participants.map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${p.status === "approved" ? '<span class="success">Approuvé</span>' : '<span class="danger-text">En attente</span>'}</td>
      <td>${escapeHtml(p.password)}</td>
      <td>${p.paid ? '<span class="success">Oui</span>' : '<span class="danger-text">Non</span>'}</td>
      <td>${Number(p.totalPoints || 0)}</td>
      <td><div class="row-actions">
        <button class="secondary" onclick="editParticipant('${p.id}')">Modifier</button>
        <button class="secondary" onclick="togglePaid('${p.id}')">${p.paid ? 'Mettre non payé' : 'Mettre payé'}</button>
        <button class="secondary" onclick="deleteParticipant('${p.id}')">Supprimer</button>
      </div></td>
    </tr>`).join("");
  byId("participantsTable").innerHTML = `<tr><th>Participant</th><th>Statut</th><th>Mot de passe</th><th>Payé</th><th>Points cumulés</th><th>Actions</th></tr>${rows || '<tr><td colspan="6" class="small">Aucun participant.</td></tr>'}`;
}

function renderPredictionsTable(){
  const rows = state.participants.map(p => {
    const pred = state.predictions.find(x => x.participantId === p.id);
    return `<tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${pred ? escapeHtml(pred.winner) : "-"}</td>
      <td>${pred && pred.score1 !== "" ? pred.score1 : "-"}</td>
      <td>${pred && pred.score2 !== "" ? pred.score2 : "-"}</td>
      <td>${pred ? escapeHtml(pred.gwg) : "-"}</td>
      <td>${pred ? formatDateTime(pred.savedAt) : "-"}</td>
      <td><button class="secondary" onclick="editPrediction('${p.id}')">Modifier</button></td>
    </tr>`;
  }).join("");
  byId("predictionsTable").innerHTML = `<tr><th>Participant</th><th>Gagnant</th><th>${escapeHtml(state.settings.team1)}</th><th>${escapeHtml(state.settings.team2)}</th><th>But gagnant</th><th>Enregistré</th><th>Action</th></tr>${rows || '<tr><td colspan="7" class="small">Aucune prédiction.</td></tr>'}`;
}

async function editPrediction(participantId){
  const pred = state.predictions.find(x => x.participantId === participantId);
  const p = state.participants.find(x => x.id === participantId);
  if(!p) return;
  const base = pred || { winner: state.settings.team1, gwg: "", score1: "", score2: "" };
  const winner = prompt("Équipe gagnante :", base.winner); if(winner === null) return;
  const gwg = prompt("Marqueur du but gagnant :", base.gwg); if(gwg === null) return;
  const score1 = prompt("Score exact " + state.settings.team1 + " :", base.score1); if(score1 === null) return;
  const score2 = prompt("Score exact " + state.settings.team2 + " :", base.score2); if(score2 === null) return;
  await setDoc(doc(PREDICTIONS_COL, p.id), {
    participantId: p.id, participantName: p.name,
    winner: winner.trim(), gwg: gwg.trim(),
    score1: score1 === "" ? "" : Number(score1),
    score2: score2 === "" ? "" : Number(score2),
    savedAt: new Date().toISOString(),
    editedByAdmin: true
  });
}

function renderMatchStandings(){
  const rows = state.scores.slice().sort((a,b)=> b.points - a.points || a.participantName.localeCompare(b.participantName,"fr"))
    .map((s, idx) => `<tr><td>${idx+1}</td><td>${escapeHtml(s.participantName)}</td><td>${s.detail.winner}</td><td>${s.detail.exactScore}</td><td>${s.detail.gwg}</td><td><strong>${s.points}</strong></td></tr>`).join("");
  byId("matchStandingsTable").innerHTML = `<tr><th>#</th><th>Participant</th><th>Équipe gagnante</th><th>Score exact</th><th>But gagnant</th><th>Total match</th></tr>${rows || '<tr><td colspan="6" class="small">Aucun point calculé.</td></tr>'}`;
}

function renderSeriesStandings(tableId){
  const rows = state.participants.slice().sort((a,b)=> Number(b.totalPoints||0)-Number(a.totalPoints||0)||a.name.localeCompare(b.name,"fr"))
    .map((p, idx)=> `<tr><td>${idx+1}</td><td>${escapeHtml(p.name)}</td><td>${tableId==="seriesStandingsTable" ? (p.paid ? "Oui":"Non") : ""}</td><td><strong>${Number(p.totalPoints||0)}</strong></td></tr>`).join("");
  if(tableId==="seriesStandingsTable"){
    byId(tableId).innerHTML = `<tr><th>#</th><th>Participant</th><th>Payé</th><th>Points cumulés</th></tr>${rows || '<tr><td colspan="4" class="small">Aucun participant.</td></tr>'}`;
  } else {
    const rows2 = state.participants.slice().sort((a,b)=> Number(b.totalPoints||0)-Number(a.totalPoints||0)||a.name.localeCompare(b.name,"fr"))
      .map((p, idx)=> `<tr><td>${idx+1}</td><td>${escapeHtml(p.name)}</td><td><strong>${Number(p.totalPoints||0)}</strong></td></tr>`).join("");
    byId(tableId).innerHTML = `<tr><th>#</th><th>Participant</th><th>Points cumulés</th></tr>${rows2 || '<tr><td colspan="3" class="small">Aucun participant.</td></tr>'}`;
  }
}

function renderParticipantPredictions(){
  const rows = state.participants.map(p => {
    const pred = state.predictions.find(x => x.participantId === p.id);
    return `<tr><td>${escapeHtml(p.name)}</td><td>${pred ? escapeHtml(pred.winner) : "-"}</td><td>${pred && pred.score1 !== "" ? pred.score1 : "-"}</td><td>${pred && pred.score2 !== "" ? pred.score2 : "-"}</td><td>${pred ? escapeHtml(pred.gwg) : "-"}</td></tr>`;
  }).join("");
  byId("participantPredictionsTable").innerHTML = `<tr><th>Participant</th><th>Gagnant</th><th>${escapeHtml(state.settings.team1)}</th><th>${escapeHtml(state.settings.team2)}</th><th>But gagnant</th></tr>${rows || '<tr><td colspan="5" class="small">Aucune prédiction.</td></tr>'}`;
}

function fillParticipantView(){
  const p = getCurrentParticipant();
  if(!p) return;
  byId("whoami").textContent = p.name;
  byId("participantPaidLabel").textContent = p.paid ? "Payé" : "Non payé";
  byId("paymentInfoBanner").classList.toggle("hidden", !!p.paid);

  const pred = state.predictions.find(x => x.participantId === p.id);
  if(pred){
    byId("pickWinner").value = pred.winner || state.settings.team1;
    byId("pickGWG").value = pred.gwg || "";
    byId("pickScore1").value = pred.score1 ?? "";
    byId("pickScore2").value = pred.score2 ?? "";
  } else {
    byId("pickWinner").value = state.settings.team1;
    byId("pickGWG").value = "";
    byId("pickScore1").value = "";
    byId("pickScore2").value = "";
  }

  const published = !!state.settings.predictionsPublished;
  const locked = currentDeadlinePassed();
  byId("predictionPublishBanner").classList.toggle("hidden", published);
  byId("predictionLockedBanner").classList.toggle("hidden", !locked);
  const disabled = (!published) || locked;
  ["pickWinner","pickGWG","pickScore1","pickScore2"].forEach(id => byId(id).disabled = disabled);

  byId("participantAfterPrediction").classList.toggle("hidden", !pred);
  renderSeriesStandings("participantSeriesStandingsTable");
  renderSeriesStandings("participantSeriesStandingsInlineTable");
  renderParticipantPredictions();
}

function renderApp(){
  renderLoginParticipants();
  updateCommonLabels();
  renderPendingParticipants();
  renderParticipantsTable();
  renderPredictionsTable();
  renderMatchStandings();
  renderSeriesStandings("seriesStandingsTable");

  const regClosed = registrationDeadlinePassed();
  byId("registrationClosedBanner").classList.toggle("hidden", !regClosed);
  ["signupName","signupPassword"].forEach(id => byId(id).disabled = regClosed);

  byId("loginView").classList.add("hidden");
  byId("participantView").classList.add("hidden");
  byId("adminView").classList.add("hidden");

  if(state.session.role === "participant"){
    fillParticipantView();
    byId("participantView").classList.remove("hidden");
  } else if(state.session.role === "admin"){
    byId("adminView").classList.remove("hidden");
  } else {
    byId("loginView").classList.remove("hidden");
  }
}

window.signupParticipant = signupParticipant;
window.loginParticipant = loginParticipant;
window.loginAdmin = loginAdmin;
window.logout = logout;
window.saveMatchSettings = saveMatchSettings;
window.addParticipant = addParticipant;
window.approveParticipant = approveParticipant;
window.rejectParticipant = rejectParticipant;
window.togglePaid = togglePaid;
window.deleteParticipant = deleteParticipant;
window.editParticipant = editParticipant;
window.savePrediction = savePrediction;
window.editPrediction = editPrediction;
window.calculatePoints = calculatePoints;
window.archiveCurrentMatch = archiveCurrentMatch;
window.changeAdminPassword = changeAdminPassword;

loadInitial();
