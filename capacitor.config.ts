import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trainlab.app',
  appName: 'TrainLab',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: false,
      backgroundColor: "#060A26",
      androidSplashResourceName: "launch_screen",
      showSpinner: false,
  }
}
};

export default config;
