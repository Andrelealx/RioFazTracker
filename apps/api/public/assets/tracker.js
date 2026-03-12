const state = {
  accessToken: localStorage.getItem("riofaz_access_token"),
  profile: null,
  routes: [],
  selectedRouteCode: null,
  autoRefresh: true,
  autoTimer: null,
  map: null,
  marker: null,
  polyline: null,
  watchId: null,
  sendTimer: null,
  latestPosition: null,
  sendingTick: false,
  lastSendAt: 0,
  lastLat: null,
  lastLng: null
};

const TRACKER_SEND_INTERVAL_MS = 3000;
const MAP_REFRESH_INTERVAL_MS = 3000;

const statusBanner = document.getElementById("statusBanner");
const adminBadge = document.getElementById("adminBadge");
const routeSelect = document.getElementById("routeSelect");
const routeList = document.getElementById("routeList");
const mapMeta = document.getElementById("mapMeta");
const logOutput = document.getElementById("logOutput");
const routeForm = document.getElementById("routeForm");
const routeCodeInput = document.getElementById("routeCodeInput");
const routeNameInput = document.getElementById("routeNameInput");
const routeNeighborhoodInput = document.getElementById("routeNeighborhoodInput");
const routeCityInput = document.getElementById("routeCityInput");
const routeUfInput = document.getElementById("routeUfInput");
const scheduleForm = document.getElementById("scheduleForm");
const scheduleAdminList = document.getElementById("scheduleAdminList");
const weekdayInput = document.getElementById("weekdayInput");
const timeStartInput = document.getElementById("timeStartInput");
const timeEndInput = document.getElementById("timeEndInput");
const clearRouteBtn = document.getElementById("clearRouteBtn");
const deleteRouteBtn = document.getElementById("deleteRouteBtn");
const startTrackerBtn = document.getElementById("startTrackerBtn");
const stopTrackerBtn = document.getElementById("stopTrackerBtn");

const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado"
];

function showStatus(message, type = "ok") {
  statusBanner.className = `status-banner ${type}`;
  statusBanner.textContent = message;
}

function clearStatus() {
  statusBanner.className = "status-banner";
  statusBanner.textContent = "";
}

function appendLog(message, payload) {
  const line = `[${new Date().toLocaleTimeString("pt-BR")}] ${message}${
    payload ? ` | ${JSON.stringify(payload)}` : ""
  }`;
  logOutput.textContent = `${line}\n${logOutput.textContent}`.trim();
}

function updateTrackerButtons() {
  const active = state.sendTimer !== null;
  if (startTrackerBtn) {
    startTrackerBtn.disabled = active;
  }
  if (stopTrackerBtn) {
    stopTrackerBtn.disabled = !active;
  }
}

