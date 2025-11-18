import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';

const TabButton = ({ label, icon, tintColor, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 30, bounciness: 6 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }),
    ]).start();
    setTimeout(() => {
      onPress && onPress();
    }, 90);
  };
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      style={styles.tab}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Image source={icon} style={[styles.tabIconImg, { tintColor }]} resizeMode="contain" />
        <Text style={[styles.tabLabel, { color: tintColor === '#007AFF' ? '#007AFF' : '#38393c' }]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const BottomNavigation = ({ activeTab, onTabPress }) => {
  const insets = useSafeAreaInsets();
  const [localActive, setLocalActive] = useState(activeTab || 'home');

  useEffect(() => {
    if (activeTab && activeTab !== localActive) {
      setLocalActive(activeTab);
    }
  }, [activeTab]);
  
  const tabs = useMemo(() => [
    {
      id: 'home',
      label: 'Home',
      icon: require('../icons/home.png'),
      screen: 'Dashboard'
    },
    {
      id: 'task',
      label: 'Task',
      icon: require('../icons/to-do-list.png'),
      screen: 'QCStatus'
    },
    {
      id: 'me',
      label: 'Me',
      icon: require('../icons/user.png'),
      screen: 'UserProfile'
    }
  ], []);

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((tab) => {
        const isActive = localActive === tab.id;
        const tint = isActive ? '#007AFF' : '#38393c';
        return (
        <TabButton
          key={tab.id}
          label={tab.label}
          icon={tab.icon}
          tintColor={tint}
          onPress={() => {
            setLocalActive(tab.id);
            onTabPress && onTabPress(tab.id, tab.screen);
          }}
        />
      )})}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: '#d6dee6',
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tabIconImg: {
    width: 26,
    height: 26,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: FontSizes.tabLabel,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
    textAlign: 'center',
  },
  
});

export default React.memo(BottomNavigation, () => true);
