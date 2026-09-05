// Nome da cache actual da aplicação.
// Sempre que mudares ficheiros importantes, incrementa esta versão.
const CACHE_NAME = 'd228-cache-v1.5.10';

// Página principal usada como fallback quando uma navegação falha.
const APP_SHELL_FALLBACK = './index.html';

// Tempo máximo para esperar pela rede antes de desistir.
const NETWORK_TIMEOUT_MS = 800;

// === Registo de utilização (log) ===
// Substitui pelos valores reais do Google Form.
const LOG_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfkzRRxrHEX7pu7vw0rc1riRVsvlDoMayE1eINZy26bQCPKfQ/formResponse';
const LOG_ENTRY_PAGE = 'entry.471001487'; // campo "Pagina"
const LOG_ENTRY_TIME = 'entry.1641792080'; // campo "data/hora"

// Nome da cache usada como fila de registos por enviar (quando offline).
const PENDING_LOG_CACHE = 'd228-pending-logs';

// Nome da cache usada para guardar meta-informação do registo diário.
const LOG_META_CACHE = 'd228-log-meta';
const LAST_LOG_KEY = './__last-log-date__';

// Devolve a data de hoje no formato AAAA-MM-DD.
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Verifica se já foi tentado um registo hoje neste dispositivo.
async function alreadyLoggedToday() {
  const cache = await caches.open(LOG_META_CACHE);
  const stored = await cache.match(LAST_LOG_KEY);
  if (!stored) return false;
  const lastDate = await stored.text();
  return lastDate === todayKey();
}

// Marca que já foi tentado hoje (evita repetir, mesmo que ainda esteja offline).
async function markLoggedToday() {
  const cache = await caches.open(LOG_META_CACHE);
  await cache.put(LAST_LOG_KEY, new Response(todayKey()));
}

