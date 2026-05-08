const API_URL = "/api/players";
const DEFAULT_IMAGE =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 400">
      <defs>
        <linearGradient id="g" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#d7ece5"/>
          <stop offset="100%" stop-color="#eef6fb"/>
        </linearGradient>
      </defs>
      <rect width="320" height="400" fill="url(#g)"/>
      <circle cx="160" cy="125" r="54" fill="#7aa697"/>
      <path d="M78 320c16-63 60-98 82-98s66 35 82 98" fill="#7aa697"/>
    </svg>
  `);

const form = document.getElementById("playerForm");
const playerList = document.getElementById("playerList");
const resetButton = document.getElementById("resetButton");
const searchQuery = document.getElementById("searchQuery");
const maxAge = document.getElementById("maxAge");
const filterPosition = document.getElementById("filterPosition");
const filterTeam = document.getElementById("filterTeam");
const playerTemplate = document.getElementById("playerCardTemplate");
const totalPlayers = document.getElementById("totalPlayers");
const averageAge = document.getElementById("averageAge");
const lastUpdated = document.getElementById("lastUpdated");
const resultsCount = document.getElementById("resultsCount");
const tabButtons = [...document.querySelectorAll("[data-tab-target]")];
const tabPanels = [...document.querySelectorAll("[data-tab-panel]")];

let players = [];

form.addEventListener("submit", handleSubmit);
resetButton.addEventListener("click", resetForm);
searchQuery.addEventListener("input", render);
maxAge.addEventListener("input", render);
filterPosition.addEventListener("change", render);
filterTeam.addEventListener("change", render);
tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tabTarget));
});

setActiveTab("database");
loadPlayers();

async function loadPlayers() {
  playerList.innerHTML = '<div class="empty-state">Cargando jugadores...</div>';

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("No se pudo cargar la base de datos.");

    players = await response.json();
    render();
  } catch (error) {
    playerList.innerHTML = `
      <div class="empty-state">
        No se pudo conectar con la base de datos. Arranca el servidor con python3 server.py.
      </div>
    `;
    resultsCount.textContent = "Base de datos desconectada";
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const photoFile = document.getElementById("photo").files[0];
  const currentId = document.getElementById("playerId").value;
  const existing = players.find((player) => player.id === currentId);
  const photo = photoFile
    ? await fileToDataUrl(photoFile)
    : existing?.photo || DEFAULT_IMAGE;

  const player = {
    id: currentId || crypto.randomUUID(),
    firstName: getValue("firstName"),
    lastName: getValue("lastName"),
    birthYear: Number(getValue("birthYear")),
    team: getValue("team") || "Sin equipo",
    position: getValue("position"),
    besoccerUrl: getValue("besoccerUrl"),
    statsUpdatedAt: getValue("statsUpdatedAt"),
    photo,
    notes: getValue("notes"),
    stats: {
      matches: Number(getValue("matches") || 0),
      goals: Number(getValue("goals") || 0),
      assists: Number(getValue("assists") || 0),
      minutes: Number(getValue("minutes") || 0),
    },
    updatedAt: new Date().toISOString(),
  };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(player),
  });

  if (!response.ok) {
    resultsCount.textContent = "No se pudo guardar el jugador.";
    return;
  }

  players = currentId
    ? players.map((item) => (item.id === currentId ? player : item))
    : [player, ...players];

  resetForm();
  render();
  setActiveTab("database");
}

function render() {
  syncTeamFilter();

  const filtered = players.filter(matchesFilters);
  playerList.innerHTML = "";
  resultsCount.textContent = `${filtered.length} de ${players.length} jugadores`;

  if (!filtered.length) {
    playerList.innerHTML = `
      <div class="empty-state">
        No hay jugadores para este filtro. Añade uno nuevo o ajusta la búsqueda.
      </div>
    `;
  }

  filtered.forEach((player) => {
    const fragment = playerTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".player-card");

    fragment.querySelector(".player-photo").src = player.photo || DEFAULT_IMAGE;
    fragment.querySelector(".player-name").textContent =
      `${player.firstName} ${player.lastName}`.trim();
    fragment.querySelector(".player-team").textContent = player.team || "Sin equipo";
    fragment.querySelector(".position-badge").textContent = player.position || "Sin posición";

    const age = currentYear() - Number(player.birthYear || currentYear());
    fragment.querySelector(".player-meta").innerHTML = [
      createPill(`Edad: ${age}`),
      createPill(`Nacimiento: ${player.birthYear || "-"}`),
      createPill(`Actualizado: ${formatDate(player.statsUpdatedAt || player.updatedAt)}`),
    ].join("");

    fragment.querySelector(".player-stats").innerHTML = [
      createStat(`Partidos ${player.stats?.matches ?? 0}`),
      createStat(`Goles ${player.stats?.goals ?? 0}`),
      createStat(`Asistencias ${player.stats?.assists ?? 0}`),
      createStat(`Minutos ${player.stats?.minutes ?? 0}`),
    ].join("");

    fragment.querySelector(".player-notes").textContent =
      player.notes || "Sin observaciones.";

    const besoccerLink = fragment.querySelector(".besoccer-link");
    if (player.besoccerUrl) {
      besoccerLink.href = player.besoccerUrl;
    } else {
      besoccerLink.removeAttribute("href");
      besoccerLink.textContent = "Sin enlace BeSoccer";
      besoccerLink.style.pointerEvents = "none";
      besoccerLink.style.opacity = "0.5";
    }

    fragment.querySelector(".edit-button").addEventListener("click", () => {
      populateForm(player);
      setActiveTab("form");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    fragment.querySelector(".delete-button").addEventListener("click", async () => {
      const response = await fetch(`${API_URL}/${encodeURIComponent(player.id)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        resultsCount.textContent = "No se pudo eliminar el jugador.";
        return;
      }

      players = players.filter((item) => item.id !== player.id);
      render();
    });

    card.dataset.playerId = player.id;
    playerList.appendChild(fragment);
  });

  updateSummary();
}

