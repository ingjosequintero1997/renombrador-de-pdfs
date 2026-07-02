const os = require("os");
const path = require("path");
const formidable = require("formidable");
const { processPdfBatch } = require("../lib/pdfBatch");

const MAX_FILES_PER_BATCH = 2000;
const MAX_FILE_SIZE_MB = 75;

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value];
}

function parseForm(req) {
  const form = formidable({
    multiples: true,
    keepExtensions: true,
    uploadDir: os.tmpdir(),
    maxFiles: MAX_FILES_PER_BATCH,
    maxFileSize: MAX_FILE_SIZE_MB * 1024 * 1024
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (error, fields, files) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ fields, files });
    });
  });
}

function normalizeFiles(fileInput) {
  const files = toArray(fileInput);
  return files.map((file) => ({
    filepath: file.filepath,
    originalFilename: file.originalFilename,
    mimetype: file.mimetype
  }));
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Método no permitido." });
      return;
    }

    const { fields, files } = await parseForm(req);
    const uploadedFiles = normalizeFiles(files.pdfs);

    if (uploadedFiles.length === 0) {
      res.status(400).json({ error: "No se subieron archivos PDF." });
      return;
    }

    const names = toArray(fields.names);
    if (names.length !== uploadedFiles.length) {
      res.status(400).json({ error: "La cantidad de nombres no coincide con la cantidad de archivos." });
      return;
    }

    const outputRouteDir = path.join(os.tmpdir(), "outputs", "pdfs-renombrados");
    const batchResult = await processPdfBatch({
      files: uploadedFiles,
      names,
      batchRootDir: outputRouteDir,
      cleanupFiles: true
    });

    res.status(200).json({
      ok: true,
      outputRouteDir,
      deployment: "vercel",
      ...batchResult
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ocurrió un error procesando los PDFs." });
  }
};
