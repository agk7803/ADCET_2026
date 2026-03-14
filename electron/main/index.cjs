// electron/main/index.cjs
const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const waitPort = require("wait-port");

const devForceVenv = true;
const debugShowBackendConsole = true;

let backendProc = null;

function pickPythonExecutable() {
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
        return process.env.PYTHON_PATH;
    }

    // Check project-root .venv first (where dependencies are installed)
    const projectRoot = path.join(__dirname, "..", "..");
    const isWin = process.platform === "win32";

    const rootVenv = isWin
        ? path.join(projectRoot, ".venv", "Scripts", "python.exe")
        : path.join(projectRoot, ".venv", "bin", "python3");

    if (devForceVenv && fs.existsSync(rootVenv)) {
        return rootVenv;
    }

    // Fallback to backend-level .venv
    const backendVenv = isWin
        ? path.join(projectRoot, "backend", ".venv", "Scripts", "python.exe")
        : path.join(projectRoot, "backend", ".venv", "bin", "python3");

    if (devForceVenv && fs.existsSync(backendVenv)) {
        return backendVenv;
    }

    return isWin ? "python" : "python3";
}

function startBackendProc(cmd, args, options) {
    const p = spawn(cmd, args, options);
    p.stdout?.on("data", (d) => console.log("[backend]", d.toString()));
    p.stderr?.on("data", (d) => console.error("[backend ERROR]", d.toString()));
    p.on("exit", (code, signal) => console.log("[backend] exited:", code, signal));
    return p;
}

const { execSync } = require("child_process");

if (process.platform === "win32") {
    try {
        execSync("taskkill /IM python.exe /F", { stdio: "ignore" });
    } catch { }
}

async function startBackend() {
    const projectRoot = path.join(__dirname, "..", "..");
    const serverScript = path.join(projectRoot, "backend", "server.py");

    if (fs.existsSync(serverScript)) {
        const pythonExe = pickPythonExecutable();
        backendProc = startBackendProc(
            pythonExe,
            ["-m", "uvicorn", "backend.server:app", "--host", "127.0.0.1", "--port", "8000", "--reload"],
            { cwd: projectRoot, shell: true, windowsHide: !debugShowBackendConsole }
        );
    }

    const ok = await waitPort({ host: "127.0.0.1", port: 8000, timeout: 20000 });
    return ok;
}

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

async function createWindow() {
    const ok = await startBackend();
    if (!ok) console.error("[main] Backend failed to start.");

    const win = new BrowserWindow({
        title: "Railway Track Inspection System",
        icon: path.join(__dirname, "..", "..", "build", "railsuraksha.jpg"),
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
            preload: path.join(__dirname, "..", "preload", "index.cjs"),
        },
    });

    // Prevent window.open() from creating blank popup windows
    // Instead, download files (e.g. PDF reports) directly to the storage folder
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.includes("/report") || url.includes("/download") || url.endsWith(".pdf")) {
            win.webContents.downloadURL(url);
            return { action: "deny" };
        }
        return { action: "deny" };
    });

    // Handle file downloads — auto-save to storage folder
    win.webContents.session.on("will-download", (event, item) => {
        const fileName = item.getFilename();
        const desktopPath = path.join(os.homedir(), "Desktop");
        const reportRoot = path.join(desktopPath, "report");

        let savePath = "";
        const lowerName = (fileName || "").toLowerCase();

        // 1. If it's a PDF and has "report" in name, STRICTLY land in Desktop/report/...
        if (lowerName.includes("report") && lowerName.endsWith(".pdf")) {
            // Priority 1: Filename has timestamp
            const reportMatch = (fileName || "").match(/session_report_(\d{8}_\d{6})\.pdf/);
            if (reportMatch) {
                const ts = reportMatch[1];
                const sessionDir = path.join(reportRoot, ts);
                if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
                savePath = path.join(sessionDir, fileName);
            } else {
                // Priority 2: Try to find the MOST RECENT session folder on Desktop
                let targetDir = reportRoot;
                if (fs.existsSync(reportRoot)) {
                    const dirs = fs.readdirSync(reportRoot).filter(d => fs.lstatSync(path.join(reportRoot, d)).isDirectory());
                    if (dirs.length > 0) {
                        const sortedDirs = dirs.sort((a, b) => b.localeCompare(a)); // Newest first (YYYYMMDD_HHMMSS)
                        targetDir = path.join(reportRoot, sortedDirs[0]);
                    }
                } else {
                    fs.mkdirSync(reportRoot, { recursive: true });
                }
                savePath = path.join(targetDir, fileName || "session_report.pdf");
            }
        } else {
            // 2. Fallback for other non-report exports (Telemetry, Acceleration, etc.)
            const storageDir = path.join(__dirname, "..", "..", "..", "storage");
            let subFolder = "";

            if (lowerName.includes("telemetry") && lowerName.endsWith(".csv")) {
                subFolder = "Exports";
            } else if (lowerName.includes("acceleration") && lowerName.endsWith(".xlsx")) {
                subFolder = "Acceleration";
            } else if (lowerName.includes("export") && lowerName.endsWith(".xlsx")) {
                subFolder = "Infringements";
            }

            const finalDir = subFolder ? path.join(storageDir, subFolder) : storageDir;
            if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });
            savePath = path.join(finalDir, fileName || "export.dat");
        }

        item.setSavePath(savePath);

        item.once("done", (e, state) => {
            if (state === "completed") {
                shell.showItemInFolder(savePath);
            }
        });
    });

    const indexHtml = path.join(__dirname, "..", "..", "frontend", "dist", "index.html");
    if (fs.existsSync(indexHtml)) {
        win.loadFile(indexHtml);
    } else {
        win.loadURL("http://localhost:5173");
    }
}

app.whenReady().then(() => {
    if (process.platform === 'darwin') {
        app.dock.setIcon(path.join(__dirname, "..", "..", "build", "railsuraksha.jpg"));
    }
    createWindow();
});

app.on("before-quit", () => {
    if (backendProc) {
        backendProc.kill();
        if (process.platform === "win32") {
            spawn("taskkill", ["/PID", String(backendProc.pid), "/F"], { windowsHide: true });
        }
    }
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