function setAccessToken(token) {
  state.accessToken = token;
  if (token) {
    localStorage.setItem("riofaz_access_token", token);
  } else {
    localStorage.removeItem("riofaz_access_token");
  }
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const method = options.method || "GET";
  const auth = options.auth !== false;
  const retry = options.retry !== false;

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (auth && state.accessToken) {
    headers.Authorization = `Bearer ${state.accessToken}`;
  }

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 401 && auth && retry) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiRequest(path, { ...options, retry: false });
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && payload.message
        ? Array.isArray(payload.message)
          ? payload.message.join(", ")
          : payload.message
        : `Erro HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function refreshSession() {
  try {
    const session = await apiRequest("/auth/refresh", {
      method: "POST",
      auth: false,
      retry: false,
      body: {}
    });
    if (session?.accessToken) {
      setAccessToken(session.accessToken);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function ensureMap() {
  if (typeof window.L === "undefined") {
    showStatus("Mapa indisponivel: biblioteca Leaflet nao carregou. Recarregue a pagina.", "warn");
    appendLog("Leaflet nao carregado", {});
    return false;
  }

  if (state.map) {
    return true;
  }

  state.map = L.map("map").setView([-22.54, -42.99], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(state.map);
  return true;
}

function formatDate(value) {
  if (!value) {
    return "--";
  }
  return new Date(value).toLocaleString("pt-BR");
}

function normalizeRouteCode(value) {
  return (value || "").trim().toLowerCase();
}

function getSelectedRoute() {
  if (!state.selectedRouteCode) {
    return null;
  }
  return state.routes.find((route) => route.code === state.selectedRouteCode) || null;
}

function signalLabel(capturedAt) {
  if (!capturedAt) {
    return "Sem sinal";
  }
  const age = Math.floor((Date.now() - new Date(capturedAt).getTime()) / 1000);
  if (age <= 60) {
    return `Online (${age}s)`;
  }
  if (age <= 300) {
    return `Recente (${age}s)`;
  }
  return `Sem atualizacao (${Math.floor(age / 60)} min)`;
}

function buildNeighborhoodPayload() {
  const name = routeNeighborhoodInput.value.trim();
  const city = routeCityInput.value.trim();
  const uf = routeUfInput.value.trim().toUpperCase();

  const hasAny = Boolean(name || city || uf);
  const hasAll = Boolean(name && city && uf);
  if (hasAny && !hasAll) {
    throw new Error("Preencha bairro, cidade e UF para vincular a rota.");
  }

  if (!hasAll) {
    return undefined;
  }

  return { name, city, uf };
}

function fillRouteForm(route) {
  if (!route) {
    routeCodeInput.value = "";
    routeNameInput.value = "";
    routeNeighborhoodInput.value = "";
    routeCityInput.value = "";
    routeUfInput.value = "";
    renderScheduleAdminList(null);
    return;
  }

  routeCodeInput.value = route.code;
  routeNameInput.value = route.name;
  routeNeighborhoodInput.value = route.neighborhood?.name || "";
  routeCityInput.value = route.neighborhood?.city || "";
  routeUfInput.value = route.neighborhood?.uf || "";
  renderScheduleAdminList(route);
}

function renderScheduleAdminList(route) {
  scheduleAdminList.innerHTML = "";
  if (!route || !Array.isArray(route.schedules) || route.schedules.length === 0) {
    const item = document.createElement("li");
    item.className = "route-item";
    item.textContent = "Sem horarios cadastrados para a rota selecionada.";
    scheduleAdminList.appendChild(item);
    return;
  }

  const sorted = route.schedules.slice().sort((a, b) => a.weekday - b.weekday);
  for (const schedule of sorted) {
    const item = document.createElement("li");
    item.className = "route-item";

    const row = document.createElement("div");
    row.className = "schedule-row";

    const text = document.createElement("span");
    text.className = "schedule-text";
    text.textContent = `${WEEKDAY_LABELS[schedule.weekday] || `Dia ${schedule.weekday}`} | ${
      schedule.timeStart
    } - ${schedule.timeEnd}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "danger-link";
    removeButton.textContent = "Excluir";
    removeButton.addEventListener("click", () => {
      void deleteScheduleForRoute(route.code, schedule.weekday);
    });

    row.appendChild(text);
    row.appendChild(removeButton);
    item.appendChild(row);
    scheduleAdminList.appendChild(item);
  }
}

function renderRouteSelector() {
  routeSelect.innerHTML = "";

  if (state.routes.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Sem rotas cadastradas";
    routeSelect.appendChild(option);
    state.selectedRouteCode = null;
    return;
  }

  if (!state.selectedRouteCode || !state.routes.some((route) => route.code === state.selectedRouteCode)) {
    state.selectedRouteCode = state.routes[0].code;
  }

  for (const route of state.routes) {
    const option = document.createElement("option");
    option.value = route.code;
    option.textContent = `${route.code} - ${route.name}`;
    option.selected = route.code === state.selectedRouteCode;
    routeSelect.appendChild(option);
  }
}

