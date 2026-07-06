const pdfInput = document.getElementById("pdfInput");
const dropzone = document.getElementById("dropzone");
const fileList = document.getElementById("fileList");
const previewShell = document.getElementById("previewShell");
const previewCanvas = document.getElementById("previewCanvas");
const previewCanvasWrap = document.getElementById("previewCanvasWrap");
const pdfPageLayer = document.getElementById("pdfPageLayer");
const previewTextLayer = document.getElementById("previewTextLayer");
const previewPlaceholder = document.getElementById("previewPlaceholder");
const fileCountBadge = document.getElementById("fileCountBadge");
const activeFileName = document.getElementById("activeFileName");
const zoomIndicator = document.getElementById("zoomIndicator");
const processBtn = document.getElementById("processBtn");
const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const progressLabel = document.getElementById("progressLabel");
const statusText = document.getElementById("statusText");
const fileItemTemplate = document.getElementById("fileItemTemplate");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const fitWidthBtn = document.getElementById("fitWidthBtn");
const rotateLeftBtn = document.getElementById("rotateLeftBtn");
const rotateRightBtn = document.getElementById("rotateRightBtn");
const pageIndicator = document.getElementById("pageIndicator");

let selectedFiles = [];
let selectedIndex = -1;
let activePdf = null;
let activePage = 1;
let zoomScale = 1;
let activeRotation = 0;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

function setProgress(value, label) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  progressBar.style.width = `${safeValue}%`;
  progressLabel.textContent = label || `${safeValue}%`;
}

function showProgress() {
  progressWrap.classList.remove("hidden");
}

function hideProgress() {
  progressWrap.classList.add("hidden");
}

function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const percent = (event.loaded / event.total) * 100;
      onProgress(percent);
    });

    xhr.addEventListener("load", () => {
      const rawText = xhr.responseText || "";
      let payload = {};

      try {
        payload = rawText ? JSON.parse(rawText) : {};
      } catch (_error) {
        payload = {
          error: rawText.trim() || `Respuesta no JSON (HTTP ${xhr.status})`
        };
      }

      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        body: payload
      });
    });

    xhr.addEventListener("error", () => {
      reject(new Error("No se pudo conectar con el servidor."));
    });

    xhr.send(formData);
  });
}

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

function getBaseName(fileName) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}

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

function extractIdBasedName(candidateName) {
  const cleaned = sanitizeName(candidateName || "");
  if (!cleaned) {
    return null;
  }

  const patterns = [
    /^([A-Za-z]{2,15})[-_\s]+([A-Za-z0-9.-]{4,30})$/,
    /^([A-Za-z]{2,15})[-_\s]+([A-Za-z0-9.-]{4,30})[-_\s]+.+$/,
    /^([A-Za-z]{2,15})\s*[:#-]?\s*([0-9][A-Za-z0-9.-]{3,30}).*$/
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const idType = String(match[1] || "").toUpperCase();
      const idNumber = String(match[2] || "");
      return `${idType}-${idNumber}`;
    }
  }

  return null;
}

function isSelectionInsidePreviewLayer(selection) {
  if (!selection || selection.rangeCount === 0) {
    return false;
  }

  const range = selection.getRangeAt(0);
  return previewTextLayer.contains(range.commonAncestorContainer);
}

