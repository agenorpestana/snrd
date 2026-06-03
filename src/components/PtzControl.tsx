import React, { useState } from "react";
import { Camera } from "../types";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Compass, ShieldCheck, Terminal, HelpCircle } from "lucide-react";

interface PtzControlProps {
  selectedCamera: Camera | null;
  onPtzChange: (updatedCamera: Camera) => void;
}

export default function PtzControl({ selectedCamera, onPtzChange }: PtzControlProps) {
  const [speed, setSpeed] = useState<number>(5);
  const [presetInput, setPresetInput] = useState<number>(1);
  const [isSending, setIsSending] = useState(false);
  const [logs, setLogs] = useState<string[]>([
    "CONEXÃO ESTABELECIDA COM SUCESSO COLETOR ONVIF PERFIL S/T/G.",
    "Aguardando interações do usuário..."
  ]);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 8)]);
  };

  const executePtz = async (action: string, overridePreset?: number) => {
    if (!selectedCamera) return;
    if (!selectedCamera.isPtzCompatible) {
      addLog("ERRO: Esta câmera não oferece suporte a controle PTZ.");
      return;
    }

    setIsSending(true);
    const body: any = { action, speed };
    if (overridePreset !== undefined) {
      body.preset = overridePreset;
    }

    // Generate SOAP XML mock representation to render on logs terminal!
    const xmlMockTemplate = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <soap:Header>
    <wsse:Security soap:mustUnderstand="true">
      <wsse:UsernameToken>
        <wsse:Username>${selectedCamera.onvifUser || "admin"}</wsse:Username>
        <wsse:Password Type="...PasswordDigest">ONVIFDigestTokenHash==</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soap:Header>
  <soap:Body>
    ${action.startsWith("zoom") 
      ? `<tptz:ContinuousMove><tptz:ProfileToken>Profile_1</tptz:ProfileToken><tptz:Velocity><tt:Zoom x="${action === "zoom_in" ? "0.2" : "-0.2"}"/></tptz:Velocity></tptz:ContinuousMove>`
      : action === "preset"
      ? `<tptz:GotoPreset><tptz:ProfileToken>Profile_1</tptz:ProfileToken><tptz:PresetToken>${overridePreset}</tptz:PresetToken><tptz:Speed><tt:PanTilt x="0.8" y="0.8"/></tptz:Speed></tptz:GotoPreset>`
      : `<tptz:ContinuousMove><tptz:ProfileToken>Profile_1</tptz:ProfileToken><tptz:Velocity><tt:PanTilt x="${action === "right" ? "0.4" : action === "left" ? "-0.4" : "0"}" y="${action === "up" ? "0.4" : action === "down" ? "-0.4" : "0"}"/></tptz:Velocity></tptz:ContinuousMove>`
    }
  </soap:Body>
</soap:Envelope>`;

    addLog(`ONVIF SOAP DISPATCH: action=${action.toUpperCase()}`);
    
    try {
      const res = await fetch(`/api/cameras/${selectedCamera.id}/ptz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao executar comando PTZ.");
      }

      const data = await res.json();
      onPtzChange(data.ptzStatus ? { ...selectedCamera, ptzStatus: data.ptzStatus } : selectedCamera);
      
      addLog(`HTTP 200 OK — Resposta ONVIF recebida.`);
      addLog(`SOAP XML ENVIADO:\n${xmlMockTemplate.slice(0, 160)}...`);
      addLog(`PROFILER COORDINATES: P=${data.ptzStatus.pan}°, T=${data.ptzStatus.tilt}°, Z=${data.ptzStatus.zoom}x`);
    } catch (err: any) {
      console.error(err);
      addLog(`FALHA NO DISPACHO SOAP: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div id="ptz-control-panel" className="bg-[#1c2c31] text-slate-100 rounded-xl p-4 shadow-lg border border-slate-800 text-sm select-none">
      {/* 1. Header */}
      <h3 className="text-xs uppercase font-bold tracking-widest text-[#00A767] border-b border-slate-800 pb-2 mb-4 flex items-center gap-1.5 justify-between">
        <span className="flex items-center gap-1.5">
          <Compass className="h-4 w-4 animate-spin text-[#00A767]" style={{ animationDuration: '6s' }} />
          Controle Pan e Tilt
        </span>
        <span className="text-[9px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-slate-400 font-mono">
          ONVIF S/T/G
        </span>
      </h3>

      {!selectedCamera ? (
        <div className="py-12 text-center text-slate-500 font-mono text-xs flex flex-col items-center">
          <Compass className="h-10 w-10 text-slate-600 mb-3 stroke-1 animate-pulse" />
          Selecione uma câmera para habilitar o controle PTZ / ONVIF
        </div>
      ) : (
        <div className="space-y-5">
          {/* Information badge indicating current camera */}
          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60 flex items-center justify-between text-xs font-mono">
            <div>
              <p className="text-slate-400">Câmera Ativa:</p>
              <p className="text-[#00A767] font-semibold truncate max-w-[160px]">{selectedCamera.name}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400">Compatível:</p>
              <p className={selectedCamera.isPtzCompatible ? "text-emerald-400" : "text-amber-500"}>
                {selectedCamera.isPtzCompatible ? "Sim (Habilitado)" : "Não"}
              </p>
            </div>
          </div>

          {selectedCamera.isPtzCompatible ? (
            <>
              {/* JOYSTICK CONTROLLER */}
              <div className="flex flex-col items-center justify-center py-2">
                <div className="relative w-40 h-40 bg-slate-950 rounded-full border-4 border-slate-800/80 shadow-inner flex items-center justify-center p-3">
                  
                  {/* Center circle */}
                  <div className="absolute w-16 h-16 bg-slate-900 border-2 border-slate-800 rounded-full flex items-center justify-center z-10">
                    <button
                      id="ptz-zoom-rst"
                      onClick={() => executePtz("zoom_reset")}
                      disabled={isSending}
                      className="text-[9px] font-bold font-mono py-1 px-1.5 rounded text-white bg-[#00A767] hover:bg-[#009055] transition-colors focus:ring-1 focus:ring-emerald-400 cursor-pointer text-center"
                      title="Resetar Enquadramento"
                    >
                      RESET
                    </button>
                  </div>

                  {/* Up button */}
                  <button
                    id="ptz-up-btn"
                    onClick={() => executePtz("up")}
                    disabled={isSending}
                    className="absolute top-2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all cursor-pointer border border-[#ffffff04]"
                    title="Olhar Para Cima (Tilt Up)"
                  >
                    <ChevronUp className="h-6 w-6" />
                  </button>

                  {/* Down button */}
                  <button
                    id="ptz-down-btn"
                    disabled={isSending}
                    onClick={() => executePtz("down")}
                    className="absolute bottom-2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all cursor-pointer border border-[#ffffff04]"
                    title="Olhar Para Baixo (Tilt Down)"
                  >
                    <ChevronDown className="h-6 w-6" />
                  </button>

                  {/* Left button */}
                  <button
                    id="ptz-left-btn"
                    disabled={isSending}
                    onClick={() => executePtz("left")}
                    className="absolute left-2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all cursor-pointer border border-[#ffffff04]"
                    title="Girar Esquerda (Pan Left)"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>

                  {/* Right button */}
                  <button
                    id="ptz-right-btn"
                    disabled={isSending}
                    onClick={() => executePtz("right")}
                    className="absolute right-2 w-10 h-10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-all cursor-pointer border border-[#ffffff04]"
                    title="Girar Direita (Pan Right)"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {/* ZOOM CONTROLS */}
              <div className="grid grid-cols-2 gap-3 pb-1">
                <button
                  id="ptz-zoom-in"
                  disabled={isSending}
                  onClick={() => executePtz("zoom_in")}
                  className="bg-slate-950 border border-slate-800 hover:border-slate-700 py-2.5 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition-all text-xs font-semibold cursor-pointer"
                >
                  <ZoomIn className="h-4 w-4 text-[#00A767]" />
                  <span>Zoom In (+)</span>
                </button>
                <button
                  id="ptz-zoom-out"
                  disabled={isSending}
                  onClick={() => executePtz("zoom_out")}
                  className="bg-slate-950 border border-slate-800 hover:border-slate-700 py-2.5 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition-all text-xs font-semibold cursor-pointer"
                >
                  <ZoomOut className="h-4 w-4 text-[#00A767]" />
                  <span>Zoom Out (-)</span>
                </button>
              </div>

              {/* SPEED BAR SELECTOR */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label htmlFor="ptz-speed-sel" className="font-medium text-slate-300">Velocidade(1-8):</label>
                  <span className="text-emerald-400 font-bold font-mono">Velocidade {speed}</span>
                </div>
                <select
                  id="ptz-speed-sel"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full bg-slate-950 text-slate-100 border border-slate-800 px-3 py-2 rounded-lg text-xs font-mono focus:outline-none focus:border-[#00A767]"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>
                      Velocidade {s} {s === 1 ? "(Lenta)" : s === 5 ? "(Padrão)" : s === 8 ? "(Máxima)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* PRESETS CONTROLLER SECTION */}
              <div className="space-y-2 border-t border-slate-800/60 pt-4">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="ptz-preset-input" className="font-medium text-slate-300">Preset Ativo:</label>
                  <span className="text-[10px] text-slate-500">Faixa: 1~300</span>
                </div>
                <div className="flex space-x-2">
                  <input
                    id="ptz-preset-input"
                    type="number"
                    min={1}
                    max={300}
                    value={presetInput}
                    onChange={(e) => setPresetInput(Math.max(1, Math.min(300, Number(e.target.value))))}
                    className="w-20 bg-slate-950 border border-slate-800 rounded-lg text-xs px-2.5 py-2 font-mono text-center text-slate-100 focus:outline-none focus:border-[#00A767]"
                  />
                  <button
                    id="ptz-preset-go"
                    disabled={isSending}
                    onClick={() => executePtz("preset", presetInput)}
                    className="flex-1 bg-slate-900 border border-slate-800 hover:bg-[#002f1d] hover:border-[#00A767]/50 text-emerald-400 text-xs font-bold py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    Ir Para
                  </button>
                </div>
              </div>

              {/* TELEMETRY LOGGER CONSOLE */}
              <div className="space-y-1.5 border-t border-slate-800/60 pt-4 flex flex-col">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1">
                    <Terminal className="h-3 w-3 text-[#00A767]" />
                    LOG DE COMANDOS ONVIF (SOAP XML)
                  </span>
                  {isSending && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>}
                </div>
                <div className="bg-slate-950 p-2 text-[10px] rounded-lg font-mono text-slate-400 border border-slate-900 overflow-y-auto max-h-[140px] space-y-1 leading-normal">
                  {logs.map((log, i) => (
                    <p key={i} className={`whitespace-pre-wrap border-b border-slate-900 pb-1 ${
                      log.includes("ERRO") 
                        ? "text-red-400" 
                        : log.includes("HTTP 200") 
                        ? "text-emerald-400 font-semibold" 
                        : "text-slate-400"
                    }`}>
                      {log}
                    </p>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-amber-950/20 border border-amber-800/30 p-4 rounded-xl text-xs text-amber-300 leading-relaxed space-y-2 flex flex-col">
              <div className="flex items-center gap-1.5 font-bold">
                <HelpCircle className="h-4 w-4 shrink-0 text-amber-400" />
                CONTROLE PTZ DESABILITADO
              </div>
              <p>
                Esta câmera está configurada em modo Estático pelo ONVIF ou não é compatível com rotação Pan-Tilt-Zoom.
              </p>
              <p className="font-mono text-[10px] text-amber-500 bg-slate-950/30 p-1.5 rounded">
                Dica: Selecione a câmera "VIPW Intelbras" de Joinville no painel acima para testar todos os recursos de movimentação com renderização responsiva em tempo real.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
