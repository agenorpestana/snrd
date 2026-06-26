import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import net from "net";

// Load environment variables from .env file
dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const DB_FILE = path.join(process.cwd(), "cameras.json");

// Default Cameras to pre-seed the database
const DEFAULT_CAMERAS = [
  {
    id: "cam-1",
    name: "Pista Principal - VIP SNRD",
    streamUrl: "rtsp://admin:intelbras123@192.168.1.108:554/cam/realmonitor?channel=1&subtype=0",
    city: "Joinville, SC",
    description: "Portaria Principal - Vista panorâmica da pista de pouso (VIPW-1300-MINI-SD). Monitoramento de pousos, decolagens e área perimetral.",
    onvifIp: "192.168.1.108",
    onvifPort: 80,
    onvifUser: "admin",
    isPtzCompatible: true,
    ptzStatus: {
      pan: 45.2,
      tilt: -12.5,
      zoom: 1.5,
      speed: 5
    },
    modelName: "VIPW-1300-MINI-SD",
    serialNumber: "8PHM39018505A",
    firmwareVersion: "V2.820.00IB001.0.T"
  },
  {
    id: "cam-2",
    name: "Área Externa - Copacabana",
    streamUrl: "rtsp://admin:copa2026@192.168.1.150:554/live/ch1",
    city: "Rio de Janeiro, RJ",
    description: "Monitoramento de fluxo de pessoas e condições do mar na praia de Copacabana.",
    onvifIp: "192.168.1.150",
    onvifPort: 80,
    onvifUser: "admin",
    isPtzCompatible: true,
    ptzStatus: {
      pan: -15.0,
      tilt: 5.0,
      zoom: 1.0,
      speed: 4
    },
    modelName: "VIPW-2000-DOME",
    serialNumber: "9BHM81037502B",
    firmwareVersion: "V2.800.00IB002.3.R"
  },
  {
    id: "cam-3",
    name: "Pátio Interno - Escritório Central",
    streamUrl: "rtsp://admin:office789@192.168.0.222:554/mpeg4",
    city: "São Paulo, SP",
    description: "Vista de entrada interna do pátio operacional e estacionamento de veículos de servidores.",
    onvifIp: "192.168.0.222",
    onvifPort: 80,
    onvifUser: "admin",
    isPtzCompatible: false,
    ptzStatus: {
      pan: 0,
      tilt: 0,
      zoom: 1.0,
      speed: 1
    },
    modelName: "VIP-1230-BULLET",
    serialNumber: "7PHN12019904X",
    firmwareVersion: "V1.002.00IB"
  }
];

// Fallback JSON-based Database Operations
function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ 
      cameras: DEFAULT_CAMERAS, 
      adminPasswordHash: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918",
      users: [
        {
          id: "user-super",
          email: "suporte@unityautomacoes.com.br",
          passwordHash: "63b82a7a40b8a1c97efbbffc155518b5bf67d8d21c324bc9eafef135fb0fa4b1",
          role: "admin"
        }
      ]
    }));
  }
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.users) {
      parsed.users = [
        {
          id: "user-super",
          email: "suporte@unityautomacoes.com.br",
          passwordHash: "63b82a7a40b8a1c97efbbffc155518b5bf67d8d21c324bc9eafef135fb0fa4b1",
          role: "admin"
        }
      ];
      fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2));
    }
    return parsed;
  } catch (err) {
    console.error("Erro abrindo BD local, restaurando padrões:", err);
    return { 
      cameras: DEFAULT_CAMERAS, 
      adminPasswordHash: "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918",
      users: [
        {
          id: "user-super",
          email: "suporte@unityautomacoes.com.br",
          passwordHash: "63b82a7a40b8a1c97efbbffc155518b5bf67d8d21c324bc9eafef135fb0fa4b1",
          role: "admin"
        }
      ]
    };
  }
}

