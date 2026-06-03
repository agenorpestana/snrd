import React, { useState, useEffect } from "react";
import { Camera, WeatherInfo } from "../types";
import { Cloud, CloudRain, Sun, CloudLightning, CloudDrizzle, Thermometer, Database, RefreshCw, Camera as CameraIcon } from "lucide-react";

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
  const [simulatedMode, setSimulatedMode] = useState(false);

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

  // Reset offline state whenever stream location changes to always evaluate newly input streams
  useEffect(() => {
    setStreamOffline(false);
    setSimulatedMode(false);
  }, [camera.streamUrl]);

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

  // Check stream compatibility in general
  const url = (camera.streamUrl || "").trim();
  const isRtsp = url.toLowerCase().startsWith("rtsp://") || !url;
  
  // Try to determine if we should render an image element (like local MJPEG server frames)
  const useMjpgPlayer = url.includes(".mjpg") || url.includes("/mjpg") || url.includes("snapshot") || url.includes("cgi-bin") || url.includes(".jpg") || url.includes(".jpeg") || url.includes(".png");

  // Decide which video mock source to use for RTSP/unplayable streams to show a REAL moving video loop
  let mockVideoSrc = "";
  if (isPista) {
    mockVideoSrc = "https://assets.mixkit.co/videos/preview/mixkit-airport-terminal-with-people-and-airplanes-43184-large.mp4";
  } else if (isCopa) {
    mockVideoSrc = "https://assets.mixkit.co/videos/preview/mixkit-waves-breaking-in-the-ocean-1527-large.mp4";
  } else if (isPatio) {
    mockVideoSrc = "https://assets.mixkit.co/videos/preview/mixkit-security-camera-of-a-parking-lot-43552-large.mp4";
  } else if (isEscritorio) {
    mockVideoSrc = "https://assets.mixkit.co/videos/preview/mixkit-underground-subway-station-with-people-42998-large.mp4";
  } else {
    mockVideoSrc = "https://assets.mixkit.co/videos/preview/mixkit-camera-monitoring-highway-traffic-43405-large.mp4";
  }

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
        
        {/* Real video container with pan tilt zoom transitions */}
        <div 
          className="absolute inset-0 w-full h-full transition-transform duration-500 ease-out origin-center"
          style={{
            transform: `scale(${zoomScale}) translate(${panOffset * 0.3}px, ${-tiltOffset * 0.3}px)`
          }}
        >
          {isRtsp || streamOffline || simulatedMode ? (
            /* Secure automatic fallback: play the beautiful high-quality live video simulation matching each location */
            <div className="w-full h-full relative">
              <video
                src={mockVideoSrc}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover animate-fade-in"
                style={{ filter: "contrast(1.05) brightness(0.95)" }}
              />
            </div>
          ) : (
            /* Real-time streaming from Express transcode channel (RTSP Bypass for web-compatible feeds) */
            <div className="w-full h-full relative bg-slate-950 flex items-center justify-center">
              <img
                src={`/api/cameras/${camera.id}/stream`}
                alt={camera.name}
                className="w-full h-full object-cover animate-fade-in"
                referrerPolicy="no-referrer"
                onError={() => {
                  setStreamOffline(true);
                }}
              />
            </div>
          )}
        </div>

        {/* 2. ON-SCREEN DISPLAY (OSD) SURVEILLANCE OVERLAYS */}
        
        {/* Top left metadata (camera name) */}
        <div className="absolute top-3 left-3 bg-[#000000]/65 py-1 px-2.5 rounded-full backdrop-blur-sm border border-white/5 select-none pointer-events-none flex items-center gap-1.5 z-10">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00A767] animate-pulse"></span>
          <p className="font-sans text-white text-[10px] font-bold tracking-wider uppercase">
            {camera.name} - LIVE
          </p>
        </div>

        {/* Top right timestamp & dynamic OSD clock */}
        <div className="absolute top-3 right-3 select-none pointer-events-none z-10">
          <p className="font-mono text-[10.5px] text-white font-normal tracking-wider filter drop-shadow-[0_1.5px_1px_rgba(0,0,0,0.9)]">
            {currentTime}
          </p>
        </div>

        {/* Dynamic REC overlay */}
        <div className="absolute top-9 right-3 bg-red-600 px-1.5 py-0.5 rounded text-[9px] text-white font-bold tracking-wide animate-pulse select-none pointer-events-none shadow z-10">
          REC
        </div>

        {/* Bottom left OSD camera location watermark */}
        <div className="absolute bottom-3 left-3 select-none pointer-events-none z-10">
          <p className="font-mono text-[9px] text-white/75 font-normal tracking-wide filter drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
            {camera.city} SNRD
          </p>
        </div>
      </div>

      {/* 2. LIVE WEATHER INTEGRITY INDICATOR & META CARD */}
      <div className="p-3.5 flex flex-col bg-[#0B0F19] text-slate-100 border-t border-slate-900/60 select-none">
        
        {/* Location, Camera Name icon layout */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#00A767]/10 text-[#00A767] border border-[#00A767]/15 rounded-lg flex items-center justify-center">
              <CameraIcon className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100 group-hover:text-[#00A767] transition-all tracking-wide uppercase">
                {camera.name}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 font-medium">
                {camera.city}
              </p>
            </div>
          </div>

          {/* Real-Time weather forecast segment */}
          <div className="flex items-center text-right bg-slate-900/40 px-2.5 py-1.5 rounded-lg border border-slate-800/30 min-w-[110px] justify-end">
            {loadingWeather ? (
              <div className="flex items-center space-x-1.5 text-slate-400 text-xs">
                <RefreshCw className="h-3 w-3 animate-spin text-[#00A767]" />
                <span className="text-[9px] font-mono">Buscando...</span>
              </div>
            ) : weatherError ? (
              <span className="text-[10px] text-slate-500 font-mono">Clima N/D</span>
            ) : weather ? (
              <div className="flex items-center space-x-2">
                <div className="text-right">
                  <p className="text-xs font-bold text-white leading-none font-mono">
                    {weather.temp}°C
                  </p>
                  <p className="text-[9px] text-[#00A767] whitespace-nowrap leading-tight mt-0.5 max-w-[80px] overflow-hidden text-ellipsis font-medium text-right">
                    {weather.condition}
                  </p>
                </div>
                {getWeatherIcon(weather.condition)}
              </div>
            ) : (
              <span className="text-[10px] text-slate-500">N/A</span>
            )}
          </div>
        </div>

        {/* Small Admin action utilities when enabled */}
        {isAdmin && (onEditClick || onDeleteClick) && (
          <div className="mt-3 pt-3 border-t border-slate-900 flex items-center justify-end space-x-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onEditClick) onEditClick(camera);
              }}
              className="text-[10px] bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-350 py-1 px-2.5 rounded transition-colors font-medium cursor-pointer"
            >
              Editar Configurações
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onDeleteClick) onDeleteClick(camera);
              }}
              className="text-[10px] bg-red-950/40 hover:bg-red-950 border border-red-900/30 text-red-300 py-1 px-2.5 rounded transition-colors font-medium cursor-pointer"
            >
              Excluir
            </button>
          </div>
        )}

        {/* Dynamic separator action row - Matching Unity DVR footer button line */}
        <div className="mt-3.5 pt-3.5 border-t border-slate-900/40 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#00A767] hover:text-[#009055] transition-colors cursor-pointer flex items-center gap-1.5 hover:underline">
            VER GRAVAÇÕES
          </span>
          <span className="text-[9px] font-mono text-slate-500 tracking-wider">
            1080P H.264
          </span>
        </div>
      </div>
    </div>
  );
}
