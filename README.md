# awg-stat (Gate)

Веб-сервис **только для чтения**: мониторинг и статистика уже установленных серверов **AmneziaVPN / AmneziaWG 3.1**.

Репозиторий: [github.com/finenumbers/awg-stat](https://github.com/finenumbers/awg-stat).

Управление VPN остаётся в штатном приложении AmneziaVPN. Gate не ставит протокол, не стартует контейнеры и не пишет в `clientsTable` / `awg0.conf`.

## Что делает

- Подключается по SSH к Debian-серверу, где уже работает контейнер `amnezia-awg2`
- Читает несекретные селекторы `awg show all` и файл `/opt/amnezia/awg/clientsTable`
- Хранит историю трафика в своей PostgreSQL
- Показывает имена пиров из `clientsTable` на VPN

## Образы GHCR

Публикуются на каждый push в `main`, тег всегда `latest` (linux/amd64):

- [`ghcr.io/finenumbers/awg-stat:latest`](https://github.com/finenumbers/awg-stat/pkgs/container/awg-stat)
- [`ghcr.io/finenumbers/awg-stat-poller:latest`](https://github.com/finenumbers/awg-stat/pkgs/container/awg-stat-poller)
- [`ghcr.io/finenumbers/awg-stat-migrate:latest`](https://github.com/finenumbers/awg-stat/pkgs/container/awg-stat-migrate)

После первой публикации в GitHub Packages выставьте у трёх пакетов visibility **Public** — иначе Portainer не сможет тянуть образы без логина.

## Локальный запуск (Docker)

Сборка из исходников, без GHCR:

```bash
./scripts/generate-dev-env.sh
docker compose up -d --build
```

Откройте http://localhost:8088 → `/setup` → создайте администратора.

В интерфейсе не будет демо-данных: пока не подключён реальный сервер Amnezia, экраны пустые.

## Продакшен (Portainer + NPM)

Только **Docker standalone / Compose**, не Swarm. NPM уже установлен, его сеть называется `proxy`. Стек: [`deploy/portainer.stack.yml`](deploy/portainer.stack.yml).

1. Дождитесь публикации `:latest` в GHCR и сделайте пакеты Public.
2. Portainer → Stacks → Add stack → **Repository**
   - URL: `https://github.com/finenumbers/awg-stat`
   - Compose path: `deploy/portainer.stack.yml`
   - Branch: `main`
3. Env: `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `APP_ENCRYPTION_KEY` (`openssl rand -base64 32`), `APP_URL` (публичный HTTPS **без** `/` на конце).
4. Включите **Re-pull image** при обновлении.
5. Настройте NPM по инструкции ниже.

Редеплой: Pull and redeploy + Re-pull image — всегда новый `latest`.

Postgres в проде не публикуется на хост.

## Настройка Nginx Proxy Manager

NPM в этот стек **не входит**: используется уже работающий экземпляр в Docker-сети `proxy`. Контейнер `gate-app` сам подключается к этой сети, поэтому NPM резолвит его по имени `gate-app`.

### Что должно быть готово

- Стек awg-stat уже запущен в Portainer (контейнер `gate-app` в статусе running).
- NPM крутится на **том же Docker Engine**, в сети `proxy`.
- DNS-имя (например `stat.example.com`) указывает на IP хоста NPM.

Проверка сети:

```bash
docker network inspect proxy --format '{{range .Containers}}{{.Name}} {{end}}'
```

В списке должны быть контейнер NPM и `gate-app`. Если `gate-app` нет — стек не поднялся или подключён к другой сети.

### Proxy Host

В NPM: **Hosts → Proxy Hosts → Add Proxy Host**.

**Details**

| Поле | Значение |
|---|---|
| Domain Names | то же имя, что в `APP_URL`, без `https://` и без `/` |
| Scheme | `http` |
| Forward Hostname / IP | `gate-app` |
| Forward Port | `8088` |
| Cache Assets | выкл. |
| Block Common Exploits | по желанию |
| Websockets Support | **вкл.** |
| Access List | не обязателен |

Не указывайте `https` и не ставьте IP хоста: приложение слушает только внутри Docker, порт на хост не публикуется.

**SSL**

| Поле | Значение |
|---|---|
| SSL Certificate | Request a new SSL Certificate (Let's Encrypt) или свой сертификат |
| Force SSL | **вкл.** |
| HTTP/2 Support | вкл. |
| HSTS Enabled | по желанию |

Сохраните. Откройте `https://ваш-домен` — должен открыться `/setup` (первый запуск) или `/login`.

### Согласовать `APP_URL`

В переменных стека Portainer `APP_URL` должен **точно** совпадать с адресом в браузере:

```text
APP_URL=https://stat.example.com
```

Без `/` на конце, только `https`. Иначе Better Auth сломает редиректы и cookies после логина. После смены `APP_URL` пересоздайте стек (Update / Pull and redeploy).

### Типичные ошибки

- **502 Bad Gateway** — `gate-app` ещё не готов, не в сети `proxy`, или указан не тот hostname/порт. Нужны именно `gate-app` и `8088`.
- **Страница логина зацикливается** — `APP_URL` не совпадает с доменом Proxy Host или Force SSL выключен при заходе по HTTPS.
- **NPM не резолвит `gate-app`** — разные Docker Engine или сеть не `proxy`.

## Безопасность чтения

Разрешены только шаблонные команды: `docker ps/inspect` и `docker exec … awg show all <selector>` + `cat clientsTable`.

Запрещены `dump`, `private-key`, `header-protection-key`, `awg0.conf`, любые `docker restart/run`, запись в VPN.

## Стек

Next.js · PostgreSQL · Prisma · Better Auth · SSH (ssh2) · Docker