function renderRouteList() {
  routeList.innerHTML = "";
  if (state.routes.length === 0) {
    const item = document.createElement("li");
    item.className = "route-item";
    item.textContent = "Sem rotas cadastradas no sistema.";
    routeList.appendChild(item);
    return;
  }

  for (const route of state.routes) {
    const item = document.createElement("li");
    item.className = `route-item${route.code === state.selectedRouteCode ? " active" : ""}`;
    item.dataset.routeCode = route.code;

    const title = document.createElement("div");
    title.className = "route-title";
    title.textContent = `${route.code} - ${route.name}`;

    const neighborhood = route.neighborhood
      ? `${route.neighborhood.name}/${route.neighborhood.city}-${route.neighborhood.uf}`
      : "Sem bairro vinculado";
    const scheduleCount = Array.isArray(route.schedules) ? route.schedules.length : 0;
    const signal = signalLabel(route.currentLocation?.capturedAt);
    const subtitle = document.createElement("div");
    subtitle.className = "route-sub";
    subtitle.textContent = `${neighborhood} | ${scheduleCount} horario(s) | ${signal}`;

    item.appendChild(title);
    item.appendChild(subtitle);

    item.addEventListener("click", () => {
      state.selectedRouteCode = route.code;
      routeSelect.value = route.code;
      renderRouteList();
      syncManualRouteCode();
      fillRouteForm(route);
      void refreshMapData();
    });

    routeList.appendChild(item);
  }
}

function renderHistoryPolyline(points) {
  if (!state.map) {
    return;
  }

  if (state.polyline) {
    state.map.removeLayer(state.polyline);
    state.polyline = null;
  }

  if (!points || points.length === 0) {
    return;
  }

  state.polyline = L.polyline(points, {
    color: "#0a9b5a",
    weight: 4,
    opacity: 0.86
  }).addTo(state.map);
}

function renderMarker(lat, lng, popupText) {
  if (!state.map) {
    return;
  }

  if (!state.marker) {
    state.marker = L.marker([lat, lng]).addTo(state.map);
  } else {
    state.marker.setLatLng([lat, lng]);
  }

  state.marker.bindPopup(popupText).openPopup();
  state.map.setView([lat, lng], 15);
}

async function refreshMapData() {
  if (!state.selectedRouteCode) {
    mapMeta.textContent = "Nenhuma rota selecionada.";
    document.getElementById("kpiRoute").textContent = "--";
    document.getElementById("kpiSignal").textContent = "--";
    document.getElementById("kpiCapture").textContent = "--";
    return;
  }

  const routeCode = state.selectedRouteCode;
  const route = state.routes.find((item) => item.code === routeCode) || null;
  document.getElementById("kpiRoute").textContent = route
    ? `${route.code} - ${route.name}`
    : routeCode;

  const [locationResult, historyResult] = await Promise.allSettled([
    apiRequest(`/tracking/location?${new URLSearchParams({ routeCode }).toString()}`),
    apiRequest(`/tracking/history?${new URLSearchParams({ routeCode, limit: "60" }).toString()}`)
  ]);

  let latestLocation = null;
  if (locationResult.status === "fulfilled") {
    latestLocation = locationResult.value;
  }

  let historyItems = [];
  if (historyResult.status === "fulfilled" && Array.isArray(historyResult.value.items)) {
    historyItems = historyResult.value.items;
  }

  const points = historyItems
    .slice()
    .reverse()
    .map((item) => [item.lat, item.lng]);
  renderHistoryPolyline(points);

  if (!latestLocation && points.length > 0) {
    const lastPoint = points[points.length - 1];
    const lastHistory = historyItems[0];
    latestLocation = {
      lat: Number(lastPoint[0]),
      lng: Number(lastPoint[1]),
      capturedAt: lastHistory?.capturedAt || null
    };
  }

  if (latestLocation) {
    renderMarker(
      latestLocation.lat,
      latestLocation.lng,
      `Rota ${routeCode} | ${formatDate(latestLocation.capturedAt)}`
    );
    mapMeta.textContent = `Rota ${routeCode}: lat ${Number(latestLocation.lat).toFixed(6)}, lng ${Number(
      latestLocation.lng
    ).toFixed(6)} | ultima captura ${formatDate(latestLocation.capturedAt)}`;
    document.getElementById("kpiSignal").textContent = signalLabel(latestLocation.capturedAt);
    document.getElementById("kpiCapture").textContent = formatDate(latestLocation.capturedAt);
  } else {
    mapMeta.textContent = `Sem localizacao para a rota ${routeCode}.`;
    document.getElementById("kpiSignal").textContent = "Sem sinal";
    document.getElementById("kpiCapture").textContent = "--";
  }

  if (locationResult.status === "rejected") {
    appendLog("Falha ao carregar localizacao atual", { routeCode, error: locationResult.reason.message });
  }
  if (historyResult.status === "rejected") {
    appendLog("Falha ao carregar historico", { routeCode, error: historyResult.reason.message });
  }
}

