const state = {
  accessToken: localStorage.getItem("riofaz_access_token"),
  dashboard: null,
  selectedRouteCode: null,
  autoRefresh: true,
  autoTimer: null,
  map: null,
  marker: null,
  polyline: null
};

const statusBanner = document.getElementById("statusBanner");
const authShell = document.getElementById("authShell");
const dashboardShell = document.getElementById("dashboardShell");
const trackerLink = document.getElementById("trackerLink");
const userBadge = document.getElementById("userBadge");
const logoutBtn = document.getElementById("logoutBtn");
const routeSelect = document.getElementById("routeSelect");
const routeSchedule = document.getElementById("routeSchedule");
const mapMeta = document.getElementById("mapMeta");
const lookupResult = document.getElementById("lookupResult");

function showStatus(message, type = "ok") {
  statusBanner.className = `status-banner ${type}`;
  statusBanner.textContent = message;
}

function clearStatus() {
  statusBanner.className = "status-banner";
  statusBanner.textContent = "";
}

function setAccessToken(token) {
  state.accessToken = token;
  if (token) {
    localStorage.setItem("riofaz_access_token", token);
  } else {
    localStorage.removeItem("riofaz_access_token");
  }
}

function setLoggedIn(loggedIn) {
  authShell.classList.toggle("hidden", loggedIn);
  dashboardShell.classList.toggle("hidden", !loggedIn);
  logoutBtn.classList.toggle("hidden", !loggedIn);
}

