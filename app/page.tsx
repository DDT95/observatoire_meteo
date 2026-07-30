"use client";

import { useEffect, useMemo, useState } from "react";
import WeatherMap, { type MapMode } from "./WeatherMap";

type Place = { nom: string; code: string; centre?: { coordinates: [number, number] } };
type Weather = {
  current: Record<string, number>;
  current_units: Record<string, string>;
  hourly: Record<string, (number | string)[]>;
  daily: Record<string, (number | string)[]>;
};
type History = { daily: Record<string, (number | string)[]> };
type Climate = { daily: Record<string, (number | string)[]> };

const fallbackPlaces: Place[] = [
  { nom: "Cergy", code: "95127", centre: { coordinates: [2.076, 49.036] } },
  { nom: "Argenteuil", code: "95018", centre: { coordinates: [2.247, 48.947] } },
  { nom: "Sarcelles", code: "95585", centre: { coordinates: [2.379, 48.997] } },
  { nom: "Roissy-en-France", code: "95527", centre: { coordinates: [2.517, 49.004] } },
  { nom: "Magny-en-Vexin", code: "95355", centre: { coordinates: [1.787, 49.156] } },
];
const departmentPlace: Place = { nom: "Val-d’Oise", code: "95", centre: { coordinates: [2.12, 49.08] } };
const airModes: { id: MapMode; label: string; detail: string; color: string }[] = [
  { id: "atmo", label: "Indice ATMO", detail: "Situation quotidienne par commune", color: "#7a1f5c" },
  { id: "no2", label: "Dioxyde d’azote · NO₂", detail: "Sous-indice quotidien", color: "#a558a5" },
  { id: "pm10", label: "Particules · PM10", detail: "Sous-indice quotidien", color: "#d97706" },
  { id: "pm25", label: "Particules fines · PM2,5", detail: "Sous-indice quotidien", color: "#e1000f" },
  { id: "o3", label: "Ozone · O₃", detail: "Sous-indice quotidien", color: "#009081" },
];

const fallbackWeather: Weather = {
  current: { temperature_2m: 24.6, apparent_temperature: 25.1, relative_humidity_2m: 52, precipitation: 0, wind_speed_10m: 13, wind_direction_10m: 245, weather_code: 1 },
  current_units: { temperature_2m: "°C" },
  hourly: {
    time: Array.from({ length: 24 }, (_, i) => `${i}:00`),
    temperature_2m: [18,18,17,17,18,19,21,23,24,25,26,27,28,28,29,28,27,26,24,23,22,21,20,19],
    precipitation_probability: [4,3,3,4,5,5,7,8,9,10,10,12,14,16,18,20,18,15,12,9,7,6,5,4],
  },
  daily: {
    time: ["2026-07-28","2026-07-29","2026-07-30","2026-07-31","2026-08-01","2026-08-02","2026-08-03"],
    temperature_2m_max: [29,28,31,32,27,25,26],
    temperature_2m_min: [17,16,18,19,17,15,15],
    precipitation_sum: [0,0.4,0,1.8,7.2,2.1,0],
    weather_code: [1,2,1,2,61,3,1],
    uv_index_max: [6.8,6.4,7.1,6.9,4.1,5.2,6.1],
  },
};

const fmt = (n: unknown, digits = 0) => typeof n === "number" ? n.toLocaleString("fr-FR", { maximumFractionDigits: digits }) : "—";
const day = (iso: unknown, long = false) => new Intl.DateTimeFormat("fr-FR", { weekday: long ? "long" : "short", day: "numeric" }).format(new Date(String(iso)));
const weatherLabel = (code: number) => code === 0 ? "Ciel clair" : code <= 2 ? "Éclaircies" : code <= 3 ? "Nuageux" : code <= 48 ? "Brouillard" : code <= 67 ? "Pluie" : code <= 77 ? "Neige" : code <= 82 ? "Averses" : "Orages";
const weatherIcon = (code: number) => code === 0 ? "☀" : code <= 2 ? "◒" : code <= 3 ? "☁" : code <= 67 ? "☂" : code <= 77 ? "❄" : code <= 82 ? "☂" : "ϟ";

function Sparkline({ values, color = "#5b7cfa" }: { values: number[]; color?: string }) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  const min = Math.min(...clean), max = Math.max(...clean), span = max - min || 1;
  const points = clean.map((v, i) => `${(i / Math.max(clean.length - 1, 1)) * 100},${38 - ((v - min) / span) * 32}`).join(" ");
  return <svg className="spark" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true"><path d="M0 39H100" /><polyline points={points} style={{ stroke: color }} /></svg>;
}