function stopAutoRefresh() {
  if (state.autoTimer) {
    clearInterval(state.autoTimer);
    state.autoTimer = null;
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  if (!state.autoRefresh) {
    return;
  }
  state.autoTimer = setInterval(() => {
    void refreshMapData();
  }, MAP_REFRESH_INTERVAL_MS);
}

function readManualConfig() {
  return {
    routeCode: document.getElementById("manualRouteCode").value.trim(),
    vehicleCode: document.getElementById("vehicleCode").value.trim() || undefined,
    teamCode: document.getElementById("teamCode").value.trim() || undefined
  };
}

function syncManualRouteCode() {
  const field = document.getElementById("manualRouteCode");
  if (!field.value && state.selectedRouteCode) {
    field.value = state.selectedRouteCode;
  }
}

async function sendPosition(position) {
  const config = readManualConfig();
  if (!config.routeCode) {
    throw new Error("Preencha a rota para iniciar o tracker.");
  }

  const payload = {
    routeCode: config.routeCode,
    vehicleCode: config.vehicleCode,
    teamCode: config.teamCode,
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    speed: position.coords.speed != null ? Math.max(0, position.coords.speed) : undefined,
    accuracy: position.coords.accuracy != null ? Math.max(0, position.coords.accuracy) : undefined,
    capturedAt: new Date(position.timestamp).toISOString()
  };

  const result = await apiRequest("/tracking/admin/location", {
    method: "POST",
    body: payload
  });

  state.lastSendAt = Date.now();
  state.lastLat = payload.lat;
  state.lastLng = payload.lng;
  appendLog("Localizacao enviada", result);

  if (!state.routes.some((route) => route.code === config.routeCode)) {
    await loadRoutes();
  }

  if (!state.selectedRouteCode || state.selectedRouteCode === config.routeCode) {
    state.selectedRouteCode = config.routeCode;
    routeSelect.value = config.routeCode;
    await refreshMapData();
  }

  return result;
}

function onGeoError(error) {
  appendLog("Erro de geolocalizacao", { code: error.code, message: error.message });
  showStatus(`Geolocalizacao falhou: ${error.message}`, "warn");
}

async function sendNow() {
  if (!navigator.geolocation) {
    throw new Error("Geolocalizacao nao suportada neste navegador.");
  }

  const position = await requestCurrentPosition();
  state.latestPosition = position;
  return sendPosition(position);
}

async function requestCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => reject(new Error(error.message)),
      {
        enableHighAccuracy: true,
        timeout: 15000
      }
    );
  });
}

async function sendTrackerTick() {
  if (state.sendingTick) {
    return;
  }
  state.sendingTick = true;
  try {
    let position = state.latestPosition;
    if (!position) {
      position = await requestCurrentPosition();
      state.latestPosition = position;
    }
    await sendPosition(position);
  } catch (error) {
    appendLog("Falha ao enviar localizacao", { message: error.message });
    showStatus(error.message, "warn");
  } finally {
    state.sendingTick = false;
  }
}

