export type Mode = "host" | "guest";

export const VERSION = "1.2.0";

function useColor(): boolean {
  return !process.argv.includes("--no-color") && process.env.NO_COLOR !== "1" && !!process.stdout.isTTY;
}

const enabled = useColor();

// Raw ANSI codes — use directly: `${ansi.green}text${ansi.reset}`
export const ansi = {
  bold: enabled ? "\x1b[1m" : "",
  dim: enabled ? "\x1b[2m" : "",
  green: enabled ? "\x1b[32m" : "",
  yellow: enabled ? "\x1b[33m" : "",
  red: enabled ? "\x1b[31m" : "",
  cyan: enabled ? "\x1b[36m" : "",
  magenta: enabled ? "\x1b[35m" : "",
  blue: enabled ? "\x1b[34m" : "",
  white: enabled ? "\x1b[37m" : "",
  brightGreen: enabled ? "\x1b[92m" : "",
  brightYellow: enabled ? "\x1b[93m" : "",
  brightRed: enabled ? "\x1b[91m" : "",
  reset: enabled ? "\x1b[0m" : "",
};

const wrap = (code: string) => (s: string) => `${ansi.bold.startsWith("\x1b") ? `\x1b[${code}m` : ""}${s}${ansi.reset}`;
// simpler: just use ansi codes directly
const c = (code: string) => (s: string) => {
  if (!enabled) return s;
  return `\x1b[${code}m${s}\x1b[0m`;
};

// Wrapper functions for convenience
export const C = {
  bold: c("1"),
  dim: c("2"),
  cyan: c("36"),
  green: c("32"),
  yellow: c("33"),
  red: c("31"),
  magenta: c("35"),
  blue: c("34"),
  white: c("37"),
  brightGreen: c("92"),
  brightYellow: c("93"),
  brightRed: c("91"),
  colorRtt: (ms: number) =>
    ms < 5 ? ansi.green : ms < 20 ? ansi.yellow : ansi.red,
  reset: ansi.reset,
};

function cliValue(key: string): string | undefined {
  const idx = process.argv.indexOf("--" + key);
  if (idx !== -1 && idx + 1 < process.argv.length && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return undefined;
}

function cliFlag(key: string): boolean {
  return process.argv.includes("--" + key);
}

if (cliFlag("version")) {
  console.log(`Raiden ${C.green("v" + VERSION)}`);
  process.exit(0);
}

if (cliFlag("help")) {
  const w = (opt: string, val: string, desc: string, def?: string) =>
    `  ${C.yellow(opt)} ${C.green(val).padEnd(28)}${C.dim(desc)}${def ? C.dim(" (default: " + def + ")") : ""}`;

  console.log(`
${C.cyan("╭──────────────────────────────────────────────────────────────╮")}
${C.cyan("│")}  ${C.bold(C.cyan("⚡ Raiden " + VERSION))} — WebSocket Latency & Jitter Meter   ${C.cyan("│")}
${C.cyan("╰──────────────────────────────────────────────────────────────╯")}

${C.bold(C.cyan("Usage:"))}
  ${C.yellow("bun run index.ts")} [${C.green("options")}]

${C.bold(C.cyan("Modes:"))}
${w("--mode", "<host|guest>", "Run mode", "guest")}

${C.bold(C.cyan("Guest options:"))}
${w("--url", "<ws://...>", "WebSocket server URL", "ws://localhost:8080/ws")}
${w("--ping-interval", "<ms>", "Interval between pings", "5000")}
${w("--reconnect-interval", "<ms>", "Delay before reconnect", "3000")}
${w("--max-reconnects", "<n>", "Max reconnect attempts", "10")}
${w("--sample-limit", "<n>", "Max RTT samples stored", "100")}
${w("--speed-payloads", "<bytes,...>", "Comma-separated payload sizes", "64,1024,16384")}
${w("--speed-test-interval", "<ms>", "Re-run speed tests every N ms (0=once)", "30000")}
${w("--csv", "<path>", "Export RTT samples to CSV")}

${C.bold(C.cyan("Host options:"))}
${w("--host", "<ip>", "Bind address", "0.0.0.0")}
${w("--port", "<n>", "Listen port", "8080")}

${C.bold(C.cyan("Display:"))}
${w("--no-color", "", "Disable ANSI colors")}

${C.dim("All options can also be set via environment variables (WS_MODE, WS_URL, etc.).")}
${C.dim("CLI flags take precedence over environment variables.")}
`);
  process.exit(0);
}

function parseMode(): Mode {
  const val = cliValue("mode");
  if (val === "host" || val === "guest") return val;
  const env = process.env.WS_MODE;
  if (env === "host" || env === "guest") return env;
  return "guest";
}

export const config = {
  mode: parseMode(),
  host: cliValue("host") ?? process.env.WS_HOST ?? "0.0.0.0",
  port: parseInt(cliValue("port") ?? process.env.WS_PORT ?? "8080", 10),
  url: cliValue("url") ?? process.env.WS_URL ?? "ws://localhost:8080/ws",
  reconnectInterval: parseInt(cliValue("reconnect-interval") ?? process.env.WS_RECONNECT_INTERVAL_MS ?? "3000", 10),
  maxReconnectAttempts: parseInt(cliValue("max-reconnects") ?? process.env.WS_MAX_RECONNECT_ATTEMPTS ?? "10", 10),
  pingInterval: parseInt(cliValue("ping-interval") ?? process.env.WS_PING_INTERVAL_MS ?? "5000", 10),
  speedTestPayloads: (cliValue("speed-payloads") ?? process.env.WS_SPEED_TEST_PAYLOADS ?? "64,1024,16384").split(",").map(Number),
  speedTestInterval: parseInt(cliValue("speed-test-interval") ?? process.env.WS_SPEED_TEST_INTERVAL_MS ?? "30000", 10),
  sampleLimit: parseInt(cliValue("sample-limit") ?? process.env.WS_SAMPLE_LIMIT ?? "100", 10),
  csvOutput: cliValue("csv") ?? process.env.WS_CSV_OUTPUT ?? null,
  logLevel: process.env.WS_LOG_LEVEL ?? "info",
  attempts: 0,
};
