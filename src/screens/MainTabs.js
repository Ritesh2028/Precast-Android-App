import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import DashboardScreen from './DashboardScreen';
import QCStatusScreen from './QCStatusScreen';
import UserProfileScreen from './UserProfileScreen';
import BottomNavigation from '../components/BottomNavigation';
import { Colors } from '../styles/colors';
import { startTokenRefreshService, stopTokenRefreshService } from '../services/tokenRefreshService';

const MainTabs = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState('home');

  const handleTabPress = useCallback((tabId) => {
    setActiveTab(tabId);
  }, []);

  // Update header title based on active tab
  useEffect(() => {
    let title = 'Dashboard';
    if (activeTab === 'task') {
      title = 'Task';
    } else if (activeTab === 'me') {
      title = 'User details';
    }
    
    navigation.setOptions({
      title: title,
    });
  }, [activeTab, navigation]);

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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1 },
});

export default MainTabs;


