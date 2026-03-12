/* Service Worker do Tracker RioFaz */
const SW_VERSION = 'v1.0.0';
const PRECACHE = `precache-${SW_VERSION}`;
const RUNTIME  = `runtime-${SW_VERSION}`;

/* Lista mínima para o app ser “instalável” e abrir offline (shell) */
const PRECACHE_URLS = [
  '/',                 // raiz
  '/logo-reciclaguapi.png',
  '/pwa/manifest.json'
  // se a sua página for, por exemplo, /tracker.html ou /index.php, pode colocar aqui também
  // '/tracker.html'
];

/* Instalação: baixa arquivos básicos */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

/* Ativação: limpa caches antigos */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((k) => ![PRECACHE, RUNTIME].includes(k))
        .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* Estratégia de fetch
   - GET same-origin: cache-first com atualização em background (stale-while-revalidate)
   - POST e requests de rastreio/tiles externos: passam direto (não cacheia)
*/
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Não cachear POST/PUT/etc.
  if (req.method !== 'GET') return;

  // Evita cachear tiles do OpenStreetMap e chamadas de geocoding (por política deles)
  const isOSM = /tile\.openstreetmap\.org/.test(url.host);
  const isNominatim = /nominatim\.openstreetmap\.org/.test(url.host);
  if (isOSM || isNominatim) return; // deixa seguir normal (rede)

  // Não cachear sua API de update (para garantir dados em tempo real)
  if (/\/api\/(update_location\.php|get_update\.php)/.test(url.pathname)) return;

  // Same-origin: stale-while-revalidate simples
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const cached = await cache.match(req);
      const networkFetch = fetch(req).then((res) => {
        // só guarda se ok e básico
        if (res && res.status === 200 && res.type === 'basic') {
          cache.put(req, res.clone());
        }
        return res;
      }).catch(() => cached);

      // retorna rápido o cached (se existir) e atualiza em bg
      return cached || networkFetch;
    })());
  }
});