// Envia um registo ao Google Form. Lança erro se não houver rede.
async function sendLog(pathname, time) {
  const body = new URLSearchParams();
  body.append(LOG_ENTRY_PAGE, pathname);
  body.append(LOG_ENTRY_TIME, time);
  await fetch(LOG_FORM_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
}

// Guarda um registo por enviar, para tentar mais tarde (ex: sem rede agora).
async function queuePendingLog(pathname, time) {
  try {
    const cache = await caches.open(PENDING_LOG_CACHE);
    const key = `./__pending-log__/${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await cache.put(key, new Response(JSON.stringify({ pathname, time })));
  } catch (error) {
    // Se nem isto correr, perde-se este registo em concreto - aceitável.
  }
}

// Tenta reenviar todos os registos que ficaram por enviar.
async function flushPendingLogs() {
  const cache = await caches.open(PENDING_LOG_CACHE);
  const pending = await cache.keys();

  for (const request of pending) {
    try {
      const stored = await cache.match(request);
      const { pathname, time } = await stored.json();
      await sendLog(pathname, time);
      // Só remove da fila depois de confirmar o envio.
      await cache.delete(request);
    } catch (error) {
      // Continua sem rede (ou falhou) - mantém-se na fila para a próxima vez.
    }
  }
}

// Regista que a app foi aberta (não bloqueia nem afeta a navegação em si).
// No máximo uma tentativa por dispositivo por dia.
async function logAppEntry(pathname) {
  if (await alreadyLoggedToday()) {
    return;
  }
  await markLoggedToday();

  const time = new Date().toISOString();
  try {
    await sendLog(pathname, time);
  } catch (error) {
    // Sem rede agora - guarda para reenviar na próxima abertura.
    await queuePendingLog(pathname, time);
  }
}

// Lista de ficheiros críticos para funcionamento offline.
// Evita meter aqui ficheiros que possam não existir.
const ASSETS = [
  './',
  './index.html',
  './manifest.json',

  './Popup-TrafficLoad.html',
  './calculadora.html',
  './fdr.html',
  './mb-print-thermal.html',
  './mb.html',
  './performance.html',
  './popup-fuel.html',
  './rotas.html',
  './settings.html',

  './footer.html',
  './header.html',

  './css/calculadora.css',
  './css/index.css',
  './css/mb-print-thermal.css',
  './css/mb.css',
  './css/menu.css',
  './css/normalize.css',
  './css/performance.css',
  './css/popup-TLoad.css',
  './css/popup-TrafficLoad.css',
  './css/popup-fuel.css',
  './css/rotas.css',
  './css/settings.css',
  './css/style.css',
  './css/theme.css',

  './data/TrafficLoad.json',
  './data/aircraft.json',
  './data/airportsList.json',
  './data/payload.json',
  './data/rotas.json',

  './js/Popup-TrafficLoad.js',
  './js/ToSpeeds.js',
  './js/ToWAT.js',
  './js/asdrFlaps1_CSATH.js',
  './js/asdrFlapsUP_CSATH.js',
  './js/calculadora.js',
  './js/cat-printer-protocol.js',
  './js/cg2segFlaps1_CSATH.js',
  './js/cg2segFlapsUp_CSATH.js',
  './js/cg3segFlaps1_CSATH.js',
  './js/cg4segFlapsUp_CSATH.js',
  './js/cgMTOWSearch.js',
  './js/cgRequired2Seg_CSATH.js',
  './js/cgRequired34Seg_CSATH.js',
  './js/dataLoader.js',
  './js/general.js',
  './js/index.js',
  './js/mb-print-thermal.js',
  './js/mb-thermal-launcher.js',
  './js/mb.js',
  './js/mtowASDA_Flaps1.js',
  './js/mtowASDA_FlapsUp.js',
  './js/mtowTODA_Flaps1.js',
  './js/mtowTODA_FlapsUp.js',
  './js/mtowTORA_Flaps1.js',
  './js/mtowTORA_FlapsUp.js',
  './js/netGradient_CSATH.js',
  './js/performance.js',
  './js/popup-TLoad.js',
  './js/rotas.js',
  './js/settings.js',
  './js/spa-router.js',
  './js/todrFlaps1_CSATH.js',
  './js/todrFlapsUP_CSATH.js',
  './js/torqueTakeoff_CSATH.js',
  './js/torrFlaps1_CSATH.js',
  './js/torrFlapsUP_CSATH.js',

  './js/vendor/jspdf.umd.min.js',
  './js/vendor/pdf.min.js',
  './js/vendor/pdf.worker.min.js',

  './img/Layout_Cargo.webp',
  './img/NOTAM.png',
  './img/SMS.png',
  './img/app-192.png',
  './img/app-512.png',
  './img/balance.png',
  './img/calculator.png',
  './img/data.png',
  './img/front-cargo.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/iphone-share.png',
  './img/large-rear-cargo.png',
  './img/lay19pax.png',
  './img/laycargo.png',
  './img/layout_19PAX.webp',
  './img/mapa.png',
  './img/performance.png',
  './img/serie200.png',
  './img/serie212-Standard.png',
  './img/serie212.png',
  './img/serieError.png',
  './img/settings.png',
  './img/sevenair.png',
  './img/small-rear-cargo.png',
  './img/waypoint.png',
  './img/weather.png'
];

// Instala o Service Worker.
self.addEventListener('install', (event) => {
  // Garante que a instalação só termina depois da cache inicial.
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Guarda os ficheiros um a um para evitar que um único erro rebente a instalação toda.
      await Promise.all(
        ASSETS.map(async (asset) => {
          try {
            // Faz o pedido do ficheiro.
            const response = await fetch(asset, { cache: 'no-cache' });

            // Só guarda respostas válidas.
            if (response.ok) {
              await cache.put(asset, response);
            } else {
              console.warn('[SW] Ficheiro não colocado em cache:', asset, response.status);
            }
          } catch (error) {
            // Regista o erro sem impedir a instalação inteira.
            console.warn('[SW] Falhou ao colocar em cache:', asset, error);
          }
        })
      );
    })
  );

  // Activa este Service Worker assim que possível.
  self.skipWaiting();
});

// Activa o Service Worker.
self.addEventListener('activate', (event) => {
  // Remove caches antigas.
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );

  // Assume controlo imediato das páginas abertas.
  self.clients.claim();
});

// Faz fetch com limite de tempo.
async function fetchWithTimeout(request, timeoutMs = NETWORK_TIMEOUT_MS) {
  // Cria um controlador para poder cancelar o pedido.
  const controller = new AbortController();

  // Agenda o cancelamento do pedido se demorar demasiado.
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Faz o pedido à rede com suporte para cancelamento.
    return await fetch(request, {
      signal: controller.signal,
      cache: 'no-cache'
    });
  } finally {
    // Limpa o temporizador quando o pedido termina.
    clearTimeout(timeout);
  }
}

// Actualiza a cache em segundo plano.
async function updateCacheInBackground(request) {
  try {
    // Tenta obter uma versão nova pela rede.
    const response = await fetchWithTimeout(request);

    // Só guarda respostas válidas da própria origem.
    if (response && response.ok && response.type === 'basic') {
      // Abre a cache actual.
      const cache = await caches.open(CACHE_NAME);

      // Guarda uma cópia da resposta.
      await cache.put(request, response.clone());
    }

    // Devolve a resposta da rede.
    return response;
  } catch (error) {
    // Ignora falhas de rede em background.
    return null;
  }
}

// Intercepta pedidos da app.
self.addEventListener('fetch', (event) => {
  // Só trata pedidos GET.
  if (event.request.method !== 'GET') {
    return;
  }

  // Guarda o pedido original.
  const request = event.request;

  // Analisa o URL do pedido.
  const requestUrl = new URL(request.url);

  // Verifica se o pedido é da mesma origem da app.
  const isSameOrigin = requestUrl.origin === self.location.origin;

  // Trata navegações de páginas HTML.
  if (request.mode === 'navigate') {
    // Regista só se não houver nenhuma janela da app já aberta -
    // aproxima "abriu a app agora" de simples navegação interna entre ecrãs.
    // Aproveita também para tentar reenviar registos presos de quando esteve offline.
    event.waitUntil(
      Promise.all([
        flushPendingLogs(),
        self.clients.matchAll({ type: 'window' }).then((openClients) => {
          if (openClients.length === 0) {
            return logAppEntry(requestUrl.pathname);
          }
        })
      ])
    );

    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(async (cachedResponse) => {
        // Se houver página em cache, devolve imediatamente.
        if (cachedResponse) {
          // Tenta actualizar a página em segundo plano sem bloquear a app.
          event.waitUntil(updateCacheInBackground(request));

          // Devolve a versão em cache.
          return cachedResponse;
        }

        try {
          // Se não houver cache, tenta ir à rede.
          const networkResponse = await fetchWithTimeout(request);

          // Guarda resposta válida em cache.
          if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse.clone());
          }

          // Devolve a resposta da rede.
          return networkResponse;
        } catch (error) {
          // Se a rede falhar, tenta abrir a página principal.
          const fallback = await caches.match(APP_SHELL_FALLBACK);

          // Se existir fallback, devolve-o.
          if (fallback) {
            return fallback;
          }

          // Último recurso: devolve uma resposta simples de erro.
          return new Response('Aplicação indisponível offline.', {
            status: 503,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8'
            }
          });
        }
      })
    );

    return;
  }

  // Trata recursos da própria app: JS, CSS, JSON, imagens, etc.
  if (isSameOrigin) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(async (cachedResponse) => {
        // Se existir em cache, devolve já.
        if (cachedResponse) {
          // Actualiza em segundo plano.
          event.waitUntil(updateCacheInBackground(request));

          // Devolve a versão em cache.
          return cachedResponse;
        }

        try {
          // Se não existir em cache, tenta ir à rede.
          const networkResponse = await fetchWithTimeout(request);

          // Guarda resposta válida em cache.
          if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse.clone());
          }

          // Devolve a resposta da rede.
          return networkResponse;
        } catch (error) {
          // Devolve erro controlado em vez de deixar o browser bloquear sem explicação.
          return new Response('Recurso indisponível offline.', {
            status: 503,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8'
            }
          });
        }
      })
    );

    return;
  }

  // Trata recursos externos.
  event.respondWith(
    caches.match(request).then(async (cachedResponse) => {
      // Se existir em cache, devolve.
      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        // Tenta obter recurso externo pela rede.
        return await fetchWithTimeout(request);
      } catch (error) {
        // Se falhar e não houver cache, devolve erro controlado.
        return new Response('', {
          status: 504,
          statusText: 'Gateway Timeout'
        });
      }
    })
  );
});
