# Underwater Bathymetry 3D Terrain & Geological Discovery

Interactive React Three Fiber 3D seafloor elevation system featuring scientific GEBCO depth-based vertex coloring, dynamic vertical exaggeration scaling, bathymetric isoline contour lines, and seamount landmark callouts.

> [!IMPORTANT]
> **User Review & Confirmed Design Specifications**:
> - **Bathymetric Color Palette**: GEBCO official palette featuring continental shelf turquoise (`#38bdf8`), bathyal ocean blues (`#0284c7`, `#1d4ed8`), abyssal plain midnight navy (`#0f172a`), and hadal trench violet (`#3b0764`).
> - **Surface Overlays**: Scientific shaded terrain mesh coupled with depth isoline contour lines and interactive seamount / trench landmark callouts.
> - **Scale & Exaggeration**: Dynamic vertical exaggeration slider (1.0x – 8.0x) with real-time vertex displacement recalculation and smooth normal recomputation.

---

## 1. Overview & Core Concept

The `UnderwaterBathymetry` component provides a scientifically accurate, navigable 3D seabed digital twin inside MARIVEX. Leveraging real-world bathymetric datasets (GEBCO 2024 Grid and regional hydrographic surveys), the component converts 2D elevation grids into an optimized Three.js terrain mesh using custom vertex colors, hypsometric tinting, depth contours, and benthic inspection raycasting.

### Key Capabilities
- **Direct Grid-to-Mesh Generation**: Converts regular or irregular bathymetric elevation grids ($N \times M$) into a sub-divided `PlaneGeometry` or custom `BufferGeometry`.
- **GEBCO Vertex Tinting**: Calculates per-vertex RGB values dynamically based on true depth in meters ($0\text{ m}$ to $-11{,}000\text{ m}$), with smooth interpolation across continental margins, abyssal plains, and deep oceanic trenches.
- **Isoline Depth Contours**: Renders glowing depth contour rings at standard hydrographic intervals (e.g., $200\text{ m}$, $1{,}000\text{ m}$, $2{,}500\text{ m}$, $4{,}000\text{ m}$, $6{,}000\text{ m}$) across the seabed geometry.
- **Seamount & Trench Feature Callouts**: 3D spatial markers highlighting named bathymetric landmarks (e.g., Mariana Trench Challenger Deep, Mid-Atlantic Ridge, Java Trench, Davidson Seamount) with distance-fading labels.
- **Real-Time Vertical Exaggeration**: Smooth slider control allowing oceanographers to scale vertical relief from subtle 1.0x (true to scale) to 8.0x (enhanced geomorphological study).

---

## 2. User Experience & Visual Design

### User Navigation Flow
1. **Entry**: User selects an ocean basin (e.g., North Atlantic, Mariana Trench, Indian Ocean Ridge) and clicks **"Explore Ocean Floor"** in the top navigation or regional panel.
2. **Transition**: Camera swoops smoothly beneath the sea surface into an atmospheric underwater realm with volumetric water absorption fog, marine snow particles, and directional sunlight shafts.
3. **Underwater Viewport**: The `UnderwaterBathymetry` mesh loads with progressive resolution, displaying the GEBCO terrain with active depth contours and geological landmarks.
4. **Interactive HUD Controls**:
   - **Vertical Exaggeration Slider**: Adjusts terrain height scaling in real time ($1.0\times$ to $8.0\times$) with zero reload.
   - **Contour Isoline Toggle**: Switches between solid hypsometric bathymetry, contour-enhanced terrain, and sonar wireframe modes.
   - **Feature Markers Toggle**: Toggles seamount, trench, and hydrothermal vent geological tags.
   - **Click Anywhere Depth Probe**: Clicking any vertex or surface point triggers acoustic raycasting, reporting exact latitude, longitude, depth (m), elevation relative to sea level, and geological morphology classification.

### Visual Styling & Atmosphere
- **Canvas Environment**: Deep oceanic water column fog (`#020b18`, density $0.035$) with subtle marine particulate drift.
- **Terrain Material**: `MeshStandardMaterial` with `vertexColors: true`, balanced roughness ($0.82$) and subtle ambient reflection, accented by emissive contour lines.
- **HUD Interface**: Floating frosted glass panels (`bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-slate-100`) strictly obeying anti-slop guidelines (zero pills, unboxed metadata with `·` separators, tabular figures for all coordinates and metric depths).

---

## 3. Key Product Decisions & Trade-Offs

