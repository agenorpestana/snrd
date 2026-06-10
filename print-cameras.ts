import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

async function main() {
  const DB_FILE = path.join(process.cwd(), "cameras.json");
  console.log("=== Lendo Cameras do cameras.json ===");
  if (fs.existsSync(DB_FILE)) {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    console.log(JSON.stringify(JSON.parse(raw).cameras, null, 2));
  } else {
    console.log("cameras.json não localizado.");
  }

  console.log("\n=== Lendo Cameras do MySQL (se aplicável) ===");
  const hasDbConfig = !!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
  if (!hasDbConfig) {
    console.log("Sem variáveis de ambiente de banco de dados.");
    return;
  }

  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectTimeout: 2000
    });
    const [rows]: any = await conn.query("SELECT * FROM cameras");
    console.log(JSON.stringify(rows, null, 2));
    await conn.end();
  } catch (err: any) {
    console.error("Erro ao conectar no MySQL:", err.message);
  }
}

main();
