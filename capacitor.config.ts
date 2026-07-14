import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.genitop.mindcraft.agent',
  appName: 'MindCraft-Agent',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
