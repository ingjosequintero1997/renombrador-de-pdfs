# Renombrador PDF Studio

Herramienta web para previsualizar PDFs, girarlos si hace falta, renombrarlos y generar carpetas por archivo.

## Uso local

```bash
npm install
npm start
```

Abre `http://localhost:3000`.

## Despliegue en Vercel

- Sube el proyecto a GitHub.
- Conecta el repositorio en Vercel.
- La interfaz queda en `public/`.
- La API de procesamiento vive en `api/process.js`.

## Nota

El flujo local conserva la apertura automática de carpetas en Windows. En Vercel, el procesamiento funciona como función serverless, pero sin abrir el Explorador del sistema.
