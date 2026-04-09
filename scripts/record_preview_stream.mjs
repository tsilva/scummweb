import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultFps = 1;
const defaultPollMs = 250;
const defaultReadRetryMs = 25;
const defaultReadTimeoutMs = 1000;
const defaultInputPath = path.join(rootDir, "artifacts", "play-peek.jpg");
const defaultOutputPath = path.join(rootDir, "artifacts", "play-peek.ts");

function delay(timeoutMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

function usage() {
  return [
    "Usage: node scripts/record_preview_stream.mjs [--input <jpg>] [--output <ts>] [--fps <n>] [--poll-ms <n>] [--ffmpeg <path>]",
    "",
    "Appends each distinct rewritten preview JPEG to a live-growing MPEG-TS stream.",
    `Defaults: --input ${defaultInputPath} --output ${defaultOutputPath} --fps ${defaultFps} --poll-ms ${defaultPollMs}`,
  ].join("\n");
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    ffmpegPath: "ffmpeg",
    fps: defaultFps,
    inputPath: defaultInputPath,
    outputPath: defaultOutputPath,
    pollMs: defaultPollMs,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];

    switch (token) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--input":
        options.inputPath = value;
        index += 1;
        break;
      case "--output":
        options.outputPath = value;
        index += 1;
        break;
      case "--fps":
        options.fps = Number(value);
        index += 1;
        break;
      case "--poll-ms":
        options.pollMs = Number(value);
        index += 1;
        break;
      case "--ffmpeg":
        options.ffmpegPath = value;
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!options.help) {
    if (!Number.isFinite(options.fps) || options.fps <= 0) {
      throw new Error("--fps must be a positive number");
    }

    if (!Number.isFinite(options.pollMs) || options.pollMs <= 0) {
      throw new Error("--poll-ms must be a positive number");
    }
  }

  return options;
}

export function computeFrameDigest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function waitForFile(filePath, options = {}) {
  const pollMs = options.pollMs ?? defaultReadRetryMs;
  const timeoutMs = options.timeoutMs ?? defaultReadTimeoutMs;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      const stat = await fs.promises.stat(filePath);

      if (stat.size > 0) {
        return true;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }

    await delay(pollMs);
  }

  return false;
}

export function buildFfmpegArgs({ fps, outputPath } = {}) {
  if (!outputPath) {
    throw new Error("buildFfmpegArgs requires an outputPath");
  }

  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error("buildFfmpegArgs requires a positive fps value");
  }

  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "-framerate",
    String(fps),
    "-i",
    "pipe:0",
    "-an",
    "-vf",
    "scale=in_range=full:out_range=tv,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-x264-params",
    "keyint=1:min-keyint=1:scenecut=0:repeat-headers=1",
    "-pix_fmt",
    "yuv420p",
    "-color_range",
    "tv",
    "-flush_packets",
    "1",
    "-muxdelay",
    "0",
    "-muxpreload",
    "0",
    "-mpegts_flags",
    "resend_headers",
    "-f",
    "mpegts",
    outputPath,
  ];
}

export function spawnMpegTsEncoder({
  ffmpegPath = "ffmpeg",
  fps = defaultFps,
  outputPath,
  spawnFn = spawn,
} = {}) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const ffmpegArgs = buildFfmpegArgs({ fps, outputPath });
  const child = spawnFn(ffmpegPath, ffmpegArgs, {
    stdio: ["pipe", "ignore", "pipe"],
  });
  let stderr = "";

  child.stderr?.setEncoding?.("utf8");
  child.stderr?.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4000);
  });

  const exitPromise = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `ffmpeg exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "none"})${stderr ? `: ${stderr}` : ""}`,
        ),
      );
    });
  });

  return {
    async writeFrame(bytes) {
      if (!child.stdin.writable) {
        throw new Error("ffmpeg stdin is not writable");
      }

      if (!child.stdin.write(bytes)) {
        await once(child.stdin, "drain");
      }
    },
    async close() {
      child.stdin.end();
      await exitPromise;
    },
  };
}

