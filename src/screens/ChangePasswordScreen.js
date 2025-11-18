import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { FontSizes } from '../styles/fonts';
import { Colors } from '../styles/colors';

const ChangePasswordScreen = () => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSendLink = async () => {
    if (!email.trim()) {
      Alert.alert('Required', 'Please enter your email address.');
      return;
    }
    setSubmitting(true);
    try {
      // TODO: plug in real API for sending reset link
      setTimeout(() => {
        setSubmitting(false);
        Alert.alert('Email sent', 'If this email is registered, a reset link has been sent.');
      }, 700);
    } catch (e) {
      setSubmitting(false);
      Alert.alert('Error', 'Could not send the reset link. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Change Password</Text>
        <Text style={styles.subtitle}>Enter your email to receive a password reset link</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            returnKeyType="done"
          />
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={onSendLink} disabled={submitting}>
          <Text style={styles.primaryButtonText}>{submitting ? 'Sending...' : 'Send Reset Link'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 24 },
  title: { fontSize: 20, fontWeight: 'bold', color: Colors.textDark, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  inputGroup: { backgroundColor: Colors.background, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 16 },
  label: { fontSize: 12, color: Colors.textSecondary, marginBottom: 8 },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: Colors.textDark },
  primaryButton: { backgroundColor: Colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: Colors.textWhite, fontSize: 16, fontWeight: '600' },
});

export default ChangePasswordScreen;