function getUniqueName(baseName, usedNames) {
  let candidate = baseName;
  let counter = 1;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${baseName} (${counter})`;
    counter += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

async function processClientSideBatch(filesWithNames) {
  if (!window.JSZip) {
    throw new Error("No se pudo cargar el generador ZIP.");
  }

  const zip = new window.JSZip();
  const usedFolders = new Set();
  const renamedFiles = [];

  for (const [index, item] of filesWithNames.entries()) {
    const cleanBase = sanitizeName(item.rename || "") || getBaseName(item.file.name);
    const idBasedName = extractIdBasedName(cleanBase);
    const mappedBase = idBasedName || cleanBase;
    const folderBase = sanitizeFolderName(mappedBase);
    const uniqueFolder = getUniqueName(folderBase, usedFolders);
    const finalFileBase = cleanBase;
    const finalFileName = ensurePdfExtension(finalFileBase);

    const fileBuffer = await item.file.arrayBuffer();
    const folder = zip.folder(uniqueFolder);
    folder.file(finalFileName, fileBuffer);

    renamedFiles.push({
      original: item.file.name,
      renamed: finalFileName,
      folder: uniqueFolder
    });

    const percent = Math.round(((index + 1) / filesWithNames.length) * 70);
    setProgress(percent, `Preparando archivos... ${percent}%`);
  }

  const zipBlob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (metadata) => {
      const p = 70 + Math.round((metadata.percent / 100) * 30);
      setProgress(p, `Comprimiendo lote... ${Math.min(p, 100)}%`);
    }
  );

  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const zipName = `renombrados-${stamp}.zip`;
  const objectUrl = URL.createObjectURL(zipBlob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = zipName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);

  return {
    zipName,
    renamedFiles
  };
}

function resetPreview() {
  previewShell.classList.add("empty");
  previewPlaceholder.style.display = "grid";
  previewPlaceholder.textContent = "Tu vista previa aparecera en esta area.";
  previewCanvas.width = 0;
  previewCanvas.height = 0;
  pdfPageLayer.style.width = "0px";
  pdfPageLayer.style.height = "0px";
  previewTextLayer.innerHTML = "";
  activePdf = null;
  activePage = 1;
  zoomScale = 1;
  activeRotation = 0;
  activeFileName.textContent = "Sin documento seleccionado";
  zoomIndicator.textContent = "100%";
  pageIndicator.textContent = "- / -";
  updateControls();
  selectedIndex = -1;
}

function updateControls() {
  const hasPdf = Boolean(activePdf);
  prevPageBtn.disabled = !hasPdf || activePage <= 1;
  nextPageBtn.disabled = !hasPdf || activePage >= activePdf.numPages;
  zoomInBtn.disabled = !hasPdf || zoomScale >= MAX_ZOOM;
  zoomOutBtn.disabled = !hasPdf || zoomScale <= MIN_ZOOM;
  fitWidthBtn.disabled = !hasPdf;
}

async function renderPage(pageNumber) {
  if (!activePdf) {
    return;
  }

  const page = await activePdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: zoomScale, rotation: activeRotation });
  const dpi = window.devicePixelRatio || 1;

  previewCanvas.width = Math.floor(viewport.width * dpi);
  previewCanvas.height = Math.floor(viewport.height * dpi);
  previewCanvas.style.width = `${Math.floor(viewport.width)}px`;
  previewCanvas.style.height = `${Math.floor(viewport.height)}px`;
  pdfPageLayer.style.width = `${Math.floor(viewport.width)}px`;
  pdfPageLayer.style.height = `${Math.floor(viewport.height)}px`;
  previewTextLayer.innerHTML = "";

  const context = previewCanvas.getContext("2d");
  context.setTransform(dpi, 0, 0, dpi, 0, 0);

  await page.render({
    canvasContext: context,
    viewport
  }).promise;

  try {
    const textContent = await page.getTextContent();
    const renderTask = window.pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container: previewTextLayer,
      viewport,
      textDivs: [],
      enhanceTextSelection: true
    });
    if (renderTask?.promise) {
      await renderTask.promise;
    }
  } catch (_error) {
    previewTextLayer.innerHTML = "";
  }

  pageIndicator.textContent = `${activePage} / ${activePdf.numPages}`;
  zoomIndicator.textContent = `${Math.round(zoomScale * 100)}%`;
  updateControls();
}

async function calculateFitWidthScale() {
  if (!activePdf) {
    return 1;
  }

  const page = await activePdf.getPage(activePage);
  const baseViewport = page.getViewport({ scale: 1, rotation: activeRotation });
  const availableWidth = Math.max(previewCanvasWrap.clientWidth - 40, 300);
  const newScale = availableWidth / baseViewport.width;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newScale));
}

async function showPreview(index) {
  const item = selectedFiles[index];
  if (!item) {
    resetPreview();
    return;
  }

  selectedIndex = index;
  document.querySelectorAll(".file-preview-btn").forEach((btn, idx) => {
    btn.classList.toggle("active", idx === index);
  });
  activeFileName.textContent = item.file.name;
  activeRotation = item.rotation || 0;

  previewPlaceholder.textContent = "Cargando PDF...";
  previewPlaceholder.style.display = "grid";
  previewShell.classList.remove("empty");

  try {
    const loadingTask = window.pdfjsLib.getDocument(item.url);
    const loadedPdf = await loadingTask.promise;

    if (selectedIndex !== index) {
      return;
    }

    activePdf = loadedPdf;
    activePage = 1;
    zoomScale = await calculateFitWidthScale();
    previewPlaceholder.style.display = "none";
    await renderPage(activePage);
  } catch (_error) {
    previewPlaceholder.textContent = "No se pudo previsualizar este PDF.";
    previewPlaceholder.style.display = "grid";
    activePdf = null;
    pageIndicator.textContent = "- / -";
    updateControls();
  }
}

function clearObjectUrls() {
  selectedFiles.forEach((item) => URL.revokeObjectURL(item.url));
}

function renderFileList() {
  fileList.innerHTML = "";

  selectedFiles.forEach((item, index) => {
    const fragment = fileItemTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".file-item");
    const previewBtn = fragment.querySelector(".file-preview-btn");
    const nameInput = fragment.querySelector(".name-input");

    previewBtn.textContent = item.file.name;
    previewBtn.addEventListener("click", () => showPreview(index));

    nameInput.value = item.rename;
    nameInput.placeholder = "Nombre nuevo";
    nameInput.dataset.index = String(index);
    nameInput.addEventListener("input", (e) => {
      selectedFiles[index].rename = e.target.value;
    });

    row.dataset.index = String(index);
    fileList.appendChild(fragment);
  });

  processBtn.disabled = selectedFiles.length === 0;
  fileCountBadge.textContent = `${selectedFiles.length} archivo${selectedFiles.length === 1 ? "" : "s"}`;

  if (selectedFiles.length > 0) {
    void showPreview(0);
  } else {
    resetPreview();
  }
}

function loadFiles(fileLikeList) {
  const files = Array.from(fileLikeList || []).filter((file) => file.type === "application/pdf");

  clearObjectUrls();
  selectedFiles = files.map((file) => ({
    file,
    rename: getBaseName(file.name),
    rotation: 0,
    url: URL.createObjectURL(file)
  }));

  statusText.textContent = selectedFiles.length
    ? `${selectedFiles.length} PDF(s) listos para renombrar.`
    : "No se detectaron archivos PDF válidos.";

  renderFileList();
}

pdfInput.addEventListener("change", (event) => {
  loadFiles(event.target.files);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-over");
  });
});

["dragleave", "dragend", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag-over");
  });
});

dropzone.addEventListener("drop", (event) => {
  loadFiles(event.dataTransfer?.files || []);
});

prevPageBtn.addEventListener("click", async () => {
  if (!activePdf || activePage <= 1) {
    return;
  }
  activePage -= 1;
  await renderPage(activePage);
});

nextPageBtn.addEventListener("click", async () => {
  if (!activePdf || activePage >= activePdf.numPages) {
    return;
  }
  activePage += 1;
  await renderPage(activePage);
});

zoomInBtn.addEventListener("click", async () => {
  if (!activePdf) {
    return;
  }
  zoomScale = Math.min(MAX_ZOOM, zoomScale + 0.2);
  await renderPage(activePage);
});

zoomOutBtn.addEventListener("click", async () => {
  if (!activePdf) {
    return;
  }
  zoomScale = Math.max(MIN_ZOOM, zoomScale - 0.2);
  await renderPage(activePage);
});

fitWidthBtn.addEventListener("click", async () => {
  if (!activePdf) {
    return;
  }
  zoomScale = await calculateFitWidthScale();
  await renderPage(activePage);
});

rotateLeftBtn.addEventListener("click", async () => {
  if (!activePdf || selectedIndex < 0) {
    return;
  }

  activeRotation = (activeRotation + 270) % 360;
  selectedFiles[selectedIndex].rotation = activeRotation;
  zoomScale = await calculateFitWidthScale();
  await renderPage(activePage);
});

rotateRightBtn.addEventListener("click", async () => {
  if (!activePdf || selectedIndex < 0) {
    return;
  }

  activeRotation = (activeRotation + 90) % 360;
  selectedFiles[selectedIndex].rotation = activeRotation;
  zoomScale = await calculateFitWidthScale();
  await renderPage(activePage);
});

document.addEventListener("copy", (event) => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !isSelectionInsidePreviewLayer(selection)) {
    return;
  }

  const selectedText = selection.toString().replace(/\s+/g, " ").trim();
  if (!selectedText) {
    return;
  }

  const idOnly = extractIdBasedName(selectedText);
  const finalText = idOnly || selectedText;

  if (event.clipboardData) {
    event.preventDefault();
    event.clipboardData.setData("text/plain", finalText);
    statusText.textContent = idOnly
      ? `Copiado: ${idOnly}`
      : "Texto copiado desde la previsualizacion.";
  }
});

window.addEventListener("resize", async () => {
  if (!activePdf) {
    return;
  }
  zoomScale = await calculateFitWidthScale();
  await renderPage(activePage);
});

processBtn.addEventListener("click", async () => {
  if (selectedFiles.length === 0) {
    return;
  }

  const filesWithNames = selectedFiles.map((item) => ({
    file: item.file,
    rename: item.rename.trim() || getBaseName(item.file.name)
  }));

  processBtn.disabled = true;
  statusText.textContent = "Iniciando procesamiento...";
  showProgress();
  setProgress(0, "Preparando lote...");

  try {
    const result = await processClientSideBatch(filesWithNames);

    const lines = result.renamedFiles
      .map((f) => `${f.original} -> ${f.folder}/${f.renamed}`)
      .join(" | ");

    statusText.textContent = `Lote completado. Se descargó ${result.zipName} con las carpetas generadas. Detalle: ${lines}`;

    setProgress(100, "Completado 100%");
  } catch (error) {
    statusText.textContent = `Error: ${error.message}`;
    setProgress(0, "Error en el procesamiento");
  } finally {
    processBtn.disabled = false;
    setTimeout(() => {
      hideProgress();
    }, 1600);
  }
});

resetPreview();