function matchesFilters(player) {
  const query = normalizeText(searchQuery.value);
  const selectedPosition = filterPosition.value;
  const selectedTeam = filterTeam.value;
  const maxAgeValue = Number(maxAge.value);
  const age = currentYear() - Number(player.birthYear || currentYear());
  const searchableText = normalizeText(
    [
      player.firstName,
      player.lastName,
      player.position,
      player.team,
      player.birthYear,
      player.notes,
      player.stats?.matches,
      player.stats?.goals,
      player.stats?.assists,
      player.stats?.minutes,
    ].join(" ")
  );

  const matchesQuery =
    !query || query.split(/\s+/).every((term) => searchableText.includes(term));
  const matchesPosition = !selectedPosition || player.position === selectedPosition;
  const matchesTeam = !selectedTeam || player.team === selectedTeam;
  const matchesAge = !maxAgeValue || age <= maxAgeValue;

  return matchesQuery && matchesPosition && matchesTeam && matchesAge;
}

function syncTeamFilter() {
  const selectedTeam = filterTeam.value;
  const teams = [...new Set(players.map((player) => player.team).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));

  filterTeam.innerHTML = '<option value="">Todos</option>';

  teams.forEach((team) => {
    const option = document.createElement("option");
    option.value = team;
    option.textContent = team;
    filterTeam.appendChild(option);
  });

  filterTeam.value = teams.includes(selectedTeam) ? selectedTeam : "";
}

function populateForm(player) {
  document.getElementById("playerId").value = player.id;
  document.getElementById("firstName").value = player.firstName;
  document.getElementById("lastName").value = player.lastName;
  document.getElementById("birthYear").value = player.birthYear;
  document.getElementById("team").value = player.team;
  document.getElementById("position").value = player.position;
  document.getElementById("besoccerUrl").value = player.besoccerUrl || "";
  document.getElementById("statsUpdatedAt").value = player.statsUpdatedAt || "";
  document.getElementById("matches").value = player.stats?.matches ?? "";
  document.getElementById("goals").value = player.stats?.goals ?? "";
  document.getElementById("assists").value = player.stats?.assists ?? "";
  document.getElementById("minutes").value = player.stats?.minutes ?? "";
  document.getElementById("notes").value = player.notes || "";
  document.getElementById("photo").value = "";
}

function resetForm() {
  form.reset();
  document.getElementById("playerId").value = "";
}

function updateSummary() {
  totalPlayers.textContent = players.length;

  const ages = players.map((player) => currentYear() - Number(player.birthYear));
  const average = ages.length
    ? Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length)
    : 0;

  averageAge.textContent = average;

  const latest = players
    .map((player) => player.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  lastUpdated.textContent = latest ? formatDate(latest) : "-";
}

function createPill(text) {
  return `<span class="meta-pill">${text}</span>`;
}

function createStat(text) {
  return `<span class="stat-pill">${text}</span>`;
}

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getValue(id) {
  return document.getElementById(id).value.trim();
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function currentYear() {
  return new Date().getFullYear();
}

function setActiveTab(tabName) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === tabName;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tabPanel === tabName;
    panel.classList.toggle("is-active", isActive);
  });
}