function startWatch() {
  if (!navigator.geolocation) {
    throw new Error("Geolocalizacao nao suportada neste navegador.");
  }

  if (state.sendTimer !== null) {
    showStatus("Envio continuo ja esta ativo.", "ok");
    updateTrackerButtons();
    return;
  }

  const config = readManualConfig();
  if (!config.routeCode) {
    throw new Error("Preencha a rota antes de iniciar o tracker.");
  }

  state.watchId = navigator.geolocation.watchPosition(
    (position) => {
      state.latestPosition = position;
    },
    onGeoError,
    {
      enableHighAccuracy: true,
      maximumAge: 1500,
      timeout: 15000
    }
  );

  state.sendTimer = setInterval(() => {
    void sendTrackerTick();
  }, TRACKER_SEND_INTERVAL_MS);

  void sendTrackerTick();

  appendLog("Envio continuo iniciado", { watchId: state.watchId, intervalMs: TRACKER_SEND_INTERVAL_MS });
  showStatus("Tracker ativo: enviando localizacao a cada 3 segundos.", "ok");
  updateTrackerButtons();
}

function stopWatch() {
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    appendLog("Envio continuo parado", { watchId: state.watchId });
    state.watchId = null;
  }
  if (state.sendTimer !== null) {
    clearInterval(state.sendTimer);
    state.sendTimer = null;
  }
  state.latestPosition = null;
  state.sendingTick = false;
  updateTrackerButtons();
}

async function ensureAdminSession() {
  try {
    const profile = await apiRequest("/auth/me");
    state.profile = profile;
    if (profile.role !== "ADMIN") {
      showStatus("Acesso negado: somente administradores.", "warn");
      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
      throw new Error("Acesso restrito");
    }

    adminBadge.textContent = `${profile.name || "Admin"} (ADMIN)`;
    return true;
  } catch {
    const refreshed = await refreshSession();
    if (!refreshed) {
      window.location.href = "/";
      return false;
    }

    const profile = await apiRequest("/auth/me");
    state.profile = profile;
    if (profile.role !== "ADMIN") {
      showStatus("Acesso negado: somente administradores.", "warn");
      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
      return false;
    }

    adminBadge.textContent = `${profile.name || "Admin"} (ADMIN)`;
    return true;
  }
}

async function loadRoutes() {
  const routes = await apiRequest("/routes/list");
  state.routes = Array.isArray(routes) ? routes : [];
  renderRouteSelector();
  renderRouteList();
  syncManualRouteCode();
  fillRouteForm(getSelectedRoute());
}

async function saveRouteFromForm() {
  const code = normalizeRouteCode(routeCodeInput.value);
  const name = routeNameInput.value.trim();
  if (!code) {
    throw new Error("Informe o codigo da rota.");
  }
  if (!name) {
    throw new Error("Informe o nome da rota.");
  }

  const neighborhood = buildNeighborhoodPayload();
  const existing = state.routes.find((route) => route.code === code);
  if (existing) {
    await apiRequest(`/routes/admin/${encodeURIComponent(code)}`, {
      method: "PATCH",
      body: {
        name,
        neighborhood
      }
    });
  } else {
    await apiRequest("/routes/admin", {
      method: "POST",
      body: {
        code,
        name,
        neighborhood
      }
    });
  }

  state.selectedRouteCode = code;
  await loadRoutes();
  await refreshMapData();
  showStatus(`Rota ${code} salva com sucesso.`, "ok");
}

async function deleteRouteFromForm() {
  const code = normalizeRouteCode(routeCodeInput.value || state.selectedRouteCode);
  if (!code) {
    throw new Error("Selecione uma rota para excluir.");
  }

  await apiRequest(`/routes/admin/${encodeURIComponent(code)}`, {
    method: "DELETE"
  });

  state.selectedRouteCode = null;
  await loadRoutes();
  await refreshMapData();
  showStatus(`Rota ${code} removida.`, "ok");
}