export async function openPathInVlc({
  target,
  platform = process.platform,
  spawnFn = spawn,
} = {}) {
  if (!target || platform !== "darwin") {
    return false;
  }

  const child = spawnFn("open", ["-a", "VLC", target], {
    detached: true,
    stdio: "ignore",
  });
  child.unref?.();
  return true;
}

export function createGrowingTsHttpServer({
  host = "127.0.0.1",
  outputPath,
  pathName = "/play-peek.ts",
  pollMs = defaultPollMs,
} = {}) {
  if (!outputPath) {
    throw new Error("createGrowingTsHttpServer requires an outputPath");
  }

  const clients = new Set();
  let server = null;
  let stopped = false;
  let streamTimer = null;

  async function pumpClient(client) {
    if (client.pumping || client.closed) {
      return;
    }

    client.pumping = true;

    try {
      while (!client.closed) {
        let stat;

        try {
          stat = await fs.promises.stat(outputPath);
        } catch (error) {
          if (error?.code === "ENOENT") {
            break;
          }

          throw error;
        }

        if (stat.size <= client.offset) {
          break;
        }

        const stream = fs.createReadStream(outputPath, {
          end: stat.size - 1,
          start: client.offset,
        });

        for await (const chunk of stream) {
          if (client.closed || !client.response.writable) {
            stream.destroy();
            break;
          }

          if (!client.response.write(chunk)) {
            await once(client.response, "drain");
          }
        }

        client.offset = stat.size;
      }
    } finally {
      client.pumping = false;
    }
  }

  function closeClient(client) {
    if (client.closed) {
      return;
    }

    client.closed = true;
    clients.delete(client);
    client.response.end();
  }

  return {
    async start() {
      if (server) {
        return server;
      }

      server = http.createServer(async (request, response) => {
        if (request.url !== pathName) {
          response.writeHead(404);
          response.end("Not Found");
          return;
        }

        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Connection": "keep-alive",
          "Content-Type": "video/mp2t",
        });

        const client = {
          closed: false,
          offset: 0,
          pumping: false,
          response,
        };
        clients.add(client);

        request.on("close", () => {
          closeClient(client);
        });

        response.on("close", () => {
          closeClient(client);
        });

        await pumpClient(client);
      });

      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, host, resolve);
      });

      streamTimer = setInterval(() => {
        for (const client of clients) {
          void pumpClient(client);
        }
      }, pollMs);
      streamTimer.unref?.();

      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Unable to determine HTTP server address");
      }

      return {
        host,
        pathName,
        port: address.port,
        url: `http://${host}:${address.port}${pathName}`,
      };
    },
    async stop() {
      stopped = true;

      if (streamTimer) {
        clearInterval(streamTimer);
      }

      for (const client of [...clients]) {
        closeClient(client);
      }

      if (!server) {
        return;
      }

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      server = null;
    },
  };
}

async function readFileWhenReady(filePath, options = {}) {
  const pollMs = options.pollMs ?? defaultReadRetryMs;
  const timeoutMs = options.timeoutMs ?? defaultReadTimeoutMs;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      const bytes = await fs.promises.readFile(filePath);

      if (bytes.length > 0) {
        return bytes;
      }
    } catch (error) {
      if (!["ENOENT", "EBUSY"].includes(error?.code)) {
        throw error;
      }
    }

    await delay(pollMs);
  }

  return null;
}

function matchesWatchedFile(filePath, fileName) {
  if (!fileName) {
    return true;
  }

  const normalized = String(fileName);
  const baseName = path.basename(filePath);
  return normalized === baseName || normalized === `${baseName}.tmp`;
}

