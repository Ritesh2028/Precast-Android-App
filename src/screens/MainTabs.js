import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import DashboardScreen from './DashboardScreen';
import QCStatusScreen from './QCStatusScreen';
import UserProfileScreen from './UserProfileScreen';
import BottomNavigation from '../components/BottomNavigation';
import { Colors } from '../styles/colors';
import { startTokenRefreshService, stopTokenRefreshService } from '../services/tokenRefreshService';
import { themedStyles } from '../theme';

const TAB_IDS = ['home', 'task', 'me'];

const MainTabs = ({ navigation, route }) => {
  const [activeTab, setActiveTab] = useState(
    TAB_IDS.includes(route?.params?.tab) ? route.params.tab : 'home',
  );

  // Screens opened on top of the tabs (e.g. Bird's Eye View) show the same bottom
  // bar and come back here with { tab } to switch to the tapped tab.
  const requestedTab = route?.params?.tab;
  const requestKey = route?.params?.tabRequest;
  useEffect(() => {
    if (TAB_IDS.includes(requestedTab)) setActiveTab(requestedTab);
  }, [requestedTab, requestKey]);

  const handleTabPress = useCallback((tabId) => {
    setActiveTab(tabId);
  }, []);

  // Start token refresh service when component mounts (user is logged in)
  useEffect(() => {
    startTokenRefreshService();
    
    // Cleanup: stop the service when component unmounts
    return () => {
      stopTokenRefreshService();
    };
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <DashboardScreen navigation={navigation} hideBottomNav />;
      case 'task':
        return <QCStatusScreen navigation={navigation} hideBottomNav />;
      case 'me':
        return <UserProfileScreen navigation={navigation} hideBottomNav />;
      default:
        return <DashboardScreen navigation={navigation} hideBottomNav />;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>{renderContent()}</View>
      <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
};

const styles = themedStyles(() => ({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1 },
}));

export default MainTabs;


