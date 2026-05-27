import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.financeiro.dashboard',
  appName: 'Financeiro Dashboard',
  webDir: 'www',
  server: {
    url: 'https://antarctica-ultram-grain-progressive.trycloudflare.com/?app=android',
    cleartext: false,
    androidScheme: 'https',
  },
};

export default config;
