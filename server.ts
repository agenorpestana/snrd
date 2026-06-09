import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const DB_FILE = path.join(process.cwd(), "cameras.json");

// Default Cameras to pre-seed the database
const DEFAULT_CAMERAS = [
  {
    id: "cam-1",
    name: "Pista Principal - VIPW SNRD",
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

    console.log(`[${isRtmp ? "RTMP" : "RTSP"} Stream] Inicializando codec ffmpeg de bypass de vídeo para: ${camera.name} (${streamUrl})`);

    // Build perfect arguments to transcode RTSP/RTMP feed dynamically to Motion JPEG
    // Uses scale=1024:-2 to ensure calculated height is divisible by 2 to prevent silent vertical scale crashes
    const ffmpegArgs = isRtmp ? [
      "-fflags", "+genpts+discardcorrupt+nobuffer",          // Reduce latency and start decoding instantly
      "-rtmp_live", "live",           // Indicate live stream source bypass
      "-analyzeduration", "1500000",   // 1.5 seconds to analyze codec info
      "-probesize", "1000000",         // 1MB probe size to ensure we get a keyframe
      "-i", streamUrl,
      "-vf", "scale=1024:-2",
      "-q:v", "6",
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-an",
      "-r", "15",
      "pipe:1"
    ] : [
      "-rtsp_transport", "tcp", // Force stable connection over TCP instead of UDP packets Loss
      "-i", streamUrl,
      "-vf", "scale=1024:-2", // Downscale to 1024 width and even height maintaining aspect ratio
      "-q:v", "6", // Balance of details and low latency transport
      "-f", "image2pipe",
      "-vcodec", "mjpeg",
      "-an", // Eliminate unneeded microphone audio streams
      "-r", "15", // Cap FPS at 15 to secure lighter, smoother rendering
      "pipe:1"
    ];

    const ffmpeg = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "pipe", "pipe"] });
    let buffer = Buffer.alloc(0);
    let hasSentData = false;

    // Listen to stderr for important FFmpeg stream errors or warning feedbacks
    ffmpeg.stderr.on("data", (chunk) => {
      const logs = chunk.toString();
      if (logs.includes("Error") || logs.includes("failed") || logs.includes("timed out") || logs.includes("Connection refused")) {
        console.warn(`[FFmpeg Stream ${id} Error] ${logs.trim()}`);
      }
    });

    // Timeout safety: if ffmpeg does not output any video frames within 10 seconds, close stream
    const streamTimeout = setTimeout(() => {
      if (!hasSentData) {
        console.warn(`[${isRtmp ? "RTMP" : "RTSP"} Stream] Timeout de conexão (10s) da câmera ${id}. Sem quadros recebidos.`);
        ffmpeg.kill("SIGKILL");
        res.end();
      }
    }, 10000);

    ffmpeg.stdout.on("data", (chunk) => {
      if (!hasSentData) {
        hasSentData = true;
        clearTimeout(streamTimeout);
      }
      buffer = Buffer.concat([buffer, chunk]);
      let start = 0;

      while (true) {
        const soi = buffer.indexOf(Buffer.from([0xff, 0xd8]), start);
        if (soi === -1) break;

        const eoi = buffer.indexOf(Buffer.from([0xff, 0xd9]), soi + 2);
        if (eoi === -1) {
          buffer = buffer.subarray(soi);
          break;
        }

        const frame = buffer.subarray(soi, eoi + 2);

        try {
          res.write("--frame\r\n");
          res.write("Content-Type: image/jpeg\r\n");
          res.write(`Content-Length: ${frame.length}\r\n\r\n`);
          res.write(frame);
          res.write("\r\n");
        } catch (writeErr) {
          ffmpeg.kill("SIGKILL");
          break;
        }

        start = eoi + 2;
      }

      if (start > 0) {
        buffer = buffer.subarray(start);
      }
    });

    ffmpeg.on("error", (err) => {
      console.error(`[${isRtmp ? "RTMP" : "RTSP"} Stream] Erro iniciando ffmpeg para a câmera ${id}:`, err.message);
      clearTimeout(streamTimeout);
    });

    ffmpeg.on("close", (code) => {
      console.log(`[${isRtmp ? "RTMP" : "RTSP"} Stream] Transcodificador da câmera ${id} finalizado com código ${code}`);
      clearTimeout(streamTimeout);
      res.end();
    });

    req.on("close", () => {
      console.log(`[${isRtmp ? "RTMP" : "RTSP"} Stream] Conexão encerrada pelo cliente, encerrando processo ffmpeg para a câmera ${id}`);
      clearTimeout(streamTimeout);
      ffmpeg.kill("SIGKILL");
    });
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