export function createPreviewFileMonitor({
  inputPath,
  onBytes,
  pollMs = defaultPollMs,
  useFsWatch = true,
} = {}) {
  if (!inputPath) {
    throw new Error("createPreviewFileMonitor requires an inputPath");
  }

  if (typeof onBytes !== "function") {
    throw new Error("createPreviewFileMonitor requires an onBytes callback");
  }

  const inputDir = path.dirname(inputPath);
  let stopped = false;
  let watcher = null;
  let pollTimer = null;
  let scanInFlight = null;
  let rescanRequested = false;
  let lastObservedVersion = null;

  async function scan(reason = "manual") {
    if (stopped) {
      return;
    }

    if (scanInFlight) {
      rescanRequested = true;
      return scanInFlight;
    }

    scanInFlight = (async () => {
      do {
        rescanRequested = false;

        let stat;

        try {
          stat = await fs.promises.stat(inputPath);
        } catch (error) {
          if (error?.code === "ENOENT") {
            continue;
          }

          throw error;
        }

        const version = `${stat.size}:${stat.mtimeMs}`;

        if (version === lastObservedVersion) {
          continue;
        }

        const bytes = await readFileWhenReady(inputPath);

        if (!bytes) {
          continue;
        }

        lastObservedVersion = version;
        await onBytes(bytes, { inputPath, reason, stat });
      } while (rescanRequested && !stopped);
    })().finally(() => {
      scanInFlight = null;
    });

    return scanInFlight;
  }

  return {
    async start() {
      fs.mkdirSync(inputDir, { recursive: true });

      if (useFsWatch) {
        watcher = fs.watch(inputDir, (eventType, fileName) => {
          if (eventType && !matchesWatchedFile(inputPath, fileName)) {
            return;
          }

          void scan("watch");
        });
      }

      pollTimer = setInterval(() => {
        void scan("poll");
      }, pollMs);
      pollTimer.unref?.();

      await scan("startup");
    },
    async stop() {
      stopped = true;
      watcher?.close();

      if (pollTimer) {
        clearInterval(pollTimer);
      }

      await scanInFlight;
    },
  };
}

export function createPreviewStreamRecorder({
  createEncoder = spawnMpegTsEncoder,
  createHttpServer = createGrowingTsHttpServer,
  ffmpegPath = "ffmpeg",
  fps = defaultFps,
  inputPath,
  openInVlc = openPathInVlc,
  outputPath,
  pollMs = defaultPollMs,
  useFsWatch = true,
} = {}) {
  if (!inputPath) {
    throw new Error("createPreviewStreamRecorder requires an inputPath");
  }

  if (!outputPath) {
    throw new Error("createPreviewStreamRecorder requires an outputPath");
  }

  let encoder = null;
  let httpServerInfo = null;
  let lastDigest = null;
  let vlcOpened = false;
  const httpServer = createHttpServer({ outputPath, pollMs });
  const monitor = createPreviewFileMonitor({
    inputPath,
    onBytes: async (bytes) => {
      const digest = computeFrameDigest(bytes);

      if (digest === lastDigest) {
        return;
      }

      lastDigest = digest;

      if (!encoder) {
        encoder = createEncoder({
          ffmpegPath,
          fps,
          outputPath,
        });
      }

      await encoder.writeFrame(bytes);

      if (!vlcOpened) {
        try {
          const streamTarget = httpServerInfo?.url || outputPath;
          vlcOpened = await openInVlc({ target: streamTarget });
        } catch {
          vlcOpened = false;
        }
      }
    },
    pollMs,
    useFsWatch,
  });

  return {
    async start() {
      httpServerInfo = await httpServer.start();
      await monitor.start();
      return {
        httpStreamUrl: httpServerInfo?.url || null,
      };
    },
    async stop() {
      await monitor.stop();

      if (encoder) {
        await encoder.close();
      }

      await httpServer.stop();
    },
  };
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    console.log(usage());
    return;
  }

  const recorder = createPreviewStreamRecorder(options);
  const session = await recorder.start();
  console.log(`Watching ${options.inputPath} and appending distinct frames to ${options.outputPath}`);
  if (session.httpStreamUrl) {
    console.log(`Streaming VLC-compatible preview at ${session.httpStreamUrl}`);
  }

  let stopping = false;
  const stop = async (signal = "shutdown") => {
    if (stopping) {
      return;
    }

    stopping = true;
    console.log(`Stopping preview recorder (${signal})`);
    await recorder.stop();
  };

  const handleSignal = (signal) => {
    void stop(signal).finally(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
