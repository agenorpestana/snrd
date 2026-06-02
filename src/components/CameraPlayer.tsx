import React, { useState, useEffect } from "react";
import { Camera, WeatherInfo } from "../types";
import { Cloud, CloudRain, Sun, CloudLightning, CloudDrizzle, Thermometer, Wind, Droplets, Info, Database, Eye, ShieldCheck, RefreshCw } from "lucide-react";

interface CameraPlayerProps {
  camera: Camera;
  isSelected: boolean;
  onSelect: () => void;
  isAdmin: boolean;
  onEditClick?: (camera: Camera) => void;
  onDeleteClick?: (camera: Camera) => void;
}

export default function CameraPlayer({
  camera,
  isSelected,
  onSelect,
  isAdmin,
  onEditClick,
  onDeleteClick,
}: CameraPlayerProps): React.JSX.Element {
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const [streamOffline, setStreamOffline] = useState(false);

  // Dynamic ticking clock for surveillance overlay
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const day = pad(now.getDate());
      const month = pad(now.getMonth() + 1);
      const year = now.getFullYear();
      const hours = pad(now.getHours());
      const minutes = pad(now.getMinutes());
      const seconds = pad(now.getSeconds());
      setCurrentTime(`${day}/${month}/${year} ${hours}:${minutes}:${seconds}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch weather forecast of the specific city associated with the camera
  const fetchWeather = async () => {
    if (!camera.city) return;
    setLoadingWeather(true);
    setWeatherError("");
    try {
      const res = await fetch(`/api/weather?city=${encodeURIComponent(camera.city)}`);
      if (!res.ok) throw new Error("Erro de resposta do servidor climático.");
      const data = await res.json();
      setWeather(data);
    } catch (err: any) {
      console.error("Falha ao buscar clima para", camera.city, err);
      setWeatherError("Clima indisponível.");
    } finally {
      setLoadingWeather(false);
    }
  };

  useEffect(() => {
    fetchWeather();
  }, [camera.city]);

  // Determine weather icon representation
  const getWeatherIcon = (condition: string) => {
    const cond = (condition || "").toLowerCase();
    if (cond.includes("sol") || cond.includes("limpo") || cond.includes("quente")) {
      return <Sun className="h-6 w-6 text-amber-400" />;
    }
    if (cond.includes("chuva") || cond.includes("chovendo")) {
      return <CloudRain className="h-6 w-6 text-sky-400 animate-bounce" />;
    }
    if (cond.includes("chuvisco") || cond.includes("garoa") || cond.includes("leves")) {
      return <CloudDrizzle className="h-6 w-6 text-blue-300" />;
    }
    if (cond.includes("tempestade") || cond.includes("temporal") || cond.includes("raios")) {
      return <CloudLightning className="h-6 w-6 text-purple-400 animate-pulse" />;
    }
    return <Cloud className="h-6 w-6 text-slate-400" />;
  };

  // Convert PTZ state values to style translation offsets for simulated live preview panning!
  const panOffset = camera.ptzStatus ? camera.ptzStatus.pan : 0;
  const tiltOffset = camera.ptzStatus ? camera.ptzStatus.tilt : 0;
  const zoomScale = camera.ptzStatus ? camera.ptzStatus.zoom : 1.0;

  // Render a beautiful stylized canvas-backdrop representing airport runway or coastal view depending on the camera name
  const nameLower = camera.name.toLowerCase();
  const descLower = (camera.description || "").toLowerCase();
  const indexMatch = String(camera.id).toLowerCase();

  const isPista = nameLower.includes("pista") || nameLower.includes("aeroporto") || descLower.includes("pista") || indexMatch.includes("cam-1");
  const isCopa = nameLower.includes("copacabana") || nameLower.includes("mar") || nameLower.includes("praia") || nameLower.includes("rio") || descLower.includes("praia") || indexMatch.includes("cam-2");
  const isPatio = nameLower.includes("pátio") || nameLower.includes("patio") || nameLower.includes("garagem") || nameLower.includes("estacionamento") || nameLower.includes("yard") || nameLower.includes("portaria") || descLower.includes("pátio") || descLower.includes("estacionamento");
  const isEscritorio = nameLower.includes("escritório") || nameLower.includes("escritorio") || nameLower.includes("sala") || nameLower.includes("servidor") || nameLower.includes("interno") || nameLower.includes("corredor") || nameLower.includes("datacenter") || nameLower.includes("hall") || nameLower.includes("recepção") || descLower.includes("escritório") || descLower.includes("pátio interno") || descLower.includes("interno") || indexMatch.includes("cam-3");

  return (
    <div
      id={`camera-card-${camera.id}`}
      onClick={onSelect}
      className={`rounded-xl border transition-all duration-300 flex flex-col group overflow-hidden cursor-pointer ${
        isSelected
          ? "bg-slate-900 border-[#00A767] shadow-xl ring-2 ring-[#00A767]/30 scale-[1.01]"
          : "bg-slate-950/70 border-slate-800 hover:border-slate-700 shadow hover:shadow-lg hover:bg-slate-950"
      }`}
    >
      {/* 1. SURVEILLANCE VIEWPORT */}
      <div className="relative aspect-video bg-slate-950 overflow-hidden select-none">
        
        {/* Real video background mock (animated vector rendering using pure HTML & CSS) */}
        <div 
          className="absolute inset-0 w-full h-full transition-transform duration-500 ease-out origin-center"
          style={{
            transform: `scale(${zoomScale}) translate(${panOffset * 0.3}px, ${-tiltOffset * 0.3}px)`
          }}
        >
          {isPista ? (
            /* Visual airport runway mockup matching the Intelbras user prompt image perfectly! */
            <div className="w-full h-full relative bg-gradient-to-b from-sky-400 via-sky-300 to-emerald-800 overflow-hidden">
              {/* Skylines/Decolations */}
              <div className="absolute top-[35%] left-0 right-0 h-1 bg-sky-200"></div>
              <div className="absolute top-0 left-0 right-0 h-[40%] bg-gradient-to-t from-transparent to-sky-500/30"></div>
              {/* Cloulds */}
              <div className="absolute top-10 left-[15%] w-32 h-10 bg-white/60 rounded-full blur-[6px]"></div>
              <div className="absolute top-20 right-[25%] w-44 h-12 bg-white/50 rounded-full blur-[8px]"></div>
              
              {/* Sun Flare */}
              <div className="absolute top-8 left-[30%] w-60 h-60 bg-gradient-to-r from-yellow-100/30 to-orange-200/5 blur-3xl rounded-full"></div>
              
              {/* Forest / Mountains Backdrop */}
              <div className="absolute bottom-[40%] left-0 right-0 h-16 bg-[#005c31] clip-mountain flex items-end">
                <div className="w-full h-4 bg-[#0a522f] opacity-80 blur-sm"></div>
              </div>

              {/* Asphalt Airport Runway Lane */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[75%] h-[42%] bg-[#2e2e2e] py-1">
                {/* Yellow center line */}
                <div className="h-full w-2 mx-auto border-t-[8px] bg-yellow-400/90 border-dashed border-yellow-500/20"></div>
                {/* White side lines */}
                <div className="absolute left-4 top-0 bottom-0 w-1 bg-white/65"></div>
                <div className="absolute right-4 top-0 bottom-0 w-1 bg-white/65"></div>
              </div>

              {/* Hangar elements */}
              <div className="absolute bottom-0 left-2 w-14 h-16 bg-white border-r-4 border-slate-300 origin-bottom flex items-start justify-center text-[8px] text-slate-400 pt-2 shadow-lg">
                Hangar 1
              </div>

              {/* Grass details */}
              <div className="absolute bottom-0 left-0 w-[12.5%] h-[40%] bg-gradient-to-r from-emerald-800 to-emerald-700"></div>
              <div className="absolute bottom-0 right-0 w-[12.5%] h-[40%] bg-gradient-to-l from-emerald-800 to-emerald-700"></div>

              {/* Animated Airplane landing shadow */}
              <div className="absolute top-[42%] left-[48%] bg-slate-900/40 w-10 h-2 rounded-full blur-sm opacity-60 animate-pulse"></div>
            </div>
          ) : isCopa ? (
            /* Visual Copacabana view mockup */
            <div className="w-full h-full relative bg-gradient-to-b from-sky-300 via-sky-200 to-yellow-100 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[45%] bg-gradient-to-b from-blue-400 to-sky-300"></div>
              {/* Sea Waves */}
              <div className="absolute bottom-[10%] left-0 right-0 h-[35%] bg-gradient-to-b from-teal-500 to-cyan-600">
                <div className="absolute inset-0 bg-white/10 opacity-40 animate-pulse flex items-center justify-center font-bold text-teal-800 text-xs">~~ COPACABANA ~~</div>
              </div>
              {/* Sand Beach */}
              <div className="absolute bottom-0 left-0 right-0 h-[18%] bg-[#e3cfac]"></div>
              {/* Sun */}
              <div className="absolute top-12 right-20 w-16 h-16 bg-amber-200 rounded-full blur-md"></div>
            </div>
          ) : isPatio ? (
            /* Visual Operations Yard / Patio / Parking Lot mockup */
            <div className="w-full h-full relative bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 overflow-hidden">
              {/* Starry/Surveillance Sky details */}
              <div className="absolute top-4 left-10 w-1.5 h-1.5 bg-yellow-100 rounded-full opacity-60"></div>
              <div className="absolute top-10 right-16 w-1 h-1 bg-white rounded-full opacity-40"></div>
              
              {/* Horizon & Mountains */}
              <div className="absolute bottom-[40%] left-0 right-0 h-10 bg-slate-950 opacity-90 clip-mountain"></div>
              
              {/* Yard Ground */}
              <div className="absolute bottom-0 left-0 right-0 h-[40%] bg-gradient-to-b from-slate-800 to-slate-900 border-t border-slate-700/50">
                {/* Yellow parking markers */}
                <div className="absolute left-[20%] top-4 bottom-0 w-1.5 bg-yellow-500/20 origin-bottom transform skew-x-12"></div>
                <div className="absolute left-[50%] top-4 bottom-0 w-1.5 bg-yellow-500/20"></div>
                <div className="absolute right-[20%] top-4 bottom-0 w-1.5 bg-yellow-500/20 origin-bottom transform -skew-x-12"></div>
              </div>

              {/* Stacked Cargo Containers */}
              <div className="absolute bottom-[35%] left-4 w-12 h-14 bg-gradient-to-b from-blue-600 to-blue-700 rounded border-t border-blue-400 flex flex-col justify-between p-1 shadow-md">
                <div className="h-1 border-b border-blue-500/35"></div>
                <div className="h-1 border-b border-blue-500/35"></div>
                <span className="text-[7px] font-mono text-white/50 text-center uppercase tracking-wider">CARGO</span>
              </div>
              <div className="absolute bottom-[35%] left-18 w-10 h-10 bg-gradient-to-b from-orange-600 to-orange-705 rounded border-t border-orange-400 flex flex-col justify-between p-1 shadow-md">
                <div className="h-1 border-b border-orange-400/35"></div>
                <span className="text-[7px] font-mono text-white/50 text-center uppercase tracking-wider">SNRD</span>
              </div>

              {/* Industrial Lamp / Spotlight projection */}
              <div className="absolute top-0 right-[25%] w-0 h-0 border-l-[45px] border-l-transparent border-r-[45px] border-r-transparent border-b-[120px] border-b-yellow-400/10 pointer-events-none blur-sm animate-pulse"></div>
              <div className="absolute top-0 right-[25%] w-2 h-4 bg-slate-700 rounded-b"></div>

              {/* Stylized Security Bar Gate */}
              <div className="absolute bottom-6 right-[15%] w-24 h-1.5 bg-red-600 border border-white rounded shadow-md"></div>
              <div className="absolute bottom-2 right-[22%] w-3 h-5 bg-slate-600 rounded"></div>

              {/* Animated camera lens sweep reflection (subtle light bars passing by) */}
              <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent"></div>
            </div>
          ) : isEscritorio ? (
            /* Visual High-Tech Server Room / Indoor corridor mockup */
            <div className="w-full h-full relative bg-slate-950 overflow-hidden pb-10">
              {/* Prospective Corridor lines */}
              <svg className="absolute inset-0 w-full h-full opacity-25" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="0" x2="135" y2="70" stroke="#10b981" strokeWidth="0.5" strokeOpacity="0.4" />
                <line x1="100%" y1="0" x2="185" y2="70" stroke="#10b981" strokeWidth="0.5" strokeOpacity="0.4" />
                <line x1="0" y1="100%" x2="135" y2="110" stroke="#10b981" strokeWidth="0.5" strokeOpacity="0.4" />
                <line x1="100%" y1="100%" x2="185" y2="110" stroke="#10b981" strokeWidth="0.5" strokeOpacity="0.4" />
              </svg>

              {/* Far end door/wall */}
              <div className="absolute top-[40%] left-[42%] w-[16%] h-[15%] bg-slate-900 border border-slate-800 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></div>
              </div>

              {/* Left Server Rack Cabinet with Blinking LEDs */}
              <div className="absolute top-0 bottom-0 left-0 w-[30%] bg-gradient-to-r from-slate-950 to-slate-900 border-r border-slate-800/80 flex flex-col justify-around py-2 px-1">
                {Array.from({ length: 4 }).map((_, rIdx) => (
                  <div key={rIdx} className="bg-slate-950 border border-slate-900 rounded p-1 flex flex-col space-y-1">
                    <div className="h-0.5 bg-slate-800 rounded"></div>
                    <div className="flex justify-between items-center px-0.5 scale-90">
                      {/* Servers rack status blinking LEDs */}
                      <span className={`w-1.5 h-1.5 rounded-full ${rIdx % 2 === 0 ? "bg-emerald-500 animate-pulse" : "bg-cyan-500 animate-pulse"}`}></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className={`w-1.5 h-1.5 rounded-full ${rIdx % 3 === 0 ? "bg-amber-400 animate-bounce" : "bg-emerald-500"}`}></span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right Office Partition or Windows Cabinet */}
              <div className="absolute top-0 bottom-0 right-0 w-[30%] bg-gradient-to-l from-slate-950 to-slate-900 border-l border-slate-800/80 flex flex-col justify-around py-3 px-1.5">
                {Array.from({ length: 3 }).map((_, wIdx) => (
                  <div key={wIdx} className="h-[22%] bg-blue-950/15 border border-blue-900/25 rounded flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-blue-500/5 to-transparent"></div>
                    <span className="text-[7px] font-mono text-slate-500 scale-90">SYS ACTIVE</span>
                  </div>
                ))}
              </div>

              {/* Floor highlight reflection */}
              <div className="absolute bottom-0 left-[30%] right-[30%] h-4 bg-gradient-to-t from-emerald-500/5 to-transparent blur-sm"></div>
            </div>
          ) : (
            /* Visual High-Fidelity Urban City Skyline Fallback Mockup */
            /* This mimics a real-world active street/outdoor camera feed! */
            <div className="w-full h-full relative bg-gradient-to-b from-[#050917] via-[#091024] to-[#121c38] overflow-hidden">
              {/* Starry Night Sky */}
              <div className="absolute top-4 left-6 w-0.5 h-0.5 bg-white rounded-full opacity-60"></div>
              <div className="absolute top-10 right-12 w-0.5 h-0.5 bg-white rounded-full opacity-70"></div>
              <div className="absolute top-6 left-[40%] w-1 h-1 bg-yellow-105 rounded-full opacity-35 animate-pulse"></div>
              
              {/* City Skyline Silhouette with Window Lights */}
              <div className="absolute bottom-[30%] inset-x-0 h-24 flex items-end justify-between px-2 opacity-95">
                <div className="w-12 h-14 bg-slate-950 border-t border-l border-slate-800 rounded-t relative">
                  <div className="grid grid-cols-2 gap-0.5 p-1 opacity-70">
                    <span className="w-1 h-1 bg-yellow-300 rounded-sm"></span>
                    <span className="w-1 h-1 bg-slate-800 rounded-sm"></span>
                    <span className="w-1 h-1 bg-yellow-200 rounded-sm animate-pulse"></span>
                    <span className="w-1 h-1 bg-yellow-300 rounded-sm"></span>
                  </div>
                </div>
                <div className="w-16 h-20 bg-slate-900 border-t border-x border-slate-850 rounded-t relative">
                  <div className="grid grid-cols-3 gap-0.5 p-1 opacity-80">
                    <span className="w-1 h-1 bg-slate-800 rounded-sm"></span>
                    <span className="w-1 h-1 bg-yellow-300 rounded-sm"></span>
                    <span className="w-1 h-1 bg-yellow-400 rounded-sm animate-pulse"></span>
                    <span className="w-1 h-1 bg-slate-800 rounded-sm"></span>
                    <span className="w-1 h-1 bg-yellow-300 rounded-sm"></span>
                    <span className="w-1 h-1 bg-slate-800 rounded-sm"></span>
                  </div>
                </div>
                <div className="w-10 h-16 bg-slate-950 border-t border-r border-slate-800 rounded-t relative">
                  <div className="grid grid-cols-2 gap-1 p-1 opacity-60">
                    <span className="w-1 h-1 bg-yellow-200 rounded-sm"></span>
                    <span className="w-1 h-1 bg-yellow-300 rounded-sm"></span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-slate-900 border-t border-slate-850 rounded-t"></div>
              </div>

              {/* Express Highway in Perspective */}
              <div className="absolute bottom-0 left-0 right-0 h-[32%] bg-[#1c1d24] border-t border-slate-700 flex flex-col justify-between py-1 shadow-inner relative overflow-hidden">
                {/* Lane Separator Dash */}
                <div className="h-0.5 w-full bg-transparent border-t border-dashed border-white/20 my-auto"></div>
                
                {/* White Highway Guardrails */}
                <div className="absolute top-0 inset-x-0 h-0.5 bg-slate-600/45"></div>
                
                {/* Headlights Traffic (White going Left) */}
                <div className="absolute top-[20%] left-0 right-0 flex justify-between animate-marquee-left">
                  <span className="w-2.5 h-1 bg-yellow-100 rounded-full blur-[0.5px] shadow-[0_0_8px_white]"></span>
                  <span className="w-3.5 h-1.5 bg-white rounded-full blur-[0.5px] shadow-[0_0_8px_white] opacity-80"></span>
                </div>

                {/* Taillights Traffic (Red going Right) */}
                <div className="absolute bottom-[20%] left-0 right-0 flex justify-around animate-marquee-right">
                  <span className="w-1.5 h-1 bg-red-500 rounded-full blur-[0.5px] shadow-[0_0_6px_red]"></span>
                  <span className="w-2.5 h-1 bg-red-605 rounded-full blur-[0.5px] shadow-[0_0_6px_red] opacity-90"></span>
                </div>
              </div>

              {/* Surveillance Overlay Message in corner */}
              <div className="absolute bottom-12 inset-x-0 flex items-center justify-center opacity-30 select-none pointer-events-none">
                <span className="text-[8px] font-mono text-slate-400 tracking-widest uppercase">AUTO-MONITORAMENTO URBANO ATIVO</span>
              </div>
            </div>
          )}
        </div>

        {/* 2. ON-SCREEN DISPLAY (OSD) SURVEILLANCE OVERLAYS */}
        
        {/* Top left metadata (camera name) */}
        <div className="absolute top-3 left-3 bg-slate-950/70 py-1 px-2.5 rounded-md backdrop-blur-sm border border-white/5 select-none pointer-events-none">
          <p className="font-mono text-white text-[11px] font-semibold tracking-wide flex items-center gap-1.5 uppercase">
            <span className="h-2 w-2 rounded-full bg-[#00A767] animate-ping"></span>
            {camera.name}
          </p>
        </div>

        {/* Top right timestamp & dynamic OSD clock */}
        <div className="absolute top-3 right-3 bg-slate-950/70 py-1 px-2.5 rounded-md backdrop-blur-sm border border-white/5 select-none pointer-events-none">
          <p className="font-mono text-[11px] text-white/95 font-medium tracking-widest uppercase bg-transparent">
            {currentTime}
          </p>
        </div>

        {/* Bottom left device model label */}
        <div className="absolute bottom-3 left-3 select-none pointer-events-none">
          <p className="font-mono text-xs text-white bg-slate-950/60 px-2 py-0.5 rounded backdrop-blur-sm font-semibold tracking-wider">
            {camera.modelName || "VIPW Intelbras"}
          </p>
        </div>

        {/* Stream coordinates telemetry in lower quadrant */}
        {camera.isPtzCompatible && camera.ptzStatus && (
          <div className="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur-sm py-1 px-2 rounded border border-white/5 font-mono text-[8.5px] text-slate-300 flex space-x-2 pointer-events-none">
            <span>P: {camera.ptzStatus.pan}°</span>
            <span>T: {camera.ptzStatus.tilt}°</span>
            <span>Z: {camera.ptzStatus.zoom}x</span>
          </div>
        )}

        {/* Scan lines / Camera scan HUD */}
        <div className="absolute inset-0 bg-scanlines pointer-events-none opacity-20"></div>

        {/* Corner framing indicators */}
        <div className="absolute top-4 left-4 w-3 h-3 border-t-2 border-l-2 border-white/35 pointer-events-none"></div>
        <div className="absolute top-4 right-4 w-3 h-3 border-t-2 border-r-2 border-white/35 pointer-events-none"></div>
        <div className="absolute bottom-4 left-4 w-3 h-3 border-b-2 border-l-2 border-white/35 pointer-events-none"></div>
        <div className="absolute bottom-4 right-4 w-3 h-3 border-b-2 border-r-2 border-white/35 pointer-events-none"></div>

        {/* REC overlay */}
        <div className="absolute top-12 left-3 flex items-center space-x-1 font-mono text-[9px] text-red-500 font-bold bg-slate-950/50 px-1.5 py-0.5 rounded pointer-events-none select-none">
          <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse"></span>
          <span>REC 1080P</span>
        </div>
      </div>

      {/* 2. LIVE WEATHER INTEGRITY INDICATOR & META CARD */}
      <div className="p-4 flex flex-col flex-grow bg-slate-950 text-slate-100 border-t border-slate-900 select-none">
        
        {/* Location & Real-Time Weather segment */}
        <div className="flex items-start justify-between border-b border-slate-900 pb-3 mb-3">
          <div>
            <h3 className="font-semibold text-sm text-slate-100 group-hover:text-[#00A767] transition-all">
              {camera.city}
            </h3>
            <p className="text-xs text-slate-400 line-clamp-1 mt-0.5 font-mono text-[11px]">
              {camera.streamUrl.replace(/:\/\/.*@/, "://***:***@")}
            </p>
          </div>

          {/* Core Gemini weather widget integrated */}
          <div className="flex items-center text-right bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-800/40 relative min-w-[120px] justify-end group">
            {loadingWeather ? (
              <div className="flex items-center space-x-2 text-slate-400 text-xs">
                <RefreshCw className="h-3 w-3 animate-spin text-[#00A767]" />
                <span className="text-[10px] font-mono">Buscando Clima...</span>
              </div>
            ) : weatherError ? (
              <span className="text-[10px] text-red-400 font-mono flex items-center gap-1">
                {weatherError}
                <button 
                  onClick={(e) => { e.stopPropagation(); fetchWeather(); }} 
                  className="hover:text-white"
                  title="Tentar Novamente"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                </button>
              </span>
            ) : weather ? (
              <div className="flex items-center space-x-2">
                <div className="text-left">
                  <p className="text-xs font-bold text-white leading-none font-mono flex items-center gap-0.5">
                    {weather.temp}°C
                    <Thermometer className="h-3 w-3 text-emerald-400" />
                  </p>
                  <p className="text-[9px] text-[#00A767] whitespace-nowrap leading-tight mt-0.5 max-w-[80px] overflow-hidden text-ellipsis font-medium">
                    {weather.condition}
                  </p>
                </div>
                {getWeatherIcon(weather.condition)}
              </div>
            ) : (
              <span className="text-[10px] text-slate-400">N/A</span>
            )}
          </div>
        </div>

        {/* Description panel */}
        <p className="text-xs text-slate-450 leading-relaxed font-sans line-clamp-2">
          {camera.description}
        </p>

        {/* ONVIF Details footer panel & Device Info */}
        <div className="mt-3 pt-3 border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <div className="flex items-center space-x-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${camera.isPtzCompatible ? "bg-emerald-400" : "bg-slate-500"}`}></span>
            <span>{camera.isPtzCompatible ? "ONVIF PTZ ATIVO" : "ONVIF ESTÁTICO"}</span>
          </div>
          
          <div className="flex items-center space-x-1">
            <Database className="h-3 w-3 text-slate-600" />
            <span className="text-[10px] text-slate-600">IP: {camera.onvifIp || "N/A"}</span>
          </div>
        </div>

        {/* Admin management buttons */}
        {isAdmin && (onEditClick || onDeleteClick) && (
          <div className="mt-4 pt-3 border-t border-slate-900 flex items-center justify-end space-x-2">
            <button
              id={`cam-edit-${camera.id}`}
              onClick={(e) => {
                e.stopPropagation();
                if (onEditClick) onEditClick(camera);
              }}
              className="text-xs bg-slate-900 hover:bg-slate-850 hover:text-white border border-slate-800 text-slate-300 py-1.5 px-3 rounded-lg transition-colors font-medium cursor-pointer"
            >
              Editar Configurações
            </button>
            <button
              id={`cam-delete-${camera.id}`}
              onClick={(e) => {
                e.stopPropagation();
                if (onDeleteClick) onDeleteClick(camera);
              }}
              className="text-xs bg-red-950/40 hover:bg-red-900 border border-red-900/30 text-red-200 py-1.5 px-3 rounded-lg transition-colors font-medium cursor-pointer"
            >
              Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
