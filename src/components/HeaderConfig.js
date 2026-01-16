import React from 'react';
import { TouchableOpacity, Image, View } from 'react-native';
import { Colors } from '../styles/colors';

/*
 * Default header configuration for React Navigation
 * This can be used in screenOptions to ensure consistent header styling across all screens
 */
export const getDefaultHeaderOptions = (navigation) => ({
  headerStyle: {
    backgroundColor: Colors.background,
    height: 85,
    borderBottomWidth: 1,
    borderBottomColor: '#d6dee6',
    elevation: 0,
    shadowOpacity: 0,
  },
  headerTintColor: Colors.textPrimary,
  headerTitleStyle: {
    fontWeight: 'bold',
    fontSize: 20,
    color: Colors.textPrimary,
  },
  headerTitleAlign: 'center',
  animationEnabled: false,
  animation: 'none',
  headerTitleContainerStyle: {
    paddingHorizontal: 10,
  },
  headerLeftContainerStyle: {
    paddingLeft: 10,
  },
  headerRightContainerStyle: {
    paddingRight: 10,
  },
  headerRight: () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <TouchableOpacity
        onPress={() => navigation.navigate('Notifications')}
        style={{ paddingHorizontal: 8, paddingVertical: 6 }}
        accessibilityRole="button"
        accessibilityLabel="Open notifications"
      >
        <Image
          source={require('../icons/bell.png')}
          style={{ width: 24, height: 24, tintColor: '#333' }}
          resizeMode="contain"
        />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.navigate('Scan')}
        style={{ paddingHorizontal: 8, paddingVertical: 6 }}
        accessibilityRole="button"
        accessibilityLabel="Open scanner"
      >
        <Image
          source={require('../icons/qr-code.png')}
          style={{ width: 24, height: 24, tintColor: '#333' }}
          resizeMode="contain"
        />
      </TouchableOpacity>
    </View>
  ),
});

/**
 * Get header options for a specific screen
 * @param {Object} navigation - Navigation object
 * @param {Object} customOptions - Custom options to override defaults
 * @returns {Object} Header options
 */
export const getHeaderOptions = (navigation, customOptions = {}) => {
  const defaultOptions = getDefaultHeaderOptions(navigation);
  return {
    ...defaultOptions,
    ...customOptions,
    // Merge nested objects properly
    headerStyle: {
      ...defaultOptions.headerStyle,
      ...(customOptions.headerStyle || {}),
    },
    headerTitleStyle: {
      ...defaultOptions.headerTitleStyle,
      ...(customOptions.headerTitleStyle || {}),
    },
    headerTitleContainerStyle: {
      ...defaultOptions.headerTitleContainerStyle,
      ...(customOptions.headerTitleContainerStyle || {}),
    },
    headerLeftContainerStyle: {
      ...defaultOptions.headerLeftContainerStyle,
      ...(customOptions.headerLeftContainerStyle || {}),
    },
    headerRightContainerStyle: {
      ...defaultOptions.headerRightContainerStyle,
      ...(customOptions.headerRightContainerStyle || {}),
    },
  };
};

export default {
  getDefaultHeaderOptions,
  getHeaderOptions,
};

