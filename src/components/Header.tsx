import React from "react";
import { Cctv, LogIn, LogOut, LayoutGrid, Tv, Shield, ShieldAlert, Cpu } from "lucide-react";

interface HeaderProps {
  isAdmin: boolean;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  viewMode: "grid" | "theater";
  setViewMode: (mode: "grid" | "theater") => void;
  activeCameraCount: number;
}

export default function Header({
  isAdmin,
  onLoginClick,
  onLogoutClick,
  viewMode,
  setViewMode,
  activeCameraCount,
}: HeaderProps) {
  return (
    <header className="bg-[#00A767] text-white shadow-md select-none border-b border-[#009055]">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
        {/* Left Brand and Status */}
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-white/10 rounded-lg flex items-center justify-center animate-pulse">
            <Cctv className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold tracking-tight text-lg font-sans">SNRD</span>
            </div>
            <p className="text-[10px] text-emerald-100 font-mono flex items-center gap-1">
              <Cpu className="h-2.5 w-2.5" />
              SISTEMA V2.4 • {activeCameraCount} DISPOSITIVOS ATIVOS
            </p>
          </div>
        </div>

        {/* Center Title Accent */}
        <div className="hidden md:flex items-center space-x-2 bg-emerald-800/40 px-4 py-1.5 rounded-full border border-emerald-500/20">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></div>
          <span className="text-xs font-medium tracking-wide">CENTRAL DE MONITORAMENTO SNRD</span>
        </div>

        {/* Right Controls */}
        <div className="flex items-center space-x-3">
          {/* View Mode Toggle Controls */}
          <div className="bg-emerald-800/50 p-1 rounded-lg flex items-center space-x-1 border border-emerald-700/30">
            <button
              id="view-grid-btn"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded ${
                viewMode === "grid"
                  ? "bg-[#00A767] text-white shadow-sm"
                  : "text-emerald-100 hover:text-white hover:bg-emerald-700/40"
              } transition-all`}
              title="Visualização em Grade"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              id="view-theater-btn"
              onClick={() => setViewMode("theater")}
              className={`p-1.5 rounded ${
                viewMode === "theater"
                  ? "bg-[#00A767] text-white shadow-sm"
                  : "text-emerald-100 hover:text-white hover:bg-emerald-700/40"
              } transition-all`}
              title="Visualização em Destaque"
            >
              <Tv className="h-4 w-4" />
            </button>
          </div>

          {/* Admin Indicator Pin & Action button */}
          <div className="flex items-center space-x-2">
            {isAdmin ? (
              <>
                <div className="hidden lg:flex items-center space-x-1.5 bg-white/10 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/20">
                  <Shield className="h-3.5 w-3.5 text-emerald-200" />
                  <span className="text-emerald-150">Administrador</span>
                </div>
                <button
                  id="admin-logout-btn"
                  onClick={onLogoutClick}
                  className="bg-red-600/90 hover:bg-red-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Sair do Painel</span>
                </button>
              </>
            ) : (
              <>
                <div className="hidden lg:flex items-center space-x-1.5 bg-emerald-950/20 px-3 py-1.5 rounded-lg text-xs text-emerald-100 border border-emerald-500/20">
                  <ShieldAlert className="h-3.5 w-3.5 text-emerald-200" />
                  <span>Modo Público de Observação</span>
                </div>
                <button
                  id="admin-login-btn"
                  onClick={onLoginClick}
                  className="bg-white hover:bg-emerald-50 text-[#00A767] font-semibold text-xs px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 shadow"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Painel Admin</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
