#!/bin/bash

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Gerenciador de Instalação Multi-SaaS Unity ===${NC}"

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Por favor, execute como root (sudo ./gerenciar.sh)${NC}"
  exit
fi

# ==========================================
# 0. Menu Principal: Ação
# ==========================================
echo -e "${BLUE}O que você deseja fazer?${NC}"
echo "1) Instalar ou Atualizar um Sistema"
echo "2) Desinstalar um Sistema existente"
echo "3) Sair"
read ACTION_CHOICE

if [ "$ACTION_CHOICE" -eq 3 ]; then exit 0; fi

# ==========================================
# 1. Seleção do Sistema
# ==========================================
echo -e "${YELLOW}Selecione o Sistema:${NC}"
echo "1) Opa Suite Dashboard (Porta 3000)"
echo "2) Unity Score SaaS (Porta 3001)"
echo "3) Pastoral da Catequese (Porta 3004)"
echo "4) ITL Cursos (Porta 3003)"
echo "5) Rastreae (Porta 3002)"
echo "6) iWedding SaaS (Porta 3005)"
echo "7) StreamControl (Porta 3006)"
echo "8) Unity DVR (Porta 3007)"
echo "9) Unity Tax Manager (Porta 3008)"
echo "10) VooSimples (Porta 3009)"
echo "11) Unity Comprovantes (Porta 3010)"
echo "12) Bolão da Copa - Provedor ISP (Porta 3011)"
echo "13) Central de Câmeras SNRD (Porta 3012)"
read SYSTEM_CHOICE

case $SYSTEM_CHOICE in
  1)
    SYSTEM_NAME="Opa Suite Dashboard"
    APP_PORT=3000
    PM2_PREFIX="opa-dash-api"
    DEFAULT_DB_NAME="opadashboard"
    DEFAULT_DB_USER="opadash"
    IS_CATEQUESE=0
    ;;
  2)
    SYSTEM_NAME="Unity Score SaaS"
    APP_PORT=3001
    PM2_PREFIX="unity-score-api"
    DEFAULT_DB_NAME="unity_saas"
    DEFAULT_DB_USER="unity_user"
    IS_CATEQUESE=0
    ;;
  3)
    SYSTEM_NAME="Pastoral da Catequese"
    APP_PORT=3004
    PM2_PREFIX="catequese-api"
    DEFAULT_DB_NAME="catequese_db"
    DEFAULT_DB_USER="catequese_user"
    IS_CATEQUESE=1
    ;;
  4)
    SYSTEM_NAME="ITL Cursos"
    APP_PORT=3003
    PM2_PREFIX="itl-cursos-api"
    DEFAULT_DB_NAME="itl_cursos"
    DEFAULT_DB_USER="itl_user"
    IS_CATEQUESE=0
    ;;
  5)
    SYSTEM_NAME="Rastreae"
    APP_PORT=3002
    PM2_PREFIX="rastreae-api"
    DEFAULT_DB_NAME="rastreae_db"
    DEFAULT_DB_USER="rastreae_user"
    IS_CATEQUESE=0
    ;;
  6)
    SYSTEM_NAME="iWedding SaaS"
    APP_PORT=3005
    PM2_PREFIX="iwedding-api"
    DEFAULT_DB_NAME="iwedding_db"
    DEFAULT_DB_USER="iwedding_user"
    IS_CATEQUESE=0
    ;;
  7)
    SYSTEM_NAME="StreamControl"
    APP_PORT=3006
    PM2_PREFIX="streamcontrol-api"
    DEFAULT_DB_NAME="streamcontrol"
    DEFAULT_DB_USER="stream_user"
    IS_CATEQUESE=0
    ;;
  8)
    SYSTEM_NAME="Unity DVR"
    APP_PORT=3007
    PM2_PREFIX="unity-dvr-api"
    DEFAULT_DB_NAME="unity_dvr"
    DEFAULT_DB_USER="dvr_user"
    IS_CATEQUESE=0
    ;;
  9)
    SYSTEM_NAME="Unity Tax Manager"
    APP_PORT=3008
    PM2_PREFIX="unity-tax-api"
    DEFAULT_DB_NAME="unity_tax_db"
    DEFAULT_DB_USER="tax_user"
    IS_CATEQUESE=0
    ;;
  10)
    SYSTEM_NAME="VooSimples"
    APP_PORT=3009
    PM2_PREFIX="voosimples-api"
    DEFAULT_DB_NAME="voosimples_db"
    DEFAULT_DB_USER="voos_user"
    IS_CATEQUESE=0
    ;;
  11)
    SYSTEM_NAME="Unity Comprovantes"
    APP_PORT=3010
    PM2_PREFIX="unity-comprovantes-api"
    DEFAULT_DB_NAME="unity_comprovantes"
    DEFAULT_DB_USER="comprovantes_user"
    IS_CATEQUESE=0
    ;;
  12)
    SYSTEM_NAME="Bolão da Copa - Provedor ISP"
    APP_PORT=3011
    PM2_PREFIX="bolao-copa-api"
    DEFAULT_DB_NAME="copa_bolao_db"
    DEFAULT_DB_USER="copa_user"
    IS_CATEQUESE=0
    ;;
  13)
    SYSTEM_NAME="Central de Câmeras SNRD"
    APP_PORT=3012
    PM2_PREFIX="snrd-cameras-api"
    DEFAULT_DB_NAME="snrd_cameras"
    DEFAULT_DB_USER="snrd_user"
    IS_CATEQUESE=0
    ;;
  *)
    echo -e "${RED}Opção inválida.${NC}"
    exit 1
    ;;
