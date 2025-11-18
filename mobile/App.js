import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Text } from 'react-native';
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
import QCResponseScreen from './src/screens/QCResponseScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import QRScannerScreen from './src/screens/QRScannerScreen';
import QuestionsScreen from './src/screens/QuestionsScreen';

const Stack = createStackNavigator();

export default function App() {
  // Set global default text color
  if (Text && Text.defaultProps == null) {
    Text.defaultProps = {};
  }
  if (Text) {
    const base = Text.defaultProps?.style || {};
    Text.defaultProps.style = [base, { color: '#75767a' }];
  }
  return (
    <NavigationContainer>
      <View style={styles.container}>
        <StatusBar style="auto" />
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
              title: 'Dashboard',
              
              headerTitleStyle: {
                fontSize: 20,
                fontWeight: 'bold',
                color: '#333'
              },
              headerBackVisible: false,
              headerLeft: () => null
            }}
          />
          <Stack.Screen 
            name="JobDetails" 
            component={JobDetailsScreen}
            options={{ title: 'Job Details' }}
          />
          <Stack.Screen 
            name="ElementDetails" 
            component={ElementDetailsScreen}
            options={{ title: 'Element Details', }}
          />
          <Stack.Screen 
            name="QCStatus" 
            component={QCStatusScreen}
            options={{ title: 'QC Status' }}
          />
          <Stack.Screen 
            name="QCResponse" 
            component={QCResponseScreen}
            options={{ title: 'QC Response' }}
          />
          <Stack.Screen 
            name="UserProfile" 
            component={UserProfileScreen}
            options={{ title: 'Profile' }}
          />
          <Stack.Screen 
            name="Scan" 
            component={QRScannerScreen}
            options={{ title: 'Scan' }}
          />
          <Stack.Screen 
            name="Questions" 
            component={QuestionsScreen}
            options={{ title: 'Questions' }}
          />
        </Stack.Navigator>
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});