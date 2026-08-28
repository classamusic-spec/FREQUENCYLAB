import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import {
  IBMPlexMono_300Light,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { colors } from '../src/design/tokens';
import { usePreferences } from '../src/state/preferences';
import { useProtocolLibrary } from '../src/state/library';
import { useHistory } from '../src/state/history';
import { useExperiments } from '../src/state/experiments';
import { useArchive } from '../src/state/archive';
import { usePlayerAttachment } from '../src/state/player';
import { PreflightSheet } from '../src/design/components/PreflightSheet';
import { SplashSequence } from '../src/design/components/SplashSequence';

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(colors.background);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    IBMPlexMono_300Light,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const [hydrated, setHydrated] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDone = useCallback(() => setSplashDone(true), []);
  const hydratePreferences = usePreferences((state) => state.hydrate);
  const hydrateProtocols = useProtocolLibrary((state) => state.hydrate);
  const hydrateHistory = useHistory((state) => state.hydrate);
  const hydrateExperiments = useExperiments((state) => state.hydrate);
  const hydrateArchive = useArchive((state) => state.hydrate);
  const preferences = usePreferences((state) => state.preferences);
  const router = useRouter();

  usePlayerAttachment();

  useEffect(() => {
    void Promise.all([
      hydratePreferences(),
      hydrateProtocols(),
      hydrateHistory(),
      hydrateExperiments(),
      hydrateArchive(),
    ]).finally(() => setHydrated(true));
  }, [hydrateArchive, hydrateExperiments, hydrateHistory, hydratePreferences, hydrateProtocols]);

  const ready = fontsLoaded && hydrated;

  useEffect(() => {
    // Hidden immediately: the animated sequence below is already painting the
    // same mark on the same background, so handing over early avoids the
    // native splash lingering over an app that is ready to draw.
    void SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (!ready || !splashDone) return;
    if (!preferences.onboardingCompletedAt) {
      router.replace('/onboarding');
    }
  }, [preferences.onboardingCompletedAt, ready, router, splashDone]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: preferences.reducedMotion ? 'none' : 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen
            name="session"
            options={{ animation: 'slide_from_bottom', gestureEnabled: false }}
          />
          <Stack.Screen name="calibration" options={{ presentation: 'modal' }} />
          <Stack.Screen name="diagnostics" options={{ presentation: 'modal' }} />
          <Stack.Screen name="ai" options={{ presentation: 'modal' }} />
          {/* The scope notice is a modal so it reads as an interruption the
              first time and as a reference afterwards, rather than becoming a
              screen the user has to navigate back out of. */}
          <Stack.Screen name="archive/scope" options={{ presentation: 'modal' }} />
        </Stack>
        {/* Rendered once at the root so every path into playback passes the
            output-route and safety checks, not just the ones that remembered to. */}
        <PreflightSheet />
        {splashDone ? null : (
          <SplashSequence waiting={!ready} onDone={handleSplashDone} />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