esac

# ==========================================
# LÓGICA DE DESINSTALAÇÃO
# ==========================================
if [ "$ACTION_CHOICE" -eq 2 ]; then
    echo -e "${RED}=== MODO DE DESINSTALAÇÃO ===${NC}"
    echo -e "${YELLOW}Digite o domínio do sistema que deseja remover (ex: app.seudominio.com):${NC}"
    read DOMAIN

    if [ -z "$DOMAIN" ]; then
      echo -e "${RED}Domínio é obrigatório para localizar a instalação.${NC}"
      exit 1
    fi

    APP_DIR="/var/www/$DOMAIN"
    SAFE_DOMAIN_SUFFIX=$(echo $DOMAIN | tr '.' '-')
    PM2_NAME="${PM2_PREFIX}-${SAFE_DOMAIN_SUFFIX}"

    echo -e "${RED}ATENÇÃO: Você está prestes a remover:${NC}"
    echo -e "Sistema: $SYSTEM_NAME"
    echo -e "Domínio: $DOMAIN"
    echo -e "Processo PM2: $PM2_NAME"
    echo ""
    echo -e "${YELLOW}Tem certeza que deseja prosseguir? (s/n)${NC}"
    read CONFIRM

    if [ "$CONFIRM" != "s" ] && [ "$CONFIRM" != "S" ]; then
        echo "Operação cancelada."
        exit 0
    fi

    echo -e "${YELLOW}1. Parando e removendo processo PM2...${NC}"
    pm2 delete "$PM2_NAME" 2>/dev/null
    pm2 save

    echo -e "${YELLOW}2. Removendo configurações do Nginx...${NC}"
    rm -f "/etc/nginx/sites-available/$DOMAIN"
    rm -f "/etc/nginx/sites-enabled/$DOMAIN"
    systemctl reload nginx

    echo -e "${YELLOW}3. Removendo Certificado SSL (se existir)...${NC}"
    certbot delete --cert-name "$DOMAIN" --non-interactive 2>/dev/null

    echo -e "${YELLOW}4. Removendo arquivos da aplicação...${NC}"
    if [ -d "$APP_DIR" ]; then
        rm -rf "$APP_DIR"
        echo "Diretório $APP_DIR removido."
    fi

    echo -e "${YELLOW}5. Banco de Dados${NC}"
    echo -e "${RED}Deseja EXCLUIR o Banco de Dados? (s/n)${NC}"
    read DB_CONFIRM

    if [ "$DB_CONFIRM" == "s" ] || [ "$DB_CONFIRM" == "S" ]; then
        echo -e "${YELLOW}Digite o NOME EXATO do banco de dados para excluir:${NC}"
        read DB_TO_DELETE
        if [ ! -z "$DB_TO_DELETE" ]; then
            echo -e "Digite a senha root do MySQL:"
            read -s DB_ROOT_PASS
            mysql -u root -p"$DB_ROOT_PASS" -e "DROP DATABASE IF EXISTS \`${DB_TO_DELETE}\`;"
            echo -e "${GREEN}Banco removido.${NC}"
        fi
    fi

    echo -e "${GREEN}=== Desinstalação Concluída! ===${NC}"
    exit 0
fi

# ==========================================
# LÓGICA DE INSTALAÇÃO / ATUALIZAÇÃO
# ==========================================

echo -e "${GREEN}>> Selecionado: $SYSTEM_NAME${NC}"

echo -e "${YELLOW}Digite o domínio (ex: app.seudominio.com):${NC}"
read DOMAIN
if [ -z "$DOMAIN" ]; then exit 1; fi

APP_DIR="/var/www/$DOMAIN"
SAFE_DOMAIN_SUFFIX=$(echo $DOMAIN | tr '.' '-')
PM2_NAME="${PM2_PREFIX}-${SAFE_DOMAIN_SUFFIX}"

# Verifica se é atualização
IS_UPDATE=0
if [ -d "$APP_DIR/.git" ]; then IS_UPDATE=1; fi

