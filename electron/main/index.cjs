// electron/main/index.cjs
const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
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

async function createWindow() {
    const ok = await startBackend();
    if (!ok) console.error("[main] Backend failed to start.");

    const win = new BrowserWindow({
        title: "Railway Track Inspection System",
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
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
        const fileName = item.getFilename() || "report.pdf";
        const storageDir = path.join(__dirname, "..", "..", "..", "storage");

        const lowerName = fileName.toLowerCase();
        let subFolder = "";

        if (lowerName.includes("report") && lowerName.endsWith(".pdf")) {
            subFolder = "Reports";
        } else if (lowerName.includes("telemetry") && lowerName.endsWith(".csv")) {
            subFolder = "Exports";
        } else if (lowerName.includes("acceleration") && lowerName.endsWith(".xlsx")) {
            subFolder = "Acceleration";
        } else if (lowerName.includes("export") && lowerName.endsWith(".xlsx")) {
            subFolder = "Infringements";
        }

        const finalStorageDir = path.join(storageDir, subFolder);

        if (!fs.existsSync(finalStorageDir)) {
            fs.mkdirSync(finalStorageDir, { recursive: true });
        }

        const savePath = path.join(finalStorageDir, fileName);
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

app.whenReady().then(createWindow);

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
