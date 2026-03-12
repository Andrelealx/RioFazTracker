# Diagnóstico Técnico do Legado (RioFazTracker)

Data do diagnóstico: 11/03/2026  
Escopo analisado:
- `legacy_source/public_html_5` (extraído de `C:/Users/Lealx/Downloads/public_html (5).zip`)
- `C:/Users/Lealx/Downloads/u305836601_coleta.sql`

## 1) Resumo executivo

O legado é uma aplicação monolítica estática + PHP procedural, com banco MySQL/MariaDB, sem separação formal de camadas e sem gestão moderna de configuração/deploy.

Estado atual por macro-módulo:
- Rastreamento em tempo real: **parcial funcional** (update + leitura da última posição).
- Mapa operacional: **parcial funcional** (polling HTTP; sem tempo real push).
- Portal do cidadão: **parcial** (UX pronta, persistência real não integrada na tela principal).
- Autenticação/autorização: **parcial e frágil** (API key global + cookie token sem login formal).
- Notificações/preferências: **estrutural no banco apenas**.
- Auditoria/histórico: **estrutural/parcial** (há tabelas e endpoint de debug, mas sem trilha auditável confiável de negócio).

Problemas críticos:
- Segredos expostos em código (`.env.php` + API key no frontend).
- Inconsistência de contratos entre frontend e API (endpoints referenciados inexistentes).
- Persistência principal de rastreamento sem histórico consolidado (só última posição em `current_location`).
- CORS permissivo/ambíguo e ausência de controles de segurança (rate limiting, autenticação robusta, sessão segura completa).

---

## 2) Inventário técnico do legado

### 2.1 Estrutura de arquivos

```text
legacy_source/public_html_5/
  .env.php
  .htaccess
  index.html
  mapa.html
  tracker.html
  logo-reciclaguapi.png
  /api
    debug_log.php
    get_location.php
    profile_get.php
    profile_save.php
    route_info.php
    update_location.php
  /pwa
    manifest.json
    sw.js
```

### 2.2 Stack atual identificada
- Frontend: HTML + JavaScript inline + Tailwind CDN + Leaflet CDN.
- Backend: PHP procedural (PDO em cada endpoint).
- Banco: MySQL/MariaDB.
- PWA: `manifest.json` e `service worker` para `tracker.html`.
- Integrações externas: ViaCEP, Nominatim, tiles OpenStreetMap.

---

## 3) Endpoints existentes e estado real

### 3.1 Endpoints PHP encontrados

1. `POST|GET /api/update_location.php`
- Função: recebe localização e faz upsert em `current_location`.
- Auth: API key (`X-API-KEY` ou query/body `api_key`).
- Estado: **implementada (núcleo de rastreamento atual)**.
- Observações:
  - Aceita múltiplos aliases de campos (`route_id`, `imei`, `lat`, `longitude`, etc.).
  - Faz DDL em runtime (`CREATE TABLE IF NOT EXISTS current_location`).
  - Não grava histórico em `truck_location_history`.

2. `GET /api/get_location.php`
- Função: retorna última localização de uma `route_id`.
- Estado: **implementada**.
- Observações:
  - Sem autenticação.
  - Comentário interno aponta nome antigo (`get_update.php`), indicando renome sem alinhar clientes.

3. `GET|POST /api/profile_save.php`
- Função: upsert de usuário e endereço principal + cookie `riofaz_uid`.
- Estado: **parcial**.
- Observações:
  - Não existe login/senha/JWT.
  - Baseado em telefone + token em cookie.
  - Endereço é regravado (desmarca primário anterior e insere novo).

4. `GET|POST /api/profile_get.php`
- Função: lê perfil por token de cookie.
- Estado: **parcial**.
- Observações:
  - Sem expiração/rotação robusta de sessão.
  - Cria tabela `user_tokens` em runtime se necessário.

5. `GET|POST /api/route_info.php`
- Função: consulta rota/agenda por bairro/cidade/UF.
- Estado: **implementada no backend, sem uso efetivo no frontend atual**.

6. `ANY /api/debug_log.php`
- Função: ecoa requisição e grava em `error_log`.
- Estado: **parcial/diagnóstico**, não é endpoint de produção.
- Risco: exposição de headers/payload quando API key vaza.

### 3.2 Contratos quebrados no frontend

Referências existentes para endpoints **não presentes**:
- `tracker.html` chama `/api/get_update.php` (arquivo não existe; existe `get_location.php`).
- `mapa.html` chama `/api/get_location_public.php` (arquivo não existe).

Impacto:
- Parte dos fluxos pode falhar silenciosamente ou depender de fallback local.

---

## 4) Fluxos de tela e regra de negócio atual

### 4.1 `tracker.html` (rastreador operacional)
- Fluxo:
  1. Obtém geolocalização do dispositivo (`watchPosition`).
  2. Aplica deduplicação por tempo/distância.
  3. Envia localização para `update_location.php`.
  4. Tenta sincronizar visual com leitura do servidor.
- Estado: **parcial funcional**.
- Regras identificadas:
  - `route_id` default `coleta1`.
  - Heartbeat forçado.
  - Ajuste adaptativo de GPS (alta/baixa precisão).
  - Fallback de leitura do servidor em intervalo.

### 4.2 `index.html` (mapa principal + portal cidadão)
- Fluxo de mapa:
  - Polling em `/api/get_location.php` com stale timeout de 15s.
