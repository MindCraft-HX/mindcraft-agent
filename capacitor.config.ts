import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mindcraft.app',
  appName: 'MindCraft',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