async function apiRequest(path, options = {}) {
  const method = options.method || "GET";
  const auth = options.auth !== false;
  const retry = options.retry !== false;
  const headers = { ...(options.headers || {}) };

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
    const data = await apiRequest("/auth/refresh", {
      method: "POST",
      auth: false,
      retry: false,
      body: {}
    });
    if (data && data.accessToken) {
      setAccessToken(data.accessToken);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function formatDate(isoDate) {
  if (!isoDate) {
    return "--";
  }
  return new Date(isoDate).toLocaleString("pt-BR");
}

function routeFreshnessStatus(lastCaptureIso) {
  if (!lastCaptureIso) {
    return "Sem localizacao";
  }
  const ageSeconds = Math.floor((Date.now() - new Date(lastCaptureIso).getTime()) / 1000);
  if (ageSeconds <= 60) {
    return `Online agora (${ageSeconds}s)`;
  }
  if (ageSeconds <= 300) {
    return `Sinal recente (${ageSeconds}s)`;
  }
  return `Sem atualizacao (${Math.floor(ageSeconds / 60)} min)`;
}

function ensureMap() {
  if (state.map) {
    return;
  }

  state.map = L.map("liveMap").setView([-22.538, -42.99], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(state.map);
}

function renderRouteHistory(points) {
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
    color: "#0aa05e",
    weight: 4,
    opacity: 0.85
  }).addTo(state.map);
}

function renderCurrentMarker(lat, lng, popupText) {
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

function renderRouteSelector(routes) {
  routeSelect.innerHTML = "";
  if (!routes || routes.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Sem rotas vinculadas";
    routeSelect.appendChild(option);
    state.selectedRouteCode = null;
    return;
  }

  if (!state.selectedRouteCode || !routes.some((route) => route.code === state.selectedRouteCode)) {
    state.selectedRouteCode = routes[0].code;
  }

  for (const route of routes) {
    const option = document.createElement("option");
    option.value = route.code;
    option.textContent = `${route.code} - ${route.name}`;
    option.selected = route.code === state.selectedRouteCode;
    routeSelect.appendChild(option);
  }
}

function renderSchedule(route) {
  routeSchedule.innerHTML = "";
  if (!route || !route.schedules || route.schedules.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Sem agenda cadastrada para a rota selecionada.";
    routeSchedule.appendChild(item);
    return;
  }
  for (const schedule of route.schedules) {
    const item = document.createElement("li");
    item.textContent = `Dia ${schedule.weekday} | ${schedule.timeStart} - ${schedule.timeEnd}`;
    routeSchedule.appendChild(item);
  }
}

function fillProfileForm(dashboard) {
  const profile = dashboard.profile || {};
  const preferences = dashboard.preferences || {};
  const address = dashboard.address || {};
  document.getElementById("profileName").value = profile.name || "";
  document.getElementById("profilePhone").value = profile.phoneE164 || "";
  document.getElementById("profileNotifyEnabled").value = String(preferences.notifyEnabled ?? false);
  document.getElementById("profileNotifyMeters").value = preferences.notifyProximityMeters ?? 500;
  document.getElementById("addrCep").value = address.cep || "";
  document.getElementById("addrStreet").value = address.logradouro || "";
  document.getElementById("addrNumber").value = address.numero || "";
  document.getElementById("addrComplement").value = address.complemento || "";
  document.getElementById("addrNeighborhood").value = address.bairro || "";
  document.getElementById("addrCity").value = address.cidade || "";
  document.getElementById("addrUf").value = address.uf || "";
}

function renderDashboard(dashboard) {
  state.dashboard = dashboard;
  const routes = dashboard.routes || [];
  const nextPickup = dashboard.nextPickup;
  fillProfileForm(dashboard);
  renderRouteSelector(routes);

  const selectedRoute = routes.find((route) => route.code === state.selectedRouteCode) || null;
  renderSchedule(selectedRoute);

  document.getElementById("kpiNextPickup").textContent = nextPickup
    ? `${nextPickup.routeName} em ${formatDate(nextPickup.datetime)}`
    : "Sem agenda definida";
  document.getElementById("kpiRouteStatus").textContent = selectedRoute
    ? routeFreshnessStatus(selectedRoute.currentLocation?.capturedAt)
    : "Sem rota";
  document.getElementById("kpiLastUpdate").textContent = selectedRoute?.currentLocation?.capturedAt
    ? formatDate(selectedRoute.currentLocation.capturedAt)
    : "--";

  const role = dashboard.profile?.role || "CITIZEN";
  userBadge.textContent = `${dashboard.profile?.name || "Usuario"} (${role})`;
  userBadge.classList.remove("hidden");
  trackerLink.classList.toggle("hidden", role !== "ADMIN");
}

async function refreshLiveRoute() {
  if (!state.selectedRouteCode) {
    mapMeta.textContent = "Sem rota selecionada.";
    return;
  }
  try {
    const routeCode = state.selectedRouteCode;
    const [location, history] = await Promise.all([
      apiRequest(`/tracking/location?${new URLSearchParams({ routeCode }).toString()}`, { auth: false }),
      apiRequest(`/tracking/history?${new URLSearchParams({ routeCode, limit: "40" }).toString()}`, {
        auth: false
      })
    ]);

    const points = (history.items || [])
      .slice()
      .reverse()
      .map((item) => [item.lat, item.lng]);

    renderRouteHistory(points);
    renderCurrentMarker(location.lat, location.lng, `${routeCode} | ${formatDate(location.capturedAt)}`);
    mapMeta.textContent = `Rota ${routeCode}: lat ${location.lat.toFixed(6)}, lng ${location.lng.toFixed(6)} | Captura ${formatDate(location.capturedAt)}`;
    document.getElementById("kpiRouteStatus").textContent = routeFreshnessStatus(location.capturedAt);
    document.getElementById("kpiLastUpdate").textContent = formatDate(location.capturedAt);
  } catch (error) {
    mapMeta.textContent = `Nao foi possivel carregar localizacao da rota ${state.selectedRouteCode}.`;
    showStatus(error.message, "warn");
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
    void refreshLiveRoute();
  }, 8000);
}

async function loadDashboard() {
  const dashboard = await apiRequest("/citizen/dashboard");
  setLoggedIn(true);
  renderDashboard(dashboard);
  ensureMap();
  await refreshLiveRoute();
  startAutoRefresh();
}

function setupTabs() {
  const tabLogin = document.getElementById("tabLogin");
  const tabRegister = document.getElementById("tabRegister");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
  });

  tabRegister.addEventListener("click", () => {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
  });
}

document.getElementById("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();
  try {
    const session = await apiRequest("/auth/login", {
      method: "POST",
      auth: false,
      body: {
        identifier: document.getElementById("loginIdentifier").value,
        password: document.getElementById("loginPassword").value
      }
    });
    setAccessToken(session.accessToken);
    await loadDashboard();
    showStatus("Login realizado com sucesso.", "ok");
  } catch (error) {
    showStatus(error.message, "warn");
  }
});

