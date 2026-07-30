"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSON, LayerGroup, Polygon as LeafletPolygon } from "leaflet";

export type MapMode = "temperature" | "rain" | "wind" | "atmo" | "no2" | "pm10" | "pm25" | "o3";
type Place = { nom: string; code: string; centre?: { coordinates: [number, number] } };
type AirRow = { code: string; date: string; qualificatif: string; indice: number; no2: number; pm10: number; pm25: number; o3: number };
type Meteo = { temperature: number; rain: number; wind: number; code: number };
type Properties = { nom?: string; code?: string; meteo?: Meteo; air?: AirRow };

const isAirMode = (mode: MapMode) => ["atmo", "no2", "pm10", "pm25", "o3"].includes(mode);
const airValue = (row: AirRow | undefined, mode: MapMode) => mode === "atmo" ? row?.indice : mode === "no2" ? row?.no2 : mode === "pm10" ? row?.pm10 : mode === "pm25" ? row?.pm25 : mode === "o3" ? row?.o3 : undefined;
const airLabels = ["Indisponible", "Bon", "Moyen", "Dégradé", "Mauvais", "Très mauvais", "Extrêmement mauvais"];
const airColors = ["#d8e0e7", "#50f0e6", "#50ccaa", "#f0e641", "#ff5050", "#960032", "#7d2181"];