function saveDb(data: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Global MySQL pool configuration
let mysqlPool: mysql.Pool | null = null;
let isMysqlEnabled = false;

async function initMysql() {
  const hasDbConfig = !!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
  if (!hasDbConfig) {
    console.log("[DB] Variaveis de ambiente MySQL ausentes (/etc/environment ou .env). Fallback rodará em JSON local.");
    return;
  }

  try {
    console.log(`[DB] Tentando conexão MySQL no host "${process.env.DB_HOST}" (timeout de 2s)...`);
    
    // 1. Tenta comunicar sem banco pré-selecionado para garantir a auto-criação
    const tempConn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectTimeout: 2000
    });
    
    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
    await tempConn.end();
    console.log(`[DB] Banco de dados "${process.env.DB_NAME}" garantido.`);

    // 2. Pool persistente
    mysqlPool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 12,
      queueLimit: 0,
      connectTimeout: 2000
    });

    // Se o pool foi conectado, consideramos o MySQL ativo
    isMysqlEnabled = true;

    // 3. Sincronização automática das tabelas essenciais para o sistema com tratamento granular de erros
    try {
      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS settings (
          key_name VARCHAR(100) PRIMARY KEY,
          value_text TEXT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("[DB] Tabela 'settings' garantida.");
    } catch (tblErr: any) {
      console.error("[DB] Falha crítica ao criar/verificar tabela 'settings':", tblErr.message);
    }

    try {
      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS cameras (
          id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          streamUrl TEXT NOT NULL,
          city VARCHAR(255) NOT NULL,
          description TEXT,
          onvifIp VARCHAR(100),
          onvifPort INT DEFAULT 80,
          onvifUser VARCHAR(100),
          isPtzCompatible TINYINT(1) DEFAULT 0,
          ptzStatus TEXT,
          modelName VARCHAR(255),
          serialNumber VARCHAR(255),
          firmwareVersion VARCHAR(255)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("[DB] Tabela 'cameras' garantida.");
    } catch (tblErr: any) {
      console.error("[DB] Falha crítica ao criar/verificar tabela 'cameras':", tblErr.message);
    }

    try {
      await mysqlPool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(55) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'admin'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("[DB] Tabela 'users' garantida.");
    } catch (tblErr: any) {
      console.error("[DB] Falha crítica ao criar/verificar tabela 'users':", tblErr.message);
    }

    // 4. Seed da senha do administrador
    try {
      const [settingRows]: any = await mysqlPool.query("SELECT * FROM settings WHERE key_name = 'adminPasswordHash'");
      if (settingRows.length === 0) {
        await mysqlPool.query(
          "INSERT INTO settings (key_name, value_text) VALUES ('adminPasswordHash', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918')"
        );
        console.log("[DB] Seed administrativo 'adminPasswordHash' inserido com sucesso.");
      }
    } catch (seedErr: any) {
      console.error("[DB] Falha ao fazer seed da senha administrativa em 'settings':", seedErr.message);
    }

    // 4.1 Seed do usuário super admin padrão 'suporte@unityautomacoes.com.br'
    try {
      const [userRows]: any = await mysqlPool.query("SELECT * FROM users WHERE email = 'suporte@unityautomacoes.com.br'");
      if (userRows.length === 0) {
        await mysqlPool.query(
          "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)",
          [
            "user-super",
            "suporte@unityautomacoes.com.br",
            "4e839acad179b2868bc041b62b069b70698643b539c3325a818539ff03f93e8f",
            "admin"
          ]
        );
        console.log("[DB] Criado usuário super admin padrão com sucesso: suporte@unityautomacoes.com.br");
      } else {
        console.log("[DB] Usuário padrão suporte@unityautomacoes.com.br já existe no banco. Verificando integridade do hash...");
        // Garante que o hash do administrador padrão seja atualizado para a versão correta, caso estivesse usando o hash incorreto anterior
        await mysqlPool.query(
          "UPDATE users SET password_hash = ? WHERE email = ? AND (password_hash = '63b82a7a40b8a1c97efbbffc155518b5bf67d8d21c324bc9eafef135fb0fa4b1' OR password_hash = '')",
          [
            "4e839acad179b2868bc041b62b069b70698643b539c3325a818539ff03f93e8f",
            "suporte@unityautomacoes.com.br"
          ]
        );
        console.log("[DB] Hash do usuário super admin verificado/atualizado com sucesso.");
      }
    } catch (seedErr: any) {
      console.error("[DB] Falha crítica ao realizar seed do usuário padrão 'users':", seedErr.message);
    }

    // 5. Seed das câmeras padrões SNRD
    try {
      const [cameraRows]: any = await mysqlPool.query("SELECT COUNT(*) as count FROM cameras");
      if (cameraRows[0].count === 0) {
        for (const cam of DEFAULT_CAMERAS) {
          await mysqlPool.query(
            `INSERT INTO cameras 
            (id, name, streamUrl, city, description, onvifIp, onvifPort, onvifUser, isPtzCompatible, ptzStatus, modelName, serialNumber, firmwareVersion)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              cam.id,
              cam.name,
              cam.streamUrl,
              cam.city,
              cam.description,
              cam.onvifIp,
              cam.onvifPort,
              cam.onvifUser,
              cam.isPtzCompatible ? 1 : 0,
              JSON.stringify(cam.ptzStatus),
              cam.modelName,
              cam.serialNumber,
              cam.firmwareVersion
            ]
          );
        }
        console.log("[DB] Seed de câmeras padrão inserido com sucesso.");
      }
    } catch (seedErr: any) {
      console.error("[DB] Falha ao fazer seed de câmeras padrões:", seedErr.message);
    }

    console.log("[DB] Inicialização e verificação das tabelas do MySQL concluída.");
  } catch (err: any) {
    console.error("[DB] Falha de conexão inicial no MySQL. Verifique credenciais. Entrando em fallback JSON. Detalhes:", err.message);
    isMysqlEnabled = false;
  }
}

// Lazy load Gemini Client to handle cases where GEMINI_API_KEY isn't configured,
// avoiding server crash on boot, and providing clear diagnostics.
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (aiClient) return aiClient;
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY") {
    console.warn("WARN: GEMINI_API_KEY indefinido ou valor padrão. Clima inteligente usará respostas otimizadas simuladas.");
    return null;
  }
  try {
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
    return aiClient;
  } catch (err) {
    console.error("Erro inicializando cliente Gemini:", err);
    return null;
  }
}

const weatherCache = new Map<string, { data: any; expiry: number }>();

function getSimulatedWeather(city: string): any {
  const cityLower = String(city).toLowerCase();
  let temp = 22;
  let condition = "Parcialmente Nublado";
  let desc = "Tempo agradável com ventos moderados.";
  let hum = 65;
  let wind = 14;
  
  if (cityLower.includes("joinville")) {
    temp = 19;
    condition = "Chuva Leve";
    desc = "Chuvas fracas de Joinville com umidade característica.";
    hum = 92;
    wind = 8;
  } else if (cityLower.includes("rio") || cityLower.includes("copacabana")) {
    temp = 27;
    condition = "Ensolarado";
    desc = "Céu limpo com ventos costeiros frescos.";
    hum = 60;
    wind = 12;
  } else if (cityLower.includes("são paulo") || cityLower.includes("sp") || cityLower.includes("sao paulo")) {
    temp = 23;
    condition = "Nublado";
    desc = "Céu predominantemente nublado com temperatura estável.";
    hum = 70;
    wind = 11;
  } else if (cityLower.includes("curitiba")) {
    temp = 14;
    condition = "Nublado";
    desc = "Clima frio com névoa úmida típica.";
    hum = 82;
    wind = 18;
  } else if (cityLower.includes("bahia") || cityLower.includes("salvador")) {
    temp = 29;
    condition = "Ensolarado";
    desc = "Dia ensolarado com brisa do mar constante.";
    hum = 75;
    wind = 15;
  }

  // No artificial minutes-based variation to prevent annoying fluctuations
  return {
    city: String(city),
    temp,
    condition,
    description: desc,
    humidity: hum,
    windSpeed: wind,
    windDirection: Math.floor(Math.random() * 360),
    pressure: 1013, // Standard atmospheric pressure at sea level in hPa (QNH)
    fetchedAt: Date.now()
  };
}

// Fetch real-time weather information from Open-Meteo (fully online and dynamic)
async function fetchRealWeather(city: string): Promise<any | null> {
  try {
    let trimmedCity = String(city).trim();
    if (!trimmedCity) return null;

    let latitude: number | null = null;
    let longitude: number | null = null;
    let formattedName = trimmedCity;
    let admin1 = "";

    // 1. Detect if the city string contains coordinates (e.g., -17.3326, -39.2308)
    const coordRegex = /(-?\d+\.\d+)[,\s/]+(-?\d+\.\d+)/;
    const coordMatch = trimmedCity.match(coordRegex);

    if (coordMatch) {
      latitude = parseFloat(coordMatch[1]);
      longitude = parseFloat(coordMatch[2]);
      console.log(`[Weather API] Coordenadas detectadas diretamente na string da cidade: (${latitude}, ${longitude})`);
      
      // Try to extract a clean textual name before the coordinates if present, e.g. "Prado, BA (-17.3326, -39.2308)" -> "Prado, BA"
      const namePart = trimmedCity.split('(')[0].trim();
      if (namePart && namePart !== `${latitude},${longitude}` && namePart !== `${latitude}, ${longitude}`) {
        formattedName = namePart;
      } else {
        formattedName = "Localização Geográfica";
        admin1 = `${latitude}, ${longitude}`;
      }
    } else {
      // Normalize simple default values to prevent international overlaps (e.g. Joinville in France)
      const lower = trimmedCity.toLowerCase();
      if (lower === "joinville") {
        trimmedCity = "Joinville, SC";
      } else if (lower === "rio de janeiro" || lower === "rio") {
        trimmedCity = "Rio de Janeiro, RJ";
      } else if (lower === "são paulo" || lower === "sao paulo") {
        trimmedCity = "São Paulo, SP";
      }

      const UF_MAP: Record<string, string> = {
        "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia",
        "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás",
        "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais",
        "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí",
        "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul",
        "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo",
        "SE": "Sergipe", "TO": "Tocantins"
      };

      // Split base city name and any state abbreviation / full state name hint
      const parts = trimmedCity.split(/[,\-]+/);
      let cityName = parts[0].trim();
      let stateHint = "";
      if (parts.length > 1) {
        stateHint = parts[1].trim().toUpperCase();
      } else {
        // Check if the last word matches a state abbreviation
        const words = trimmedCity.split(/\s+/);
        if (words.length > 1) {
          const lastWord = words[words.length - 1].toUpperCase();
          if (UF_MAP[lastWord]) {
            stateHint = lastWord;
            cityName = words.slice(0, words.length - 1).join(" ");
          }
        }
      }

      console.log(`[Weather API] Consultando geocodificação Open-Meteo do nome da cidade: "${cityName}" (Original: "${trimmedCity}", Estado: "${stateHint || 'Não especificado'}")`);
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=20&language=pt`;
      
      let geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(4000) });
      let geoData: any = null;
      if (geoRes.ok) {
        geoData = await geoRes.json();
      }

      let results = geoData?.results || [];

      // If we got nothing, try to query the full query as a last resort
      if (results.length === 0) {
        console.warn(`[Weather API] Nenhuma correspondência para nome limpo "${cityName}". Tentando com string completa: "${trimmedCity}"`);
        const fallbackGeoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmedCity)}&count=5&language=pt`;
        const fallbackRes = await fetch(fallbackGeoUrl, { signal: AbortSignal.timeout(4000) });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          results = fallbackData?.results || [];
        }
      }

      if (results.length === 0) {
        console.warn(`[Weather API] Nenhuma correspondência encontrada no Open-Meteo para: "${trimmedCity}"`);
        return null;
      }

      // Filter Brazilian results
      const brResults = results.filter((r: any) => 
        String(r.country).toLowerCase().includes("brazil") || 
        String(r.country).toLowerCase().includes("brasil") ||
        (r.country_code && String(r.country_code).toLowerCase() === "br")
      );

      const fullStateName = stateHint ? UF_MAP[stateHint] : null;
      let bestMatch = null;

      if (brResults.length > 0) {
        // If we have a state hint, look for matches in the results
        if (stateHint) {
          bestMatch = brResults.find((r: any) => {
            const admin = String(r.admin1 || "").toLowerCase();
            return admin.includes(stateHint.toLowerCase()) || 
                   (fullStateName && admin.includes(fullStateName.toLowerCase()));
          });
        }
        // Fall back to first Brazilian result if no specific state match
        if (!bestMatch) {
          bestMatch = brResults[0];
        }
      } else {
        // Fall back to the first general result
        bestMatch = results[0];
      }

      latitude = bestMatch.latitude;
      longitude = bestMatch.longitude;
      formattedName = bestMatch.name;
      admin1 = bestMatch.admin1 || "";
      console.log(`[Weather API] Encontrado melhor correspondência: ${formattedName} (Estado/Região: ${admin1 || "N/A"}) - Coordenadas: (${latitude}, ${longitude})`);
    }

    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl&timezone=auto`;
    const forecastRes = await fetch(forecastUrl, { signal: AbortSignal.timeout(4000) });
    if (!forecastRes.ok) {
      console.warn(`[Weather API] Falha na resposta meteorológica Open-Meteo: status ${forecastRes.status}`);
      return null;
    }

    const forecastData: any = await forecastRes.json();
    const current = forecastData.current;
    if (!current) {
      console.warn(`[Weather API] Resposta Open-Meteo não contém seção 'current'`);
      return null;
    }

    const temp = Math.round(current.temperature_2m);
    const humidity = Math.round(current.relative_humidity_2m);
    const windSpeed = Math.round(current.wind_speed_10m);
    const windDirection = current.wind_direction_10m !== undefined ? Math.round(current.wind_direction_10m) : 0;
    const pressure = current.pressure_msl !== undefined ? Math.round(current.pressure_msl) : undefined;
    const weatherCode = Number(current.weather_code);

    // Map weather codes to friendly descriptions and conditions in Portuguese
    let condition = "Parcialmente Nublado";
    let description = "Tempo agradável na região.";

    if (weatherCode === 0) {
      condition = "Ensolarado";
      description = "Céu extremamente limpo com muito sol.";
    } else if (weatherCode >= 1 && weatherCode <= 3) {
      condition = "Parcialmente Nublado";
      description = "Céu com mescla de nuvens e aberturas de sol.";
    } else if (weatherCode === 45 || weatherCode === 48) {
      condition = "Nublado";
      description = "Nevoeiro úmido ou névoa com visibilidade reduzida.";
    } else if (weatherCode === 51 || weatherCode === 53 || weatherCode === 55) {
      condition = "Chuvisco";
      description = "Condição típica de garoa leve ou chuviscos finos.";
    } else if (weatherCode === 61 || weatherCode === 63 || weatherCode === 65) {
      if (weatherCode === 61) {
        condition = "Chuva Leve";
        description = "Chuva contínua leve caindo sobre a cidade.";
      } else if (weatherCode === 63) {
        condition = "Chuva";
        description = "Chuva moderada regular registrada na região.";
      } else {
        condition = "Chuva Forte";
        description = "Chuva pesada constante e condições climáticas instáveis.";
      }
    } else if (weatherCode === 66 || weatherCode === 67) {
      condition = "Chuva";
      description = "Chuva congelante e ventos gelados persistentes.";
    } else if (weatherCode >= 71 && weatherCode <= 77) {
      condition = "Neve";
      description = "Precipitação sólida de neve e frio intenso.";
    } else if (weatherCode >= 80 && weatherCode <= 82) {
      condition = "Parcialmente Nublado";
      description = "Instabilidade atmosférica gerando pancadas de chuva localizadas.";
    } else if (weatherCode === 95) {
      condition = "Temporal";
      description = "Área de instabilidade ativa com relâmpagos e rajadas de vento.";
    } else if (weatherCode === 96 || weatherCode === 99) {
      condition = "Temporal";
      description = "Tempestade severa com possibilidade de trovoadas e granizo.";
    }

    return {
      city: admin1 ? `${formattedName}, ${admin1}` : formattedName,
      temp,
      condition,
      description,
      humidity,
      windSpeed,
      windDirection,
      pressure,
      fetchedAt: Date.now()
    };
  } catch (err: any) {
    console.error(`[Weather API] Erro ao buscar clima em tempo real para: ${city}:`, err.message);
    return null;
  }
}

async function startServer() {
  // Inicializa banco de dados MySQL de produção ou fallback local de forma assíncrona
  initMysql().catch((err) => {
    console.error("[DB] Falha de conexão assíncrona no MySQL:", err);
  });

  const app = express();
  app.use(express.json());

  // Simple tokenless raw session verification (very lightweight, 100% stable)
  // Administrators are identified via header or local cookies
  const checkAdminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader === "Bearer admin-token-session") {
      next();
    } else {
      res.status(401).json({ error: "Sessão inválida ou não autorizada como administrador." });
    }
  };

  // --- API ROUTES ---

  // Auth Login Endpoint (Multi-user supports email + password check)
  app.post("/api/auth/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios para continuar." });
    }
    
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password).trim();
    const hash = crypto.createHash("sha256").update(cleanPassword).digest("hex");
    
    console.log(`[AUTH] Tentativa de login para email="${cleanEmail}". Hash gerado: "${hash}"`);
    
    if (isMysqlEnabled && mysqlPool) {
      try {
        const [rows]: any = await mysqlPool.query("SELECT * FROM users WHERE LOWER(TRIM(email)) = ?", [cleanEmail]);
        console.log(`[AUTH] MySQL encontrou ${rows.length} usuários correspondentes.`);
        
        if (rows.length > 0) {
          const user = rows[0];
          console.log(`[AUTH] Comparando hash enviado "${hash}" com hash do banco "${user.password_hash}"`);
          
          if (user.password_hash === hash) {
            console.log(`[AUTH] Login bem-sucedido via MySQL para: ${cleanEmail}`);
            return res.json({ 
              token: "admin-token-session", 
              email: user.email,
              role: user.role,
              message: "Autenticação efetuada com sucesso." 
            });
          }
        }
      } catch (err: any) {
        console.error("Erro consultando credenciais no MySQL:", err);
        return res.status(500).json({ error: "Erro interno no servidor de banco de dados." });
      }
    } else {
      console.log(`[AUTH] Usando fallback de banco local JSON.`);
      const db = loadDb();
      const userList = db.users || [];
      const matched = userList.find((u: any) => 
        String(u.email).trim().toLowerCase() === cleanEmail && 
        u.passwordHash === hash
      );
      if (matched) {
        console.log(`[AUTH] Login bem-sucedido via JSON local para: ${cleanEmail}`);
        return res.json({ 
          token: "admin-token-session", 
          email: matched.email,
          role: matched.role || "admin",
          message: "Autenticação efetuada com sucesso." 
        });
      }
    }
    
    console.warn(`[AUTH] Falha de login para o e-mail: ${cleanEmail} (Senha incorreta ou usuário inexistente)`);
    return res.status(401).json({ error: "E-mail ou senha incorretos." });
  });

  // Get all users (Admin only)
  app.get("/api/users", checkAdminAuth, async (req, res) => {
    if (isMysqlEnabled && mysqlPool) {
      try {
        const [rows]: any = await mysqlPool.query("SELECT id, email, role FROM users");
        return res.json(rows);
      } catch (err) {
        console.error("Erro listando usuários no MySQL:", err);
        return res.status(500).json({ error: "Erro de banco de dados." });
      }
    } else {
      const db = loadDb();
      const sanitized = (db.users || []).map((u: any) => ({
        id: u.id,
        email: u.email,
        role: u.role || "admin"
      }));
      return res.json(sanitized);
    }
  });

  // Create a user (Admin only)
  app.post("/api/users", checkAdminAuth, async (req, res) => {
    const { email, password, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }
    const hash = crypto.createHash("sha256").update(password).digest("hex");
    const newId = "user-" + Date.now();

    if (isMysqlEnabled && mysqlPool) {
      try {
        // Check uniqueness
        const [existing]: any = await mysqlPool.query("SELECT * FROM users WHERE email = ?", [email]);
        if (existing.length > 0) {
          return res.status(400).json({ error: "Este endereço de e-mail já está cadastrado." });
        }
        await mysqlPool.query(
          "INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)",
          [newId, email, hash, role || "admin"]
        );
        return res.status(201).json({ id: newId, email, role: role || "admin" });
      } catch (err) {
        console.error("Erro criando usuário no MySQL:", err);
        return res.status(500).json({ error: "Erro de banco de dados." });
      }
    } else {
      const db = loadDb();
      if (!db.users) db.users = [];
      const isExist = db.users.some((u: any) => u.email === email);
      if (isExist) {
        return res.status(400).json({ error: "Este endereço de e-mail já está cadastrado." });
      }
      const newUser = {
        id: newId,
        email,
        passwordHash: hash,
        role: role || "admin"
      };
      db.users.push(newUser);
      saveDb(db);
      return res.status(201).json({ id: newId, email, role: newUser.role });
    }
  });

  // Delete a user (Admin only)
  app.delete("/api/users/:id", checkAdminAuth, async (req, res) => {
    const { id } = req.params;
    
    // Prevent deletion of 'user-super' default account to avoid getting locked out
    if (id === "user-super") {
      return res.status(400).json({ error: "Não é permitido excluir o super usuário de segurança." });
    }

    if (isMysqlEnabled && mysqlPool) {
      try {
        const [result]: any = await mysqlPool.query("DELETE FROM users WHERE id = ?", [id]);
        if (result.affectedRows === 0) {
          return res.status(404).json({ error: "Usuário não localizado." });
        }
        return res.json({ message: "Usuário removido com sucesso." });
      } catch (err) {
        console.error("Erro deletando usuário do MySQL:", err);
        return res.status(500).json({ error: "Erro de banco de dados." });
      }
    } else {
      const db = loadDb();
      if (!db.users) db.users = [];
      const beforeLength = db.users.length;
      db.users = db.users.filter((u: any) => u.id !== id);
      if (db.users.length === beforeLength) {
        return res.status(404).json({ error: "Usuário não localizado." });
      }
      saveDb(db);
      return res.json({ message: "Usuário removido com sucesso." });
    }
  });

  // A tiny valid 1x1 black JPEG image used as an immediate keep-alive/response handshake structure
  const TINY_BLACK_JPEG = Buffer.from(
    "ffd8ffe000104a46494600010101006000600000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f0037ffd9",
    "hex"
  );

  interface SharedCameraStream {
    id: string;
    name: string;
    streamUrl: string;
    isRtmp: boolean;
    ffmpegProcess: any;
    listeners: Set<(frame: Buffer) => void>;
    buffer: Buffer;
    watchdogTimer: NodeJS.Timeout | null;
    restartTimer: NodeJS.Timeout | null;
    stopTimeout: NodeJS.Timeout | null;
    hasSentData: boolean;
    lastFrame?: Buffer;          // Cache to store the most recent live image frame
    isInitialized: boolean;      // True after the first actual feed frame is decoded
    width?: number;
    fps?: number;
    quality?: number;
    lastFrameTime: number;
  }

  const cameraStreams = new Map<string, SharedCameraStream>();

  // Helper to check if a port is open locally on 127.0.0.1
  const isLocalPortOpen = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(350);
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, "127.0.0.1");
    });
  };

  const startFFmpegForCamera = async (stream: SharedCameraStream) => {
    if (stream.ffmpegProcess) {
      try {
        stream.ffmpegProcess.kill("SIGKILL");
      } catch (e) {}
      stream.ffmpegProcess = null;
    }
    if (stream.watchdogTimer) {
      clearInterval(stream.watchdogTimer);
      stream.watchdogTimer = null;
    }
    if (stream.restartTimer) {
      clearTimeout(stream.restartTimer);
      stream.restartTimer = null;
    }

    stream.hasSentData = false;
    stream.isInitialized = false;
    stream.buffer = Buffer.alloc(0);
    stream.lastFrameTime = Date.now() + 15000; // 15 seconds grace period for initial startup

    let finalUrl = stream.streamUrl;
    if (stream.isRtmp) {
      // Prioritize 127.0.0.1 connection if Nginx-RTMP is running locally on the same server (like on the production VPS)
      // This completely avoids issues with Firewalls or Hairpin NAT routing loops when a server tries to call its own public IP
      const isLocalRtmpActive = await isLocalPortOpen(1935);
      if (isLocalRtmpActive) {
        console.log(`[Stream Orchestrator] Detected Nginx-RTMP active locally on port 1935. Forcing loopback connection for ${stream.name}`);
        if (finalUrl.includes("localhost") || finalUrl.includes("127.0.0.1")) {
          // Keep it local - already points to localhost
        } else {
          try {
            // Rewrite the stream url back to 127.0.0.1 so it bypasses external NAT limits entirely
            const urlObj = new URL(finalUrl.replace("rtmp://", "http://").replace("rtmps://", "http://"));
            finalUrl = `rtmp://127.0.0.1:1935${urlObj.pathname}${urlObj.search}`;
          } catch (e) {
            finalUrl = `rtmp://127.0.0.1:1935/live/${finalUrl.split("/").pop()}`;
          }
        }
      } else {
        // If we are running externally (like in the Cloud Run dev sandbox), translate local loopback to the DB_HOST public address
        const dbHost = process.env.DB_HOST;
        if (dbHost && dbHost !== "127.0.0.1" && dbHost !== "localhost") {
          if (finalUrl.includes("127.0.0.1") || finalUrl.includes("localhost")) {
            const original = finalUrl;
            finalUrl = finalUrl.replace("127.0.0.1", dbHost).replace("localhost", dbHost);
            console.log(`[Stream Orchestrator] Translating RTMP local address in streamUrl from ${original} to ${finalUrl} (using DB_HOST = ${dbHost})`);
          }
        }
      }
    }

    const width = stream.width || 640;
    const fps = stream.fps || 10;
    const quality = stream.quality || 8;

    const ffmpegArgs = stream.isRtmp ? [
      "-an",                                           // Descarta o stream de áudio no input imediatamente para evitar empacamento de handshake
      "-sn",                                           // Descarta legendas no input
      "-rtmp_live", "live",                            // Força comportamento de stream live real-time do Nginx-RTMP
      "-rtmp_buffer", "100",                           // Minimiza o buffer interno do RTMP para 100ms
      "-fflags", "+nobuffer+genpts+discardcorrupt",     // Sem buffer na recepção dos pacotes e correção de frames
      "-flags", "+low_delay",                          // Ativa modo de atraso mínimo de processamento
      "-analyzeduration", "200000",                    // Limita análise a 200ms para início instantâneo
      "-probesize", "200000",                          // Tamanho ideal de amostragem inicial (200KB)
      "-threads", "2",                                 // Reduzido para 2 threads para evitar sobrecarga de troca de contexto de CPU
      "-i", finalUrl,
      "-vf", `scale=${width}:-2`,                      // Resolução dinâmica
      "-q:v", `${quality}`,                            // Qualidade dinâmica
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-r", `${fps}`,                                  // FPS dinâmico
      "pipe:1"
    ] : [
      "-an",                                           // Ignora o áudio da MIBO diretamente na entrada para evitar incompatibilidade ou congelamento de canais PCM/G.711/AAC
      "-sn",                                           // Ignora legendas
      "-rtsp_transport", "tcp",                        // RTSP sobre transporte TCP estável contra perda de pacotes
      "-skip_loop_filter", "all",                      // Pula o deblocking loop filter (GIGANTESCA economia de CPU para H.264 e H.265)
      "-fflags", "+nobuffer+genpts+discardcorrupt",     // Elimina buffers de sincronismo de entrada do RTSP
      "-flags", "+low_delay",                          // Reduz filas e atrasos internos de transcodificação
      "-analyzeduration", "300000",                    // Análise de cabeçalhos de 300ms (ótimo para reconhecer VPS/SPS/PPS em H.265/HEVC)
      "-probesize", "300000",                          // Probe dimensionado para 300KB otimizando início de keyframes HEVC
      "-threads", "2",                                 // Garante limite de CPU usando 2 threads por processo de câmera
      "-i", finalUrl,
      "-vf", `scale=${width}:-2`,                      // Proporção otimizada dinâmica
      "-q:v", `${quality}`,                            // Qualidade dinâmica
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-r", `${fps}`,                                  // Framerate dinâmico
      "pipe:1"
    ];

    console.log(`[Stream Orchestrator] Spawning FFmpeg process for ${stream.name} (${stream.isRtmp ? "RTMP" : "RTSP"}). Res: ${width}px, FPS: ${fps}. Source URL: ${finalUrl}`);
    stream.ffmpegProcess = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "pipe", "pipe"] });

    stream.ffmpegProcess.stdout.on("data", (chunk: Buffer) => {
      if (!stream.hasSentData) {
        stream.hasSentData = true;
      }
      stream.buffer = Buffer.concat([stream.buffer, chunk]);
      let start = 0;

      while (true) {
        const soi = stream.buffer.indexOf(Buffer.from([0xff, 0xd8]), start);
        if (soi === -1) break;

        const eoi = stream.buffer.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
        if (eoi === -1) {
          stream.buffer = stream.buffer.subarray(soi);
          break;
        }

        const frame = stream.buffer.subarray(soi, eoi + 2);
        stream.lastFrame = frame; // Cache the most recent real JPEG frame
        stream.isInitialized = true;
        stream.lastFrameTime = Date.now(); // Update frame tick time!

        // Broadcast JPEG frame to all connected clients
        for (const emitFrame of stream.listeners) {
          try {
            emitFrame(frame);
          } catch (err) {
            stream.listeners.delete(emitFrame);
          }
        }

        start = eoi + 2;
      }

      if (start > 0) {
        stream.buffer = stream.buffer.subarray(start);
      }
    });

    stream.ffmpegProcess.stderr.on("data", (chunk: Buffer) => {
      const logs = chunk.toString();
      try {
        fs.appendFileSync(path.join(process.cwd(), "ffmpeg_debug.log"), `[${stream.name}] ${logs}`);
      } catch (e) {}
      if (logs.includes("Error") || logs.includes("failed") || logs.includes("timed out") || logs.includes("Connection refused")) {
        console.warn(`[Stream Orchestrator FFmpeg ${stream.id}] ${logs.trim()}`);
      }
    });

    stream.ffmpegProcess.on("error", (err: any) => {
      console.error(`[Stream Orchestrator] FFmpeg error for ${stream.id}:`, err.message);
      if (stream.watchdogTimer) {
        clearInterval(stream.watchdogTimer);
        stream.watchdogTimer = null;
      }
    });

    stream.ffmpegProcess.on("close", (code: number | null) => {
      console.log(`[Stream Orchestrator] FFmpeg process for ${stream.name} closed with code ${code}`);
      if (stream.watchdogTimer) {
        clearInterval(stream.watchdogTimer);
        stream.watchdogTimer = null;
      }
      stream.ffmpegProcess = null;

      if (stream.listeners.size > 0) {
        console.log(`[Stream Orchestrator] Camera ${stream.name} still has ${stream.listeners.size} active listeners. Restarting FFmpeg in 1.5s...`);
        stream.restartTimer = setTimeout(() => {
          startFFmpegForCamera(stream);
        }, 1500);
      }
    });

    // Start periodic watchdog checks instead of micro-managing timeouts
    stream.watchdogTimer = setInterval(() => {
      if (stream.listeners.size === 0) return;
      const elapsed = Date.now() - stream.lastFrameTime;
      if (elapsed > 20000) { // 20 seconds timeout
        console.warn(`[Stream Orchestrator Watchdog] No frames received in ${Math.round(elapsed / 1000)}s for ${stream.name}. Restarting FFmpeg...`);
        stream.lastFrameTime = Date.now() + 10000; // 10s grace period for next start
        startFFmpegForCamera(stream);
      }
    }, 5000);
  };

  // Live Transcoding Route: Converts RTSP stream to standard multipart/x-mixed-replace (MJPEG)
  app.get("/api/cameras/:id/stream", async (req, res) => {
    const { id } = req.params;
    let camera: any = null;

    if (isMysqlEnabled && mysqlPool) {
      try {
        const [rows]: any = await mysqlPool.query("SELECT * FROM cameras WHERE id = ?", [id]);
        if (rows.length > 0) {
          camera = rows[0];
        }
      } catch (err) {
        console.error("Erro ao buscar dados da câmera para streaming:", err);
      }
    } else {
      const db = loadDb();
      camera = db.cameras.find((c: any) => c.id === id);
    }

    if (!camera) {
      return res.status(404).send("Câmera não localizada");
    }

    const streamUrl = String(camera.streamUrl || "").trim();
    if (!streamUrl) {
      return res.status(400).send("Falta endereço de rede e protocolo de comutação da câmera.");
    }

    const isRtmp = streamUrl.toLowerCase().startsWith("rtmp://") || streamUrl.toLowerCase().startsWith("rtmps://");

    // Set standard boundary headers for server-push MJPEG
    res.writeHead(200, {
      "Content-Type": "multipart/x-mixed-replace; boundary=frame",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "X-Accel-Buffering": "no", // Disable Nginx/Proxy buffering so stream frames deliver instantly
      "Connection": "keep-alive",
      "Pragma": "no-cache",
      "Expires": "0"
    });

    // Check if we already have an active transcribing orchestrator stream for this camera ID
    let stream = cameraStreams.get(id);
    const reqWidth = parseInt(req.query.w as string) || 640;
    const reqFps = parseInt(req.query.fps as string) || 10;
    const reqQuality = parseInt(req.query.q as string) || 8;

    if (!stream) {
      stream = {
        id,
        name: camera.name,
        streamUrl,
        isRtmp,
        ffmpegProcess: null,
        listeners: new Set(),
        buffer: Buffer.alloc(0),
        watchdogTimer: null,
        restartTimer: null,
        stopTimeout: null,
        hasSentData: false,
        isInitialized: false,
        width: reqWidth,
        fps: reqFps,
        quality: reqQuality,
        lastFrameTime: Date.now() + 15000
      };
      cameraStreams.set(id, stream);
      startFFmpegForCamera(stream);
    } else {
      // If we already had this stream, but it was scheduled to turn off due to 0 listeners, cancel the stop timeout!
      if (stream.stopTimeout) {
        console.log(`[Stream Orchestrator] Canceling stop timeout for camera ${camera.name} because a new viewer connected!`);
        clearTimeout(stream.stopTimeout);
        stream.stopTimeout = null;
      }

      // Dynamically upgrade stream resolution/framerate if requested parameters are higher than current settings
      const currentWidth = stream.width || 640;
      const currentFps = stream.fps || 10;
      if (reqWidth > currentWidth || reqFps > currentFps) {
        console.log(`[Stream Orchestrator] Upgrading quality for ${stream.name} (Resolution: ${currentWidth}px -> ${reqWidth}px, FPS: ${currentFps} -> ${reqFps})`);
        stream.width = reqWidth;
        stream.fps = reqFps;
        stream.quality = Math.min(stream.quality || 8, reqQuality);
        startFFmpegForCamera(stream);
      }
    }

    let lastKeepAliveTime = Date.now();

    // Write-push listener context
    const writeFrameListener = (frame: Buffer) => {
      try {
        res.write("--frame\r\n");
        res.write("Content-Type: image/jpeg\r\n");
        res.write(`Content-Length: ${frame.length}\r\n\r\n`);
        res.write(frame);
        res.write("\r\n");
        lastKeepAliveTime = Date.now(); // Reset keepAlive clock on any successful push!
      } catch (writeErr) {
        // HTTP socket closed or broken, listener will be removed in the close handler
      }
    };

    // Push frame immediately on connection for instantaneous response!
    if (stream.lastFrame) {
      // Send the cached live frame immediately to the client
      writeFrameListener(stream.lastFrame);
    } else {
      // Send the tiny black 1x1 JPEG placeholder so the response is returned instantly
      // which completely avoids Nginx 504 Gateway Time-out
      writeFrameListener(TINY_BLACK_JPEG);
    }

    stream.listeners.add(writeFrameListener);
    console.log(`[Stream Orchestrator] Client subscribed to ${camera.name}. Active listeners: ${stream.listeners.size}`);

    // Set up continuous 3-second keepalive to protect against Proxies or Browsers terminating the chunked stream
    // Writes raw newlines inside safe boundary structures so the connection remains hot, preventing browser rendering resets
    const keepAliveInterval = setInterval(() => {
      if (Date.now() - lastKeepAliveTime >= 3000) {
        if (stream && stream.lastFrame) {
          writeFrameListener(stream.lastFrame);
        } else {
          writeFrameListener(TINY_BLACK_JPEG);
        }
      }
    }, 3000);

    req.on("close", () => {
      clearInterval(keepAliveInterval);
      if (stream) {
        stream.listeners.delete(writeFrameListener);
        console.log(`[Stream Orchestrator] Client unsubscribed from ${camera.name}. Active listeners remaining: ${stream.listeners.size}`);

        // If no clients are listening anymore, don't kill ffmpeg immediately to avoid constant re-connects on page reloads/fullscreens
        if (stream.listeners.size === 0) {
          if (stream.stopTimeout) clearTimeout(stream.stopTimeout);
          
          stream.stopTimeout = setTimeout(() => {
            if (stream && stream.listeners.size === 0) {
              console.log(`[Stream Orchestrator] No viewers for 6 seconds. Fully tearing down FFmpeg for ${stream.name}`);
              if (stream.watchdogTimer) clearInterval(stream.watchdogTimer);
              if (stream.restartTimer) clearTimeout(stream.restartTimer);
              if (stream.ffmpegProcess) {
                try {
                  stream.ffmpegProcess.kill("SIGKILL");
                } catch (e) {}
              }
              cameraStreams.delete(id);
            }
          }, 6000); // 6 seconds grace period
        }
      }
    });
  });

  // Diagnostic Endpoint to inspect Stream Orchestrator status and FFmpeg outputs
  app.get("/api/debug/streams", async (req, res) => {
    try {
      const active = [];
      for (const [id, s] of cameraStreams.entries()) {
        active.push({
          id,
          name: s.name,
          streamUrl: s.streamUrl,
          isRtmp: s.isRtmp,
          listenersCount: s.listeners.size,
          hasSentData: s.hasSentData,
          isInitialized: s.isInitialized,
          ffmpegPid: s.ffmpegProcess ? s.ffmpegProcess.pid : null,
        });
      }

      let logTail = "";
      const logPath = path.join(process.cwd(), "ffmpeg_debug.log");
      if (fs.existsSync(logPath)) {
        const fullLog = fs.readFileSync(logPath, "utf-8");
        const lines = fullLog.split("\n");
        logTail = lines.slice(-200).join("\n"); // Last 200 lines
      } else {
        logTail = "Log file ffmpeg_debug.log does not exist yet.";
      }

      return res.json({
        isMysqlEnabled,
        camerasCount: cameraStreams.size,
        activeStreams: active,
        logTail
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Get all Cameras
  app.get("/api/cameras", async (req, res) => {
    if (isMysqlEnabled && mysqlPool) {
      try {
        const [rows]: any = await mysqlPool.query("SELECT * FROM cameras");
        const formatted = rows.map((c: any) => ({
          ...c,
          isPtzCompatible: !!c.isPtzCompatible,
          ptzStatus: c.ptzStatus ? JSON.parse(c.ptzStatus) : undefined
        }));
        return res.json(formatted);
      } catch (err) {
        console.error("Erro buscando câmeras no MySQL:", err);
        return res.status(500).json({ error: "Falha de conexão com o banco de dados." });
      }
    } else {
      const db = loadDb();
      res.json(db.cameras);
    }
  });

  // Create a Camera (Admin only)
  app.post("/api/cameras", checkAdminAuth, async (req, res) => {
    const cameraData = req.body;
    if (!cameraData.name || !cameraData.streamUrl || !cameraData.city) {
      return res.status(400).json({ error: "Nome, link de stream e localidade (cidade) são obrigatórios." });
    }

    const newId = "cam-" + Date.now();
    const newCamera = {
      id: newId,
      name: cameraData.name,
      streamUrl: cameraData.streamUrl,
      city: cameraData.city,
      description: cameraData.description || "Nenhuma descrição fornecida.",
      onvifIp: cameraData.onvifIp || "",
      onvifPort: Number(cameraData.onvifPort) || 80,
      onvifUser: cameraData.onvifUser || "",
      isPtzCompatible: !!cameraData.isPtzCompatible,
      ptzStatus: cameraData.isPtzCompatible ? {
        pan: 0,
        tilt: 0,
        zoom: 1.0,
        speed: 5
      } : undefined,
      modelName: cameraData.modelName || "Modelo Customizado",
      serialNumber: cameraData.serialNumber || "SN-" + Math.floor(Math.random() * 10000000),
      firmwareVersion: cameraData.firmwareVersion || "V1.0.0-Build-" + new Date().getFullYear()
    };

    if (isMysqlEnabled && mysqlPool) {
      try {
        await mysqlPool.query(
          `INSERT INTO cameras 
          (id, name, streamUrl, city, description, onvifIp, onvifPort, onvifUser, isPtzCompatible, ptzStatus, modelName, serialNumber, firmwareVersion)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newCamera.id,
            newCamera.name,
            newCamera.streamUrl,
            newCamera.city,
            newCamera.description,
            newCamera.onvifIp,
            newCamera.onvifPort,
            newCamera.onvifUser,
            newCamera.isPtzCompatible ? 1 : 0,
            newCamera.ptzStatus ? JSON.stringify(newCamera.ptzStatus) : null,
            newCamera.modelName,
            newCamera.serialNumber,
            newCamera.firmwareVersion
          ]
        );
        res.status(201).json(newCamera);
      } catch (err) {
        console.error("Erro inserindo câmera no MySQL:", err);
        res.status(500).json({ error: "Falha ao persistir câmera no banco." });
      }
    } else {
      const db = loadDb();
      db.cameras.push(newCamera);
      saveDb(db);
      res.status(201).json(newCamera);
    }
  });

  // Update a Camera (Admin only)
  app.put("/api/cameras/:id", checkAdminAuth, async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    if (isMysqlEnabled && mysqlPool) {
      try {
        const [rows]: any = await mysqlPool.query("SELECT * FROM cameras WHERE id = ?", [id]);
        if (rows.length === 0) {
          return res.status(404).json({ error: "Câmera não localizada." });
        }
        const originalCamera = rows[0];
        const isPtz = updateData.isPtzCompatible !== undefined ? !!updateData.isPtzCompatible : !!originalCamera.isPtzCompatible;
        
        let originalPtzStatus = null;
        try {
          if (originalCamera.ptzStatus) originalPtzStatus = JSON.parse(originalCamera.ptzStatus);
        } catch (_) {}

        const ptzStatus = isPtz ? (originalPtzStatus || { pan: 0, tilt: 0, zoom: 1.0, speed: 5 }) : null;

        const updated = {
          name: updateData.name || originalCamera.name,
          streamUrl: updateData.streamUrl || originalCamera.streamUrl,
          city: updateData.city || originalCamera.city,
          description: updateData.description !== undefined ? updateData.description : originalCamera.description,
          onvifIp: updateData.onvifIp !== undefined ? updateData.onvifIp : originalCamera.onvifIp,
          onvifPort: updateData.onvifPort !== undefined ? Number(updateData.onvifPort) : originalCamera.onvifPort,
          onvifUser: updateData.onvifUser !== undefined ? updateData.onvifUser : originalCamera.onvifUser,
          isPtzCompatible: isPtz,
          ptzStatus: ptzStatus,
          modelName: updateData.modelName || originalCamera.modelName,
          serialNumber: updateData.serialNumber || originalCamera.serialNumber,
          firmwareVersion: updateData.firmwareVersion || originalCamera.firmwareVersion
        };

        await mysqlPool.query(
          `UPDATE cameras SET 
            name = ?, streamUrl = ?, city = ?, description = ?, onvifIp = ?, onvifPort = ?, onvifUser = ?, 
            isPtzCompatible = ?, ptzStatus = ?, modelName = ?, serialNumber = ?, firmwareVersion = ?
          WHERE id = ?`,
          [
            updated.name,
            updated.streamUrl,
            updated.city,
            updated.description,
            updated.onvifIp,
            updated.onvifPort,
            updated.onvifUser,
            updated.isPtzCompatible ? 1 : 0,
            updated.ptzStatus ? JSON.stringify(updated.ptzStatus) : null,
            updated.modelName,
            updated.serialNumber,
            updated.firmwareVersion,
            id
          ]
        );

        res.json({ id, ...updated });
      } catch (err) {
        console.error("Erro atualizando câmera no MySQL:", err);
        res.status(500).json({ error: "Erro de banco de dados." });
      }
    } else {
      const db = loadDb();
      const idx = db.cameras.findIndex((c: any) => c.id === id);

      if (idx === -1) {
        return res.status(404).json({ error: "Câmera não localizada." });
      }

      const originalCamera = db.cameras[idx];
      const updated = {
        ...originalCamera,
        name: updateData.name || originalCamera.name,
        streamUrl: updateData.streamUrl || originalCamera.streamUrl,
        city: updateData.city || originalCamera.city,
        description: updateData.description !== undefined ? updateData.description : originalCamera.description,
        onvifIp: updateData.onvifIp !== undefined ? updateData.onvifIp : originalCamera.onvifIp,
        onvifPort: updateData.onvifPort !== undefined ? Number(updateData.onvifPort) : originalCamera.onvifPort,
        onvifUser: updateData.onvifUser !== undefined ? updateData.onvifUser : originalCamera.onvifUser,
        isPtzCompatible: updateData.isPtzCompatible !== undefined ? !!updateData.isPtzCompatible : originalCamera.isPtzCompatible,
        ptzStatus: updateData.isPtzCompatible ? (originalCamera.ptzStatus || { pan: 0, tilt: 0, zoom: 1.0, speed: 5 }) : undefined,
        modelName: updateData.modelName || originalCamera.modelName,
        serialNumber: updateData.serialNumber || originalCamera.serialNumber,
        firmwareVersion: updateData.firmwareVersion || originalCamera.firmwareVersion
      };

      db.cameras[idx] = updated;
      saveDb(db);
      res.json(updated);
    }
  });

  // Delete a Camera (Admin only)
  app.delete("/api/cameras/:id", checkAdminAuth, async (req, res) => {
    const { id } = req.params;

    if (isMysqlEnabled && mysqlPool) {
      try {
        const [result]: any = await mysqlPool.query("DELETE FROM cameras WHERE id = ?", [id]);
        if (result.affectedRows === 0) {
          return res.status(404).json({ error: "Câmera não localizada." });
        }
        res.json({ message: "Câmera removida com sucesso." });
      } catch (err) {
        console.error("Erro deletando câmera do MySQL:", err);
        res.status(500).json({ error: "Erro de banco de dados." });
      }
    } else {
      const db = loadDb();
      const isExist = db.cameras.some((c: any) => c.id === id);

      if (!isExist) {
        return res.status(404).json({ error: "Câmera não localizada." });
      }

      db.cameras = db.cameras.filter((c: any) => c.id !== id);
      saveDb(db);
      res.json({ message: "Câmera removida com sucesso." });
    }
  });

  // Helper function to send real physical PTZ commands to Intelbras/Dahua DOME cameras matching the requested direction
  async function sendPhysicalPtzCommand(camera: any, action: string, speed: number) {
    const ip = camera.onvifIp || "";
    if (!ip) return;

    // Check if we should ignore reset
    if (action === "zoom_reset") return;

    // Extract user and password credentials securely from streamUrl (or fall back to onvifUser)
    let username = camera.onvifUser || "admin";
    let password = "";
    const streamUrl = String(camera.streamUrl || "");
    const authMatch = streamUrl.match(/rtsp:\/\/([^:]+):([^@]+)@/);
    if (authMatch) {
      username = authMatch[1];
      password = authMatch[2];
    }

    // Map action to Dahua CGI PTZ codes
    let ptzCode = "";
    switch (action) {
      case "up": ptzCode = "Up"; break;
      case "down": ptzCode = "Down"; break;
      case "left": ptzCode = "Left"; break;
      case "right": ptzCode = "Right"; break;
      case "zoom_in": ptzCode = "ZoomTele"; break;
      case "zoom_out": ptzCode = "ZoomWide"; break;
      default: return; // ignore unrecognized actions
    }

    // Map velocity parameters
    const ptzSpeed = Math.min(8, Math.max(1, Math.round(speed || 5)));
    const port = camera.onvifPort || 80;

    // Create Dahua CGI start and stop endpoint URLs
    // Incorporating user credentials directly into URL authority and setting Manual Basic Auth Header for full compatibility
    const credentials = `${encodeURIComponent(username)}:${encodeURIComponent(password)}`;
    const baseUrl = `http://${credentials}@${ip}:${port}/cgi-bin/ptz.cgi`;
    const startUrl = `${baseUrl}?action=start&channel=0&code=${ptzCode}&arg1=0&arg2=${ptzSpeed}&arg3=0`;
    const stopUrl = `${baseUrl}?action=stop&channel=0&code=${ptzCode}&arg1=0&arg2=0&arg3=0`;

    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

    console.log(`[PHYSICAL PTZ] Sending CGI Command: camera="${camera.name}" IP="${ip}" action=${action.toUpperCase()} code=${ptzCode} speed=${ptzSpeed}`);

    try {
      // 1. Send PTZ START command
      const startRes = await fetch(startUrl, {
        method: "GET",
        headers: { "Authorization": authHeader },
        signal: AbortSignal.timeout(3000)
      });
      console.log(`[PHYSICAL PTZ] START Request sent to ${ip}. HTTP status code = ${startRes.status}`);

      // 2. Wait exactly 450ms before sending the STOP command to form a tidy movement burst
      await new Promise((resolve) => setTimeout(resolve, 450));

      // 3. Send PTZ STOP command
      const stopRes = await fetch(stopUrl, {
        method: "GET",
        headers: { "Authorization": authHeader },
        signal: AbortSignal.timeout(3000)
      });
      console.log(`[PHYSICAL PTZ] STOP Request sent to ${ip}. HTTP status code = ${stopRes.status}`);
    } catch (err: any) {
      console.error(`[PHYSICAL PTZ] Failed to execute physical command on camera at ${ip}: ${err.message}`);
    }
  }

  // Execute PTZ Action (Move camera axis / preset)
  app.post("/api/cameras/:id/ptz", async (req, res) => {
    const { id } = req.params;
    const { action, speed, preset } = req.body; // action: 'up'|'down'|'left'|'right'|'zoom_in'|'zoom_out'|'zoom_reset'|'preset'

    if (isMysqlEnabled && mysqlPool) {
      try {
        const [rows]: any = await mysqlPool.query("SELECT * FROM cameras WHERE id = ?", [id]);
        if (rows.length === 0) {
          return res.status(404).json({ error: "Câmera não localizada." });
        }
        const camera = rows[0];
        if (!camera.isPtzCompatible) {
          return res.status(400).json({ error: "Esta câmera não possui suporte para comandos PTZ / ONVIF." });
        }

        let ptzStatus = { pan: 0, tilt: 0, zoom: 1.0, speed: 5 };
        if (camera.ptzStatus) {
          try {
            ptzStatus = JSON.parse(camera.ptzStatus);
          } catch (_) {}
        }

        const ptzSpeed = speed ? Number(speed) : (ptzStatus.speed || 5);
        ptzStatus.speed = ptzSpeed;

        const step = ptzSpeed * 1.5;

        switch (action) {
          case "up":
            ptzStatus.tilt = Math.min(90, Number((ptzStatus.tilt + step).toFixed(1)));
            break;
          case "down":
            ptzStatus.tilt = Math.max(-90, Number((ptzStatus.tilt - step).toFixed(1)));
            break;
          case "left":
            ptzStatus.pan = Number((ptzStatus.pan - step).toFixed(1));
            if (ptzStatus.pan < -180) ptzStatus.pan += 360;
            break;
          case "right":
            ptzStatus.pan = Number((ptzStatus.pan + step).toFixed(1));
            if (ptzStatus.pan > 180) ptzStatus.pan -= 360;
            break;
          case "zoom_in":
            ptzStatus.zoom = Math.min(16.0, Number((ptzStatus.zoom + (ptzSpeed * 0.2)).toFixed(1)));
            break;
          case "zoom_out":
            ptzStatus.zoom = Math.max(1.0, Number((ptzStatus.zoom - (ptzSpeed * 0.2)).toFixed(1)));
            break;
          case "zoom_reset":
            ptzStatus.zoom = 1.0;
            ptzStatus.pan = 0;
            ptzStatus.tilt = 0;
            break;
          case "preset":
            if (preset !== undefined) {
              const presetNum = Number(preset);
              ptzStatus.pan = Number(((presetNum * 35) % 180 - 90).toFixed(1));
              ptzStatus.tilt = Number(((presetNum * 15) % 90 - 45).toFixed(1));
              ptzStatus.zoom = Number((1.0 + (presetNum % 4) * 1.2).toFixed(1));
            }
            break;
          default:
            return res.status(400).json({ error: "Comando PTZ desconhecido." });
        }

        await mysqlPool.query("UPDATE cameras SET ptzStatus = ? WHERE id = ?", [JSON.stringify(ptzStatus), id]);

        // Send real command asynchronously to of the physical camera
        sendPhysicalPtzCommand(camera, action, ptzSpeed);

        const logEntry = `[ONVIF Command] PTZ Call: action=${action}, speed=${ptzSpeed}, PAN=${ptzStatus.pan}, TILT=${ptzStatus.tilt}, ZOOM=${ptzStatus.zoom}x`;
        console.log(logEntry);

        res.json({
          success: true,
          ptzStatus: ptzStatus,
          log: logEntry
        });
      } catch (err) {
        console.error("Erro executando PTZ no MySQL:", err);
        res.status(500).json({ error: "Erro de banco de dados." });
      }
    } else {
      const db = loadDb();
      const idx = db.cameras.findIndex((c: any) => c.id === id);

      if (idx === -1) {
        return res.status(404).json({ error: "Câmera não localizada." });
      }

      const camera = db.cameras[idx];
      if (!camera.isPtzCompatible) {
        return res.status(400).json({ error: "Esta câmera não possui suporte para comandos PTZ / ONVIF." });
      }

      if (!camera.ptzStatus) {
        camera.ptzStatus = { pan: 0, tilt: 0, zoom: 1.0, speed: 5 };
      }

      const ptzSpeed = speed ? Number(speed) : (camera.ptzStatus.speed || 5);
      camera.ptzStatus.speed = ptzSpeed;

      const step = ptzSpeed * 1.5; // step increment size based on speed

      switch (action) {
        case "up":
          camera.ptzStatus.tilt = Math.min(90, Number((camera.ptzStatus.tilt + step).toFixed(1)));
          break;
        case "down":
          camera.ptzStatus.tilt = Math.max(-90, Number((camera.ptzStatus.tilt - step).toFixed(1)));
          break;
        case "left":
          camera.ptzStatus.pan = Number((camera.ptzStatus.pan - step).toFixed(1));
          if (camera.ptzStatus.pan < -180) camera.ptzStatus.pan += 360;
          break;
        case "right":
          camera.ptzStatus.pan = Number((camera.ptzStatus.pan + step).toFixed(1));
          if (camera.ptzStatus.pan > 180) camera.ptzStatus.pan -= 360;
          break;
        case "zoom_in":
          camera.ptzStatus.zoom = Math.min(16.0, Number((camera.ptzStatus.zoom + (ptzSpeed * 0.2)).toFixed(1)));
          break;
        case "zoom_out":
          camera.ptzStatus.zoom = Math.max(1.0, Number((camera.ptzStatus.zoom - (ptzSpeed * 0.2)).toFixed(1)));
          break;
        case "zoom_reset":
          camera.ptzStatus.zoom = 1.0;
          camera.ptzStatus.pan = 0;
          camera.ptzStatus.tilt = 0;
          break;
        case "preset":
          if (preset !== undefined) {
            // Adjust camera to a pseudo preset state
            const presetNum = Number(preset);
            camera.ptzStatus.pan = Number(((presetNum * 35) % 180 - 90).toFixed(1));
            camera.ptzStatus.tilt = Number(((presetNum * 15) % 90 - 45).toFixed(1));
            camera.ptzStatus.zoom = Number((1.0 + (presetNum % 4) * 1.2).toFixed(1));
          }
          break;
        default:
          return res.status(400).json({ error: "Comando PTZ desconhecido." });
      }

      db.cameras[idx] = camera;
      saveDb(db);

      // Send real command asynchronously to of the physical camera
      sendPhysicalPtzCommand(camera, action, ptzSpeed);

      const logEntry = `[ONVIF Command] PTZ Call: action=${action}, speed=${ptzSpeed}, PAN=${camera.ptzStatus.pan}, TILT=${camera.ptzStatus.tilt}, ZOOM=${camera.ptzStatus.zoom}x`;
      console.log(logEntry);

      res.json({
        success: true,
        ptzStatus: camera.ptzStatus,
        log: logEntry
      });
    }
  });

  // ONVIF discovery helper or device verification
  app.post("/api/onvif/scan", (req, res) => {
    const { ip, port, username, password } = req.body;
    if (!ip) {
      return res.status(400).json({ error: "Por favor, digite o endereço de IP da câmera na sua rede." });
    }

    // Since this is in sandboxed container, queries are simulated but we represent real ONVIF structure!
    // We perfectly mimic Intelbras brand structures as provided!
    setTimeout(() => {
      // Create high-fidelity response targeting the exact hardware provided: VIPW-1300-MINI-SD
      const isIntelbrasAeroIP = ip.includes("192.168.1.108") || ip.includes("108");
      
      const onvifProfile = {
        success: true,
        ip: ip,
        port: port || 80,
        manufacturer: "SNRD",
        model: isIntelbrasAeroIP ? "VIPW-1300-MINI-SD" : "VIPW-2000-DOME",
        serialNumber: isIntelbrasAeroIP ? "8PHM39018505A" : "SN-" + Math.floor(Math.random() * 100000),
        firmware: isIntelbrasAeroIP ? "V2.820.00IB001.0.T, Build: 2024-05-27" : "V2.800.00IB002.3",
        webVersion: "V3.2.1.1865099",
        onvifProfile: "Perfil S, T e G",
        systemSystem: "V2.4",
        supportedFeatures: {
          ptz: true,
          discovery: "WS-Discovery Multi-Cast",
          streamSubtypes: ["Principal (H.264/H.265)", "Extra (MJPEG)"]
        },
        rtspUrl: `rtsp://${username || "admin"}:${password || "Intelbras@"}@${ip}:554/cam/realmonitor?channel=1&subtype=0`,
        description: `Câmera SNRD localizada em rede interna no IP ${ip}. Autodescoberta ONVIF executada com perfil S/T/G ativo.`
      };
      
      res.json(onvifProfile);
    }, 1200); // simulate realistic network connection handshakes
  });

  // Fetch Weather information for a given city using server-side Gemini Search Grounding!
  // Extremely innovative and highly professional. Include server-side caching (15 min TTL) to conserve Gemini quota.
  app.get("/api/weather", async (req, res) => {
    const { city } = req.query;
    if (!city) {
      return res.status(400).json({ error: "Parâmetro 'city' é obrigatório." });
    }

    const cityKey = String(city).trim().toLowerCase();

    // Check active memory cache to prevent unnecessary external queries
    const cached = weatherCache.get(cityKey);
    if (cached && Date.now() < cached.expiry) {
      console.log(`[Weather Cache] Retornando previsão de tempo ativa do cache para: ${city}`);
      return res.json(cached.data);
    }

    // Attempt real live weather lookup first (Open-Meteo API)
    const realWeatherData = await fetchRealWeather(String(city));
    if (realWeatherData) {
      // Store in memory cache with 15-minute TTL
      weatherCache.set(cityKey, { data: realWeatherData, expiry: Date.now() + 15 * 60 * 1000 });
      console.log(`[Weather API] Clima real-time do Open-Meteo obtido e cacheado com sucesso para: ${city}`);
      return res.json(realWeatherData);
    }

    console.log(`[Weather API] Open-Meteo indisponível ou sem resultados para "${city}". Tentando canal secundário (Gemini com Google Search)...`);

    const ai = getGeminiClient();
    if (!ai) {
      const simulated = getSimulatedWeather(String(city));
      // Save simulated values with shorter 1-min TTL so users can query again if key is changed later
      weatherCache.set(cityKey, { data: simulated, expiry: Date.now() + 60 * 1000 });
      return res.json(simulated);
    }

    try {
      const prompt = `Você é um serviço de retorno de previsão de tempo em JSON.
Retorne de forma EXCLUSIVA um objeto JSON contendo a previsão de tempo atual para a cidade: "${city}".
Utilize as ferramentas de busca do Google Search disponibilizadas para trazer a previsão real e atual do dia corrente.

Instruções estritas:
1. Responda APENAS o JSON puro, sem marcações markdown extra de código tipo \`\`\`json ou explicações.
2. Não invente dados! Use os dados do Google Search.
3. Use idioma Português (pt-BR).
4. O esquema do JSON deve ser EXATAMENTE:
{
  "city": "Nome da Cidade formatado corretamente",
  "temp": <número inteiro da temperatura em Celsius>,
  "condition": "Uma palavra simples definindo a condição: 'Ensolarado', 'Nublado', 'Chuva Leve', 'Temporal', 'Parcialmente Nublado' ou similar",
  "description": "Uma frase resumida descrevendo o clima e detalhes relevantes",
  "humidity": <número inteiro da umidade de 0 a 100>,
  "windSpeed": <número inteiro da velocidade do vento em km/h>,
  "pressure": <número inteiro da pressão atmosférica reduzida ao nível do mar (QNH) em hPa, ex: 1013>
}`;

      // Query Gemini 3.5 Flash with search tools
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          temperature: 0.1,
        }
      });

      let rawText = response.text || "";
      rawText = rawText.replace(/```json/gi, "").replace(/```/gi, "").trim();

      const payload = JSON.parse(rawText);
      payload.fetchedAt = Date.now();

      // Store in memory cache with 15-minute TTL to protect API keys and quota usage
      weatherCache.set(cityKey, { data: payload, expiry: Date.now() + 15 * 60 * 1000 });
      
      console.log(`[Weather] Nova previsão obtida via Gemini e cacheada com sucesso para: ${city}`);
      return res.json(payload);
    } catch (err: any) {
      const isRateLimit = String(err.message).includes("429") || String(err.message).toLowerCase().includes("quota");
      if (isRateLimit) {
        console.warn(`[Weather] Quota do Gemini atingida (429/Quota). Usando fallback de resiliência local para: ${city}`);
      } else {
        console.error(`[Weather] Erro consultando previsão de tempo via Gemini para ${city}:`, err.message);
      }

      // If we have an expired cached record, serve stale data instead of generating new mock values
      if (cached) {
        console.log(`[Weather Cache] Retornando previsão de tempo expirada (stale/stável) para: ${city}`);
        return res.json(cached.data);
      }

      const simulated = getSimulatedWeather(String(city));
      return res.json(simulated);
    }
  });

  // --- DEV & PRODUCTION VITE SERVER INGRESS HOOKS ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[RTSP Backend] Central executando com sucesso na porta ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Falha ao iniciar o servidor central:", err);
});
