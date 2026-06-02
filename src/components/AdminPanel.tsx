import React, { useState } from "react";
import { Camera, ONVIFDevice } from "../types";
import { Shield, Key, Eye, EyeOff, Plus, Edit3, Trash2, Database, HelpCircle, AlertCircle, RefreshCw, Cpu, Link, Zap, HelpCircle as Help, Users } from "lucide-react";

interface AdminPanelProps {
  isAdmin: boolean;
  onLogin: (token: string) => void;
  onLogout: () => void;
  cameras: Camera[];
  onAddCamera: (camera: Camera) => void;
  onUpdateCamera: (camera: Camera) => void;
  onDeleteCamera: (id: string) => void;
}

export default function AdminPanel({
  isAdmin,
  onLogin,
  onLogout,
  cameras,
  onAddCamera,
  onUpdateCamera,
  onDeleteCamera,
}: AdminPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Form states
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [city, setCity] = useState("Joinville");
  const [description, setDescription] = useState("");
  const [isPtzCompatible, setIsPtzCompatible] = useState(true);
  
  // ONVIF Scanner wizard states
  const [onvifIp, setOnvifIp] = useState("");
  const [onvifPort, setOnvifPort] = useState(80);
  const [onvifUser, setOnvifUser] = useState("admin");
  const [onvifPass, setOnvifPass] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanSteps, setScanSteps] = useState<string[]>([]);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [scanError, setScanError] = useState("");

  // Users listing & management states
  const [users, setUsers] = useState<any[]>([]);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPass, setNewUserPass] = useState("");
  const [newUserRole, setNewUserRole] = useState("admin");
  const [userCreatedMsg, setUserCreatedMsg] = useState("");
  const [userErrorMsg, setUserErrorMsg] = useState("");

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("rtsp_admin_token") || "admin-token-session";
      const res = await fetch("/api/users", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Erro ao carregar usuários:", err);
    }
  };

  React.useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "E-mail ou senha incorretos.");
      }

      onLogin(data.token);
      setPassword("");
      setEmail("");
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserCreatedMsg("");
    setUserErrorMsg("");

    if (!newUserEmail || !newUserPass) {
      setUserErrorMsg("E-mail e senha são obrigatórios.");
      return;
    }

    try {
      const token = localStorage.getItem("rtsp_admin_token") || "admin-token-session";
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPass,
          role: newUserRole
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao cadastrar usuário.");
      }

      setUserCreatedMsg(`Usuário ${data.email} cadastrado com sucesso!`);
      setNewUserEmail("");
      setNewUserPass("");
      fetchUsers();
    } catch (err: any) {
      setUserErrorMsg(err.message);
    }
  };

  const handleDeleteUser = async (id: string, userEmail: string) => {
    const confirmDelete = window.confirm(`Deseja realmente remover o usuário "${userEmail}"?`);
    if (!confirmDelete) return;

    try {
      const token = localStorage.getItem("rtsp_admin_token") || "admin-token-session";
      const res = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao remover usuário.");
      }

      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Run dynamic ONVIF scan animation and auto-fill form details!
  const runOnvifScanner = async () => {
    if (!onvifIp) {
      setScanError("Digite o IP do dispositivo.");
      setScanStatus("error");
      return;
    }

    setScanError("");
    setScanning(true);
    setScanStatus("scanning");
    setScanSteps([]);

    const addStep = (msg: string, delay: number) => {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          setScanSteps((prev) => [...prev, `[SINC] ${msg}`]);
          resolve();
        }, delay);
      });
    };

    try {
      await addStep(`Iniciando conexão multicast WS-Discovery ONVIF...`, 200);
      await addStep(`Requisitando handshake de segurança em http://${onvifIp}:${onvifPort}/onvif/device_service...`, 400);
      await addStep(`Enviando token WS-Security Token Digest para o usuário "${onvifUser}"...`, 300);
      
      const res = await fetch("/api/onvif/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ip: onvifIp,
          port: onvifPort,
          username: onvifUser,
          password: onvifPass
        })
      });

      if (!res.ok) {
        throw new Error("Falha ao comunicar com o agente ONVIF.");
      }

      const device = await res.json();
      
      await addStep(`Resposta HTTP 200 OK — ONVIF Perfil S/T/G detectado.`, 300);
      await addStep(`Fabricante: ${device.manufacturer} | Modelo: ${device.model}`, 200);
      await addStep(`Serial: ${device.serialNumber} | Firmware: ${device.firmware}`, 200);
      await addStep(`Stream Principal localizado: rtsp://***:***@${device.ip}:554/cam/...`, 300);

      // Autofill fields
      setName(`${device.manufacturer} ${device.model} (${device.ip})`);
      setStreamUrl(device.rtspUrl);
      setDescription(device.description);
      setIsPtzCompatible(device.supportedFeatures.ptz);
      if (onvifIp.includes("108")) {
        setCity("Joinville");
      }

      setScanStatus("success");
    } catch (err: any) {
      setScanError(err.message || "FALHA: Tempo de conexão esgotado. Dispositivo inacessível.");
      setScanStatus("error");
    } finally {
      setScanning(false);
    }
  };

  const handleCameraSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !streamUrl || !city) {
      alert("Nome, link de stream e cidade de monitoramento são obrigatórios.");
      return;
    }

    const payload = {
      name,
      streamUrl,
      city,
      description,
      isPtzCompatible,
      onvifIp: onvifIp || undefined,
      onvifPort: onvifPort || undefined,
      onvifUser: onvifUser || undefined,
    };

    setIsLoading(true);
    try {
      const url = isEditing && editId ? `/api/cameras/${editId}` : "/api/cameras";
      const method = isEditing ? "PUT" : "POST";
      const token = localStorage.getItem("rtsp_admin_token") || "admin-token-session";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erro ao salvar câmera.");
      }

      const savedCamera = await res.json();
      if (isEditing) {
        onUpdateCamera(savedCamera);
      } else {
        onAddCamera(savedCamera);
      }

      // Reset Form states
      resetForm();
    } catch (err: any) {
      alert(`Erro: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditId(null);
    setName("");
    setStreamUrl("");
    setDescription("");
    setIsPtzCompatible(true);
    setOnvifIp("");
    setOnvifPort(80);
    setOnvifUser("admin");
    setOnvifPass("");
    setScanStatus("idle");
    setScanSteps([]);
  };

  const startEdit = (cam: Camera) => {
    setIsEditing(true);
    setEditId(cam.id);
    setName(cam.name);
    setStreamUrl(cam.streamUrl);
    setCity(cam.city);
    setDescription(cam.description);
    setIsPtzCompatible(cam.isPtzCompatible);
    setOnvifIp(cam.onvifIp || "");
    setOnvifPort(cam.onvifPort || 80);
    setOnvifUser(cam.onvifUser || "admin");
    setOnvifPass("");
    setScanStatus("idle");
    setScanSteps([]);
    // Smooth scroll to target form container
    const element = document.getElementById("admin-editor-title");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmDelete = window.confirm(`Deseja realmente excluir irreversiblemente a câmera "${name}"?`);
    if (!confirmDelete) return;

    try {
      const token = localStorage.getItem("rtsp_admin_token") || "admin-token-session";
      const res = await fetch(`/api/cameras/${id}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error("Fracasso ao remover câmera no servidor.");
      }

      onDeleteCamera(id);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div id="admin-main-section" className="bg-[#101c1f] text-slate-100 rounded-xl border border-slate-800 shadow-xl overflow-hidden">
      {/* Dynamic Header */}
      <div className="bg-[#002f1d] border-b border-slate-800 px-6 py-4 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2.5">
          <Shield className="h-5 w-5 text-[#00A767]" />
          <div>
            <h2 className="text-sm uppercase font-bold tracking-widest text-[#00A767]">
              Painel Administrativo SNRD
            </h2>
            <p className="text-[10px] text-slate-400 font-mono">
              Gerenciamento Centralizado ONVIF Perfil S/T/G e RTSP
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            id="panel-logout-btn"
            onClick={onLogout}
            className="text-xs text-red-400 hover:text-red-300 font-medium font-mono hover:underline"
          >
            DESCONECTAR INTERFACE(X)
          </button>
        )}
      </div>

      {/* RENDER LOGIN IF NOT AUTHENTICATED */}
      {!isAdmin ? (
        <div className="p-8 max-w-md mx-auto">
          <form id="admin-login-form" onSubmit={handleLoginSubmit} className="space-y-5">
            <div className="text-center space-y-2">
              <Key className="h-10 w-10 text-[#00A767] mx-auto opacity-80" />
              <h3 className="font-semibold text-lg">Acesso Protegido</h3>
              <p className="text-xs text-slate-400">
                Identifique-se com suas credenciais do console administrativo para configurar seus dispositivos e usuários.
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="admin-email-field" className="text-xs text-slate-300 font-medium">E-mail de Usuário:</label>
              <input
                id="admin-email-field"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="suporte@unityautomacoes.com.br"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#00A767]"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="admin-pass-field" className="text-xs text-slate-300 font-medium">Chave de Acesso / Senha:</label>
              <input
                id="admin-pass-field"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Insira a senha do admin..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#00A767]"
              />
            </div>

            {loginError && (
              <div className="bg-red-950/40 border border-red-900/30 p-3 rounded-lg flex items-center space-x-2 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              id="admin-login-submit"
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#00A767] hover:bg-[#009055] text-white font-bold py-2.5 px-4 rounded-lg transform active:scale-95 transition-all text-xs cursor-pointer flex items-center justify-center space-x-1.5"
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <span>Validar Autenticação</span>
              )}
            </button>
          </form>
        </div>
      ) : (
        /* RENDER DEVICE MANAGEMENT BOARD */
        <div id="admin-active-board" className="p-6 space-y-8">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            
            {/* LEFT COLUMN: ONVIF CONNECT SCANNER & MANUAL REGISTERING FORM */}
            <div className="space-y-6">
              <h3 id="admin-editor-title" className="text-xs uppercase font-bold tracking-widest text-[#00A767] border-b border-slate-800 pb-2 flex items-center justify-between">
                <span>{isEditing ? "Editar Configurações da Câmera" : "Sincronização & Cadastro"}</span>
                {isEditing && (
                  <button
                    onClick={resetForm}
                    className="text-[10px] text-slate-400 hover:text-slate-200"
                  >
                    (Cancelar Edição)
                  </button>
                )}
              </h3>

              {/* SECTION: CONNECT & AUTO-CONFIG VIA ONVIF (PROTOCÓLO ONVIF) */}
              <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl space-y-4">
                <div className="flex items-center space-x-2">
                  <Database className="h-4 w-4 text-[#00A767]" />
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Assistente de Configuração ONVIF</h4>
                    <p className="text-[10px] text-slate-400">Insira as credenciais do dispositivo IP para autodescoberta de streams e PTZ</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <label htmlFor="onvif-ip-field" className="text-[11px] text-slate-400">Endereço de IP:</label>
                    <input
                      id="onvif-ip-field"
                      type="text"
                      value={onvifIp}
                      onChange={(e) => setOnvifIp(e.target.value)}
                      placeholder="Ex: 192.168.1.108"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 font-mono placeholder-slate-700 focus:outline-none focus:border-[#00A767]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="onvif-port-field" className="text-[11px] text-slate-400">Porta ONVIF (Http):</label>
                    <input
                      id="onvif-port-field"
                      type="number"
                      value={onvifPort}
                      onChange={(e) => setOnvifPort(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#00a767]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="onvif-user-field" className="text-[11px] text-slate-400">Usuário:</label>
                    <input
                      id="onvif-user-field"
                      type="text"
                      value={onvifUser}
                      onChange={(e) => setOnvifUser(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#00a767]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="onvif-pass-field" className="text-[11px] text-slate-400">Senha do Dispositivo:</label>
                    <input
                      id="onvif-pass-field"
                      type="password"
                      value={onvifPass}
                      onChange={(e) => setOnvifPass(e.target.value)}
                      placeholder="********"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 font-mono focus:outline-none focus:border-[#00a767]"
                    />
                  </div>
                </div>

                <button
                  id="onvif-scan-btn"
                  type="button"
                  onClick={runOnvifScanner}
                  disabled={scanning}
                  className="w-full bg-slate-900 hover:bg-[#002f1d] border border-slate-800 hover:border-[#00A767] text-[#00A767] text-xs font-bold py-2 px-3 rounded transition-all cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  {scanning ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  <span>Autodetectar Perfil ONVIF S/T/G</span>
                </button>

                {/* Live Connection log messages displayed under the scanning fields */}
                {scanStatus !== "idle" && (
                  <div className="bg-slate-950 p-2.5 rounded border border-slate-900 font-mono text-[9.5px] leading-relaxed space-y-1">
                    {scanSteps.map((step, idx) => (
                      <p key={idx} className="text-slate-300">{step}</p>
                    ))}
                    {scanStatus === "scanning" && (
                      <div className="text-[#00A767] flex items-center space-x-1 animate-pulse">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#00A767]"></span>
                        <span>Coletando XML SOAP Schema...</span>
                      </div>
                    )}
                    {scanStatus === "success" && (
                      <p className="text-emerald-400 font-bold">✓ AUTO-CONFIGURAÇÃO EFETUADA — Formulario carregado!</p>
                    )}
                    {scanStatus === "error" && (
                      <p className="text-red-400 font-bold">⚠️ FALHA NO ONVIF: {scanError}</p>
                    )}
                  </div>
                )}
              </div>

              {/* FORMULARIO DE INTEGRAÇÃO DE DISPOSITIVOS */}
              <form id="camera-register-form" onSubmit={handleCameraSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="cam-name-field" className="text-xs text-slate-300 font-medium">Nome Identificador da Câmera:</label>
                  <input
                    id="cam-name-field"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Runway VIPW Intelbras P9"
                    className="w-full bg-[#1c2c31] border border-slate-850 px-3 py-2 rounded-lg text-xs text-slate-150 focus:outline-none focus:border-[#00A767]"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="cam-stream-field" className="text-xs text-slate-300 font-medium">URL de Streaming (RTSP ou HLS HTTP):</label>
                  <input
                    id="cam-stream-field"
                    type="text"
                    required
                    value={streamUrl}
                    onChange={(e) => setStreamUrl(e.target.value)}
                    placeholder="rtsp://admin:admin123@192.168.1.108:554/live"
                    className="w-full bg-[#1c2c31] border border-slate-850 px-3 py-2 rounded-lg text-xs leading-normal text-slate-150 font-mono focus:outline-none focus:border-[#00A767]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <label htmlFor="cam-city-field" className="text-xs text-slate-300 font-medium">Cidade (Previsão do Tempo):</label>
                    <input
                      id="cam-city-field"
                      type="text"
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Ex: Joinville"
                      className="w-full bg-[#1c2c31] border border-slate-850 px-3 py-2 rounded-lg text-slate-150 focus:outline-none focus:border-[#00A767]"
                    />
                  </div>

                  <div className="flex items-center pt-5 pl-2">
                    <input
                      id="cam-ptz-field"
                      type="checkbox"
                      checked={isPtzCompatible}
                      onChange={(e) => setIsPtzCompatible(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-800 text-[#00A767] focus:ring-0 focus:ring-offset-0 ring-[#00A767] accent-[#00A767]"
                    />
                    <label htmlFor="cam-ptz-field" className="ml-2 text-xs text-slate-300 font-medium cursor-pointer">
                      Habilitar Controle PTZ
                    </label>
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="cam-desc-field" className="text-xs text-slate-300 font-medium">Descrição do Local Monitorado:</label>
                  <textarea
                    id="cam-desc-field"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Indique as orientações deste dispositivo, áreas críticas de monitoramento ou especificidades de perimetros de segurança..."
                    className="w-full bg-[#1c2c31] border border-slate-850 p-3 rounded-lg text-xs leading-relaxed text-slate-150 focus:outline-none focus:border-[#00A767]"
                  />
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    id="cam-submit-btn"
                    type="submit"
                    className="flex-1 bg-[#00A767] hover:bg-[#009055] text-white font-bold py-2 px-3 rounded-lg text-xs tracking-wide cursor-pointer transition-all active:scale-95 text-center flex items-center justify-center"
                    disabled={isLoading}
                  >
                    <span>{isEditing ? "Salvar Alterações" : "Adicionar Câmera Ativa"}</span>
                  </button>
                  {isEditing && (
                    <button
                      id="cam-cancel-btn"
                      type="button"
                      onClick={resetForm}
                      className="bg-slate-900 hover:bg-slate-800 px-4 py-2 border border-slate-850 text-xs text-slate-300 rounded-lg cursor-pointer"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* RIGHT COLUMN: ACTIVE MONITORED DEVICES LIST */}
            <div className="space-y-6">
              <h3 className="text-xs uppercase font-bold tracking-widest text-[#00A767] border-b border-slate-800 pb-2">
                Dispositivos Ativos ({cameras.length})
              </h3>

              <div id="admin-device-list" className="space-y-3.5 max-h-[580px] overflow-y-auto pr-1">
                {cameras.map((cam) => (
                  <div
                    key={cam.id}
                    className="bg-slate-950 p-4 rounded-xl border border-slate-850 hover:border-slate-800 transition-all flex items-start justify-between space-x-3"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
                        <h4 className="font-semibold text-xs text-white truncate max-w-[200px]">
                          {cam.name}
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-405 truncate font-mono text-slate-500 max-w-[230px]">
                        URL: {cam.streamUrl}
                      </p>
                      <div className="flex items-center space-x-3 text-[10px] text-slate-500 font-mono">
                        <span className="bg-slate-900 py-0.5 px-1.5 rounded">{cam.city}</span>
                        <span>PTZ: {cam.isPtzCompatible ? "S" : "N"}</span>
                        <span>MODEL: {cam.modelName || "Intelbras IP"}</span>
                      </div>
                    </div>

                    <div className="flex space-x-1 shrink-0">
                      <button
                        id={`edit-list-${cam.id}`}
                        onClick={() => startEdit(cam)}
                        className="p-1.5 hover:bg-slate-800 rounded text-[#00A767] transition-all cursor-pointer"
                        title="Editar Configurações"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        id={`delete-list-${cam.id}`}
                        onClick={() => handleDelete(cam.id, cam.name)}
                        className="p-1.5 hover:bg-slate-800 rounded text-red-400 transition-all cursor-pointer"
                        title="Excluir Câmera"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}

                {cameras.length === 0 && (
                  <div className="text-center py-12 text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-xl">
                    Nenhum dispositivo registrado. Adicione um através do formulário ao lado.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* USER MANAGEMENT SECTION */}
          <div className="pt-6 mt-8 border-t border-slate-800">
            <div className="flex items-center space-x-2.5 mb-6 text-[#00A767]">
              <Users className="h-5 w-5" />
              <h3 className="text-sm uppercase font-bold tracking-widest text-[#00A767]">
                Gerenciamento de Usuários do Sistema
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              {/* CREATE USER FORM */}
              <div className="bg-slate-950/45 p-5 rounded-xl border border-slate-800">
                <h4 className="text-xs uppercase font-bold tracking-wider text-slate-350 mb-4">
                  Cadastrar Novo Usuário
                </h4>

                <form onSubmit={handleCreateUser} className="space-y-4">
                  <div className="space-y-1">
                    <label htmlFor="new_usr_email" className="text-xs text-slate-300 font-medium">E-mail do Usuário:</label>
                    <input
                      id="new_usr_email"
                      type="email"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="usuario@unityautomacoes.com.br"
                      className="w-full bg-[#1c2c31] border border-slate-850 px-3 py-2 rounded-lg text-xs text-slate-150 focus:outline-none focus:border-[#00A767]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="new_usr_password" className="text-xs text-slate-300 font-medium font-sans">Senha de Acesso:</label>
                    <input
                      id="new_usr_password"
                      type="password"
                      required
                      value={newUserPass}
                      onChange={(e) => setNewUserPass(e.target.value)}
                      placeholder="Defina uma senha robusta..."
                      className="w-full bg-[#1c2c31] border border-slate-850 px-3 py-2 rounded-lg text-xs text-slate-150 focus:outline-none focus:border-[#00A767]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="new_usr_role" className="text-xs text-slate-300 font-medium">Privilégio:</label>
                    <select
                      id="new_usr_role"
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                      className="w-full bg-[#1c2c31] border border-slate-850 px-3 py-2 rounded-lg text-xs text-slate-150 focus:outline-none focus:border-[#00A767]"
                    >
                      <option value="admin">Administrador (Completo)</option>
                      <option value="viewer">Visualizador (Leitura)</option>
                    </select>
                  </div>

                  {userCreatedMsg && (
                    <p className="text-xs text-emerald-400 font-medium font-mono py-1">
                      ✓ {userCreatedMsg}
                    </p>
                  )}

                  {userErrorMsg && (
                    <p className="text-xs text-red-400 font-medium font-mono py-1">
                      ✗ {userErrorMsg}
                    </p>
                  )}

                  <button
                    id="save-user-btn"
                    type="submit"
                    className="w-full bg-[#00A767] hover:bg-[#009055] text-white font-bold py-2 px-3 rounded-lg text-xs tracking-wide cursor-pointer transition-all active:scale-95 text-center flex items-center justify-center space-x-1.5"
                  >
                    <span>Salvar Novo Usuário</span>
                  </button>
                </form>
              </div>

              {/* LIST USERS SECTOR */}
              <div className="space-y-4">
                <h4 className="text-xs uppercase font-bold tracking-wider text-slate-350 mb-4">
                  Usuários Ativos ({users.length})
                </h4>

                <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className="bg-slate-950 p-4 rounded-xl border border-slate-850 hover:border-slate-800 transition-all flex items-center justify-between"
                    >
                      <div className="space-y-1 min-w-0 flex-1 pr-3">
                        <p className="text-xs font-semibold text-white truncate">
                          {u.email}
                        </p>
                        <div className="flex items-center space-x-2">
                          <span className={`text-[9px] uppercase font-mono px-1.5 py-0.5 rounded leading-none ${
                            u.id === "user-super" 
                              ? "bg-indigo-950 text-indigo-300 border border-indigo-900 animate-pulse" 
                              : "bg-slate-800 text-slate-450 text-slate-400"
                          }`}>
                            {u.id === "user-super" ? "Super Admin" : "Privilégio: " + u.role}
                          </span>
                        </div>
                      </div>

                      {u.id !== "user-super" ? (
                        <button
                          id={`delete-user-${u.id}`}
                          onClick={() => handleDeleteUser(u.id, u.email)}
                          className="p-1.5 hover:bg-slate-800 rounded text-red-400 hover:text-red-300 transition-all cursor-pointer text-xs font-semibold font-mono"
                          title="Remover Usuário"
                        >
                          EXCLUIR
                        </button>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-600 select-none">SISTEMA</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
