import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trainlab.app',
  appName: 'TrainLab',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  }
};

export default config;