| Decision | Chosen Approach | Rationale | Alternatives Considered |
| :--- | :--- | :--- | :--- |
| **Mesh Generation Strategy** | Dynamic `BufferGeometry` with indexed vertices & CPU/Shader hybrid coloring | Provides instant raycasting collision precision for depth queries while maintaining 60 FPS rendering on mobile and desktop | Offloading entirely to custom vertex shaders makes click raycasting complex and desynchronized from CPU depth lookups |
| **Color Mapping Implementation** | Direct Vertex Color Buffer (`Float32Array(vertices * 3)`) interpolated via GEBCO depth lookup | Guarantees exact gradient fidelity without requiring separate 2D texture map downloads or GPU texture memory overhead | Pre-baked 2D texture maps (fail to scale with dynamic regional bounds) |
| **Depth Contours** | Procedural Fragment-Shader Isoline overlay or multi-segment spline lines | Sharp, scalable contour lines that respect terrain relief without texture blurring | Heavy vector line segments (slow at high vertex densities) |
| **Elevation Exaggeration** | Live vertex position Y-channel modification with `computeVertexNormals()` | Instantaneous visual feedback as users adjust the exaggeration slider | Rebuilding the entire Three.js geometry from scratch on every slider drag |

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MARIVEX App Container                           │
│  ┌───────────────────────┐             ┌────────────────────────────┐  │
│  │   Navigation Header   │             │   Ocean Data Layer Hub     │  │
│  │  [Explore Ocean Floor]│             │  [Bathymetry / GEBCO 2024] │  │
│  └───────────┬───────────┘             └─────────────┬──────────────┘  │
│              │                                       │                 │
│              ▼                                       ▼                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    OceanGlobe Viewport Canvas                    │  │
│  │                                                                  │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │       <UnderwaterBathymetry /> (React Three Fiber)        │  │  │
│  │  │  ┌──────────────────────────────────────────────────────┐  │  │  │
│  │  │  │ • Bathymetric Grid Ingestion (128x128 / 256x256)     │  │  │  │
│  │  │  │ • GEBCO Depth-Based Vertex Color Buffer              │  │  │  │
│  │  │  │ • Dynamic Vertical Relief Exaggeration (1x - 8x)     │  │  │  │
│  │  │  │ • Depth Isoline Contour Shader Overlay               │  │  │  │
│  │  │  │ • Geological Landmark Markers (Seamounts/Trenches)   │  │  │  │
│  │  │  │ • Raycast Seafloor Depth Probe Handler               │  │  │  │
│  │  │  └──────────────────────────────────────────────────────┘  │  │  │
│  └────────────────────────────────────────────────────────────┘  │  │
│  │                                                                  │  │
│  │  ┌─────────────────────────┐     ┌────────────────────────────┐  │  │
│  │  │ Underwater Camera Rig   │     │ Submersible Benthic HUD    │  │  │
│  │  │ (Collision-Safe Orbit)  │     │ (Depth, Lat/Lon, Geology)  │  │  │
│  │  └─────────────────────────┘     └────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Component & Data Model Interface

```typescript
export interface BathymetryGridData {
  id: string;
  name: string;
  bounds: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  resolutionArcSec: number;
  width: number;
  height: number;
  elevations: Float32Array; // negative meters for ocean depths
  minDepth: number; // e.g. -10924 m
  maxDepth: number; // e.g. -12 m
  landmarks: BathymetricLandmark[];
}

export interface BathymetricLandmark {
  id: string;
  name: string;
  type: 'trench' | 'seamount' | 'ridge' | 'basin' | 'vent';
  lat: number;
  lon: number;
  depthMeters: number;
  description: string;
}

export interface UnderwaterBathymetryProps {
  gridData: BathymetryGridData;
  verticalExaggeration: number; // 1.0 to 8.0
  showContours?: boolean;
  showLandmarks?: boolean;
  wireframe?: boolean;
  onProbeDepth?: (probe: BenthicProbeData) => void;
}
```

### Execution Steps
1. **Component Creation (`src/components/UnderwaterBathymetry.tsx`)**:
   - Construct reusable React Three Fiber bathymetry component with high-resolution vertex-colored terrain mesh.
   - Implement GEBCO official color mapping logic with smooth transitions across shelf turquoise, bathyal blue, abyssal navy, and hadal purple.
   - Implement isoline depth contour rendering and 3D geological landmark callouts.
   - Wire raycast pointer events for instantaneous benthic depth probing.
2. **Integration into `OceanGlobe.tsx` & `App.tsx`**:
   - Integrate `UnderwaterBathymetry` as the modular terrain renderer in underwater exploration mode.
   - Connect the interactive vertical exaggeration slider and overlay toggles in the benthic HUD.
   - Ensure camera collision avoidance and smooth return-to-globe transitions.
3. **Verification**:
   - Run `compile_applet` to confirm complete TypeScript and bundle validation.