export default function Home() {
  const [places, setPlaces] = useState<Place[]>(fallbackPlaces);
  const [selected, setSelected] = useState<Place>(departmentPlace);
  const [weather, setWeather] = useState<Weather>(fallbackWeather);
  const [history, setHistory] = useState<History | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState("à l’instant");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [climate, setClimate] = useState<Climate | null>(null);
  const [detailTab, setDetailTab] = useState<"today"|"forecast"|"climate">("today");
  const [mapMode, setMapMode] = useState<MapMode>("temperature");

  useEffect(() => {
    fetch("https://geo.api.gouv.fr/departements/95/communes?fields=nom,code,centre&format=json")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: Place[]) => setPlaces(data.sort((a, b) => a.nom.localeCompare(b.nom, "fr"))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const [lon, lat] = selected.centre?.coordinates ?? [2.076, 49.036];
    setLoading(true);
    const params = new URLSearchParams({
      latitude: String(lat), longitude: String(lon), timezone: "Europe/Paris",
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
      hourly: "temperature_2m,precipitation_probability,precipitation,relative_humidity_2m,wind_speed_10m,wind_gusts_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,uv_index_max,sunrise,sunset",
      forecast_days: "7",
    });
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(6000) })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setWeather).catch(() => setWeather(fallbackWeather)).finally(() => { setLoading(false); setUpdated(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })); });

    const end = new Date(); end.setDate(end.getDate() - 5);
    const start = new Date(end); start.setDate(start.getDate() - 29);
    const hp = new URLSearchParams({ latitude: String(lat), longitude: String(lon), timezone: "Europe/Paris", start_date: start.toISOString().slice(0,10), end_date: end.toISOString().slice(0,10), daily: "temperature_2m_max,temperature_2m_min,precipitation_sum" });
    fetch(`https://archive-api.open-meteo.com/v1/archive?${hp}`, { signal: AbortSignal.timeout(9000) }).then(r => r.ok ? r.json() : Promise.reject()).then(setHistory).catch(() => setHistory(null));

  }, [selected]);

  useEffect(() => {
    if (detailTab !== "climate" || !drawerOpen) return;
    const [lon, lat] = selected.centre?.coordinates ?? [2.076, 49.036];
    setClimate(null);
    const climateTimer = window.setTimeout(() => {
      const cp = new URLSearchParams({
        latitude:String(lat), longitude:String(lon), timezone:"Europe/Paris",
        start_date:"1981-01-01", end_date:"2025-12-31",
        daily:"temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum",
      });
      fetch(`https://archive-api.open-meteo.com/v1/archive?${cp}`, { signal: AbortSignal.timeout(60000) })
        .then(r=>r.ok?r.json():Promise.reject()).then(setClimate).catch(()=>setClimate({daily:{}}));
    }, 250);
    return () => window.clearTimeout(climateTimer);
  }, [selected, detailTab, drawerOpen]);

  const filtered = useMemo(() => query.length > 1 ? places.filter(p => p.nom.toLowerCase().includes(query.toLowerCase())).slice(0, 7) : [], [places, query]);
  const c = weather.current;
  const daily = weather.daily;
  const hourValues = (weather.hourly.temperature_2m as number[]) ?? [];
  const rain30 = ((history?.daily.precipitation_sum as number[]) ?? []).reduce((a, b) => a + (Number(b) || 0), 0);
  const max30 = Math.max(...((history?.daily.temperature_2m_max as number[]) ?? [Number(c.temperature_2m)]));
  const rain7 = ((daily.precipitation_sum as number[]) ?? []).reduce((a, b) => a + (Number(b) || 0), 0);
  const heatLevel = Number(c.temperature_2m) >= 35 ? "Très forte chaleur" : Number(c.temperature_2m) >= 30 ? "Forte chaleur" : Number(c.temperature_2m) >= 25 ? "Chaud" : "Tempéré";
  const climateRows = useMemo(() => {
    const d = climate?.daily;
    if (!d?.time) return [] as { date: string; max: number; min: number; mean: number; rain: number }[];
    return d.time.map((t,i) => ({ date:String(t), max:Number(d.temperature_2m_max?.[i]), min:Number(d.temperature_2m_min?.[i]), mean:Number(d.temperature_2m_mean?.[i]), rain:Number(d.precipitation_sum?.[i]) })).filter(x => Number.isFinite(x.mean));
  }, [climate]);
  const climateStats = useMemo(() => {
    if (!climateRows.length) return null;
    const years = new Map<number,{mean:number[];rain:number;hot:number;frost:number}>();
    climateRows.forEach(r => { const y=Number(r.date.slice(0,4)); const v=years.get(y) ?? {mean:[],rain:0,hot:0,frost:0}; v.mean.push(r.mean); v.rain+=r.rain||0; if(r.max>=30)v.hot++; if(r.min<0)v.frost++; years.set(y,v); });
    const annual=[...years].map(([year,v])=>({year,mean:v.mean.reduce((a,b)=>a+b,0)/v.mean.length,rain:v.rain,hot:v.hot,frost:v.frost}));
    const first=annual.filter(x=>x.year<=1990).reduce((a,b)=>a+b.mean,0)/Math.max(annual.filter(x=>x.year<=1990).length,1);
    const last=annual.filter(x=>x.year>=2016).reduce((a,b)=>a+b.mean,0)/Math.max(annual.filter(x=>x.year>=2016).length,1);
    const hottest=climateRows.reduce((a,b)=>b.max>a.max?b:a);
    const wettest=climateRows.reduce((a,b)=>b.rain>a.rain?b:a);
    const y2025=annual.find(x=>x.year===2025) ?? annual.at(-1)!;
    return {annual,trend:last-first,hottest,wettest,current:y2025,normal:annual.filter(x=>x.year>=1991&&x.year<=2020).reduce((a,b)=>a+b.mean,0)/30};
  },[climateRows]);

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="republique">
          <img src="https://raw.githubusercontent.com/DDT95/transport95/main/prefet-val-doise-logo.png" alt="Préfet du Val-d’Oise"/>
        </div>
        <div className="titleblock">
          <div className="eyebrow">MÉTÉO · VAL-D’OISE</div>
          <h1>Météo</h1>
          <div className="subtitle">Temps réel · prévisions · climat · qualité de l’air</div>
        </div>
        <div className="livebox">
          <span className="liveDot"/>
          <div><b>Données actualisées à {updated}</b><small>Open-Meteo · 183 communes</small></div>
        </div>
      </header>
      <div className="progress"><span/></div>

      <div className="workspace">
        <aside className="panel">
          <div className="panelHead">
            <div className="toolKicker">EXPLORER LE TERRITOIRE</div>
            <div className="question">Quel temps fait-il&nbsp;?</div>
            <p>Recherche une commune et analyse la météo actuelle, les prévisions et l’historique.</p>
            <div className="search">
              <span>⌕</span>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Commune du Val-d’Oise…" aria-label="Rechercher une commune"/>
              <button type="button" onClick={() => filtered[0] && (setSelected(filtered[0]), setQuery(""), setDrawerOpen(true))}>Rechercher</button>
              {filtered.length > 0 && <div className="results">{filtered.map(p => <button key={p.code} onClick={() => { setSelected(p); setQuery(""); setDrawerOpen(true); }}>{p.nom}<small>{p.code}</small></button>)}</div>}
            </div>
            <div className="selectedCard">
              <div><small>{selected.code === "95" ? "VUE DÉPARTEMENTALE" : "COMMUNE SÉLECTIONNÉE"}</small><b>{selected.nom}</b><span>{selected.code === "95" ? "183 communes" : `Code INSEE ${selected.code}`}</span></div>
              <strong>{loading ? "…" : `${fmt(c.temperature_2m,1)}°`}</strong>
            </div>
            <div className="actions"><button className="primary" onClick={() => setSelected(departmentPlace)}>Recentrer le Val-d’Oise</button><button disabled={selected.code === "95"} onClick={() => setDrawerOpen(true)}>Voir la fiche</button></div>
          </div>

          <div className="panelScroll">
            <section className="liveBoard">
              <div className="sectionHead"><div><h2>Choisir la lecture de la carte</h2><p>Les trois valeurs restent visibles dans chaque repère.</p></div><span>Direct</span></div>
              <div className="liveTiles">
                <button className={`tempTile ${mapMode==="temperature"?"active":""}`} onClick={()=>setMapMode("temperature")}><span>🌡️</span><div><small>Température</small><b>{fmt(c.temperature_2m,1)} °C</b></div><i>›</i></button>
                <button className={`rainTile ${mapMode==="rain"?"active":""}`} onClick={()=>setMapMode("rain")}><span>💧</span><div><small>Pluie</small><b>{fmt(c.precipitation,1)} mm</b></div><i>›</i></button>
                <button className={`windTile ${mapMode==="wind"?"active":""}`} onClick={()=>setMapMode("wind")}><span>💨</span><div><small>Vent</small><b>{fmt(c.wind_speed_10m)} km/h</b></div><i>›</i></button>
              </div>
            </section>
            <section className="airBoard">
              <div className="sectionHead"><div><h2>Qualité de l’air · Airparif</h2><p>Indice ATMO et sous-indices quotidiens.</p></div><span>Quotidien</span></div>
              <div className="airTiles">
                {airModes.map(layer => <button key={layer.id} className={mapMode === layer.id ? "active" : ""} onClick={() => setMapMode(layer.id)}><i aria-hidden="true"/><div><b>{layer.label}</b><span>{layer.detail}</span></div><em style={{ background: layer.color }}/></button>)}
              </div>
            </section>
            <section className="quickFacts"><h2>Conditions à {selected.nom}</h2><div><span>💨 Rafales <b>{fmt(c.wind_gusts_10m)} km/h</b></span><span>◉ Pression <b>{fmt(c.pressure_msl)} hPa</b></span><span>☁️ Nuages <b>{fmt(c.cloud_cover)} %</b></span><span>🧭 Vent <b>{fmt(c.wind_direction_10m)}°</b></span></div></section>
          </div>
        </aside>

        <section className="mapZone">
          <div className="mapCard">
            <WeatherMap mode={mapMode} selectedCode={selected.code} onSelect={p => { setSelected(p); setDetailTab("today"); setDrawerOpen(true); }}/>
            <div className="mapHelp"><b>Clique sur une commune</b><span>pour consulter sa fiche météorologique</span></div>
            <div className={`legend ${mapMode}`}><b>{mapMode==="temperature"?"Température de l’air":mapMode==="rain"?"Précipitations en cours":mapMode==="wind"?"Vitesse du vent":airModes.find(layer => layer.id === mapMode)?.label}</b><div className="gradient"/><span>{mapMode==="temperature"?"15 à 35 °C":mapMode==="rain"?"0 à 5+ mm":mapMode==="wind"?"0 à 40+ km/h":"Bon · moyen · dégradé · mauvais · très mauvais"}</span></div>
          </div>
        </section>
      </div>

      <footer><span><b>Sources officielles et ouvertes</b> · flux datés et qualifiés</span><span>DDT du Val-d’Oise · Leaflet 1.9.4</span></footer>

      <aside className={`drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <button className="close" onClick={() => setDrawerOpen(false)} aria-label="Fermer">×</button>
        <div className="drawerHead"><small>MÉTÉO COMMUNALE</small><h2>{selected.nom}</h2><p>Code INSEE {selected.code} · actualisé à {updated}</p></div>
        <nav className="drawerTabs"><button className={detailTab==="today"?"active":""} onClick={()=>setDetailTab("today")}>Aujourd’hui</button><button className={detailTab==="forecast"?"active":""} onClick={()=>setDetailTab("forecast")}>7 jours</button><button className={detailTab==="climate"?"active":""} onClick={()=>setDetailTab("climate")}>Climat</button></nav>
        <div className="drawerBody">
          {loading && <div className="loading">Actualisation des données…</div>}
          {detailTab==="today" && <><section className={`currentHero ${loading ? "isLoading" : ""}`}><span>{Number(c.weather_code)===0?"☀️":Number(c.weather_code)<=2?"🌤️":Number(c.weather_code)<=3?"☁️":Number(c.weather_code)<=67?"🌧️":"⛈️"}</span><div><b>{loading ? "Actualisation…" : `${fmt(c.temperature_2m,1)} °C`}</b><p>{loading ? "Synchronisation de la commune sélectionnée" : `${weatherLabel(Number(c.weather_code))} · ressenti ${fmt(c.apparent_temperature,1)} °C`}</p></div></section>
          <section className="metrics richMetrics"><div><b>{fmt(c.apparent_temperature,1)}°</b><span>Ressenti</span></div><div><b>{fmt(c.relative_humidity_2m)} %</b><span>Humidité</span></div><div><b>{fmt(c.precipitation,1)} mm</b><span>Précipitations</span></div><div><b>{fmt(c.wind_speed_10m)} km/h</b><span>Vent</span></div><div><b>{fmt(c.wind_gusts_10m)} km/h</b><span>Rafales</span></div><div><b>{fmt(c.pressure_msl)} hPa</b><span>Pression</span></div><div><b>{fmt(c.cloud_cover)} %</b><span>Nébulosité</span></div><div><b>{fmt(c.wind_direction_10m)}°</b><span>Direction</span></div></section>
          <section className="detailCard"><h3>Température sur 24 heures</h3><Sparkline values={hourValues}/><p>Minimum {fmt(Math.min(...hourValues))} °C · maximum {fmt(Math.max(...hourValues))} °C</p></section>
          <section className="comfortCard"><div><span>🔥</span><div><h3>Confort thermique</h3><p>Ressenti local et exposition à la chaleur.</p></div></div><strong className={Number(c.temperature_2m)>=30?"hot":""}>{heatLevel}</strong></section></>}
          {detailTab==="forecast" && <section className="forecastPlay compactForecast"><div className="forecastLead"><span>🗓️</span><div><h3>La semaine à venir</h3><p>Maximum · minimum · pluie · UV</p></div><strong>{fmt(rain7,1)} mm sur 7 j</strong></div><div className="forecastRows">{(daily.time??[]).map((t,i)=><article key={String(t)}><span className="forecastDay">{i===0?"Aujourd’hui":day(t,true)}</span><i>{Number(daily.weather_code[i])===0?"☀️":Number(daily.weather_code[i])<=2?"🌤️":Number(daily.weather_code[i])<=3?"☁️":Number(daily.weather_code[i])<=67?"🌧️":"⛈️"}</i><b>{fmt(daily.temperature_2m_max[i])}°</b><small>{fmt(daily.temperature_2m_min[i])}°</small><span className="rainValue">💧 {fmt(daily.precipitation_sum[i],1)} mm</span><span className="uvValue">UV {fmt(daily.uv_index_max[i],1)}</span></article>)}</div></section>}
          {detailTab==="climate" && <><section className="detailCard historyFun"><div className="forecastLead"><span>📈</span><div><h3>Les 30 derniers jours</h3><p>Le passé récent remet la journée en contexte.</p></div></div><div className="historyMetrics"><div><b>{fmt(rain30,1)} mm</b><span>Pluie cumulée</span></div><div><b>{fmt(max30,1)} °C</b><span>Pic de chaleur</span></div></div><Sparkline values={(history?.daily.temperature_2m_max as number[]) ?? []} color="#e76b3c"/></section>
          <section className="observatoryCard">
            <div className="observatoryHead"><small>REPÈRES CLIMATIQUES</small><h3>45 ans de recul</h3><p>Réanalyse climatique 1981–2025 au point de la commune.</p></div>
            {climateStats ? <>
              <div className="bigStat"><b>{climateStats.trend>=0?"+":""}{fmt(climateStats.trend,1)} °C</b><span>écart entre les décennies 1981–1990 et 2016–2025</span></div>
              <Sparkline values={climateStats.annual.map(x=>x.mean)} color="#e1000f"/>
              <div className="climateGrid">
                <div><b>{fmt(climateStats.normal,1)} °C</b><span>Normale annuelle 1991–2020</span></div>
                <div><b>{fmt(climateStats.current.rain)} mm</b><span>Pluie en {climateStats.current.year}</span></div>
                <div><b>{climateStats.current.hot}</b><span>Jours ≥ 30 °C</span></div>
                <div><b>{climateStats.current.frost}</b><span>Jours de gel</span></div>
              </div>
              <div className="recordRows"><p><span>Record de chaleur</span><b>{fmt(climateStats.hottest.max,1)} °C · {new Date(climateStats.hottest.date).toLocaleDateString("fr-FR")}</b></p><p><span>Jour le plus arrosé</span><b>{fmt(climateStats.wettest.rain,1)} mm · {new Date(climateStats.wettest.date).toLocaleDateString("fr-FR")}</b></p></div>
            </> : climate && !climateStats ? <div className="climateError"><b>Données climatiques momentanément indisponibles</b><span>Le temps réel et les 30 derniers jours restent disponibles. Réessaie dans quelques instants.</span></div> : <div className="climateLoading"><span className="loaderDot"/><b>Construction de la série 1981–2025</b><small>Plus de 16 000 journées sont analysées pour cette commune.</small></div>}
          </section></>}
        </div>
      </aside>
    </main>
  );
}
