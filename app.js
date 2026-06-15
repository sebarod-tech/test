const API_ROOT = "https://api.football-data.org/v4";
const COMPETITION = "WC";
const DISPLAY_TIME_ZONE = "America/Argentina/Buenos_Aires";
const LIVE_STATUSES = new Set(["IN_PLAY", "PAUSED"]);
const STORE_KEY = "mundial2026.settings";

const state = {
  token: "",
  season: "2026",
  proxy: "",
  matches: [],
  standings: [],
  teams: [],
  details: new Map(),
  selectedTab: "matches",
  search: "",
  status: "ALL",
  stage: "ALL",
  timer: null
};

const els = {
  tokenForm: document.querySelector("#tokenForm"),
  tokenInput: document.querySelector("#tokenInput"),
  seasonInput: document.querySelector("#seasonInput"),
  proxyInput: document.querySelector("#proxyInput"),
  refreshBtn: document.querySelector("#refreshBtn"),
  syncStatus: document.querySelector("#syncStatus"),
  tabs: document.querySelectorAll(".tabs button"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  stageFilter: document.querySelector("#stageFilter"),
  matchesPanel: document.querySelector("#matchesPanel"),
  livePanel: document.querySelector("#livePanel"),
  groupsPanel: document.querySelector("#groupsPanel"),
  phasesPanel: document.querySelector("#phasesPanel"),
  statsPanel: document.querySelector("#statsPanel"),
  matchesList: document.querySelector("#matchesList"),
  liveList: document.querySelector("#liveList"),
  groupsGrid: document.querySelector("#groupsGrid"),
  phaseBoard: document.querySelector("#phaseBoard"),
  statsGrid: document.querySelector("#statsGrid"),
  matchCount: document.querySelector("#matchCount"),
  groupsStatus: document.querySelector("#groupsStatus"),
  phasesStatus: document.querySelector("#phasesStatus"),
  totalMatches: document.querySelector("#totalMatches"),
  liveMatches: document.querySelector("#liveMatches"),
  finishedMatches: document.querySelector("#finishedMatches"),
  nextMatch: document.querySelector("#nextMatch"),
  dialog: document.querySelector("#matchDialog"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogStage: document.querySelector("#dialogStage"),
  dialogBody: document.querySelector("#dialogBody"),
  closeDialog: document.querySelector("#closeDialog"),
  emptyTemplate: document.querySelector("#emptyTemplate")
};

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  state.token = saved.token || "";
  state.season = saved.season || "2026";
  state.proxy = saved.proxy || "";
  els.tokenInput.value = state.token;
  els.seasonInput.value = state.season;
  els.proxyInput.value = state.proxy;
}

function saveSettings() {
  localStorage.setItem(STORE_KEY, JSON.stringify({
    token: state.token,
    season: state.season,
    proxy: state.proxy
  }));
}

function endpoint(path, params = {}) {
  const url = new URL(`${API_ROOT}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return state.proxy ? `${state.proxy.replace(/\/$/, "")}?url=${encodeURIComponent(url.href)}` : url.href;
}

async function api(path, params = {}) {
  if (!state.token && !state.proxy) {
    throw new Error("Ingresá un API token o una URL de proxy configurada con FOOTBALL_DATA_TOKEN.");
  }

  const headers = { "Accept": "application/json" };
  if (state.token) headers["X-Auth-Token"] = state.token;

  const response = await fetch(endpoint(path, params), {
    headers
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.message || `Error ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function setStatus(text, type = "idle") {
  const pulseClass = type === "live" ? "pulse live" : type === "error" ? "pulse error" : "pulse";
  els.syncStatus.innerHTML = `<span class="${pulseClass}"></span>${escapeHtml(text)}`;
}

async function refreshData(silent = false) {
  try {
    if (!silent) setStatus("Conectando...");
    const [matchesData, standingsData, teamsData] = await Promise.allSettled([
      api(`/competitions/${COMPETITION}/matches`, { season: state.season }),
      api(`/competitions/${COMPETITION}/standings`, { season: state.season }),
      api(`/competitions/${COMPETITION}/teams`, { season: state.season })
    ]);

    if (matchesData.status === "rejected") throw matchesData.reason;
    state.matches = matchesData.value.matches || [];
    state.standings = standingsData.status === "fulfilled" ? standingsData.value.standings || [] : [];
    state.teams = teamsData.status === "fulfilled" ? teamsData.value.teams || [] : [];

    await preloadLiveDetails();
    populateStageFilter();
    renderAll();
    const liveCount = state.matches.filter((match) => LIVE_STATUSES.has(match.status)).length;
    setStatus(liveCount ? `${liveCount} partido(s) en vivo` : "Datos actualizados", liveCount ? "live" : "idle");
  } catch (error) {
    setStatus(error.message, "error");
    renderAll();
  }
}

async function preloadLiveDetails() {
  const live = state.matches.filter((match) => LIVE_STATUSES.has(match.status));
  await Promise.allSettled(live.map((match) => loadMatchDetail(match.id)));
}

async function loadMatchDetail(matchId) {
  if (state.details.has(matchId)) return state.details.get(matchId);
  const detail = await api(`/matches/${matchId}`);
  state.details.set(matchId, detail);
  return detail;
}

function populateStageFilter() {
  const stages = [...new Set(state.matches.map((match) => match.stage).filter(Boolean))].sort();
  const current = els.stageFilter.value;
  els.stageFilter.innerHTML = `<option value="ALL">Todas</option>${stages.map((stage) => (
    `<option value="${escapeHtml(stage)}">${formatStage(stage)}</option>`
  )).join("")}`;
  els.stageFilter.value = stages.includes(current) ? current : "ALL";
}

function filteredMatches() {
  return state.matches.filter((match) => {
    const text = `${match.homeTeam?.name || ""} ${match.awayTeam?.name || ""} ${match.venue || ""} ${match.stage || ""} ${match.group || ""}`.toLowerCase();
    const matchesSearch = !state.search || text.includes(state.search.toLowerCase());
    const matchesStatus = state.status === "ALL" || match.status === state.status;
    const matchesStage = state.stage === "ALL" || match.stage === state.stage;
    return matchesSearch && matchesStatus && matchesStage;
  }).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
}

function renderAll() {
  renderSummary();
  renderMatches();
  renderLive();
  renderGroups();
  renderPhases();
  renderStats();
}

function renderSummary() {
  const live = state.matches.filter((match) => LIVE_STATUSES.has(match.status));
  const finished = state.matches.filter((match) => match.status === "FINISHED");
  const next = state.matches
    .filter((match) => new Date(match.utcDate) > new Date() && match.status !== "FINISHED")
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))[0];

  els.totalMatches.textContent = state.matches.length;
  els.liveMatches.textContent = live.length;
  els.finishedMatches.textContent = finished.length;
  els.nextMatch.textContent = next ? formatShortDate(next.utcDate) : "-";

  document.querySelector("#heroTotalMatches").textContent = state.matches.length;
  document.querySelector("#heroLiveMatches").textContent = live.length;
  document.querySelector("#heroNextMatch").textContent = next ? `${next.homeTeam?.name || "Local"} vs ${next.awayTeam?.name || "Visitante"}` : "Conectá datos";
}

function renderMatches() {
  const matches = filteredMatches();
  els.matchCount.textContent = `${matches.length} partido${matches.length === 1 ? "" : "s"}`;
  els.matchesList.innerHTML = matches.length ? matches.map(renderMatchCard).join("") : emptyState();
  bindMatchButtons(els.matchesList);
}

function renderLive() {
  const live = state.matches.filter((match) => LIVE_STATUSES.has(match.status));
  els.liveList.innerHTML = live.length ? live.map(renderMatchCard).join("") : emptyState("No hay partidos en curso ahora.", "Cuando football-data.org marque un partido como IN_PLAY o PAUSED, aparecerá acá con sus estadísticas.");
  bindMatchButtons(els.liveList);
}

function renderGroups() {
  if (!state.standings.length) {
    els.groupsStatus.textContent = "La API no devolvió tablas para esta temporada";
    els.groupsGrid.innerHTML = emptyState("Sin grupos disponibles.", "Aparecerán cuando football-data.org publique standings del Mundial 2026.");
    return;
  }

  els.groupsStatus.textContent = `${state.standings.length} grupo${state.standings.length === 1 ? "" : "s"}`;
  els.groupsGrid.innerHTML = state.standings.map((standing) => {
    const rows = (standing.table || []).map((row) => `
      <tr>
        <td>${row.position}</td>
        <td>${teamCell(row.team)}</td>
        <td>${row.playedGames ?? 0}</td>
        <td>${row.won ?? 0}</td>
        <td>${row.draw ?? 0}</td>
        <td>${row.lost ?? 0}</td>
        <td>${row.goalDifference ?? 0}</td>
        <td><strong>${row.points ?? 0}</strong></td>
      </tr>
    `).join("");

    return `
      <article class="group-card">
        <h4>${formatGroup(standing.group || standing.stage || "Grupo")}</h4>
        <table>
          <thead>
            <tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>Pts</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </article>
    `;
  }).join("");
}

function renderPhases() {
  const byStage = groupBy(state.matches, (match) => match.stage || "SIN_FASE");
  const stages = Object.entries(byStage).sort(([a], [b]) => stageOrder(a) - stageOrder(b));
  els.phasesStatus.textContent = `${stages.length} fase${stages.length === 1 ? "" : "s"}`;
  els.phaseBoard.innerHTML = stages.length ? stages.map(([stage, matches]) => `
    <article class="phase-card">
      <h4>${formatStage(stage)}</h4>
      ${matches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)).map(renderMatchCard).join("")}
    </article>
  `).join("") : emptyState();
  bindMatchButtons(els.phaseBoard);
}

function renderStats() {
  const finished = state.matches.filter((match) => match.status === "FINISHED");
  const goals = finished.reduce((sum, match) => sum + score(match, "home") + score(match, "away"), 0);
  const live = state.matches.filter((match) => LIVE_STATUSES.has(match.status)).length;
  const scheduled = state.matches.filter((match) => ["SCHEDULED", "TIMED"].includes(match.status)).length;
  const teams = new Set(state.matches.flatMap((match) => [match.homeTeam?.id, match.awayTeam?.id]).filter(Boolean)).size || state.teams.length;
  const statsFromDetails = [...state.details.values()].map((detail) => detail.match || detail).filter(Boolean);
  const shots = statsFromDetails.reduce((sum, match) => sum + statSum(match, "shots"), 0);
  const onTarget = statsFromDetails.reduce((sum, match) => sum + statSum(match, "shots_on_goal"), 0);

  const cards = [
    ["Goles", goals],
    ["Promedio de goles", finished.length ? (goals / finished.length).toFixed(2) : "-"],
    ["Equipos", teams || "-"],
    ["Programados", scheduled],
    ["En vivo", live],
    ["Finalizados", finished.length],
    ["Tiros registrados", shots || "-"],
    ["Tiros al arco", onTarget || "-"]
  ];

  els.statsGrid.innerHTML = cards.map(([label, value]) => `
    <article>
      <strong>${value}</strong>
      <p>${label}</p>
    </article>
  `).join("");
}

function renderMatchCard(match) {
  const isLive = LIVE_STATUSES.has(match.status);
  const isFinished = match.status === "FINISHED";
  const classes = ["match-card", isLive ? "live" : "", isFinished ? "finished" : ""].join(" ");
  const detail = state.details.get(match.id);
  const liveStats = detail ? renderMiniStats(detail.match || detail) : "";

  return `
    <article class="${classes}">
      <div class="match-meta">
        <span>${formatDate(match.utcDate)}</span>
        <span>${match.venue || formatGroup(match.group) || formatStage(match.stage)}</span>
      </div>
      <div class="team-stack">
        ${teamLine(match.homeTeam)}
        ${teamLine(match.awayTeam)}
        ${liveStats}
      </div>
      <div class="score-box">
        <div class="score-line"><span>${formatScore(match)}</span></div>
        <span class="badge ${isLive ? "live" : isFinished ? "finished" : ""}">${formatStatus(match.status)}</span>
        <button type="button" data-match-id="${match.id}">Detalle</button>
      </div>
    </article>
  `;
}

function renderMiniStats(match) {
  const homeStats = match.homeTeam?.statistics;
  const awayStats = match.awayTeam?.statistics;
  if (!homeStats && !awayStats) return "";
  const possession = valuePair(homeStats, awayStats, "ball_possession");
  const shots = valuePair(homeStats, awayStats, "shots");
  return `
    <div class="mini-stat">
      ${possession ? `<span class="badge">Posesión ${possession}</span>` : ""}
      ${shots ? `<span class="badge">Tiros ${shots}</span>` : ""}
    </div>
  `;
}

async function openMatch(matchId) {
  const fallback = state.matches.find((match) => match.id === Number(matchId));
  els.dialogTitle.textContent = `${fallback?.homeTeam?.name || "Local"} vs ${fallback?.awayTeam?.name || "Visitante"}`;
  els.dialogStage.textContent = fallback ? `${formatStage(fallback.stage)} · ${formatDate(fallback.utcDate)}` : "Detalle";
  els.dialogBody.innerHTML = `<div class="empty-state"><strong>Cargando detalle...</strong></div>`;
  els.dialog.showModal();

  try {
    const detail = await loadMatchDetail(matchId);
    const match = detail.match || detail;
    els.dialogTitle.textContent = `${match.homeTeam?.name || "Local"} vs ${match.awayTeam?.name || "Visitante"}`;
    els.dialogStage.textContent = `${formatStage(match.stage)} · ${formatDate(match.utcDate)}`;
    els.dialogBody.innerHTML = renderMatchDetail(match);
  } catch (error) {
    els.dialogBody.innerHTML = emptyState("No se pudo cargar el detalle.", error.message);
  }
}

function renderMatchDetail(match) {
  const home = match.homeTeam || {};
  const away = match.awayTeam || {};
  const events = [
    ...(match.goals || []).map((item) => ({ ...item, label: "Gol" })),
    ...(match.bookings || []).map((item) => ({ ...item, label: item.card || "Tarjeta" })),
    ...(match.substitutions || []).map((item) => ({ ...item, label: "Cambio" }))
  ].sort((a, b) => (a.minute || 0) - (b.minute || 0));

  return `
    <div class="match-card ${LIVE_STATUSES.has(match.status) ? "live" : match.status === "FINISHED" ? "finished" : ""}">
      <div class="match-meta">
        <span>${formatDate(match.utcDate)}</span>
        <span>${match.venue || "-"}</span>
      </div>
      <div class="team-stack">
        ${teamLine(home)}
        ${teamLine(away)}
      </div>
      <div class="score-box">
        <div class="score-line">${formatScore(match)}</div>
        <span class="badge">${formatStatus(match.status)}</span>
      </div>
    </div>
    ${renderStatBars(home.statistics, away.statistics)}
    <section>
      <h3>Eventos</h3>
      <div class="events-list">
        ${events.length ? events.map(renderEvent).join("") : `<div class="empty-state"><strong>Sin eventos publicados.</strong><p>La API todavía no devolvió goles, tarjetas o cambios para este partido.</p></div>`}
      </div>
    </section>
  `;
}

function renderStatBars(homeStats, awayStats) {
  if (!homeStats && !awayStats) {
    return emptyState("Sin estadísticas en vivo disponibles.", "Cuando football-data.org publique estadísticas del partido, aparecerán acá.");
  }

  const rows = [
    ["ball_possession", "Posesión", "%"],
    ["shots", "Tiros", ""],
    ["shots_on_goal", "Tiros al arco", ""],
    ["corner_kicks", "Córners", ""],
    ["fouls", "Faltas", ""],
    ["yellow_cards", "Amarillas", ""],
    ["offsides", "Offsides", ""],
    ["saves", "Atajadas", ""]
  ];

  return `
    <section>
      <h3>Estadísticas</h3>
      <div class="stat-bars">
        ${rows.map(([key, label, suffix]) => {
          const home = Number(homeStats?.[key] ?? 0);
          const away = Number(awayStats?.[key] ?? 0);
          const total = Math.max(home + away, 1);
          const width = key === "ball_possession" ? home : (home / total) * 100;
          return `
            <div class="stat-row">
              <div class="stat-label">
                <span>${home}${suffix}</span>
                <span>${label}</span>
                <span>${away}${suffix}</span>
              </div>
              <div class="bar"><span style="width:${Math.max(0, Math.min(100, width))}%"></span></div>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderEvent(event) {
  const minute = event.minute ? `${event.minute}'${event.injuryTime ? `+${event.injuryTime}` : ""}` : "-";
  const player = event.scorer?.name || event.player?.name || event.playerIn?.name || "Jugador";
  const team = event.team?.name || "";
  return `
    <div class="event-item">
      <strong>${minute} · ${escapeHtml(event.label)}</strong>
      <div>${escapeHtml(player)} ${team ? `· ${escapeHtml(team)}` : ""}</div>
    </div>
  `;
}

function bindMatchButtons(container) {
  container.querySelectorAll("[data-match-id]").forEach((button) => {
    button.addEventListener("click", () => openMatch(button.dataset.matchId));
  });
}

function teamLine(team = {}) {
  return `
    <div class="team-name">
      ${team.crest ? `<img class="crest" src="${team.crest}" alt="">` : `<span class="crest"></span>`}
      <span>${escapeHtml(team.name || "Por confirmar")}</span>
    </div>
  `;
}

function teamCell(team = {}) {
  return `
    <span class="team-name">
      ${team.crest ? `<img class="crest" src="${team.crest}" alt="">` : ""}
      <span>${escapeHtml(team.name || "Equipo")}</span>
    </span>
  `;
}

function score(match, side) {
  return Number(match.score?.fullTime?.[side] ?? match.score?.regularTime?.[side] ?? match.score?.halfTime?.[side] ?? 0);
}

function formatScore(match) {
  if (["SCHEDULED", "TIMED", "POSTPONED"].includes(match.status)) return "vs";
  return `${score(match, "home")} - ${score(match, "away")}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: DISPLAY_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: DISPLAY_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatStatus(status = "") {
  const labels = {
    SCHEDULED: "Programado",
    TIMED: "Con horario",
    IN_PLAY: "En juego",
    PAUSED: "Entretiempo",
    FINISHED: "Finalizado",
    POSTPONED: "Postergado",
    SUSPENDED: "Suspendido",
    CANCELED: "Cancelado"
  };
  return labels[status] || status.replaceAll("_", " ");
}

function formatStage(stage = "") {
  const labels = {
    GROUP_STAGE: "Fase de grupos",
    LAST_32: "Dieciseisavos",
    LAST_16: "Octavos de final",
    QUARTER_FINALS: "Cuartos de final",
    SEMI_FINALS: "Semifinales",
    THIRD_PLACE: "Tercer puesto",
    FINAL: "Final"
  };
  return labels[stage] || stage.replaceAll("_", " ").toLowerCase().replace(/^\w/, (char) => char.toUpperCase());
}

function formatGroup(group = "") {
  if (!group) return "";
  return group.replace("GROUP_", "Grupo ");
}

function stageOrder(stage) {
  const order = ["GROUP_STAGE", "LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"];
  const index = order.indexOf(stage);
  return index === -1 ? 99 : index;
}

function groupBy(items, selector) {
  return items.reduce((acc, item) => {
    const key = selector(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function valuePair(homeStats, awayStats, key) {
  const home = homeStats?.[key];
  const away = awayStats?.[key];
  if (home === undefined && away === undefined) return "";
  return `${home ?? 0}-${away ?? 0}`;
}

function statSum(match, key) {
  return Number(match.homeTeam?.statistics?.[key] || 0) + Number(match.awayTeam?.statistics?.[key] || 0);
}

function emptyState(title = "No hay datos para mostrar todavía.", copy = "Conectá la API o cambiá los filtros.") {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p></div>`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

els.tokenForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.token = els.tokenInput.value.trim();
  state.season = els.seasonInput.value.trim() || "2026";
  state.proxy = els.proxyInput.value.trim();
  saveSettings();
  refreshData();
});

els.refreshBtn.addEventListener("click", () => {
  state.token = els.tokenInput.value.trim();
  state.season = els.seasonInput.value.trim() || "2026";
  state.proxy = els.proxyInput.value.trim();
  saveSettings();
  refreshData();
});

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    selectTab(tab.dataset.tab);
  });
});

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => {
    selectTab(button.dataset.jump);
    document.querySelector(".tabs").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

function selectTab(tabName) {
  state.selectedTab = tabName;
  els.tabs.forEach((item) => item.classList.toggle("active", item.dataset.tab === tabName));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
  document.querySelector(`#${state.selectedTab}Panel`).classList.add("active");
}

els.searchInput.addEventListener("input", () => {
  state.search = els.searchInput.value;
  renderMatches();
});

els.statusFilter.addEventListener("change", () => {
  state.status = els.statusFilter.value;
  renderMatches();
});

els.stageFilter.addEventListener("change", () => {
  state.stage = els.stageFilter.value;
  renderMatches();
});

els.closeDialog.addEventListener("click", () => els.dialog.close());

loadSettings();
renderAll();
if (state.token) refreshData(true);

state.timer = setInterval(() => {
  if (state.token) refreshData(true);
}, 60000);
