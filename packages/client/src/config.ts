const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, '') || '/mahjong-recording';

export const config = {
  basePath: BASE_PATH,
  apiUrl: `${BASE_PATH}/api`,
  wsUrl: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${BASE_PATH}/ws`,
};
