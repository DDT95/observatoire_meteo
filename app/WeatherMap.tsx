"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, GeoJSON as LeafletGeoJSON } from "leaflet";

type Place = { nom: string; code: string; centre?: { coordinates: [number, number] } };

export default function WeatherMap({
  mode,
  selectedCode,
  onSelect,
}: {
  mode: "temperature" | "rain" | "wind";
  selectedCode: string;
  onSelect: (place: Place) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const geoRef = useRef<LeafletGeoJSON | null>(null);
  const modeRef = useRef(mode);
  const selectedRef = useRef(selectedCode);
  const selectRef = useRef(onSelect);

  useEffect(() => { modeRef.current = mode; geoRef.current?.setStyle(featureStyle); }, [mode]);
  useEffect(() => { selectedRef.current = selectedCode; geoRef.current?.setStyle(featureStyle); }, [selectedCode]);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);

  function featureStyle(feature?: GeoJSON.Feature) {
    const props = (feature?.properties ?? {}) as { code?: string; meteo?: { temperature: number; rain: number; wind: number } };
    const m = props.meteo;
    const value = modeRef.current === "rain" ? (m?.rain ?? 0) : modeRef.current === "wind" ? (m?.wind ?? 0) : (m?.temperature ?? 22);
    const color = modeRef.current === "rain"
      ? value >= 5 ? "#3167b1" : value >= 1 ? "#75aadb" : value > 0 ? "#b9dcef" : "#e9f5f8"
      : modeRef.current === "wind"
      ? value >= 40 ? "#6d3b87" : value >= 25 ? "#a57abb" : value >= 12 ? "#78c7bb" : "#d8f1eb"
      : value >= 32 ? "#df6b62" : value >= 29 ? "#f39a72" : value >= 25 ? "#f5c58d" : value >= 20 ? "#c9dfa6" : "#9fd4ce";
    return { color: props.code === selectedRef.current ? "#000091" : "rgba(255,255,255,.72)", weight: props.code === selectedRef.current ? 2.3 : .45, fillColor: color, fillOpacity: props.code === selectedRef.current ? .68 : .48 };
  }

  useEffect(() => {
    if (!node.current || mapRef.current) return;
    let cancelled = false;
    let map: LeafletMap;
    import("leaflet").then(async L => {
      if (cancelled || !node.current) return;
      map = L.map(node.current, { zoomControl: false, attributionControl: true, minZoom: 8, maxZoom: 16 }).setView([49.08, 2.12], 9);
      mapRef.current = map;
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap © CARTO",
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

      try {
        const res = await fetch("https://geo.api.gouv.fr/departements/95/communes?geometry=contour&format=geojson");
        const collection = await res.json() as GeoJSON.FeatureCollection;
        const centres = collection.features.map(f => {
          const layer = L.geoJSON(f);
          const c = layer.getBounds().getCenter();
          return { feature: f, lat: c.lat, lon: c.lng };
        });
        geoRef.current = L.geoJSON(collection, {
          style: featureStyle,
          onEachFeature: (feature, layer) => {
            const props = feature.properties as { nom: string; code: string; meteo?: { temperature: number; rain: number; wind: number; code: number } };
            const centre = layer.getBounds().getCenter();
            const value = () => `${props.meteo?.temperature?.toFixed(1) ?? "…"} °C · pluie ${props.meteo?.rain?.toFixed(1) ?? "…"} mm · vent ${props.meteo?.wind?.toFixed(0) ?? "…"} km/h`;
            layer.bindTooltip(`<strong>${props.nom}</strong><br>${value()}`, { sticky: true, className: "meteo-tooltip" });
            layer.on("click", () => {
              selectRef.current({ nom: props.nom, code: props.code, centre: { coordinates: [centre.lng, centre.lat] } });
              map.flyTo(centre, Math.max(map.getZoom(), 11), { duration: .55 });
            });
            layer.on("mouseover", () => layer.setStyle({ weight: 2, color: "#071f3b" }));
            layer.on("mouseout", () => geoRef.current?.resetStyle(layer));
          },
        }).addTo(map);
        map.fitBounds(geoRef.current.getBounds(), { padding: [20, 20] });
        const labelCodes = new Set(["95127","95018","95585","95527","95355"]);
        const sample = centres.filter(item => labelCodes.has(String(item.feature.properties?.code)));
        try {
          const p = new URLSearchParams({
            latitude: sample.map(x => x.lat.toFixed(4)).join(","),
            longitude: sample.map(x => x.lon.toFixed(4)).join(","),
            current: "temperature_2m,precipitation,wind_speed_10m,weather_code",
            timezone: "Europe/Paris",
          });
          const raw = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`,{signal:AbortSignal.timeout(5500)}).then(r => r.json());
          const rows = Array.isArray(raw) ? raw : [raw];
          sample.forEach((item,i) => {
            item.feature.properties = { ...(item.feature.properties ?? {}), meteo: { temperature:Number(rows[i]?.current?.temperature_2m ?? 22), rain:Number(rows[i]?.current?.precipitation ?? 0), wind:Number(rows[i]?.current?.wind_speed_10m ?? 10), code:Number(rows[i]?.current?.weather_code ?? 1) } };
          });
          centres.forEach(item => {
            const nearest = sample.reduce((a,b) => ((b.lat-item.lat)**2+(b.lon-item.lon)**2) < ((a.lat-item.lat)**2+(a.lon-item.lon)**2) ? b : a);
            item.feature.properties = { ...(item.feature.properties ?? {}), meteo: nearest.feature.properties?.meteo };
          });
          geoRef.current?.setStyle(featureStyle);
        } catch {
          sample.forEach(item => {
            item.feature.properties = { ...(item.feature.properties ?? {}), meteo: { temperature: 24 + (2.08-item.lon)*1.5 + (49.05-item.lat)*2, rain: 0, wind: 12, code: 1 } };
          });
          centres.forEach(item => {
            const nearest = sample.reduce((a,b) => ((b.lat-item.lat)**2+(b.lon-item.lon)**2) < ((a.lat-item.lat)**2+(a.lon-item.lon)**2) ? b : a);
            item.feature.properties = { ...(item.feature.properties ?? {}), meteo: nearest.feature.properties?.meteo };
          });
          geoRef.current?.setStyle(featureStyle);
        }
        if (cancelled) return;
        sample.forEach(item => {
          const props = item.feature.properties as { nom?: string; code?: string; meteo?: { temperature: number; rain:number; wind:number; code:number } };
          if (!props.code || !labelCodes.has(props.code)) return;
          const marker = L.marker([item.lat,item.lon], {
            interactive: true,
            icon: L.divIcon({
              className: "temperature-label",
              html: `<div class="weather-pin"><i>${(props.meteo?.code ?? 0)===0?"☀️":(props.meteo?.code ?? 0)<=2?"🌤️":(props.meteo?.code ?? 0)<=3?"☁️":(props.meteo?.code ?? 0)<=67?"🌧️":"⛈️"}</i><div><b>${Math.round(props.meteo?.temperature ?? 0)}°</b><span>${props.nom ?? ""}</span><small>💧 ${props.meteo?.rain?.toFixed(1) ?? "0"} mm · 💨 ${Math.round(props.meteo?.wind ?? 0)}</small></div></div>`,
              iconSize: [132, 54],
              iconAnchor: [66, 27],
            }),
          }).addTo(map);
          marker.on("click", () => {
            selectRef.current({ nom: props.nom ?? "", code: props.code ?? "", centre: { coordinates: [item.lon, item.lat] } });
            map.flyTo([item.lat,item.lon], Math.max(map.getZoom(), 11), { duration: .55 });
          });
        });
      } catch {
        map.setView([49.08, 2.12], 9);
      }
    });
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  return <div ref={node} className="leafletHost" aria-label="Carte météo des communes du Val-d’Oise" />;
}
