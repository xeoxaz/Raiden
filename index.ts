import { config, C, VERSION, ansi } from "./config.ts";
import { writeFileSync, appendFileSync } from "node:fs";

// ── Types ──────────────────────────────────────────────────

interface Stats {
  min: number; max: number; avg: number; median: number;
  p95: number; p99: number; stddev: number; count: number;
}

interface Rating { label: string; color: string; }

// ── Statistics ─────────────────────────────────────────────

function calcStats(samples: number[]): Stats {
  const n = samples.length;
  if (n === 0) return { min: 0, max: 0, avg: 0, median: 0, p95: 0, p99: 0, stddev: 0, count: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((a, b) => a + (b - avg) ** 2, 0) / n;
  return {
    min: sorted[0], max: sorted[n - 1], avg,
    median: n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)],
    p95: sorted[Math.min(Math.ceil(n * 0.95) - 1, n - 1)],
    p99: sorted[Math.min(Math.ceil(n * 0.99) - 1, n - 1)],
    stddev: Math.sqrt(variance), count: n,
  };
}

// ── Formatters ─────────────────────────────────────────────

function formatNs(ns: number): string {
  return Math.round(ns).toLocaleString("en-US").padStart(14);
}

function formatMs(ns: number): string {
  return (ns / 1e6).toFixed(3).padStart(7);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Quality Ratings ────────────────────────────────────────

function rttRating(ms: number): Rating {
  if (ms < 1)   return { label: "SUPERFAST", color: ansi.brightGreen };
  if (ms < 5)   return { label: "GREAT",     color: ansi.green };
  if (ms < 20)  return { label: "GOOD",      color: ansi.cyan };
  if (ms < 50)  return { label: "POOR",      color: ansi.yellow };
  if (ms < 200) return { label: "BAD",       color: ansi.magenta };
  return              { label: "VERYSLOW",   color: ansi.brightRed };
}

function jitterRating(ms: number): Rating {
  if (ms < 1)  return { label: "STABLE",   color: ansi.green };
  if (ms < 5)  return { label: "OK",       color: ansi.yellow };
  return             { label: "UNSTABLE",  color: ansi.red };
}

function speedRating(ms: number): Rating {
  if (ms < 1)   return { label: "SUPERFAST", color: ansi.brightGreen };
  if (ms < 5)   return { label: "GREAT",     color: ansi.green };
  if (ms < 20)  return { label: "GOOD",      color: ansi.cyan };
  if (ms < 50)  return { label: "POOR",      color: ansi.yellow };
  if (ms < 200) return { label: "BAD",       color: ansi.magenta };
  return              { label: "VERYSLOW",   color: ansi.brightRed };
}

// ── Dashboard Rendering ────────────────────────────────────

const W = 56;
const HR = "─".repeat(W);

function cell(raw: string): string {
  return raw + " ".repeat(Math.max(0, W - raw.length));
}

function border(s: string): string {
  return C.cyan(s);
}

/** A dash value row (RTT / Jitter / Min / Max / …) */
function dashVal(ns: number, label: string): string {
  const nsVal = formatNs(ns);
  const msVal = formatMs(ns);
  const ms = ns / 1e6;
  const raw = `${label.padEnd(7)}${nsVal} ns  ${msVal} ms`;
  const painted = `${C.bold(label.padEnd(7))}${C.colorRtt(ms)}${nsVal}${ansi.reset} ns  ${C.colorRtt(ms)}${msVal}${ansi.reset} ms`;
  return painted + " ".repeat(W - raw.length);
}

/** The quality rating row */
function dashRating(rttMs: number, jitterMs: number): string {
  const r = rttRating(rttMs);
  const j = jitterRating(jitterMs);
  const raw = `RATING  ${r.label} · ${j.label}`;
  const painted = `${C.bold("RATING")}  ${r.color}${r.label}${ansi.reset} ${ansi.dim}·${ansi.reset} ${j.color}${j.label}${ansi.reset}`;
  return painted + " ".repeat(W - raw.length);
}

/** A speed-test result row */
function dashSpeedRow(sizeLabel: string, latencyMs: number): string {
  const r = speedRating(latencyMs);
  const lat = latencyMs.toFixed(3).padStart(7);
  const raw = `  ${sizeLabel.padEnd(6)}  ${lat} ms  ${r.label}`;
  const painted = `  ${C.dim(sizeLabel.padEnd(6))}  ${r.color}${lat}${ansi.reset} ms  ${r.color}${r.label}${ansi.reset}`;
  return painted + " ".repeat(W - raw.length);
}

function showDashboard(
  url: string,
  rttNs: number | null,
  stats: Stats,
  pongs: number, pings: number,
  elapsed: number,
  speedResults: { size: number; sizeLabel: string; latencyMs: number }[],
  extra?: string,
): void {
  const out: string[] = [];

  out.push(border("┌" + HR + "┐"));
  out.push(border("│") + " " + cell(`${C.bold(C.cyan("⚡ Raiden " + VERSION))} — Guest`) + " " + border("│"));
  out.push(border("│") + " " + cell(url.length > W ? url.slice(0, W) : url) + " " + border("│"));
  out.push(border("│") + " " + cell(C.dim(`Elapsed: ${elapsed}s`)) + " " + border("│"));

  if (rttNs !== null) {
    out.push(border("├" + HR + "┤"));
    out.push(border("│") + " " + dashVal(rttNs, "RTT") + " " + border("│"));
    out.push(border("│") + " " + dashVal(stats.stddev, "Jitter") + " " + border("│"));
    out.push(border("│") + " " + dashRating(rttNs / 1e6, stats.stddev / 1e6) + " " + border("│"));
  }

  if (stats.count >= 1) {
    out.push(border("├" + HR + "┤"));
    const loss = pings > 0 ? ((1 - pongs / pings) * 100).toFixed(1) : "0.0";
    out.push(border("│") + " " + cell(`Samples: ${String(stats.count).padStart(3)} / ${String(config.sampleLimit).padStart(3)}    Loss: ${loss.padStart(4)}%`) + " " + border("│"));
    if (stats.count >= 2) {
      for (const [label, val] of [["Min", stats.min], ["Max", stats.max], ["Avg", stats.avg],
                                   ["Median", stats.median], ["P95", stats.p95], ["P99", stats.p99],
                                   ["StdDev", stats.stddev]] as [string, number][]) {
        out.push(border("│") + " " + dashVal(val, label) + " " + border("│"));
      }
    }
  }

  if (speedResults.length > 0) {
    out.push(border("├" + HR + "┤"));
    out.push(border("│") + " " + cell(C.bold("Speed Test Results")) + " " + border("│"));
    for (const r of speedResults) {
      out.push(border("│") + " " + dashSpeedRow(r.sizeLabel, r.latencyMs) + " " + border("│"));
    }
  }

  if (extra) {
    out.push(border("│") + " " + cell(C.yellow(extra.slice(0, W))) + " " + border("│"));
  }

  out.push(border("└" + HR + "┘"));
  console.clear();
  console.log(out.join("\n"));
}

function showSummary(
  url: string, stats: Stats, pongs: number, pings: number, elapsed: number, reason: string,
): void {
  const out: string[] = [];

  out.push(border("┌" + HR + "┐"));
  out.push(border("│") + " " + cell(`${C.bold(C.magenta("Session Summary"))}`) + " " + border("│"));
  out.push(border("│") + " " + cell(url.length > W ? url.slice(0, W) : url) + " " + border("│"));
  out.push(border("│") + " " + cell(C.yellow(reason)) + " " + border("│"));
  out.push(border("│") + " " + cell(C.dim(`Elapsed: ${elapsed}s`)) + " " + border("│"));

  if (stats.count > 0) {
    out.push(border("├" + HR + "┤"));
    const loss = pings > 0 ? ((1 - pongs / pings) * 100).toFixed(1) : "0.0";
    out.push(border("│") + " " + cell(`Samples: ${String(stats.count).padStart(3)}    Loss: ${loss.padStart(4)}%`) + " " + border("│"));

    if (stats.count >= 2) {
      for (const [label, val] of [["Min", stats.min], ["Max", stats.max], ["Avg", stats.avg],
                                   ["Median", stats.median], ["P95", stats.p95], ["P99", stats.p99],
                                   ["StdDev", stats.stddev]] as [string, number][]) {
        out.push(border("│") + " " + dashVal(val, label) + " " + border("│"));
      }
    }

    // Overall rating
    const rttAvg = stats.avg;
    const jitter = stats.stddev;
    const r = rttRating(rttAvg / 1e6);
    const j = jitterRating(jitter / 1e6);
    out.push(border("├" + HR + "┤"));
    out.push(border("│") + " " + cell(`${C.bold("Overall")}  ${r.color}${r.label}${ansi.reset} ${ansi.dim}·${ansi.reset} ${j.color}${j.label}${ansi.reset}`) + " " + border("│"));
  } else {
    out.push(border("├" + HR + "┤"));
    out.push(border("│") + " " + cell(C.dim("No RTT samples collected.")) + " " + border("│"));
  }

  out.push(border("└" + HR + "┘"));
  console.clear();
  console.log(out.join("\n"));
}

// ── Guest ──────────────────────────────────────────────────

function startGuest(): void {
  let ws: WebSocket | null = null;
  let pingTimer: Timer | null = null;
  let speedTestTimer: Timer | null = null;
  let rttSamples: number[] = [];
  let totalPingsSent = 0;
  let totalPongsReceived = 0;
  let lastRtt: number | null = null;
  let statusMsg = "";
  let sessionStart = Bun.nanoseconds();
  let shuttingDown = false;
  let lastSpeedResults: { size: number; sizeLabel: string; latencyMs: number }[] = [];

  function elapsedSecs(): number {
    return Math.floor((Bun.nanoseconds() - sessionStart) / 1e9);
  }

  function render(extra?: string): void {
    const stats = calcStats(rttSamples);
    showDashboard(config.url, lastRtt, stats, totalPongsReceived, totalPingsSent, elapsedSecs(), lastSpeedResults, extra ?? (statusMsg || undefined));
  }

  function handleSigint(): void {
    if (shuttingDown) return;
    shuttingDown = true;
    if (pingTimer) clearInterval(pingTimer);
    if (speedTestTimer) clearInterval(speedTestTimer);
    if (ws) { ws.onclose = null; ws.onerror = null; ws.close(); }
    const stats = calcStats(rttSamples);
    showSummary(config.url, stats, totalPongsReceived, totalPingsSent, elapsedSecs(), "Interrupted \u2014 shutdown");
    process.exit(0);
  }

  process.on("SIGINT", handleSigint);

  function connect(): void {
    if (shuttingDown) return;
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
    if (config.attempts >= config.maxReconnectAttempts) {
      const stats = calcStats(rttSamples);
      showSummary(config.url, stats, totalPongsReceived, totalPingsSent, elapsedSecs(), "Max reconnects reached \u2014 giving up");
      process.exit(1);
    }

    ws = new WebSocket(config.url);
    ws.onopen = () => {
      config.attempts = 0;
      rttSamples = [];
      totalPingsSent = 0;
      totalPongsReceived = 0;
      lastRtt = null;
      statusMsg = "Running tests...";
      sessionStart = Bun.nanoseconds();
      lastSpeedResults = [];
      if (config.csvOutput) writeFileSync(config.csvOutput, "seq,ping_time_ns,rtt_ns,rtt_ms,jitter_ms\n");
      render();

      connectionTest();
      startStablePing();
      startSpeedTests();
    };

    ws.onmessage = (event: MessageEvent) => {
      if (shuttingDown) return;
      let data: any;
      try {
        data = JSON.parse(event.data.toString());
      } catch {
        statusMsg = `Message: ${event.data}`;
        render();
        return;
      }

      switch (data.type) {
        case "welcome":
          statusMsg = `Connected \u2014 ${data.clients} client(s) in room`;
          render();
          break;

        case "pong": {
          const rttNs = Bun.nanoseconds() - Number(data.ts);
          rttSamples.push(rttNs);
          if (rttSamples.length > config.sampleLimit) rttSamples.shift();
          lastRtt = rttNs;
          totalPongsReceived++;

          if (config.csvOutput) {
            const jitterMs = calcStats(rttSamples).stddev / 1e6;
            appendFileSync(config.csvOutput, `${data.seq ?? "?"},${Number(data.ts)},${rttNs},${(rttNs / 1e6).toFixed(3)},${jitterMs.toFixed(3)}\n`);
          }
          render();
          break;
        }

        case "test":
          if (data.status === "ok") {
            statusMsg = "Connection test: " + C.green("PASSED");
            render();
          }
          break;

        case "speed": {
          const latNs = Bun.nanoseconds() - Number(data.ts);
          const latencyMs = latNs / 1e6;
          const sizeLabel = formatSize(data.size);

          const existing = lastSpeedResults.find(r => r.size === data.size);
          if (existing) {
            existing.latencyMs = latencyMs;
          } else {
            lastSpeedResults.push({ size: data.size, sizeLabel, latencyMs });
          }

          statusMsg = `Speed test: ${sizeLabel} ${latencyMs.toFixed(3)}ms`;
          render();
          break;
        }

        default:
          statusMsg = `Message: ${event.data}`;
          render();
      }
    };

    ws.onerror = () => {
      if (shuttingDown) return;
      statusMsg = C.red("WebSocket error");
      render();
    };

    ws.onclose = (event: CloseEvent) => {
      if (shuttingDown) return;
      if (pingTimer) clearInterval(pingTimer);
      if (speedTestTimer) clearInterval(speedTestTimer);
      const stats = calcStats(rttSamples);
      showSummary(config.url, stats, totalPongsReceived, totalPingsSent, elapsedSecs(), `Disconnected (code: ${event.code})`);
      config.attempts++;
      setTimeout(connect, config.reconnectInterval);
    };
  }

  function connectionTest(): void {
    ws?.send(JSON.stringify({ type: "test", msg: "Raiden connection probe" }));
  }

  function startStablePing(): void {
    let seq = 0;
    pingTimer = setInterval(() => {
      if (shuttingDown) return;
      seq++;
      ws?.send(JSON.stringify({ type: "ping", ts: Bun.nanoseconds(), seq }));
      totalPingsSent++;
    }, config.pingInterval);
  }

  function runSpeedTests(): void {
    for (const size of config.speedTestPayloads) {
      ws?.send(JSON.stringify({ type: "speed", size, data: "x".repeat(size), ts: Bun.nanoseconds() }));
    }
  }

  function startSpeedTests(): void {
    runSpeedTests();
    if (config.speedTestInterval > 0) {
      speedTestTimer = setInterval(runSpeedTests, config.speedTestInterval);
    }
  }

  statusMsg = "Starting...";
  render();
  connect();
}

// ── Host ───────────────────────────────────────────────────

function startHost(): void {
  const clients = new Set<WebSocket>();

  const addr = `${config.host}:${config.port}`;
  const listenText = `Listening on ws://${addr}/ws`;

  console.log(`
${C.cyan("┌" + HR + "┐")}
${C.cyan("│")}  ${C.bold(C.cyan("⚡ Raiden " + VERSION))} — Host  ${" ".repeat(W - 24)}${C.cyan("│")}
${C.cyan("│")}  ${C.dim(listenText)}${" ".repeat(Math.max(0, W - 2 - listenText.length))}${C.cyan("│")}
${C.cyan("└" + HR + "┘")}
`);

  Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch(req: Request, server: Server) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req);
        if (!upgraded) return new Response("Upgrade failed", { status: 400 });
      }
      return new Response("Raiden \u2014 connect to /ws", { status: 200 });
    },
    websocket: {
      open(ws: WebSocket) {
        clients.add(ws);
        console.log(C.green(`[+] Client connected. Total: ${clients.size}`));
        ws.send(JSON.stringify({ type: "welcome", clients: clients.size }));
      },
      message(ws: WebSocket, message: string | Buffer) {
        let data: any;
        try { data = JSON.parse(message.toString()); } catch {
          for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(message.toString());
          return;
        }
        switch (data.type) {
          case "test":  ws.send(JSON.stringify({ type: "test", status: "ok", echo: data.msg })); break;
          case "ping":  ws.send(JSON.stringify({ type: "pong", ts: data.ts, seq: data.seq })); break;
          case "speed": ws.send(JSON.stringify({ type: "speed", size: data.size, data: data.data, ts: data.ts })); break;
          default:
            for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(message.toString());
        }
      },
      close(ws: WebSocket) {
        clients.delete(ws);
        console.log(C.red(`[-] Client disconnected. Total: ${clients.size}`));
      },
    },
  });
}

// ── Entry ──────────────────────────────────────────────────

if (config.mode === "host") startHost();
else startGuest();
