import React, { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Polyline,
  Popup,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import parseGeoraster from "georaster";
import GeoRasterLayer from "georaster-layer-for-leaflet";

// ---- CONFIG ----
const STORAGE_KEY = "maraichage_data_ts_v3";
// 🔗 Remplace ici par ton URL GeoTIFF
const TIFF_URL = "https://github.com/toinesevenier-spec/ferme-manville-map/blob/main/98622.tif";

// ---- TYPES ----
type LineMeta = {
  species?: string;
  sowingDate?: string;
  plantingDate?: string;
  notes?: string;
  photo?: string;
  parcelId?: string | null;
};
type Parcel = {
  id: string;
  coords: L.LatLngExpression[];
  meta?: { name?: string };
};
type Line = { id: string; coords: L.LatLngExpression[]; meta: LineMeta };

// ---- UTILS ----
function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function loadData(): { parcels: Parcel[]; lines: Line[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { parcels: [], lines: [] };
    return JSON.parse(raw);
  } catch {
    return { parcels: [], lines: [] };
  }
}

// ---- APP ----
export default function App(): JSX.Element {
  const [data, setData] = useState(loadData);
  const [mode, setMode] = useState<"none" | "parcel" | "line">("none");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const [geoLayer, setGeoLayer] = useState<L.Layer | null>(null);

  // Sauvegarde automatique
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  // ---- Chargement automatique du GeoTIFF ----
  useEffect(() => {
    async function loadTiff() {
      if (!mapRef.current) return;
      try {
        const response = await fetch(TIFF_URL);
        const arrayBuffer = await response.arrayBuffer();
        const georaster = await parseGeoraster(arrayBuffer);

        // Retirer ancienne couche si présente
        if (geoLayer) {
          mapRef.current.removeLayer(geoLayer);
        }

        const layer = new GeoRasterLayer({
          georaster,
          opacity: 0.7,
          resolution: 256,
        });

        layer.addTo(mapRef.current);
        mapRef.current.fitBounds(layer.getBounds());
        setGeoLayer(layer);
      } catch (err) {
        console.error("Erreur de chargement GeoTIFF :", err);
      }
    }
    loadTiff();
  }, [mapRef]);

  // ---- Fonctions de gestion ----
  function addParcel(coords: L.LatLngExpression[]) {
    const p: Parcel = { id: uid("parcel"), coords, meta: { name: "Parcelle" } };
    setData((d) => ({ ...d, parcels: [...d.parcels, p] }));
  }

  function addLine(coords: L.LatLngExpression[]) {
    let parcelId: string | null = null;
    const mid = coords[Math.floor(coords.length / 2)];
    for (const p of data.parcels) {
      const poly = L.polygon(p.coords as L.LatLngExpression[]);
      if (
        poly.getBounds().contains(L.latLng((mid as any)[0], (mid as any)[1]))
      ) {
        parcelId = p.id;
        break;
      }
    }
    const l: Line = {
      id: uid("line"),
      coords,
      meta: {
        parcelId,
        species: "",
        sowingDate: "",
        plantingDate: "",
        notes: "",
        photo: "",
      },
    };
    setData((d) => ({ ...d, lines: [...d.lines, l] }));
    setSelectedLineId(l.id);
  }

  function updateLineMeta(id: string, patch: Partial<LineMeta>) {
    setData((d) => ({
      ...d,
      lines: d.lines.map((ln) =>
        ln.id === id ? { ...ln, meta: { ...ln.meta, ...patch } } : ln
      ),
    }));
  }

  function deleteLine(id: string) {
    setData((d) => ({ ...d, lines: d.lines.filter((ln) => ln.id !== id) }));
    if (selectedLineId === id) setSelectedLineId(null);
  }

  // ---- Dessin sur la carte ----
  function MapDrawer() {
    const [drawingPoints, setDrawingPoints] = useState<L.LatLngExpression[]>(
      []
    );
    const [isDrawing, setIsDrawing] = useState(false);

    useMapEvents({
      click(e) {
        if (!isDrawing || mode === "none") return;
        setDrawingPoints((p) => [...p, [e.latlng.lat, e.latlng.lng]]);
      },
    });

    function startDrawing(e: React.MouseEvent) {
      e.stopPropagation();
      setIsDrawing(true);
    }

    function finish(e: React.MouseEvent) {
      e.stopPropagation();
      if (mode === "parcel" && drawingPoints.length >= 3)
        addParcel(drawingPoints);
      if (mode === "line" && drawingPoints.length >= 2) addLine(drawingPoints);
      setDrawingPoints([]);
      setMode("none");
      setIsDrawing(false);
    }

    return (
      <>
        {drawingPoints.length > 0 && (
          <Polyline
            positions={drawingPoints}
            pathOptions={{ color: "#f59e0b", dashArray: "6" }}
          />
        )}
        {mode !== "none" && (
          <div
            style={{
              position: "absolute",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 999,
              background: "rgba(255,255,255,0.95)",
              padding: 8,
              borderRadius: 8,
            }}
          >
            <div style={{ marginBottom: 6 }}>
              {mode === "parcel" ? "Tracer une parcelle" : "Tracer une ligne"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {!isDrawing ? (
                <button onClick={startDrawing}>Commencer</button>
              ) : (
                <button onClick={finish}>Terminer</button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDrawingPoints([]);
                }}
              >
                Effacer
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  const selectedLine = data.lines.find((l) => l.id === selectedLineId) || null;

  // ---- Rendu principal ----
  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      {/* ---- Sidebar ---- */}
      <aside
        style={{
          width: 340,
          padding: 16,
          background: "#fff",
          borderRight: "1px solid #ddd",
          overflowY: "auto",
        }}
      >
        <h3>Suivi maraîcher</h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => setMode(mode === "parcel" ? "none" : "parcel")}
          >
            {mode === "parcel" ? "Annuler" : "Tracer parcelle"}
          </button>
          <button onClick={() => setMode(mode === "line" ? "none" : "line")}>
            {mode === "line" ? "Annuler" : "Tracer ligne"}
          </button>
        </div>

        <h4>Lignes</h4>
        {data.lines.map((l) => (
          <div key={l.id} style={{ marginBottom: 6 }}>
            <button
              style={{
                background: selectedLineId === l.id ? "#e0f2fe" : "transparent",
                border: "1px solid #ddd",
                width: "100%",
                textAlign: "left",
                padding: 6,
                borderRadius: 6,
              }}
              onClick={() => setSelectedLineId(l.id)}
            >
              {l.meta.species || "Sans nom"}
            </button>
          </div>
        ))}

        {selectedLine && (
          <div style={{ marginTop: 12 }}>
            <h4>Fiche ligne</h4>
            <label>Espèce</label>
            <input
              value={selectedLine.meta.species || ""}
              onChange={(e) =>
                updateLineMeta(selectedLine.id, { species: e.target.value })
              }
              style={{ width: "100%", marginBottom: 6, padding: 6 }}
            />
            <label>Date de semis</label>
            <input
              type="date"
              value={selectedLine.meta.sowingDate || ""}
              onChange={(e) =>
                updateLineMeta(selectedLine.id, { sowingDate: e.target.value })
              }
              style={{ width: "100%", marginBottom: 6, padding: 6 }}
            />
            <label>Date de plantation</label>
            <input
              type="date"
              value={selectedLine.meta.plantingDate || ""}
              onChange={(e) =>
                updateLineMeta(selectedLine.id, {
                  plantingDate: e.target.value,
                })
              }
              style={{ width: "100%", marginBottom: 6, padding: 6 }}
            />
            <label>Notes</label>
            <textarea
              value={selectedLine.meta.notes || ""}
              onChange={(e) =>
                updateLineMeta(selectedLine.id, { notes: e.target.value })
              }
              style={{ width: "100%", height: 60, marginBottom: 6, padding: 6 }}
            />
            <label>Photo (URL)</label>
            <input
              value={selectedLine.meta.photo || ""}
              onChange={(e) =>
                updateLineMeta(selectedLine.id, { photo: e.target.value })
              }
              style={{ width: "100%", marginBottom: 6, padding: 6 }}
            />
            <button
              onClick={() => deleteLine(selectedLine.id)}
              style={{
                background: "#ef4444",
                color: "#fff",
                border: "none",
                padding: 6,
                borderRadius: 6,
              }}
            >
              Supprimer
            </button>
          </div>
        )}
      </aside>

      {/* ---- Carte ---- */}
      <div style={{ flex: 1, position: "relative" }}>
        <MapContainer
          center={[43.95, 4.8]}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          whenCreated={(m) => (mapRef.current = m)}
          doubleClickZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap"
          />
          {data.parcels.map((p) => (
            <Polygon
              key={p.id}
              positions={p.coords}
              pathOptions={{ color: "#2a9d8f", fillOpacity: 0.2 }}
            />
          ))}
          {data.lines.map((l) => (
            <Polyline
              key={l.id}
              positions={l.coords}
              pathOptions={{
                color: selectedLineId === l.id ? "#e63946" : "#2b9348",
                weight: selectedLineId === l.id ? 5 : 3,
              }}
              eventHandlers={{ click: () => setSelectedLineId(l.id) }}
            >
              <Popup>
                <b>{l.meta.species || "—"}</b>
              </Popup>
            </Polyline>
          ))}
          <MapDrawer />
        </MapContainer>
      </div>
    </div>
  );
}
