import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";

const SERVICE_INFO = [
  { id: "api", name: "Express API", detail: "Application service", address: "api:3000" },
  { id: "prometheus", name: "Prometheus", detail: "Metrics collection", address: "localhost:9090" },
  { id: "grafana", name: "Grafana", detail: "Metrics visualization", address: "localhost:3001" },
  { id: "frontend", name: "Web dashboard", detail: "React · Nginx", address: "localhost:5173" }
];

async function requestJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status}).`);
  }
  if (!data || typeof data !== "object") {
    throw new Error("The API returned an invalid response.");
  }
  return data;
}

async function checkService(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Service returned HTTP ${response.status}.`);
  }
}

function formatUptime(value) {
  if (!Number.isFinite(value)) return "—";
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MetricCard({ label, value, supportingText, accent, icon }) {
  return (
    <article className={`metric-card ${accent}`}>
      <div className="metric-card-top">
        <span className="metric-icon" aria-hidden="true">{icon}</span>
        <span className="metric-label">{label}</span>
        <span className="metric-menu" aria-hidden="true">•••</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-support">{supportingText}</div>
    </article>
  );
}

function ServiceCard({ service, status }) {
  const statusLabel = status === "online"
    ? "Operational"
    : status === "checking"
      ? "Checking"
      : "Unavailable";

  return (
    <article className="service-card">
      <div className="service-card-heading">
        <span className={`service-mark ${service.id}`} aria-hidden="true">
          {service.id === "api" ? "API" : service.id === "prometheus" ? "P" : service.id === "grafana" ? "G" : "UI"}
        </span>
        <span className={`service-indicator ${status}`} />
      </div>
      <h3>{service.name}</h3>
      <p>{service.detail}</p>
      <div className="service-card-bottom">
        <span>{service.address}</span>
        <span className={`service-status ${status}`}>{statusLabel}</span>
      </div>
    </article>
  );
}

function App() {
  const [stats, setStats] = useState(null);
  const [serviceHealth, setServiceHealth] = useState({
    api: "checking",
    prometheus: "checking",
    grafana: "checking",
    frontend: "online"
  });
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [action, setAction] = useState("");
  const [notice, setNotice] = useState(null);
  const requestInFlight = useRef(false);

  const refreshDashboard = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setRefreshing(true);

    const [healthResult, statsResult, prometheusResult, grafanaResult] =
      await Promise.allSettled([
        requestJson("/api/health"),
        requestJson("/api/stats"),
        checkService("/ops/prometheus/ready"),
        checkService("/ops/grafana/health")
      ]);

    const apiOnline = healthResult.status === "fulfilled"
      && healthResult.value.status === "ok";
    setServiceHealth({
      api: apiOnline ? "online" : "offline",
      prometheus: prometheusResult.status === "fulfilled" ? "online" : "offline",
      grafana: grafanaResult.status === "fulfilled" ? "online" : "offline",
      frontend: "online"
    });

    if (statsResult.status === "fulfilled") {
      setStats(statsResult.value);
    }

    const errors = [];
    if (!apiOnline) {
      errors.push(healthResult.status === "rejected"
        ? healthResult.reason.message
        : "The API health check did not return an OK status.");
    }
    if (statsResult.status === "rejected") {
      errors.push(statsResult.reason.message);
    }
    setApiError(errors.join(" "));
    if (apiOnline && statsResult.status === "fulfilled") {
      setLastUpdated(new Date());
    }

    requestInFlight.current = false;
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(refreshDashboard, 0);
    const interval = window.setInterval(refreshDashboard, 5000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [refreshDashboard]);

  async function runDemoCheck() {
    setAction("check");
    setNotice(null);
    try {
      const result = await requestJson("/api/demo-check");
      setNotice({
        type: "success",
        text: `${result.message} Duration: ${result.simulatedDurationMs} ms (simulated).`
      });
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Demo check failed." });
    } finally {
      setAction("");
      await refreshDashboard();
    }
  }

  async function runDemoError() {
    setAction("error");
    setNotice(null);
    try {
      const response = await fetch("/api/demo-error", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (response.status === 500) {
        setNotice({
          type: "error",
          text: result?.error || "The API returned the expected HTTP 500 demo error."
        });
      } else if (!response.ok) {
        throw new Error(result?.error || `Request failed (${response.status}).`);
      } else {
        setNotice({ type: "success", text: "The demo endpoint returned successfully." });
      }
    } catch (error) {
      setNotice({ type: "error", text: error.message || "Could not reach the API." });
    } finally {
      setAction("");
      await refreshDashboard();
    }
  }

  const apiStatus = serviceHealth.api;
  const allServicesOnline = Object.values(serviceHealth).every(status => status === "online");
  const overallStatus = serviceHealth.api === "checking"
    || Object.values(serviceHealth).some(status => status === "checking")
    ? "checking"
    : serviceHealth.api !== "online"
      ? "offline"
      : allServicesOnline
        ? "online"
        : "degraded";
  const overallLabel = overallStatus === "online"
    ? "All systems operational"
    : overallStatus === "checking"
      ? "Connecting to services"
      : overallStatus === "degraded"
        ? "Monitoring service unavailable"
        : "API connection issue";
  const requestCount = stats?.totalRequests;
  const errorCount = stats?.serverErrors;
  const uptime = stats ? formatUptime(stats.uptimeSeconds) : "—";
  const memory = stats ? formatBytes(stats.memoryUsage?.rssBytes) : "—";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="MiniOps overview">
          <span className="brand-mark"><i /><i /><i /><i /></span>
          <span>mini<span>ops</span></span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <a className="nav-link active" href="#overview">
          <span className="nav-glyph">◫</span> Overview
        </a>
        <a className="nav-link" href="#services">
          <span className="nav-glyph">◈</span> Services
        </a>
        <div className="sidebar-label tools-label">OBSERVABILITY</div>
        <a className="nav-link" href="http://localhost:9090/targets" target="_blank" rel="noreferrer">
          <span className="nav-glyph">↗</span> Prometheus
        </a>
        <a className="nav-link" href="http://localhost:3001" target="_blank" rel="noreferrer">
          <span className="nav-glyph">↗</span> Grafana
        </a>
        <div className="sidebar-bottom">
          <span className="sidebar-version-dot" />
          <div><strong>MiniOps demo</strong><small>Docker Compose stack</small></div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>Overview</strong></div>
          <div className="topbar-actions">
            <span className={`overall-pill ${overallStatus}`}>
              <i /> {overallLabel}
            </span>
            <button className="refresh-button" type="button" onClick={refreshDashboard} disabled={refreshing}>
              <span className={refreshing ? "refresh-icon spinning" : "refresh-icon"} aria-hidden="true">↻</span>
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </header>

        <div className="dashboard">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span /> LIVE SYSTEM OVERVIEW</div>
              <h1>Good day, operator<span>.</span></h1>
              <p>Monitor your MiniOps services and API performance in real time.</p>
            </div>
            <div className="heading-updated">
              <span className="live-dot" />
              Auto-refresh every 5 seconds
              <small>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Waiting for first check"}</small>
            </div>
          </section>

          {apiError && (
            <div className="connection-alert" role="alert">
              <span className="alert-icon">!</span>
              <div><strong>API connection issue</strong><p>{apiError} Check that the Compose services are running.</p></div>
              <button type="button" onClick={refreshDashboard}>Retry</button>
            </div>
          )}

          <section className={`health-banner ${apiStatus}`} aria-label="Overall API health">
            <div className="health-banner-main">
              <div className={`health-symbol ${apiStatus}`}><span>{apiStatus === "online" ? "✓" : apiStatus === "checking" ? "…" : "!"}</span></div>
              <div>
                <div className="health-kicker">API SERVICE HEALTH</div>
                <h2>{apiStatus === "online" ? "Your API is healthy" : apiStatus === "checking" ? "Connecting to your API" : "API is unreachable"}</h2>
                <p>{apiStatus === "online" ? "Express is responding and its Prometheus metrics endpoint is available." : "Health and request statistics appear when the API is available."}</p>
              </div>
            </div>
            <div className="health-banner-meta">
              <span className="health-pulse" />
              <span>{apiStatus === "online" ? "OPERATIONAL" : apiStatus === "checking" ? "CHECKING" : "DEGRADED"}</span>
              <small>Last check {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}</small>
            </div>
          </section>

          <section className="metrics-grid" aria-label="API metrics">
            <MetricCard label="Total requests" value={loading && !stats ? "…" : Number.isFinite(requestCount) ? requestCount.toLocaleString() : "—"} supportingText="Since API container start" accent="cyan" icon="↗" />
            <MetricCard label="Server errors" value={loading && !stats ? "…" : Number.isFinite(errorCount) ? errorCount.toLocaleString() : "—"} supportingText="HTTP 5xx responses" accent="red" icon="!" />
            <MetricCard label="API uptime" value={uptime} supportingText="Time since last restart" accent="violet" icon="◷" />
            <MetricCard label="Memory usage" value={memory} supportingText="Resident set size · RSS" accent="green" icon="▤" />
          </section>

          <section className="section-block" id="services">
            <div className="section-heading">
              <div><div className="eyebrow">YOUR STACK</div><h2>Service health</h2></div>
              <span className="section-note">Health probes via the Compose network</span>
            </div>
            <div className="services-grid">
              {SERVICE_INFO.map(service => (
                <ServiceCard key={service.id} service={service} status={serviceHealth[service.id]} />
              ))}
            </div>
          </section>

          <section className="section-block activity-section">
            <div className="section-heading">
              <div><div className="eyebrow">INTERACTIVE CHECKS</div><h2>Test your API</h2></div>
              <span className="section-note">Actions create real API requests</span>
            </div>
            <div className="action-panel">
              <div className="action-copy">
                <span className="action-icon">⌁</span>
                <div><strong>Exercise the monitoring stack</strong><p>Send a successful check or create an intentional 500 response and watch the counters update.</p></div>
              </div>
              <div className="action-buttons">
                <button className="button-secondary" type="button" onClick={runDemoCheck} disabled={Boolean(action)}>
                  {action === "check" ? "Running check…" : "Run successful check"}
                </button>
                <button className="button-danger" type="button" onClick={runDemoError} disabled={Boolean(action)}>
                  {action === "error" ? "Generating error…" : "Generate HTTP 500"}
                </button>
              </div>
              {notice && <div className={`action-notice ${notice.type}`} role="status">{notice.text}</div>}
            </div>
          </section>

          <section className="links-row" aria-label="Monitoring tools">
            <a href="http://localhost:9090/targets" target="_blank" rel="noreferrer">
              <span className="external-icon">↗</span>
              <span><strong>Prometheus targets</strong><small>Inspect scrape health and targets</small></span>
              <b>↗</b>
            </a>
            <a href="http://localhost:3001" target="_blank" rel="noreferrer">
              <span className="external-icon grafana-icon">↗</span>
              <span><strong>Open Grafana</strong><small>Explore the provisioned API dashboard</small></span>
              <b>↗</b>
            </a>
          </section>

          <footer className="dashboard-footer">
            <span><span className="footer-mark">m</span> MiniOps <i /> Built for observable systems</span>
            <span>Polling every 5 seconds <i /> Data from your running services</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;