export default function WeatherMap({ mode, selectedCode, onSelect }: { mode: MapMode; selectedCode: string; onSelect: (place: Place) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const geoRef = useRef<LeafletGeoJSON | null>(null);
  const pinsRef = useRef<LayerGroup | null>(null);
  const modeRef = useRef(mode);
  const selectedRef = useRef(selectedCode);
  const selectRef = useRef(onSelect);

  function featureStyle(feature?: GeoJSON.Feature) {
    const props = (feature?.properties ?? {}) as Properties;
    const currentMode = modeRef.current;
    let fillColor = "#e9eef3";
    if (isAirMode(currentMode)) {
      const metric = airValue(props.air, currentMode);
      fillColor = airColors[Math.max(0, Math.min(6, Number(metric) || 0))];
    } else {
      const value = currentMode === "rain" ? (props.meteo?.rain ?? 0) : currentMode === "wind" ? (props.meteo?.wind ?? 0) : (props.meteo?.temperature ?? 22);
      fillColor = currentMode === "rain"
        ? value >= 5 ? "#3167b1" : value >= 1 ? "#75aadb" : value > 0 ? "#b9dcef" : "#e9f5f8"
        : currentMode === "wind"
        ? value >= 40 ? "#6d3b87" : value >= 25 ? "#a57abb" : value >= 12 ? "#78c7bb" : "#d8f1eb"
        : value >= 32 ? "#df6b62" : value >= 29 ? "#f39a72" : value >= 25 ? "#f5c58d" : value >= 20 ? "#c9dfa6" : "#9fd4ce";
    }
    const selected = props.code === selectedRef.current;
    return { color: selected ? "#000091" : "rgba(255,255,255,.86)", weight: selected ? 2.1 : .65, fillColor, fillOpacity: selected ? .82 : .67 };
  }

  useEffect(() => {
    modeRef.current = mode;
    geoRef.current?.setStyle(featureStyle);
    const map = mapRef.current;
    const pins = pinsRef.current;
    if (map && pins) isAirMode(mode) ? map.removeLayer(pins) : pins.addTo(map);
  }, [mode]);
  useEffect(() => {
    selectedRef.current = selectedCode;
    geoRef.current?.setStyle(featureStyle);
    if (selectedCode === "95" && geoRef.current && mapRef.current) mapRef.current.fitBounds(geoRef.current.getBounds(), { padding: [34, 34], animate: true });
  }, [selectedCode]);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!node.current || mapRef.current) return;
    let cancelled = false;
    import("leaflet").then(async L => {
      if (cancelled || !node.current) return;
      const map = L.map(node.current, { zoomControl: false, attributionControl: true, minZoom: 8, maxZoom: 16 }).setView([49.08, 2.12], 9);
      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { attribution: "© OpenStreetMap © CARTO", subdomains: "abcd", maxZoom: 20 }).addTo(map);

      try {
        const [communeResponse, airResponse] = await Promise.all([
          fetch("https://geo.api.gouv.fr/departements/95/communes?geometry=contour&format=geojson"),
          fetch("https://raw.githubusercontent.com/DDT95/transition-energetique95/86fb31d/data/airparif.json"),
        ]);
        const collection = await communeResponse.json() as GeoJSON.FeatureCollection;
        const airRows = await airResponse.json() as AirRow[];
        const airByCode = new Map(airRows.map(row => [row.code, row]));
        collection.features.forEach(feature => {
          const props = (feature.properties ?? {}) as Properties;
          feature.properties = { ...props, air: props.code ? airByCode.get(props.code) : undefined };
        });

        const exteriorRings: GeoJSON.Position[][] = [];
        collection.features.forEach(feature => {
          const geometry = feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
          if (geometry.type === "Polygon") exteriorRings.push(geometry.coordinates[0]);
          else geometry.coordinates.forEach(polygon => exteriorRings.push(polygon[0]));
        });
        const holes = exteriorRings.map(ring => ring.map(([lon, lat]) => L.latLng(lat, lon)));
        L.polygon([
          [L.latLng(-85, -180), L.latLng(85, -180), L.latLng(85, 180), L.latLng(-85, 180)],
          ...holes,
        ], { pane: "overlayPane", interactive: false, stroke: false, fillColor: "#e8edf4", fillOpacity: .74, fillRule: "evenodd" }).addTo(map);

        const centres = collection.features.map(feature => {
          const center = L.geoJSON(feature).getBounds().getCenter();
          return { feature, lat: center.lat, lon: center.lng };
        });
        geoRef.current = L.geoJSON(collection, {
          style: featureStyle,
          onEachFeature: (feature, layer) => {
            const props = feature.properties as Properties;
            const shape = layer as LeafletPolygon;
            const center = shape.getBounds().getCenter();
            layer.on("click", () => {
              selectRef.current({ nom: props.nom ?? "", code: props.code ?? "", centre: { coordinates: [center.lng, center.lat] } });
              map.flyTo(center, Math.max(map.getZoom(), 11), { duration: .55 });
            });
            layer.on("mouseover", () => shape.setStyle({ weight: 1.8, color: "#000091" }));
            layer.on("mouseout", () => geoRef.current?.resetStyle(layer));
            layer.bindTooltip(() => {
              const activeMode = modeRef.current;
              if (isAirMode(activeMode)) {
                const value = airValue(props.air, activeMode);
                return `<strong>${props.nom ?? ""}</strong><br>${airLabels[Number(value) || 0]} · indice ${Number(value) || "—"}<br><small>Airparif · ${props.air?.date ? new Date(props.air.date).toLocaleDateString("fr-FR") : "donnée indisponible"}</small>`;
              }
              return `<strong>${props.nom ?? ""}</strong><br>${props.meteo?.temperature?.toFixed(1) ?? "…"} °C · pluie ${props.meteo?.rain?.toFixed(1) ?? "…"} mm · vent ${props.meteo?.wind?.toFixed(0) ?? "…"} km/h`;
            }, { sticky: true, className: "meteo-tooltip" });
          },
        }).addTo(map);
        map.fitBounds(geoRef.current.getBounds(), { padding: [34, 34] });

        const labelCodes = new Set(["95127", "95018", "95585", "95527", "95355"]);
        const sample = centres.filter(item => labelCodes.has(String(item.feature.properties?.code)));
        try {
          const params = new URLSearchParams({ latitude: sample.map(x => x.lat.toFixed(4)).join(","), longitude: sample.map(x => x.lon.toFixed(4)).join(","), current: "temperature_2m,precipitation,wind_speed_10m,weather_code", timezone: "Europe/Paris" });
          const raw = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(5500) }).then(response => response.json());
          const rows = Array.isArray(raw) ? raw : [raw];
          sample.forEach((item, index) => { item.feature.properties = { ...(item.feature.properties ?? {}), meteo: { temperature: Number(rows[index]?.current?.temperature_2m ?? 22), rain: Number(rows[index]?.current?.precipitation ?? 0), wind: Number(rows[index]?.current?.wind_speed_10m ?? 10), code: Number(rows[index]?.current?.weather_code ?? 1) } }; });
          centres.forEach(item => { const nearest = sample.reduce((a, b) => ((b.lat-item.lat)**2+(b.lon-item.lon)**2) < ((a.lat-item.lat)**2+(a.lon-item.lon)**2) ? b : a); item.feature.properties = { ...(item.feature.properties ?? {}), meteo: nearest.feature.properties?.meteo }; });
          geoRef.current.setStyle(featureStyle);
        } catch {
          sample.forEach(item => { item.feature.properties = { ...(item.feature.properties ?? {}), meteo: { temperature: 24 + (2.08-item.lon)*1.5 + (49.05-item.lat)*2, rain: 0, wind: 12, code: 1 } }; });
          centres.forEach(item => { const nearest = sample.reduce((a, b) => ((b.lat-item.lat)**2+(b.lon-item.lon)**2) < ((a.lat-item.lat)**2+(a.lon-item.lon)**2) ? b : a); item.feature.properties = { ...(item.feature.properties ?? {}), meteo: nearest.feature.properties?.meteo }; });
          geoRef.current.setStyle(featureStyle);
        }

        const pins = L.layerGroup();
        pinsRef.current = pins;
        sample.forEach(item => {
          const props = item.feature.properties as Properties;
          const marker = L.marker([item.lat, item.lon], { interactive: true, icon: L.divIcon({ className: "temperature-label", html: `<div class="weather-pin"><i>${(props.meteo?.code ?? 0)===0?"☀️":(props.meteo?.code ?? 0)<=2?"🌤️":(props.meteo?.code ?? 0)<=3?"☁️":(props.meteo?.code ?? 0)<=67?"🌧️":"⛈️"}</i><div><b>${Math.round(props.meteo?.temperature ?? 0)}°</b><span>${props.nom ?? ""}</span><small>💧 ${props.meteo?.rain?.toFixed(1) ?? "0"} mm · 💨 ${Math.round(props.meteo?.wind ?? 0)}</small></div></div>`, iconSize: [132, 54], iconAnchor: [66, 27] }) });
          marker.on("click", () => { selectRef.current({ nom: props.nom ?? "", code: props.code ?? "", centre: { coordinates: [item.lon, item.lat] } }); map.flyTo([item.lat, item.lon], Math.max(map.getZoom(), 11), { duration: .55 }); });
          pins.addLayer(marker);
        });
        if (!isAirMode(modeRef.current)) pins.addTo(map);
      } catch {
        map.setView([49.08, 2.12], 9);
      }
    });
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  return <div ref={node} className="leafletHost" aria-label="Carte météo et qualité de l’air des communes du Val-d’Oise" />;
}
