# ⚡ Raiden

**WebSocket latency & jitter benchmark tool** with nanosecond precision.

## Features

- **Sub-millisecond precision** — Uses `Bun.nanoseconds()` for high-resolution RTT measurement
- **Live dashboard** — Real-time terminal UI with RTT, jitter, percentiles (P95, P99), and packet loss
- **Quality ratings** — Auto-classifies connection as SUPERFAST, GREAT, GOOD, POOR, BAD, VERYSLOW, with jitter stability (STABLE, OK, UNSTABLE)
- **Periodic speed tests** — Configurable payload sizes re-run on an interval to measure throughput latency
- **CSV export** — Log every RTT sample to CSV for post-analysis
- **Graceful shutdown** — Ctrl+C shows a full session summary before exiting
- **Sequence-numbered pings** — Accurate packet loss tracking
- **Reconnect with backoff** — Configurable reconnect delay and max attempts
- **Color-coded output** — ANSI colors for all displays (auto-disabled when piping)

## Quick start

```bash
# Start the host
bun run index.ts --mode host

# In another terminal, connect as a guest
bun run index.ts --mode guest
```

## Usage

```
bun run index.ts [options]
```

### Modes

| Flag | Description |
|------|-------------|
| `--mode host` | Start a WebSocket server that echoes messages |
| `--mode guest` | Connect to a host and run benchmarks (default) |

### Guest options

| Flag | Default | Description |
|------|---------|-------------|
| `--url` | `ws://localhost:8080/ws` | WebSocket server URL |
| `--ping-interval` | `5000` | Milliseconds between pings |
| `--reconnect-interval` | `3000` | Delay before reconnecting |
| `--max-reconnects` | `10` | Max reconnect attempts |
| `--sample-limit` | `100` | Max RTT samples stored for stats |
| `--speed-payloads` | `64,1024,16384` | Comma-separated payload sizes in bytes |
| `--speed-test-interval` | `30000` | Re-run speed tests every N ms (0 = once) |
| `--csv` | — | Path to export RTT samples as CSV |

### Host options

| Flag | Default | Description |
|------|---------|-------------|
| `--host` | `0.0.0.0` | Bind address |
| `--port` | `8080` | Listen port |

### Display

| Flag | Description |
|------|-------------|
| `--no-color` | Disable ANSI colors |
| `--help` | Show help |
| `--version` | Show version |

All options can also be set via environment variables (`WS_MODE`, `WS_URL`, etc.).  
CLI flags take precedence over environment variables.

## Examples

```bash
# Connect to a remote server with custom settings
bun run index.ts --url wss://example.com/ws --ping-interval 1000 --csv results.csv

# Run host on a specific port
bun run index.ts --mode host --port 9000

# One-shot speed tests only (no periodic re-runs)
bun run index.ts --speed-test-interval 0

# Large payload speed tests every 10 seconds
bun run index.ts --speed-payloads "1024,65536,1048576" --speed-test-interval 10000
```

## Quality ratings

| RTT | Rating | Color |
|-----|--------|-------|
| < 1 ms | SUPERFAST | Bright green |
| 1–5 ms | GREAT | Green |
| 5–20 ms | GOOD | Cyan |
| 20–50 ms | POOR | Yellow |
| 50–200 ms | BAD | Magenta |
| > 200 ms | VERYSLOW | Bright red |

| Jitter | Rating | Color |
|--------|--------|-------|
| < 1 ms | STABLE | Green |
| 1–5 ms | OK | Yellow |
| > 5 ms | UNSTABLE | Red |

## CSV export format

```
seq,ping_time_ns,rtt_ns,rtt_ms,jitter_ms
1,1234567890,1234567,1.235,0.042
```
