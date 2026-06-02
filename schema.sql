-- Schema de banco de dados para a Central de Câmeras SNRD
-- Criado para instalação de produção em ambientes VPS modernos

CREATE TABLE IF NOT EXISTS `settings` (
  `key_name` VARCHAR(100) NOT NULL,
  `value_text` TEXT NULL,
  PRIMARY KEY (`key_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(55) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` VARCHAR(50) DEFAULT 'admin',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cameras` (
  `id` VARCHAR(50) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `streamUrl` TEXT NOT NULL,
  `city` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `onvifIp` VARCHAR(100) NULL,
  `onvifPort` INT DEFAULT 80,
  `onvifUser` VARCHAR(100) NULL,
  `isPtzCompatible` TINYINT(1) DEFAULT 0,
  `ptzStatus` TEXT NULL,
  `modelName` VARCHAR(255) NULL,
  `serialNumber` VARCHAR(255) NULL,
  `firmwareVersion` VARCHAR(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed padrão: Senha do Administrador padronizada (antiga)
-- Valor padrão encryptado em SHA-256 é 'admin'
INSERT INTO `settings` (`key_name`, `value_text`) 
VALUES ('adminPasswordHash', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918')
ON DUPLICATE KEY UPDATE `key_name` = `key_name`;

-- Seed padrão: Super usuário administrador do sistema (Novo Padrão)
-- E-mail: suporte@unityautomacoes.com.br | Senha: 200616 (SHA-256)
INSERT INTO `users` (`id`, `email`, `password_hash`, `role`)
VALUES ('user-super', 'suporte@unityautomacoes.com.br', '63b82a7a40b8a1c97efbbffc155518b5bf67d8d21c324bc9eafef135fb0fa4b1', 'admin')
ON DUPLICATE KEY UPDATE `id` = `id`;

-- Seed padrão: Câmeras SNRD de monitoramento inicial
INSERT INTO `cameras` (`id`, `name`, `streamUrl`, `city`, `description`, `onvifIp`, `onvifPort`, `onvifUser`, `isPtzCompatible`, `ptzStatus`, `modelName`, `serialNumber`, `firmwareVersion`)
VALUES 
('cam-1', 'Pista Principal - VIPW SNRD', 'rtsp://admin:intelbras123@192.168.1.108:554/cam/realmonitor?channel=1&subtype=0', 'Joinville', 'Portaria Principal - Vista panorâmica da pista de pouso (VIPW-1300-MINI-SD). Monitoramento de pousos, decolagens e área perimetral.', '192.168.1.108', 80, 'admin', 1, '{"pan":45.2,"tilt":-12.5,"zoom":1.5,"speed":5}', 'VIPW-1300-MINI-SD', '8PHM39018505A', 'V2.820.00IB001.0.T'),
('cam-2', 'Área Externa - Copacabana', 'rtsp://admin:copa2026@192.168.1.150:554/live/ch1', 'Rio de Janeiro', 'Monitoramento de fluxo de pessoas e condições do mar na praia de Copacabana.', '192.168.1.150', 80, 'admin', 1, '{"pan":-15.0,"tilt":5.0,"zoom":1.0,"speed":4}', 'VIPW-2000-DOME', '9BHM81037502B', 'V2.800.00IB002.3.R'),
('cam-3', 'Pátio Interno - Escritório Central', 'rtsp://admin:office789@192.168.0.222:554/mpeg4', 'São Paulo', 'Vista de entrada interna do pátio operacional e estacionamento de veículos de servidores.', '192.168.0.222', 80, 'admin', 0, '{"pan":0,"tilt":0,"zoom":1.0,"speed":1}', 'VIP-1230-BULLET', '7PHN12019904X', 'V1.002.00IB')
ON DUPLICATE KEY UPDATE `id` = `id`;