document.getElementById("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();
  try {
    const session = await apiRequest("/auth/register", {
      method: "POST",
      auth: false,
      body: {
        name: document.getElementById("registerName").value,
        email: document.getElementById("registerEmail").value || undefined,
        phoneE164: document.getElementById("registerPhone").value || undefined,
        password: document.getElementById("registerPassword").value
      }
    });
    setAccessToken(session.accessToken);
    await loadDashboard();
    showStatus("Conta criada e sessao iniciada.", "ok");
  } catch (error) {
    showStatus(error.message, "warn");
  }
});

document.getElementById("profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();
  try {
    await apiRequest("/citizen/profile", {
      method: "PUT",
      body: {
        name: document.getElementById("profileName").value,
        phoneE164: document.getElementById("profilePhone").value.replace(/\D/g, ""),
        notifyEnabled: document.getElementById("profileNotifyEnabled").value === "true",
        notifyProximityMeters: Number(document.getElementById("profileNotifyMeters").value || "500"),
        address: {
          cep: document.getElementById("addrCep").value,
          logradouro: document.getElementById("addrStreet").value,
          numero: document.getElementById("addrNumber").value || undefined,
          complemento: document.getElementById("addrComplement").value || undefined,
          bairro: document.getElementById("addrNeighborhood").value,
          cidade: document.getElementById("addrCity").value,
          uf: document.getElementById("addrUf").value.toUpperCase()
        }
      }
    });
    await loadDashboard();
    showStatus("Perfil atualizado.", "ok");
  } catch (error) {
    showStatus(error.message, "warn");
  }
});

document.getElementById("lookupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();
  lookupResult.innerHTML = "";
  try {
    const bairro = document.getElementById("lookupBairro").value;
    const city = document.getElementById("lookupCity").value;
    const uf = document.getElementById("lookupUf").value.toUpperCase();
    const query = new URLSearchParams({ bairro, city, uf });
    const data = await apiRequest(`/routes/info?${query.toString()}`, { auth: false });

    if (!data.routes || data.routes.length === 0) {
      const item = document.createElement("li");
      item.textContent = "Nenhuma rota encontrada para essa area.";
      lookupResult.appendChild(item);
      return;
    }

    for (const route of data.routes) {
      const item = document.createElement("li");
      const schedules = route.schedules
        .map((schedule) => `Dia ${schedule.weekday} (${schedule.timeStart} - ${schedule.timeEnd})`)
        .join(" | ");
      item.textContent = `${route.code} - ${route.name} - ${schedules}`;
      lookupResult.appendChild(item);
    }
  } catch (error) {
    showStatus(error.message, "warn");
  }
});

routeSelect.addEventListener("change", () => {
  state.selectedRouteCode = routeSelect.value || null;
  if (state.dashboard) {
    const selectedRoute = (state.dashboard.routes || []).find(
      (route) => route.code === state.selectedRouteCode
    );
    renderSchedule(selectedRoute || null);
  }
  void refreshLiveRoute();
});

document.getElementById("refreshNowBtn").addEventListener("click", () => {
  void refreshLiveRoute();
});

document.getElementById("toggleAutoBtn").addEventListener("click", () => {
  state.autoRefresh = !state.autoRefresh;
  document.getElementById("toggleAutoBtn").textContent = state.autoRefresh ? "Auto ON" : "Auto OFF";
  if (state.autoRefresh) {
    startAutoRefresh();
    void refreshLiveRoute();
  } else {
    stopAutoRefresh();
  }
});

logoutBtn.addEventListener("click", async () => {
  clearStatus();
  try {
    await apiRequest("/auth/logout", { method: "POST" });
  } catch {
  } finally {
    stopAutoRefresh();
    setAccessToken(null);
    userBadge.classList.add("hidden");
    trackerLink.classList.add("hidden");
    setLoggedIn(false);
    showStatus("Sessao encerrada.", "ok");
  }
});

async function bootstrap() {
  setupTabs();
  ensureMap();

  if (state.accessToken) {
    try {
      await loadDashboard();
      return;
    } catch {
      setAccessToken(null);
    }
  }

  const refreshed = await refreshSession();
  if (refreshed) {
    try {
      await loadDashboard();
      return;
    } catch {
      setAccessToken(null);
    }
  }

  setLoggedIn(false);
}

void bootstrap();