# Coleta de dados do Banco com preenchimento automático a partir de .env existente se disponível
EXISTING_DB_HOST="localhost"
EXISTING_DB_USER="${DEFAULT_DB_USER}"
EXISTING_DB_NAME="${DEFAULT_DB_NAME}"
EXISTING_DB_PASSWORD=""
EXISTING_APP_PORT="${APP_PORT}"

if [ -f "$APP_DIR/.env" ]; then
  VAL_HOST=$(grep -E "^DB_HOST=" "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  VAL_USER=$(grep -E "^DB_USER=" "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  VAL_NAME=$(grep -E "^DB_NAME=" "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  VAL_PASS=$(grep -E "^DB_PASSWORD=" "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  VAL_PORT=$(grep -E "^PORT=" "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")

  if [ ! -z "$VAL_HOST" ]; then EXISTING_DB_HOST="$VAL_HOST"; fi
  if [ ! -z "$VAL_USER" ]; then EXISTING_DB_USER="$VAL_USER"; fi
  if [ ! -z "$VAL_NAME" ]; then EXISTING_DB_NAME="$VAL_NAME"; fi
  if [ ! -z "$VAL_PASS" ]; then EXISTING_DB_PASSWORD="$VAL_PASS"; fi
  if [ ! -z "$VAL_PORT" ]; then EXISTING_APP_PORT="$VAL_PORT"; fi
fi

# Coleta de dados do Banco
echo -e "${YELLOW}Configuração do Banco de Dados MySQL:${NC}"
echo -e "Nome do Banco [${EXISTING_DB_NAME}]:"
read DB_NAME
DB_NAME=${DB_NAME:-$EXISTING_DB_NAME}

echo -e "Usuário do Banco [${EXISTING_DB_USER}]:"
read DB_USER
DB_USER=${DB_USER:-$EXISTING_DB_USER}

if [ ! -z "$EXISTING_DB_PASSWORD" ]; then
  echo -e "Senha do Banco [Pressione Enter para manter a senha atual secreta]:"
  read -s DB_PASSWORD
  DB_PASSWORD=${DB_PASSWORD:-$EXISTING_DB_PASSWORD}
else
  echo -e "Senha do Banco:"
  read -s DB_PASSWORD
fi
echo

if [ $IS_UPDATE -eq 0 ]; then
    echo -e "${YELLOW}Digite a URL do repositório GitHub:${NC}"
    read REPO_URL
fi

# Instalação de dependências do sistema (com suporte a RTMP por módulo do Nginx)
apt update && apt install -y nginx libnginx-mod-rtmp certbot python3-certbot-nginx curl git mysql-server build-essential ffmpeg gnupg ca-certificates

# Configuração automática do módulo RTMP no Nginx para receber os fluxos de câmeras empurrados
if [ -f /etc/nginx/nginx.conf ] && ! grep -q "rtmp {" /etc/nginx/nginx.conf; then
    echo -e "${YELLOW}Configurando bloco RTMP em /etc/nginx/nginx.conf...${NC}"
    cat >> /etc/nginx/nginx.conf <<EOL

rtmp {
    server {
        listen 1935;
        chunk_size 4096;

        application live {
            live on;
            record off;
            meta copy;
        }
    }
}
EOL
    echo -e "${GREEN}Módulo RTMP configurado com sucesso na porta 1935!${NC}"
fi

# Configuração de Firewall para a porta RTMP (1935)
if command -v ufw &> /dev/null; then
    echo -e "${YELLOW}Liberando porta RTMP 1935/tcp no UFW...${NC}"
    ufw allow 1935/tcp
fi
if command -v iptables &> /dev/null; then
    echo -e "${YELLOW}Liberando porta RTMP 1935/tcp no iptables...${NC}"
    iptables -A INPUT -p tcp --dport 1935 -j ACCEPT
fi

# Instalação do Node.js v20 LTS e PM2 para Ubuntu 24.04 (se não estiver instalado)
if ! command -v node &> /dev/null || ! command -v npm &> /dev/null; then
    echo -e "${YELLOW}Node.js/npm não encontrados. Instalando Node.js v20 LTS via NodeSource...${NC}"
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
    apt update
    apt install -y nodejs
fi

# Instalação global do PM2 se necessário
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}PM2 não encontrado. Instalando PM2 globalmente via npm...${NC}"
    npm install -g pm2
fi

# Configuração MySQL (Apenas cria se o banco e usuário forem fornecidos)
if [ ! -z "$DB_PASSWORD" ]; then
    mysql -u root -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME};"
    mysql -u root -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_PASSWORD}';"
    mysql -u root -e "ALTER USER '${DB_USER}'@'localhost' IDENTIFIED WITH mysql_native_password BY '${DB_PASSWORD}';"
    mysql -u root -e "GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';"
    mysql -u root -e "FLUSH PRIVILEGES;"
