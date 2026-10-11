# MiniOps

MiniOps is a lightweight Docker Compose monitoring demo. The React dashboard
reads live health and process statistics from its Express API. Prometheus
scrapes the API and itself every five seconds, and Grafana is provisioned with
a dashboard for request rate, errors, latency, total requests, and process
memory.

## Start the stack

Run these commands in PowerShell from `docker-compose-the-second-demo`:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build -d
docker compose ps
```

The local demo Grafana credentials are `admin` / `admin`. These defaults are
only for a local demonstration and are not production-secure. Set unique
`GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` values in `.env` before the
first start if you want different credentials. Grafana does not replace an
already initialized account just because these environment variables change;
for an existing data volume, update the password through Grafana's user
settings.

## URLs

| Service | URL |
| --- | --- |
| MiniOps dashboard | <http://localhost:5173> |
| API health | <http://localhost:3000/api/health> |
| API stats | <http://localhost:3000/api/stats> |
| Prometheus metrics | <http://localhost:3000/metrics> |
| Prometheus targets | <http://localhost:9090/targets> |
| Grafana | <http://localhost:3001> |

Prometheus reaches the API at `api:3000/metrics`. Grafana reaches Prometheus
at `http://prometheus:9090`; those service names are resolved on the private
Compose network. The dashboard uses Nginx's internal health-check routes to
show Prometheus and Grafana availability without relying on browser CORS.

The API's `/api/stats` counters cover requests since the API process started.
Prometheus history is retained in its named volume for up to seven days. A
demo check reports a clearly labelled simulated duration; it is not a latency
measurement. The real request latency histogram is available in Prometheus
and Grafana.

## Useful commands

Run from the project root:

```powershell
# Follow logs from every service, or name one service such as api or grafana
docker compose logs -f
docker compose logs -f api

# Restart a single service
docker compose restart api

# Stop and remove the containers and Compose network; keep monitoring data
docker compose down

# Start again using the existing images and persistent data
docker compose up -d
```

`docker compose down` preserves the `prometheus_data` and `grafana_data`
volumes. Do not add `-v` if you want to keep monitoring history and Grafana
state. To stop containers without removing them, use `docker compose stop`.

## Project structure

```text
.
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
├── grafana/
│   ├── dashboards/miniops.json
│   └── provisioning/
├── prometheus/prometheus.yml
├── compose.yaml
├── .env.example
└── .dockerignore
```
