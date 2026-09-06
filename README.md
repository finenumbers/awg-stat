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
5. NPM Proxy Host: `http://gate-app:8088`, WebSockets ON, Force SSL.

Редеплой: Pull and redeploy + Re-pull image — всегда новый `latest`.

Postgres в проде не публикуется на хост.

## Безопасность чтения

Разрешены только шаблонные команды: `docker ps/inspect` и `docker exec … awg show all <selector>` + `cat clientsTable`.

Запрещены `dump`, `private-key`, `header-protection-key`, `awg0.conf`, любые `docker restart/run`, запись в VPN.

## Стек

Next.js · PostgreSQL · Prisma · Better Auth · SSH (ssh2) · Docker
