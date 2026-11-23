import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../styles/colors';
import { FontSizes, FontWeights } from '../styles/fonts';
import AppButton from './AppButton';
import Icon from './ui/Icon';
import { themedStyles } from '../theme';

export const OfflineScreen = ({ onRetry }) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Icon name="wifi-off" size={34} color={Colors.warning} />
      </View>
      <Text style={styles.title}>No Internet Connection</Text>
      <Text style={styles.message}>
        Please check your internet connection and try again.
      </Text>
      {onRetry && (
        <AppButton title="Retry" onPress={onRetry} style={styles.retryButton} />
      )}
    </View>
  );
};

const styles = themedStyles(() => ({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: Colors.background,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.warningSoft,
    marginBottom: 20,
  },
  title: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  retryButton: {
    minWidth: 160,
  },
}));
