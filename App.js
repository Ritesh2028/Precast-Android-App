import React, { useMemo, useRef } from 'react';
import {
  NavigationContainer,
  createNavigationContainerRef,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';
import { setPushNavigation } from './src/services/pushNotifications';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { Colors } from './src/styles/colors';
import { getDefaultHeaderOptions } from './src/components/HeaderConfig';

// Import screens
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import MainTabs from './src/screens/MainTabs';
import JobDetailsScreen from './src/screens/JobDetailsScreen';
import ElementDetailsScreen from './src/screens/ElementDetailsScreen';
import QCStatusScreen from './src/screens/QCStatusScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import QRScannerScreen from './src/screens/QRScannerScreen';
import QuestionsScreen from './src/screens/QuestionsScreen';
import StockManagerScreen from './src/screens/StockManagerScreen';
import ErectionManagerScreen from './src/screens/ErectionManagerScreen';
import DispatchManagerScreen from './src/screens/DispatchManagerScreen';
import WebViewScreen from './src/screens/WebViewScreen';
import BirdsEyeViewScreen from './src/screens/BirdsEyeViewScreen';
import NotificationScreen from './src/screens/NotificationScreen';
import RectificationScreen from './src/screens/RectificationScreen';
import QCReportScreen from './src/screens/QCReportScreen';
import WorkspacePickerScreen from './src/screens/WorkspacePickerScreen';
import { themedStyles, ThemeProvider, useColorSchemeLive } from './src/theme';

const Stack = createStackNavigator();
const navigationRef = createNavigationContainerRef();

const buildNavigationTheme = (isDark) => {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: isDark,
    colors: {
      ...base.colors,
      primary: Colors.primary,
      background: Colors.surface,
      card: Colors.background,
      text: Colors.textPrimary,
      border: Colors.headerBorder,
      notification: Colors.error,
    },
  };
};

export default function App() {
  return (
    <ThemeProvider>
      <AppNavigator />
    </ThemeProvider>
  );
}

function AppNavigator() {
  const scheme = useColorSchemeLive();
  const isDark = scheme === 'dark';
  const navigationTheme = useMemo(() => buildNavigationTheme(isDark), [isDark]);
  // When the device switches light/dark the navigator remounts (key={scheme}) so
  // every screen re-reads the theme; the saved state keeps the user on the same screen.
  const navStateRef = useRef(undefined);

  return (
    <NavigationContainer
      key={scheme}
      ref={navigationRef}
      theme={navigationTheme}
      initialState={navStateRef.current}
      onStateChange={(state) => {
        navStateRef.current = state;
      }}
      onReady={() => setPushNavigation(navigationRef)}
    >
      <View style={styles.container}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack.Navigator 
          initialRouteName="Splash"
          screenOptions={({ navigation }) => getDefaultHeaderOptions(navigation)}
        >
          <Stack.Screen 
            name="Splash" 
            component={SplashScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Login" 
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="Dashboard" 
            component={MainTabs}
            options={{
              headerBackVisible: false,
            }}
          />
          <Stack.Screen 
            name="JobDetails" 
            component={JobDetailsScreen}
            options={{ title: '' }}
          />
          <Stack.Screen 
            name="ElementDetails" 
            component={ElementDetailsScreen}
            options={{ title: '' }}
          />
          <Stack.Screen 
            name="QCStatus" 
            component={QCStatusScreen}
            options={{ title: '' }}
          />
          <Stack.Screen 
            name="UserProfile" 
            component={UserProfileScreen}
            options={{ title: '' }}
          />
          <Stack.Screen 
            name="Scan" 
            component={QRScannerScreen}
            options={{ title: '' }}
          />
          <Stack.Screen 
            name="Questions" 
            component={QuestionsScreen}
            options={{ title: '' }}
          />
          <Stack.Screen 
            name="StockManager" 
            component={StockManagerScreen}
            options={{ title: '' }}
          />
          <Stack.Screen 
            name="ErectionManager" 
            component={ErectionManagerScreen}
            options={{ title: '' }}
          />
          <Stack.Screen 
            name="DispatchManager" 
            component={DispatchManagerScreen}
            options={{ title: '' }}
          />
          <Stack.Screen 
            name="BirdsEyeView" 
            component={BirdsEyeViewScreen}
            options={{ title: '' }}
          />
          <Stack.Screen 
            name="WebView" 
            component={WebViewScreen}
            options={{ 
              headerShown: false,
              headerBackVisible: false,
              headerLeft: () => null
            }}
          />
          <Stack.Screen 
            name="Notifications" 
            component={NotificationScreen}
            options={{ title: '' }}
          />
          <Stack.Screen
            name="Rectification"
            component={RectificationScreen}
            options={{ title: '' }}
          />
          <Stack.Screen
            name="Workspaces"
            component={WorkspacePickerScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="QCReport"
            component={QCReportScreen}
            options={{ title: '' }}
          />
        </Stack.Navigator>
      </View>
    </NavigationContainer>
  );
}

const styles = themedStyles(() => ({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
}));