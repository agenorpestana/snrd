export interface Camera {
  id: string;
  name: string;
  streamUrl: string;
  city: string;
  description: string;
  onvifIp?: string;
  onvifPort?: number;
  onvifUser?: string;
  isPtzCompatible: boolean;
  ptzStatus?: {
    pan: number;
    tilt: number;
    zoom: number;
    speed: number;
  };
  modelName?: string;
  serialNumber?: string;
  firmwareVersion?: string;
}

export interface WeatherInfo {
  city: string;
  temp: number;
  condition: string;
  description: string;
  humidity: number;
  windSpeed: number;
  icon?: string;
  fetchedAt: number;
}

export interface ONVIFDevice {
  ip: string;
  port: number;
  manufacturer: string;
  model: string;
  serialNumber: string;
  firmware: string;
  rtspUrl: string;
}
