import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import {
  GebcoTileManager,
  formatCoordinateString,
  validateCoordinates,
  type BathymetryRetrievalMode
} from './server/gebco-tile-manager.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

export async function createMarivexApp() {
  const app = express();
  app.use(express.json());

  // Authoritative GEBCO / NOAA Bathymetry Tile Manager
  const gebcoManager = new GebcoTileManager(__dirname);

  // Server-side Gemini API proxy route
  app.post('/api/ask', async (req, res) => {
    const { question, context } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({ text: null, sources: [], isLiveAi: false });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });

      const hasValidCoords =
        context?.coords &&
        typeof context.coords.latitude === 'number' &&
        typeof context.coords.longitude === 'number' &&
        Number.isFinite(context.coords.latitude) &&
        Number.isFinite(context.coords.longitude);

      const formattedCoords = hasValidCoords
        ? formatCoordinateString(context.coords.latitude, context.coords.longitude, 2)
        : 'Global grid';

      const bMeta = context?.bathymetryMeta || {};
      const datasetSource =
        bMeta.source ||
        context?.oceanData?.bathymetrySource ||
        'NOAA ETOPO 2022 / GEBCO Bathymetric Grid';
      const resolutionArcSec = bMeta.resolutionArcSec || context?.oceanData?.resolutionArcSec || 60;
      const provenance = bMeta.provenance || context?.oceanData?.provenance || 'authoritative_online';
      const depthVal =
        context?.oceanData?.bathymetryDepth ??
        context?.depth ??
        bMeta.centerDepth ??
        null;
      const elevationVal =
        bMeta.centerElevation ??
        (typeof depthVal === 'number' ? -depthVal : null);

      const depthSummary =
        depthVal !== null && depthVal !== undefined
          ? `${depthVal} meters below sea level (signed elevation: ${elevationVal ?? -depthVal} m, source: ${datasetSource}, resolution: ${resolutionArcSec}", provenance: ${provenance})`
          : `Unavailable (${datasetSource})`;

      const systemPrompt = `You are "Ask MARIVEX", an expert marine scientist and oceanographic telemetry assistant for the MARIVEX 3D ocean visualizer.
You provide precise, scientifically accurate answers grounded in available datasets.
Current Telemetry Context:
- Coordinates: ${formattedCoords}
- Region: ${context?.region?.name || context?.oceanData?.oceanBasin || 'Open Ocean'}
- Seafloor Depth: ${depthSummary}
- Significant Wave Height (Thgt): ${context?.oceanData?.waveHeight !== null && context?.oceanData?.waveHeight !== undefined ? `${context.oceanData.waveHeight} m` : 'N/A'}
- Wave Period (Tper): ${context?.oceanData?.wavePeriod !== null && context?.oceanData?.wavePeriod !== undefined ? `${context.oceanData.wavePeriod} s` : 'N/A'}
- Wave Direction (Tdir): ${context?.oceanData?.waveDirection !== null && context?.oceanData?.waveDirection !== undefined ? `${context.oceanData.waveDirection}°` : 'N/A'}
- Sea Surface Temperature: ${context?.oceanData?.temperature !== null && context?.oceanData?.temperature !== undefined ? `${context.oceanData.temperature} °C` : 'N/A'}
- Surface Wind Speed: ${context?.oceanData?.windSpeed !== null && context?.oceanData?.windSpeed !== undefined ? `${context.oceanData.windSpeed} km/h` : 'N/A'}
- Current Velocity: ${context?.oceanData?.currentSpeed !== null && context?.oceanData?.currentSpeed !== undefined ? `${context.oceanData.currentSpeed} km/h` : 'N/A'}
- Observation Timestamp: ${context?.oceanData?.time || 'Current UTC Synoptic Cycle'}
- Data Source: NOAA WaveWatch III (WW3 via ERDDAP), Open-Meteo High-Resolution Marine, ${datasetSource} (${resolutionArcSec}" grid, provenance: ${provenance}).

Rules:
1. Always state numerical values with proper units, hemisphere suffixes (N/S, E/W), and timestamps.
2. Clearly distinguish empirical measurements from physical oceanographic explanations or modelled fallback estimates.
3. If data is not available or is a modelled fallback, state that explicitly. Never invent numbers.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${systemPrompt}\n\nUser Question: ${question}`
      });

      if (response && response.text) {
        return res.json({
          text: response.text,
          sources: [
            'NOAA WaveWatch III (ERDDAP)',
            'Open-Meteo Marine Grid',
            `${datasetSource} (${resolutionArcSec}" · ${provenance})`
          ],
          isLiveAi: true
        });
      }

      return res.json({ text: null, sources: [], isLiveAi: false });
    } catch (err: any) {
      console.warn('Gemini proxy error:', err?.message || err);
      return res.json({ text: null, sources: [], isLiveAi: false });
    }
  });

  // Manifest route for bathymetry tiles
  app.get('/api/bathymetry/manifest', (_req, res) => {
    const manifest = gebcoManager.getManifest();
    if (manifest) {
      return res.json(manifest);
    }
    return res.status(404).json({
      status: 'error',
      error: 'Bathymetry manifest not available'
    });
  });

  // Live on-disk bathymetry dataset & tile verification status
  app.get('/api/bathymetry/status', (_req, res) => {
    const statusReport = gebcoManager.getStatus();
    return res.json(statusReport);
  });

  // Authoritative Bathymetry API route
  app.get('/api/bathymetry', async (req, res) => {
    const regionId = typeof req.query.regionId === 'string' ? req.query.regionId.trim() : '';
    const tileId = typeof req.query.tileId === 'string' ? req.query.tileId.trim() : '';
    const hasLat = req.query.lat !== undefined && req.query.lat !== '';
    const hasLon = req.query.lon !== undefined && req.query.lon !== '';

    const rawMode = typeof req.query.mode === 'string' ? req.query.mode.trim().toLowerCase() : 'auto';
    const mode: BathymetryRetrievalMode =
      rawMode === 'real' || rawMode === 'fallback' || rawMode === 'auto'
        ? rawMode
        : rawMode === 'modelled' || rawMode === 'modeled'
        ? 'fallback'
        : 'auto';

    // 1. Direct raw tile binary/JSON download by tileId
    if (tileId && !hasLat && !hasLon && !regionId) {
      const rawTile = gebcoManager.getRawTileFileBuffer(tileId);
      if (!rawTile) {
        return res.status(404).json({
          status: 'error',
          error: `Bathymetry tile "${tileId}" not found.`
        });
      }
      res.setHeader('Content-Type', rawTile.contentType);
      return res.send(rawTile.buffer);
    }

    // 2. Validate span, maxDimension, level
    const span = req.query.span !== undefined ? Number(req.query.span) : 1.2;
    if (!Number.isFinite(span) || span <= 0 || span > 60) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid span parameter: must be a finite number between 0 (exclusive) and 60 degrees.'
      });
    }

    const maxDimension = req.query.maxDimension !== undefined ? Number(req.query.maxDimension) : 128;
    if (!Number.isFinite(maxDimension) || maxDimension < 2 || maxDimension > 1024) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid maxDimension parameter: must be between 2 and 1024.'
      });
    }

    const preferredLevel = req.query.level !== undefined ? Number(req.query.level) : undefined;
    if (preferredLevel !== undefined && (!Number.isInteger(preferredLevel) || preferredLevel < 0 || preferredLevel > 4)) {
      return res.status(400).json({
        status: 'error',
        error: 'Invalid level parameter: must be an integer between 0 and 4.'
      });
    }

    // 3. Validate coordinates if either lat or lon was supplied
    let lat: number | undefined;
    let lon: number | undefined;

    if (hasLat || hasLon) {
      if (!hasLat || !hasLon) {
        return res.status(400).json({
          status: 'error',
          error: 'Both lat and lon query parameters are required when querying by coordinate.'
        });
      }
      const validation = validateCoordinates(req.query.lat, req.query.lon);
      if (!validation.valid) {
        return res.status(400).json({
          status: 'error',
          error: validation.error || 'Invalid geographic coordinates.'
        });
      }
      lat = validation.latitude;
      lon = validation.longitude;
    }

    if (!regionId && lat === undefined && lon === undefined) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing query parameters: provide either (lat, lon) or regionId.'
      });
    }

    try {
      const result = await gebcoManager.getBathymetry(regionId, lat, lon, span, {
        mode,
        maxDimension,
        preferredLevel
      });

      if (result) {
        return res.json(result);
      }

      if (regionId && lat === undefined) {
        return res.status(404).json({
          status: 'error',
          error: `Bathymetry preset region "${regionId}" was not found.`
        });
      }

      return res.status(503).json({
        status: 'error',
        error: `Authoritative bathymetry data is unavailable for (${lat?.toFixed(4)}, ${lon?.toFixed(4)}) with mode="${mode}".`,
        provenance: 'unavailable',
        isAuthoritative: false,
        isModeledFallback: false,
        requestedCoordinates:
          lat !== undefined && lon !== undefined
            ? { latitude: lat, longitude: lon, spanDegrees: span }
            : undefined
      });
    } catch (err: any) {
      console.error('[GEBCO] Error retrieving bathymetry:', err);
      return res.status(500).json({
        status: 'error',
        error: err?.message || 'Internal bathymetry processing error'
      });
    }
  });

  // Health route
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'MARIVEX full-stack server running',
      environment: process.env.NODE_ENV || 'development'
    });
  });

  return { app, gebcoManager };
}

async function startServer() {
  const { app } = await createMarivexApp();

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MARIVEX server running on http://0.0.0.0:${PORT}`);
  });
}

// Only auto-start when executed as main entry point
const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  startServer();
}
