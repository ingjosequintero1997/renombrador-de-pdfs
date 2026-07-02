const express = require("express");
const multer = require("multer");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const { processPdfBatch, removeFileIfExists } = require("./lib/pdfBatch");

const app = express();
const PORT = 3000;

const workspaceRoot = __dirname;
const tempDir = path.join(workspaceRoot, "temp-uploads");
const outputBaseDir = path.join(workspaceRoot, "outputs");
const outputRouteDir = path.join(outputBaseDir, "pdfs-renombrados");
const MAX_FILES_PER_BATCH = 2000;
const MAX_FILE_SIZE_MB = 75;
const MAX_FIELD_SIZE_MB = 10;

for (const dir of [tempDir, outputBaseDir, outputRouteDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: {
    files: MAX_FILES_PER_BATCH,
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    fieldSize: MAX_FIELD_SIZE_MB * 1024 * 1024,
    fields: MAX_FILES_PER_BATCH * 2
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
      return;
    }
    cb(new Error("Solo se permiten archivos PDF"));
  }
});

app.use(express.static(path.join(workspaceRoot, "public")));

function openFolderInExplorer(folderPath) {
  try {
    childProcess.spawn("explorer.exe", [folderPath], {
      detached: true,
      stdio: "ignore"
    }).unref();
  } catch (error) {
    console.error("No se pudo abrir el Explorador:", error);
  }
}

app.post("/api/process", upload.array("pdfs", MAX_FILES_PER_BATCH), async (req, res) => {
  try {
    const files = req.files || [];
    if (files.length === 0) {
      res.status(400).json({ error: "No se subieron archivos PDF." });
      return;
    }

    const rawNames = req.body.names;
    const names = Array.isArray(rawNames) ? rawNames : [rawNames];

    if (names.length !== files.length) {
      res.status(400).json({ error: "La cantidad de nombres no coincide con la cantidad de archivos." });
      return;
    }

    const batchResult = await processPdfBatch({
      files,
      names,
      batchRootDir: outputRouteDir,
      cleanupFiles: true
    });

    res.json({
      ok: true,
      outputRouteDir,
      ...batchResult
    });

    openFolderInExplorer(batchResult.outputBatchFolderPath);
  } catch (error) {
    console.error(error);
    if (req.files && Array.isArray(req.files)) {
      await Promise.all(req.files.map((file) => removeFileIfExists(file.path)));
    }
    res.status(500).json({ error: "Ocurrió un error procesando los PDFs." });
  }
});

app.use((err, _req, res, _next) => {
  if (err && err.message) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: "Error inesperado." });
});

app.listen(PORT, () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);
});
