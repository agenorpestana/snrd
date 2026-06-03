import React from "react";
import { Cctv, LogOut, Tv, Settings, Database, FolderGit, LayoutGrid, Cpu } from "lucide-react";

interface HeaderProps {
  isAdmin: boolean;
  onLoginClick: () => void;
  onLogoutClick: () => void;
  viewMode: "grid" | "theater";
  setViewMode: (mode: "grid" | "theater") => void;
  activeCameraCount: number;
  activeView: "live" | "admin" | "recordings";
  setActiveView: (view: "live" | "admin" | "recordings") => void;
}

export default function Header({
  isAdmin,
  onLoginClick,
  onLogoutClick,
  viewMode,
  setViewMode,
  activeCameraCount,
  activeView,
  setActiveView,
}: HeaderProps) {
  return (
    <header className="bg-[#060D13] text-white shadow-2xl select-none border-b border-slate-900/40">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-18 flex items-center justify-between">
        {/* Left Brand and Status - Matching "Unity DVR" branding style and colors */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveView("live")}>
          <div className="p-2.5 bg-[#00A767] text-black rounded-lg flex items-center justify-center shadow-lg shadow-[#00A767]/20 transition-all hover:scale-105">
            <Cctv className="h-5.5 w-5.5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold tracking-wide text-base font-sans">Unity DVR</span>
            </div>
            <p className="text-[8.5px] text-[#00A767] font-bold tracking-widest uppercase">
              SURVEILLANCE SYSTEM
            </p>
          </div>
        </div>

        {/* Center Navigation Pill - Identical to the sent screenshot */}
        <div className="bg-[#0E1520] border border-slate-800/80 p-1 flex items-center space-x-1 rounded-full">
          <button
            onClick={() => setActiveView("live")}
            className={`flex items-center space-x-1.5 px-4.5 py-1.5 text-xs font-bold rounded-full transition-all duration-300 ${
              activeView === "live"
                ? "bg-[#00A767] text-black shadow-md border border-[#009055]/30 font-extrabold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Tv className="h-3.5 w-3.5" />
            <span>Monitoramento</span>
          </button>
          
          <button
            onClick={() => setActiveView("recordings")}
            className={`flex items-center space-x-1.5 px-4.5 py-1.5 text-xs font-bold rounded-full transition-all duration-300 ${
              activeView === "recordings"
                ? "bg-[#00A767] text-black shadow-md border border-[#009055]/30 font-extrabold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            <span>Gravações</span>
          </button>

          <button
            onClick={() => {
              if (isAdmin) {
                setActiveView("admin");
              } else {
                onLoginClick();
              }
            }}
            className={`flex items-center space-x-1.5 px-4.5 py-1.5 text-xs font-bold rounded-full transition-all duration-300 ${
              activeView === "admin"
                ? "bg-[#00A767] text-black shadow-md border border-[#009055]/30 font-extrabold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Configurações</span>
          </button>
        </div>

        {/* Right Section Profile Info - Display SuperAdmin or public status */}
        <div className="flex items-center space-x-3">
          {isAdmin ? (
            <div className="flex items-center">
              <div className="text-right">
                <p className="text-[12px] text-white font-bold leading-normal font-sans">
                  suporte@unityautomacoes.com.br
                </p>
                <p className="text-[9px] text-[#00A767] font-extrabold tracking-widest uppercase text-right leading-none mt-0.5">
                  SUPERADMIN
                </p>
              </div>
              <button
                id="header-logout-power"
                onClick={onLogoutClick}
                className="p-2 ml-3 bg-slate-900/60 border border-slate-800 hover:bg-red-950/40 hover:border-red-900/40 hover:text-red-400 text-slate-400 rounded-lg transition-all cursor-pointer shadow-sm"
                title="Sair do DVR"
              >
                <LogOut className="h-4.5 w-4.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center">
              <div className="text-right md:block hidden">
                <p className="text-[11.5px] text-slate-300 font-semibold font-sans">
                  visitante@unity.com.br
                </p>
                <p className="text-[9px] text-slate-500 font-extrabold tracking-widest uppercase text-right mt-0.5">
                  VISUALIZAÇÃO PÚBLICA
                </p>
              </div>
              <button
                onClick={onLoginClick}
                className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs px-3.5 py-1.5 rounded-lg transition-all shadow font-bold ml-2.5 cursor-pointer"
              >
                Acesso Restrito
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
