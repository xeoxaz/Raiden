export type Mode = "host" | "guest";

function parseMode(): Mode {
  const idx = process.argv.indexOf("--mode");
  if (idx !== -1 && idx + 1 < process.argv.length) {
    const val = process.argv[idx + 1] as Mode;
    if (val === "host" || val === "guest") return val;
  }
  const env = process.env.WS_MODE;
  if (env === "host" || env === "guest") return env;
  return "guest";
}

export const config = {
  mode: parseMode(),
  host: process.env.WS_HOST || "0.0.0.0",
  port: parseInt(process.env.WS_PORT || "8080", 10),
  url: process.env.WS_URL || "ws://localhost:8080/ws",
  reconnectInterval: parseInt(process.env.WS_RECONNECT_INTERVAL_MS || "3000", 10),
  maxReconnectAttempts: parseInt(process.env.WS_MAX_RECONNECT_ATTEMPTS || "10", 10),
  pingInterval: parseInt(process.env.WS_PING_INTERVAL_MS || "5000", 10),
  speedTestPayloads: (process.env.WS_SPEED_TEST_PAYLOADS || "64,1024,16384").split(",").map(Number),
  logLevel: process.env.WS_LOG_LEVEL || "info",
  attempts: 0,
};