- Fluxo portal:
  - Cadastro e dashboard em modal.
  - Persistência em `localStorage` (`riofaz_portal_profile`) em vez de backend real.
  - ViaCEP preenche endereço.
- Estado:
  - Mapa: **implementada/parcial**.
  - Portal cidadão: **parcial** (persistência fake para regra principal de cidadão).

### 4.3 `mapa.html` (mapa público)
- Fluxo de polling para endpoint ausente (`get_location_public.php`).
- Estado: **quebrada/parcial**.

### 4.4 PWA
- `tracker.html` registra `sw.js`.
- Estado: **implementada parcial**.
- Observação: regras de cache mencionam `get_update.php` (nome legado), reforçando inconsistência de rotas.

---

## 5) Banco de dados legado (SQL) e classificação

## 5.1 Tabelas encontradas
- `users`
- `addresses`
- `user_tokens`
- `user_preferences`
- `neighborhoods`
- `routes`
- `route_schedules`
- `address_route_map`
- `current_location`
- `truck_locations`
- `truck_location_history`
- `notification_log`
- view `v_route_full`

## 5.2 Classificação por uso real

### Implementada (em uso no código)
- `current_location`
- `users`
- `addresses`
- `user_tokens`
- `neighborhoods`
- `routes`
- `route_schedules`

### Parcial
- `current_location` (só estado atual; sem histórico operacional persistente)
- `user_tokens` (sessão simples, sem modelo de auth completo)

### Estrutural no banco apenas
- `user_preferences`
- `notification_log`
- `address_route_map`
- `truck_locations`
- `truck_location_history`
- `v_route_full` (view existe, não utilizada no frontend/API atual)

### Obsoleta ou com forte sinal de obsolescência no código atual
- Convenção de endpoint `get_update.php` (substituída por `get_location.php` sem migração completa dos consumidores).

## 5.3 Inconsistências de modelagem
- Identidade de rota inconsistente:
  - `current_location.route_id` é texto (`coleta1`).
  - `truck_locations.route_id`/`truck_location_history.route_id` referenciam `routes.id` (inteiro).
- DDL divergente entre dump e runtime:
  - Dump de `current_location` usa `DOUBLE` + `TIMESTAMP`.
  - Endpoint cria `DECIMAL(10,7)` + `DATETIME` se tabela não existir.
- `routes` mistura códigos de bairro em maiúsculo e rota genérica `coleta1`.

---

## 6) Segurança (achados objetivos)

## 6.1 Exposição de segredos
- Credenciais de banco e API key presentes em:
  - `.env.php` versionado.
  - `tracker.html` (API key hardcoded).

## 6.2 Autenticação/autorização fracas
- Sem login/senha para usuário cidadão.
- Sem JWT, sem refresh token, sem RBAC.
- `update_location` depende de uma API key estática global.
- `get_location` é público.

## 6.3 CORS e sessão
- Endpoints com `Access-Control-Allow-Origin: *` (tracking/debug).
- Endpoints de perfil refletem `Origin` sem allowlist explícita.
- Cookie de sessão sem arquitetura completa anti-CSRF (fluxo atual não protege operações de escrita por origem confiável formalizada).

## 6.4 Hardening ausente
- Sem rate limiting.
- Sem headers de segurança padronizados.
- Sem trilha de auditoria estruturada para ações críticas.

---

## 7) Observabilidade e operação

- Logs: `error_log` textual sem estrutura padrão (JSON/trace id).
- Sem healthcheck endpoint.
- Sem métricas técnicas (latência, taxa de erro, throughput).
- Sem testes automatizados (backend/frontend).
- Sem Docker/Compose no legado.
- Sem pipeline de deploy moderna.

---

## 8) Inconsistências explícitas código x banco

1. Frontend usa endpoints que não existem (`get_update.php`, `get_location_public.php`).
2. Modelo de rota textual no tracking (`coleta1`) conflita com modelo relacional por `routes.id`.
3. Portal cidadão no frontend salva em `localStorage`, enquanto há backend/tabelas de usuário/endereço.
4. Tabelas de notificações/preferências/histórico existem, porém não sustentam fluxo ativo no código.

---

## 9) Riscos priorizados (para migração)

### P0 (bloqueia produção segura)
1. Segredos hardcoded no repositório e frontend.
2. Contratos quebrados entre frontend e endpoints.
3. Ausência de autenticação robusta para ações sensíveis.
4. Ausência de rate limiting e hardening básico.

### P1 (alto impacto funcional)
1. Rastreamento sem histórico confiável.
2. Módulos parcialmente implementados (portal/notificação).
3. Inconsistência de modelagem de rota e nomenclatura.

### P2 (evolução/manutenção)
1. Falta de modularização e testes.
2. Falta de observabilidade estruturada.
3. Dependência de JS inline e lógica acoplada à UI.

---

## 10) Conclusão do diagnóstico

O sistema legado possui uma base funcional válida para:
- ingestão de posição,
- visualização em mapa,
- cadastro cidadão básico,
- roteamento/agenda por bairro.

Porém, há dívida técnica e risco de segurança significativos. A migração deve preservar as regras úteis (dedupe de localização, stale timeout, lookup de rota por bairro, vínculo usuário/endereço) e substituir os pontos frágeis por arquitetura modular (Next.js + NestJS + Prisma + PostgreSQL), com autenticação JWT, contratos de API consistentes e observabilidade/segurança adequadas para Railway.
