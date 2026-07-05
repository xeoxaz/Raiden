import { config } from "./config.ts";

interface Stats {
  min: number;
  max: number;
  avg: number;
  median: number;
  p95: number;
  p99: number;
  stddev: number;
  count: number;
}

function calcStats(samples: number[]): Stats {
  const n = samples.length;
  if (n === 0) return { min: 0, max: 0, avg: 0, median: 0, p95: 0, p99: 0, stddev: 0, count: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((a, b) => a + (b - avg) ** 2, 0) / n;
  return {
    min: sorted[0],
    max: sorted[n - 1],
    avg,
    median: n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)],
    p95: sorted[Math.min(Math.ceil(n * 0.95) - 1, n - 1)],
    p99: sorted[Math.min(Math.ceil(n * 0.99) - 1, n - 1)],
    stddev: Math.sqrt(variance),
    count: n,
  };
}

function formatNs(ns: number): string {
  return Math.round(ns).toLocaleString("en-US").padStart(14);
}

function formatMs(ns: number): string {
  return (ns / 1e6).toFixed(3).padStart(7);
}

function showDashboard(
  url: string,
  rttNs: number | null,
  stats: Stats,
  pongs: number,
  pings: number,
  elapsed: number,
  extra?: string,
): void {
  const W = 54;
  const hr = "─".repeat(W);
  const cell = (s: string) => s + " ".repeat(Math.max(0, W - s.length));

  const out: string[] = [];
  out.push("┌" + hr + "┐");
  out.push("│ " + cell("Raiden — Guest") + " │");
  out.push("│ " + cell(url.length > W ? url.slice(0, W) : url) + " │");
  out.push("│ " + cell(`Elapsed: ${elapsed}s`) + " │");

  if (rttNs !== null) {
    out.push("├" + hr + "┤");
    out.push("│ " + cell(`RTT     ${formatNs(rttNs)} ns  ${formatMs(rttNs)} ms`) + " │");
    out.push("│ " + cell(`Jitter  ${formatNs(stats.stddev)} ns  ${formatMs(stats.stddev)} ms`) + " │");
  }

  if (stats.count >= 1) {
    out.push("├" + hr + "┤");
    const loss = pings > 0 ? ((1 - pongs / pings) * 100).toFixed(1) : "0.0";
    out.push("│ " + cell(`Samples: ${String(stats.count).padStart(3)} / 100    Loss: ${loss.padStart(4)}%`) + " │");
    if (stats.count >= 2) {
      const rows: [string, number][] = [
        ["Min", stats.min],
        ["Max", stats.max],
        ["Avg", stats.avg],
        ["Median", stats.median],
        ["P95", stats.p95],
        ["P99", stats.p99],
        ["StdDev", stats.stddev],
      ];
      for (const [label, val] of rows) {
        out.push("│ " + cell(`${label.padEnd(7)}${formatNs(val)} ns  ${formatMs(val)} ms`) + " │");
      }
    }
  }

  if (extra) {
    out.push("│ " + cell(extra.slice(0, W)) + " │");
  }

  out.push("└" + hr + "┘");
  console.clear();
  console.log(out.join("\n"));
}

function showSummary(url: string, stats: Stats, pongs: number, pings: number, elapsed: number, reason: string): void {
  const W = 54;
  const hr = "─".repeat(W);
  const cell = (s: string) => s + " ".repeat(Math.max(0, W - s.length));

  const out: string[] = [];
  out.push("┌" + hr + "┐");
  out.push("│ " + cell("Raiden — Session Summary") + " │");
  out.push("│ " + cell(url.length > W ? url.slice(0, W) : url) + " │");
  out.push("│ " + cell(reason) + " │");
  out.push("│ " + cell(`Elapsed: ${elapsed}s`) + " │");
  out.push("├" + hr + "┤");

  if (stats.count > 0) {
    const loss = pings > 0 ? ((1 - pongs / pings) * 100).toFixed(1) : "0.0";
    out.push("│ " + cell(`Samples: ${String(stats.count).padStart(3)}    Loss: ${loss.padStart(4)}%`) + " │");

    if (stats.count >= 2) {
      const rows: [string, number][] = [
        ["Min", stats.min],
        ["Max", stats.max],
        ["Avg", stats.avg],
        ["Median", stats.median],
        ["P95", stats.p95],
        ["P99", stats.p99],
        ["StdDev", stats.stddev],
      ];
      for (const [label, val] of rows) {
        out.push("│ " + cell(`${label.padEnd(7)}${formatNs(val)} ns  ${formatMs(val)} ms`) + " │");
      }
    }
  } else {
    out.push("│ " + cell("No RTT samples collected.") + " │");
  }

  out.push("└" + hr + "┘");
  console.clear();
  console.log(out.join("\n"));
}

