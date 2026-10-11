const express = require("express");
const client = require("prom-client");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const register = new client.Registry();
let totalRequests = 0;
let serverErrors = 0;

register.setDefaultLabels({ service: "miniops-api" });
client.collectDefaultMetrics({ register });

const httpRequests = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests handled by the API.",
  labelNames: ["method", "route", "status_code"],
  registers: [register]
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});

app.use((req, res, next) => {
  if (req.path === "/metrics") {
    return next();
  }

  totalRequests += 1;
  const start = process.hrtime.bigint();

  res.once("finish", () => {
    const route = req.route
      ? `${req.baseUrl || ""}${req.route.path}`
      : "unmatched";
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode)
    };

    if (res.statusCode >= 500) {
      serverErrors += 1;
    }

    httpRequests.inc(labels);
    httpRequestDuration.observe(
      labels,
      Number(process.hrtime.bigint() - start) / 1e9
    );
  });

  next();
});

app.use(express.json({ limit: "20kb" }));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "miniops-api",
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.get("/api/stats", (req, res) => {
  const memory = process.memoryUsage();
  res.json({
    totalRequests,
    serverErrors,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsage: {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external
    }
  });
});

app.get("/api/demo-check", (req, res) => {
  res.json({
    status: "ok",
    message: "Demo check completed successfully.",
    checkedAt: new Date().toISOString(),
    simulatedDurationMs: Math.floor(Math.random() * 180) + 40,
    durationLabel: "simulated"
  });
});

app.get("/api/demo-error", (req, res) => {
  res.status(500).json({
    status: "error",
    error: "Intentional server error generated for the MiniOps demo."
  });
});

app.get("/metrics", async (req, res, next) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((error, req, res, next) => {
  console.error("Unhandled API error:", error);
  if (res.headersSent) {
    return next(error);
  }
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MiniOps API listening on port ${PORT}`);
});
