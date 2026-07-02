const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

function sanitizeName(name) {
  return String(name || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ensurePdfExtension(name) {
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

function sanitizeFolderName(name) {
  return sanitizeName(name)
    .replace(/[.]+$/g, "")
    .trim() || "sin-nombre";
}

function uniquePath(dir, desiredName) {
  const ext = path.extname(desiredName);
  const base = path.basename(desiredName, ext);
  let candidate = desiredName;
  let counter = 1;

  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base} (${counter})${ext}`;
    counter += 1;
  }

  return path.join(dir, candidate);
}

function uniqueFolderPath(parentDir, desiredFolderName) {
  let candidate = desiredFolderName;
  let counter = 1;

  while (fs.existsSync(path.join(parentDir, candidate))) {
    candidate = `${desiredFolderName} (${counter})`;
    counter += 1;
  }

  return path.join(parentDir, candidate);
}

async function removeFileIfExists(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch (_error) {
    // Ignore cleanup errors for temp files.
  }
}

function getSourcePath(fileRecord) {
  return fileRecord.path || fileRecord.filepath || fileRecord.tempFilePath || "";
}

function getOriginalName(fileRecord, sourcePath) {
  return fileRecord.originalname || fileRecord.originalFilename || path.basename(sourcePath || "archivo.pdf");
}

async function processPdfBatch({ files, names, batchRootDir, cleanupFiles = true }) {
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const outputBatchFolderName = `renombrados-${stamp}`;
  const outputBatchFolderPath = path.join(batchRootDir, outputBatchFolderName);

  await fsp.mkdir(outputBatchFolderPath, { recursive: true });

  const renamedFiles = [];
  const createdFolders = [];

  for (const [index, fileRecord] of files.entries()) {
    const sourcePath = getSourcePath(fileRecord);
    const originalName = getOriginalName(fileRecord, sourcePath);
    const cleaned = sanitizeName(names[index] || "");
    const fallback = path.parse(originalName).name;
    const finalBaseName = cleaned || fallback;
    const finalName = ensurePdfExtension(finalBaseName);

    const folderName = sanitizeFolderName(finalBaseName);
    const folderPath = uniqueFolderPath(outputBatchFolderPath, folderName);
    await fsp.mkdir(folderPath, { recursive: true });

    const destinationPath = uniquePath(folderPath, finalName);
    await fsp.copyFile(sourcePath, destinationPath);

    renamedFiles.push({
      original: originalName,
      renamed: path.basename(destinationPath),
      folder: path.basename(folderPath)
    });

    createdFolders.push(path.basename(folderPath));

    if (cleanupFiles) {
      await removeFileIfExists(sourcePath);
    }
  }

  return {
    outputBatchFolderName,
    outputBatchFolderPath,
    createdFolders,
    renamedFiles
  };
}

module.exports = {
  processPdfBatch,
  sanitizeName,
  ensurePdfExtension,
  sanitizeFolderName,
  uniquePath,
  uniqueFolderPath,
  removeFileIfExists
};
