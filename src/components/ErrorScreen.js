import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../styles/colors';
import { FontSizes, FontWeights } from '../styles/fonts';
import AppButton from './AppButton';
import Icon from './ui/Icon';

export const ErrorScreen = ({ onReload, errorMessage }) => {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Icon name="alert-circle" size={34} color={Colors.error} />
      </View>
      <Text style={styles.title}>Something went wrong</Text>
      {errorMessage ? <Text style={styles.message}>{errorMessage}</Text> : null}
      {onReload ? (
        <AppButton title="Reload" onPress={onReload} style={styles.reloadButton} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: Colors.errorSoft,
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
  reloadButton: {
    minWidth: 160,
  },
});