async function saveScheduleForRoute() {
  const code = normalizeRouteCode(routeCodeInput.value || state.selectedRouteCode);
  if (!code) {
    throw new Error("Informe a rota para salvar o horario.");
  }

  const weekday = Number(weekdayInput.value);
  const timeStart = (timeStartInput.value || "").trim();
  const timeEnd = (timeEndInput.value || "").trim();
  if (!timeStart || !timeEnd) {
    throw new Error("Informe horario de inicio e fim.");
  }

  await apiRequest(`/routes/admin/${encodeURIComponent(code)}/schedules`, {
    method: "POST",
    body: {
      weekday,
      timeStart,
      timeEnd
    }
  });

  state.selectedRouteCode = code;
  await loadRoutes();
  await refreshMapData();
  showStatus(`Horario salvo para rota ${code}.`, "ok");
}

async function deleteScheduleForRoute(code, weekday) {
  await apiRequest(`/routes/admin/${encodeURIComponent(code)}/schedules/${weekday}`, {
    method: "DELETE"
  });
  state.selectedRouteCode = code;
  await loadRoutes();
  await refreshMapData();
  showStatus(`Horario removido da rota ${code}.`, "ok");
}

async function bootstrap() {
  clearStatus();
  const mapReady = ensureMap();

  const ok = await ensureAdminSession();
  if (!ok) {
    return;
  }

  await loadRoutes();
  if (mapReady) {
    await refreshMapData();
  }
  startAutoRefresh();
}

routeSelect.addEventListener("change", () => {
  state.selectedRouteCode = routeSelect.value || null;
  renderRouteList();
  syncManualRouteCode();
  fillRouteForm(getSelectedRoute());
  void refreshMapData();
});

document.getElementById("refreshBtn").addEventListener("click", () => {
  void refreshMapData();
});

document.getElementById("toggleAutoBtn").addEventListener("click", (event) => {
  state.autoRefresh = !state.autoRefresh;
  event.currentTarget.textContent = state.autoRefresh ? "Auto ON" : "Auto OFF";
  if (state.autoRefresh) {
    startAutoRefresh();
    void refreshMapData();
  } else {
    stopAutoRefresh();
  }
});

document.getElementById("sendNowBtn").addEventListener("click", async () => {
  clearStatus();
  try {
    await sendNow();
    showStatus("Localizacao enviada com sucesso.", "ok");
  } catch (error) {
    showStatus(error.message, "warn");
    appendLog("Falha no envio manual", { message: error.message });
  }
});

if (startTrackerBtn) {
  startTrackerBtn.addEventListener("click", () => {
    clearStatus();
    try {
      startWatch();
      showStatus("Tracker iniciado com envio continuo.", "ok");
    } catch (error) {
      showStatus(error.message, "warn");
    }
  });
}

if (stopTrackerBtn) {
  stopTrackerBtn.addEventListener("click", () => {
    stopWatch();
    showStatus("Tracker parado.", "ok");
  });
}

routeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();
  try {
    await saveRouteFromForm();
  } catch (error) {
    showStatus(error.message, "warn");
  }
});

clearRouteBtn.addEventListener("click", () => {
  fillRouteForm(null);
  showStatus("Formulario de rota limpo.", "ok");
});

deleteRouteBtn.addEventListener("click", async () => {
  clearStatus();
  try {
    await deleteRouteFromForm();
  } catch (error) {
    showStatus(error.message, "warn");
  }
});

scheduleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();
  try {
    await saveScheduleForRoute();
  } catch (error) {
    showStatus(error.message, "warn");
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  stopAutoRefresh();
  stopWatch();
  try {
    await apiRequest("/auth/logout", { method: "POST" });
  } catch {
  } finally {
    setAccessToken(null);
    window.location.href = "/";
  }
});

window.addEventListener("beforeunload", () => {
  stopAutoRefresh();
  stopWatch();
});

weekdayInput.value = "1";
timeStartInput.value = "08:00";
timeEndInput.value = "12:00";
updateTrackerButtons();

void bootstrap().catch((error) => {
  appendLog("Erro ao iniciar tracker", { message: error.message });
  showStatus(error.message, "warn");
});
