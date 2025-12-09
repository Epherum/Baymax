"use strict";

const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const DEFAULT_PORT = process.env.PORT || 3939;
let serverProcess = null;

function ensureUserDb() {
  const userDbDir = path.join(app.getPath("userData"), "db");
  const userDb = path.join(userDbDir, "baymax.sqlite");
  const userSchema = path.join(userDbDir, "schema.sql");
  const sourceDb = path.join(app.getAppPath(), "db", "baymax.sqlite");
  const sourceSchema = path.join(app.getAppPath(), "db", "schema.sql");

  fs.mkdirSync(userDbDir, { recursive: true });
  if (!fs.existsSync(userDb) && fs.existsSync(sourceDb)) {
    fs.copyFileSync(sourceDb, userDb);
  }
  if (!fs.existsSync(userSchema) && fs.existsSync(sourceSchema)) {
    fs.copyFileSync(sourceSchema, userSchema);
  }

  return userDb;
}

function waitForServer(url, attempts = 20, delay = 300) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const res = await fetch(url);
        if (res.ok) {
          clearInterval(timer);
          resolve(true);
        }
      } catch {
        // keep waiting
      }
      if (tries >= attempts) {
        clearInterval(timer);
        reject(new Error("Server did not start in time"));
      }
    }, delay);
  });
}

function startServer(dbPath) {
  const serverScript = path.join(app.getAppPath(), "server.js");
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(DEFAULT_PORT),
    BAYMAX_DB_PATH: dbPath,
  };

  serverProcess = spawn(process.execPath, [serverScript], {
    env,
    cwd: app.getAppPath(),
    stdio: "inherit",
  });

  serverProcess.on("exit", () => {
    serverProcess = null;
    if (!app.isQuiting) {
      app.quit();
    }
  });
}

async function createWindow() {
  const dbPath = ensureUserDb();
  startServer(dbPath);

  await waitForServer(`http://localhost:${DEFAULT_PORT}/api/health`).catch(() => {});

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#f8fafc",
    webPreferences: {
      contextIsolation: true,
      preload: path.join(app.getAppPath(), "electron", "preload.js"),
    },
  });

  await win.loadURL(`http://localhost:${DEFAULT_PORT}`);

  win.on("closed", () => {
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  app.isQuiting = true;
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});
