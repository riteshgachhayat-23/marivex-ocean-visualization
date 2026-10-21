import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { GebcoTileManager } from './server/gebco-tile-manager.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json());

  // Server-side Gemini API proxy route
  app.post('/api/ask', async (req, res) => {
    const { question, context } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({ text: null, sources: [], isLiveAi: false });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const systemPrompt = `You are "Ask MARIVEX", an expert marine scientist and oceanographic telemetry assistant for the MARIVEX 3D ocean visualizer.
You provide precise, scientifically accurate answers grounded in available datasets.
Current Telemetry Context:
- Coordinates: ${context?.coords ? `${context.coords.latitude.toFixed(2)}°N, ${context.coords.longitude.toFixed(2)}°E` : 'Global grid'}
- Region: ${context?.region?.name || context?.oceanData?.oceanBasin || 'Open Ocean'}
- Seafloor Depth: ${context?.oceanData?.bathymetryDepth ?? context?.depth ?? 4000} meters (GEBCO 2024)
- Significant Wave Height (Thgt): ${context?.oceanData?.waveHeight !== null && context?.oceanData?.waveHeight !== undefined ? `${context.oceanData.waveHeight} m` : 'N/A'}
- Wave Period (Tper): ${context?.oceanData?.wavePeriod !== null && context?.oceanData?.wavePeriod !== undefined ? `${context.oceanData.wavePeriod} s` : 'N/A'}
- Wave Direction (Tdir): ${context?.oceanData?.waveDirection !== null && context?.oceanData?.waveDirection !== undefined ? `${context.oceanData.waveDirection}°` : 'N/A'}
- Sea Surface Temperature: ${context?.oceanData?.temperature !== null && context?.oceanData?.temperature !== undefined ? `${context.oceanData.temperature} °C` : 'N/A'}
- Surface Wind Speed: ${context?.oceanData?.windSpeed !== null && context?.oceanData?.windSpeed !== undefined ? `${context.oceanData.windSpeed} km/h` : 'N/A'}
- Current Velocity: ${context?.oceanData?.currentSpeed !== null && context?.oceanData?.currentSpeed !== undefined ? `${context.oceanData.currentSpeed} km/h` : 'N/A'}
- Observation Timestamp: ${context?.oceanData?.time || 'Current UTC Synoptic Cycle'}
- Data Source: NOAA WaveWatch III (WW3 via ERDDAP), Open-Meteo High-Resolution Marine, GEBCO 2024.

Rules:
1. Always state numerical values with proper units and timestamps.
2. Clearly distinguish empirical measurements from physical oceanographic explanations.
3. If data is not available, state that explicitly. Never invent numbers.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${systemPrompt}\n\nUser Question: ${question}`
      });

      if (response && response.text) {
        return res.json({
          text: response.text,
          sources: ['NOAA WaveWatch III (ERDDAP)', 'Open-Meteo Marine Grid', 'GEBCO 2024 Bathymetric Grid'],
          isLiveAi: true
        });
      }

      return res.json({ text: null, sources: [], isLiveAi: false });
    } catch (err: any) {
      console.warn('Gemini proxy error:', err?.message || err);
      return res.json({ text: null, sources: [], isLiveAi: false });
    }
  });

  // Real GEBCO 2026 Bathymetry Tile Manager
  const gebcoManager = new GebcoTileManager(__dirname);

  // Manifest route for bathymetry tiles
  app.get('/api/bathymetry/manifest', async (_req, res) => {
    const manifest = gebcoManager.getManifest();
    if (manifest) {
      return res.json(manifest);
    }
    try {
      const manifestPath = path.resolve(__dirname, 'public/data/bathymetry/manifest.json');
      const manifestContent = await import('fs').then(f => f.promises.readFile(manifestPath, 'utf8'));
      return res.json(JSON.parse(manifestContent));
    } catch {
      return res.status(404).json({ error: 'Manifest not available' });
    }
  });

  app.get('/api/bathymetry', async (req, res) => {
    const regionId = typeof req.query.regionId === 'string' ? req.query.regionId : '';
    const lat = req.query.lat ? parseFloat(String(req.query.lat)) : undefined;
    const lon = req.query.lon ? parseFloat(String(req.query.lon)) : undefined;
    const span = req.query.span ? parseFloat(String(req.query.span)) : 1.2;

    try {
      const result = await gebcoManager.getBathymetry(regionId, lat, lon, span);
      if (result) {
        return res.json(result);
      }
      return res.status(404).json({ error: 'Bathymetry sector not found' });
    } catch (err: any) {
      console.error('[GEBCO] Error retrieving bathymetry:', err);
      return res.status(500).json({ error: 'Internal bathymetry processing error' });
    }
  });

  // Health route
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'MARIVEX full-stack server running',
      environment: process.env.NODE_ENV || 'development'
    });
  });

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

startServer();