fi

# Download do código
mkdir -p $APP_DIR
if [ $IS_UPDATE -eq 1 ]; then
    cd $APP_DIR && git pull
else
    git clone $REPO_URL $APP_DIR
    cd $APP_DIR
fi

# Executa as tabelas SQL da aplicação (para Unity Comprovantes ou Central de Câmeras SNRD se for instalação nova)
if ( [ "$SYSTEM_CHOICE" -eq 11 ] || [ "$SYSTEM_CHOICE" -eq 13 ] ) && [ $IS_UPDATE -eq 0 ] && [ -f "$APP_DIR/schema.sql" ] && [ ! -z "$DB_PASSWORD" ]; then
    echo -e "${YELLOW}Executando estrutura schema.sql no banco de dados ${DB_NAME}...${NC}"
    mysql -u "${DB_USER}" -p"${DB_PASSWORD}" "${DB_NAME}" < "$APP_DIR/schema.sql" 2>/dev/null || {
      # Fallback com usuário root se houver algum erro de permissão inicial temporário
      mysql -u root "${DB_NAME}" < "$APP_DIR/schema.sql"
    }
fi

# Configuração e Build
if [ "$IS_CATEQUESE" -eq 1 ]; then
    # Lógica Pastoral da Catequese
    cd "$APP_DIR/server"
    npm install
    cat > .env <<EOL
DB_HOST=localhost
DB_USER=${DB_USER}
DB_PASSWORD="${DB_PASSWORD}"
DB_NAME=${DB_NAME}
PORT=${APP_PORT}
EOL
    cd "$APP_DIR"
    npm install && npm run build
    PM2_START_DIR="$APP_DIR/server"
    PM2_SCRIPT="index.js"
else
    # Lógica Genérica
    cd $APP_DIR

    # Gerar um JWT_SECRET aleatório se não existir
    SECRET_KEY=$(openssl rand -base64 32)
    if [ -f .env ]; then
      EXISTING_SECRET=$(grep -E "^JWT_SECRET=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")
      if [ ! -z "$EXISTING_SECRET" ]; then
        SECRET_KEY="$EXISTING_SECRET"
      fi
    fi

    cat > .env <<EOL
PORT=${APP_PORT}
DB_HOST=localhost
DB_USER=${DB_USER}
DB_PASSWORD="${DB_PASSWORD}"
DB_NAME=${DB_NAME}
NODE_ENV=production
JWT_SECRET="${SECRET_KEY}"
DATABASE_URL="mysql://${DB_USER}:${DB_PASSWORD}@localhost:3306/${DB_NAME}"
EOL
    npm install && npm run build
    PM2_START_DIR="$APP_DIR"

    # Para sistemas que usam server.ts ou compilados
    if [ -f "dist/server.cjs" ]; then
        PM2_SCRIPT="dist/server.cjs"
    elif [ -f "server.js" ]; then
        PM2_SCRIPT="server.js"
    elif [ -f "server/index.ts" ]; then
        PM2_SCRIPT="server/index.ts"
    else
        PM2_SCRIPT="server.ts"
    fi
fi

# PM2
cd $PM2_START_DIR
pm2 delete $PM2_NAME 2>/dev/null
if [[ "$PM2_SCRIPT" == *.ts ]]; then
    PORT=$APP_PORT pm2 start "npx tsx $PM2_SCRIPT" --name "$PM2_NAME"
else
    PORT=$APP_PORT pm2 start "$PM2_SCRIPT" --name "$PM2_NAME"
fi
pm2 save

# Nginx
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
WEB_ROOT="$APP_DIR/dist"
if [ ! -d "$WEB_ROOT" ] && [ -d "$APP_DIR/build" ]; then WEB_ROOT="$APP_DIR/build"; fi

cat > $NGINX_CONF <<EOL
server {
    listen 80;
    server_name $DOMAIN;
    root $WEB_ROOT;
    index index.html;
    client_max_body_size 200M;

    location /api {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }

    location /recordings {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /uploads {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        # Configuração para persistência de uploads
        client_max_body_size 200M;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Inclusão de configurações personalizadas (opcional)
    # Se você criar um arquivo chamado ${DOMAIN}.custom dentro de /etc/nginx/sites-available/
    # ele será incluído aqui automaticamente.
    include /etc/nginx/sites-available/${DOMAIN}.custom*;
}
EOL
ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t && systemctl restart nginx

# SSL
certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN --redirect

echo -e "${GREEN}=== Processo Concluído! ===${NC}"
echo -e "URL: https://$DOMAIN"
echo -e "Porta: $APP_PORT"
echo -e "PM2: $PM2_NAME"