function startGuest(): void {
  let ws: WebSocket | null = null;
  let pingTimer: Timer | null = null;
  let rttSamples: number[] = [];
  let totalPingsSent = 0;
  let totalPongsReceived = 0;
  let lastRtt: number | null = null;
  let statusMsg = "";
  let sessionStart = Bun.nanoseconds();

  function elapsedSecs(): number {
    return Math.floor((Bun.nanoseconds() - sessionStart) / 1e9);
  }

  function render(extra?: string): void {
    const stats = calcStats(rttSamples);
    showDashboard(config.url, lastRtt, stats, totalPongsReceived, totalPingsSent, elapsedSecs(), extra ?? (statusMsg || undefined));
  }

  function connect(): void {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
    if (config.attempts >= config.maxReconnectAttempts) {
      const stats = calcStats(rttSamples);
      showSummary(config.url, stats, totalPongsReceived, totalPingsSent, elapsedSecs(), "Max reconnects reached — giving up");
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
      render();

      connectionTest();
      startStablePing();
      speedTest();
    };

    ws.onmessage = (event: MessageEvent) => {
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
          statusMsg = `Connected — ${data.clients} client(s) in room`;
          render();
          break;
        case "pong": {
          const rttNs = Bun.nanoseconds() - Number(data.ts);
          rttSamples.push(rttNs);
          if (rttSamples.length > 100) rttSamples.shift();
          lastRtt = rttNs;
          totalPongsReceived++;
          render();
          break;
        }
        case "test":
          if (data.status === "ok") {
            statusMsg = "Connection test: PASSED";
            render();
          }
          break;
        case "speed": {
          const latNs = Bun.nanoseconds() - Number(data.ts);
          const sizeKB = (data.size / 1024).toFixed(2);
          statusMsg = `Speed test: ${sizeKB}KB payload, ${(latNs / 1e6).toFixed(3)}ms`;
          render();
          break;
        }
        default:
          statusMsg = `Message: ${event.data}`;
          render();
      }
    };

    ws.onerror = () => {
      statusMsg = "WebSocket error";
      render();
    };

    ws.onclose = (event: CloseEvent) => {
      if (pingTimer) clearInterval(pingTimer);
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
    pingTimer = setInterval(() => {
      ws?.send(JSON.stringify({ type: "ping", ts: Bun.nanoseconds() }));
      totalPingsSent++;
    }, config.pingInterval);
  }

  function speedTest(): void {
    for (const size of config.speedTestPayloads) {
      const payload = "x".repeat(size);
      ws?.send(JSON.stringify({ type: "speed", size, data: payload, ts: Bun.nanoseconds() }));
    }
  }

  statusMsg = "Starting...";
  render();
  connect();
}

function startHost(): void {
  const clients = new Set<WebSocket>();

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch(req: Request, server: Server) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        const upgraded = server.upgrade(req);
        if (!upgraded) return new Response("Upgrade failed", { status: 400 });
      }
      return new Response("Raiden — connect to /ws", { status: 200 });
    },
    websocket: {
      open(ws: WebSocket) {
        clients.add(ws);
        console.log("Client connected. Total:", clients.size);
        ws.send(JSON.stringify({ type: "welcome", clients: clients.size }));
      },
      message(ws: WebSocket, message: string | Buffer) {
        let data: any;
        try {
          data = JSON.parse(message.toString());
        } catch {
          for (const client of clients) {
            if (client.readyState === WebSocket.OPEN) client.send(message.toString());
          }
          return;
        }

        switch (data.type) {
          case "test":
            ws.send(JSON.stringify({ type: "test", status: "ok", echo: data.msg }));
            break;
          case "ping":
            ws.send(JSON.stringify({ type: "pong", ts: data.ts }));
            break;
          case "speed":
            ws.send(JSON.stringify({ type: "speed", size: data.size, data: data.data, ts: data.ts }));
            break;
          default:
            for (const client of clients) {
              if (client.readyState === WebSocket.OPEN) client.send(message.toString());
            }
        }
      },
      close(ws: WebSocket) {
        clients.delete(ws);
        console.log("Client disconnected. Total:", clients.size);
      },
    },
  });

  console.log(`Raiden host listening on ws://${config.host}:${config.port}/ws`);
}

if (config.mode === "host") {
  startHost();
} else {
  startGuest();
}
