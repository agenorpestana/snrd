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

  // Compute a base zoomed scale of at least 1.35x. This provides extra margins
  // for the image to slide inside the container when panned or tilted, preventing black bands entirely!
  const effectiveZoom = Math.max(1.35, zoomScale);

  // Bounds-preserving mathematical maximum translations relative to the zoomed frame:
  // (effectiveZoom - 1) / (2 * effectiveZoom) is the exact mathematically derived percentage-based bound to keep edges fully inside!
  const maxTranslateX = ((effectiveZoom - 1) / (2 * effectiveZoom)) * 100;
  const maxTranslateY = ((effectiveZoom - 1) / (2 * effectiveZoom)) * 100;

  const translateX = (panOffset / 180) * maxTranslateX;
  const translateY = (-tiltOffset / 90) * maxTranslateY;

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
        
        {/* Real video container with normal layout and no zoom clipping */}
        <div className="absolute inset-0 w-full h-full">
          {simulatedMode ? (
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
              {/* Overlay info for active simulation with option to return to live stream */}
              <div className="absolute inset-x-0 bottom-4 flex justify-center px-4 select-none pointer-events-auto z-10 animate-fade-in">
                <div className="bg-slate-950/90 backdrop-blur-md border border-emerald-500/30 rounded-lg py-1 px-3 text-center shadow-lg flex items-center justify-between gap-3">
                  <span className="text-[9.5px] text-emerald-400 font-semibold flex items-center gap-1.5 font-sans">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Modo Demonstrativo Ativo
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSimulatedMode(false);
                      setStreamOffline(false);
                    }}
                    className="bg-[#00A767] hover:bg-[#009055] text-black font-extrabold text-[9px] py-1 px-2.5 rounded transition-colors cursor-pointer uppercase tracking-wider"
                  >
                    Tentar Sinal Real
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Real-time streaming from Express transcode channel (RTSP Bypass for web-compatible feeds) */
            <div className="w-full h-full relative bg-slate-950 flex items-center justify-center">
              {!streamOffline ? (
                <img
                  src={`/api/cameras/${camera.id}/stream`}
                  alt={camera.name}
                  className="w-full h-full object-cover animate-fade-in"
                  referrerPolicy="no-referrer"
                  onError={() => {
                    setStreamOffline(true);
                  }}
                />
              ) : (
                <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-4 text-center z-10 select-text">
                  <div className="h-8 w-8 rounded-full bg-red-950 border border-red-500/45 flex items-center justify-center mb-1.5 animate-pulse select-none">
                    <span className="h-2 w-2 bg-red-500 rounded-full"></span>
                  </div>
                  <p className="text-[10.5px] font-bold text-red-500 font-mono tracking-wider uppercase">Câmera Offline</p>
                  <p className="text-[9px] text-slate-300 mt-1 max-w-[280px]">
                    Não foi possível conectar ao endereço <code className="bg-slate-900 px-1 py-0.5 rounded font-mono text-[8.5px] text-slate-100">{camera.streamUrl}</code> via servidor central.
                  </p>
                  <div className="flex gap-2 mt-3 select-none">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setStreamOffline(false);
                      }}
                      className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white font-bold text-[9px] py-1 px-2.5 rounded transition-all cursor-pointer shadow-sm"
                    >
                      Reconectar
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSimulatedMode(true);
                        setStreamOffline(false);
                      }}
                      className="bg-[#00A767] hover:bg-[#009055] text-black font-extrabold text-[9px] py-1 px-2.5 rounded transition-all cursor-pointer shadow-sm"
                    >
                      Demonstração
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* On-screen overlays removed for uncluttered display */}
      </div>

      {/* 2. LIVE WEATHER INTEGRITY INDICATOR & META CARD */}
      <div className="p-4 flex flex-col bg-[#0b1317] text-slate-100 border-t border-slate-900 select-none">
        
        {/* Title, climate & temperature layout */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-extrabold text-[15px] text-slate-100 group-hover:text-[#00A767] transition-all tracking-wide font-sans">
              {camera.name}
            </h3>
          </div>

          {/* Climate card widgets */}
          {weather && (
            <div className="flex items-center space-x-2 text-right bg-slate-950/40 px-2.5 py-1.5 rounded-lg border border-slate-800/40 min-w-[110px] justify-end shrink-0">
              <div className="text-right">
                <div className="flex items-center gap-1 justify-end font-mono text-xs font-bold text-white">
                  <span>{weather.temp}°C</span>
                  <Thermometer className="h-3 w-3 text-red-500" />
                </div>
                <p className="text-[8.5px] text-emerald-400 leading-tight mt-0.5 text-right font-medium max-w-[80px] overflow-hidden text-ellipsis">
                  {weather.condition}
                </p>
              </div>
              {getWeatherIcon(weather.condition)}
            </div>
          )}
        </div>

        {/* Complete autodiscovery details row under stream card */}
        <p className="text-[11.5px] text-slate-300 mt-3 font-sans leading-relaxed">
          {camera.description || `Câmera SNRD localizada em rede interna no IP ${camera.onvifIp || "10.65.0.1"}. Autodescoberta ONVIF executada com perfil S/T/G ativo.`}
        </p>

        {/* Dynamic footer status ribbon */}
        <div className="mt-4 pt-3.5 border-t border-slate-900/60 flex items-center justify-between font-mono text-[10px] text-slate-400">
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            ONVIF PTZ ATIVO
          </div>
          <span className="text-slate-500">
            IP: {camera.onvifIp || "10.65.0.1"}
          </span>
        </div>

        {/* Admin and action control buttons panel matching the card design */}
        {isAdmin && (onEditClick || onDeleteClick) && (
          <div className="mt-4 pt-3.5 border-t border-slate-900 flex items-center justify-start space-x-2 border-b border-transparent pb-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onEditClick) onEditClick(camera);
              }}
              className="bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-250 text-[11px] font-bold py-1.5 px-3.5 rounded transition-all cursor-pointer"
            >
              Editar Configurações
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onDeleteClick) onDeleteClick(camera);
              }}
              className="bg-red-950/20 hover:bg-red-950 border border-red-900/30 text-red-400 text-[11px] font-bold py-1.5 px-3.5 rounded transition-all cursor-pointer"
            >
              Excluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
