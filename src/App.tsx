import React, { useState, useEffect } from "react";
import Header from "./components/Header";
import CameraPlayer from "./components/CameraPlayer";
import PtzControl from "./components/PtzControl";
import AdminPanel from "./components/AdminPanel";
import { Camera } from "./types";
import { ShieldCheck, Video, LayoutGrid, Tv, Database, Radio, Sparkles, Server, RefreshCw } from "lucide-react";

export default function App(): React.JSX.Element {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "theater">("grid");
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<"live" | "admin">("live");

  // Load cameras and admin session persistence on mount
  useEffect(() => {
    const fetchInit = async () => {
      try {
        const res = await fetch("/api/cameras");
        if (res.ok) {
          const data = await res.json();
          setCameras(data);
          
          // Pre-select the runway camera (VIPW Intelbras) if available
          if (data.length > 0) {
            setSelectedId(data[0].id);
          }
        }
      } catch (err) {
        console.error("Falha ao recuperar base de câmeras:", err);
      } finally {
        setLoading(false);
      }
    };

    // Load admin token from local state
    const token = localStorage.getItem("rtsp_admin_token");
    if (token === "admin-token-session") {
      setIsAdmin(true);
    }

    fetchInit();
  }, []);

  const handleAdminLogin = (token: string) => {
    localStorage.setItem("rtsp_admin_token", token);
    setIsAdmin(true);
  };

  const handleAdminLogout = () => {
    localStorage.removeItem("rtsp_admin_token");
    setIsAdmin(false);
  };

  // Callback to insert newly created camera
  const handleAddCamera = (newCam: Camera) => {
    setCameras((prev) => [...prev, newCam]);
    setSelectedId(newCam.id);
  };

  // Callback to update existing camera parameters (e.g. PTZ updates or edit changes)
  const handleUpdateCamera = (updatedCam: Camera) => {
    setCameras((prev) => prev.map((c) => (c.id === updatedCam.id ? updatedCam : c)));
  };

  // Callback to remove deleted camera from state
  const handleDeleteCamera = (id: string) => {
    setCameras((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) {
      setSelectedId(cameras.length > 1 ? cameras[0].id : null);
    }
  };

  // Dynamic find for active centered camera
  const selectedCamera = cameras.find((c) => c.id === selectedId) || null;

  return (
    <div className="min-h-screen bg-[#070d0f] text-slate-100 flex flex-col font-sans selection:bg-[#00A767] selection:text-white">
      {/* 1. HEADER COMPONENT */}
      <Header
        isAdmin={isAdmin}
        onLoginClick={() => {
          setActiveView("admin");
        }}
        onLogoutClick={() => {
          handleAdminLogout();
          setActiveView("live");
        }}
        viewMode={viewMode}
        setViewMode={setViewMode}
        activeCameraCount={cameras.length}
      />

      {/* 2. MAIN HUB LAYOUT */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 md:px-6 py-6 space-y-6">
        
        {activeView === "live" ? (
          /* PUBLIC WATCH BOARD */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* LEFT SECTION (GRID OR THEATER STREAM VIEW) */}
            <div className="col-span-1 lg:col-span-2 space-y-5">
              
              {/* Sector Title indicator */}
              <div className="flex items-center justify-between bg-[#101c1f]/50 px-4 py-2.5 rounded-lg border border-slate-800 backdrop-blur-sm select-none">
                <div className="flex items-center space-x-2">
                  <Radio className="h-4 w-4 text-[#00A767] animate-pulse" />
                  <span className="text-xs uppercase tracking-widest font-bold text-slate-300">
                    {viewMode === "grid" ? "Grade Geral de Monitoramento" : "Foco em Câmera Única"}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-500">
                  LAYOUT: {viewMode.toUpperCase()} | FPS: 30 FIXED
                </div>
              </div>

              {loading ? (
                <div className="h-[400px] bg-slate-950/40 rounded-xl border border-slate-900 flex flex-col items-center justify-center space-y-3">
                  <RefreshCw className="h-8 w-8 animate-spin text-[#00A767]" />
                  <span className="text-sm font-mono text-slate-400">Restaurando feeds RTSP centrais...</span>
                </div>
              ) : cameras.length === 0 ? (
                <div className="h-[400px] bg-slate-950/40 rounded-xl border border-dashed border-slate-800 flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <Video className="h-12 w-12 text-slate-700 stroke-1" />
                  <div>
                    <h3 className="font-bold text-slate-350">Nenhuma Câmera Conectada</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-md">
                      O banco de dados se encontra vazio ou desconectado. Solicite a um administrador para configurar ou escanear via ONVIF IPs internos.
                    </p>
                  </div>
                </div>
              ) : viewMode === "grid" ? (
                /* GRID LAYOUT: Displays all streams concurrently */
                <div id="cameras-grid-view" className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {cameras.map((cam) => (
                    <CameraPlayer
                      key={cam.id}
                      camera={cam}
                      isSelected={selectedId === cam.id}
                      onSelect={() => setSelectedId(cam.id)}
                      isAdmin={isAdmin}
                      onEditClick={(c) => {
                        // Switch active view to admin edit
                        setActiveView("admin");
                      }}
                      onDeleteClick={(c) => handleDeleteCamera(c.id)}
                    />
                  ))}
                </div>
              ) : (
                /* THEATER LAYOUT: Focuses completely on a single chosen stream */
                <div id="cameras-theater-view" className="space-y-4">
                  {selectedCamera ? (
                    <div className="space-y-4">
                      <CameraPlayer
                        camera={selectedCamera}
                        isSelected={true}
                        onSelect={() => {}}
                        isAdmin={isAdmin}
                        onDeleteClick={(c) => handleDeleteCamera(c.id)}
                      />
                      
                      {/* Horizontal secondary carousel to toggle theater target */}
                      <div className="bg-[#101c1f]/40 p-3 rounded-lg border border-slate-800/80">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Comutar Visualização:</p>
                        <div className="flex space-x-3 overflow-x-auto pb-1">
                          {cameras.map((c) => (
                            <button
                              id={`carousel-toggle-${c.id}`}
                              key={c.id}
                              onClick={() => setSelectedId(c.id)}
                              className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                                selectedId === c.id
                                  ? "bg-[#00A767] border-[#009055] text-white"
                                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-xs text-slate-500 font-mono">Erro ao encontrar enquadramento.</p>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT SECTION: PTZ DIRECTIONS & CONSOLE TELEMETRY */}
            <div className="space-y-6">
              <PtzControl
                selectedCamera={selectedCamera}
                onPtzChange={handleUpdateCamera}
              />
            </div>
          </div>
        ) : (
          /* SEPARATE SECURE ADMIN SYSTEM */
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between bg-[#101c1f]/50 px-4 py-3 rounded-xl border border-slate-800 backdrop-blur-sm">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-4 w-4 text-[#00A767]" />
                <span className="text-xs uppercase tracking-widest font-bold text-slate-300">
                  Gerenciamento Privado / Autenticação Requerida
                </span>
              </div>
              <button
                onClick={() => setActiveView("live")}
                className="bg-slate-900 hover:bg-slate-850 text-slate-350 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 text-xs transition-all flex items-center gap-1.5 cursor-pointer font-semibold"
              >
                ← Voltar ao Monitoramento
              </button>
            </div>

            <AdminPanel
              isAdmin={isAdmin}
              onLogin={handleAdminLogin}
              onLogout={() => {
                handleAdminLogout();
                setActiveView("live");
              }}
              cameras={cameras}
              onAddCamera={handleAddCamera}
              onUpdateCamera={handleUpdateCamera}
              onDeleteCamera={handleDeleteCamera}
            />
          </div>
        )}
      </main>

      {/* 4. FOOTER */}
      <footer className="bg-[#0b1315] border-t border-slate-900 text-slate-500 text-xs py-8 select-none">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="font-mono text-[10px] leading-relaxed text-center md:text-left">
            <p className="text-slate-450 uppercase font-semibold">Copyright © 2026 SNRD - Todos os direitos reservados.</p>
            <p className="mt-0.5">Versão WEB V3.2.1.1865099 | ONVIF Perfil S, T e G | Sistema V2.4</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5 bg-[#101c1f] px-3 py-1 rounded-full border border-slate-800 text-[10px] font-mono text-slate-400">
              <Server className="h-3 w-3 text-emerald-400" />
              <span>CONTAINER CLOUD LOCAL: IP 127.0.0.1</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-[#101c1f] px-3 py-1 rounded-full border border-slate-800 text-[10px] font-mono text-slate-400">
              <ShieldCheck className="h-3 w-3 text-[#00A767]" />
              <span>CRIPTOGRAFIA SHA-256</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
