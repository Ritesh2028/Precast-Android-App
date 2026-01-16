import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import { getTokens } from '../services/tokenManager';
import { validateSession } from '../services/authService';

const DeviceLimitModal = ({ visible, onClose, activeDevices, onDeviceLogout, maxDevices, currentDevices, message }) => {
  const [loggingOutDevice, setLoggingOutDevice] = useState(null);
  
  // Prevent closing dialog while logging out
  const handleClose = () => {
    if (!loggingOutDevice) {
      onClose();
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      };
      return date.toLocaleString('en-US', options);
    } catch (error) {
      return dateString;
    }
  };

  const handleLogoutDevice = async (sessionId, deviceIndex) => {
    try {
      setLoggingOutDevice(sessionId);
      
      // Note: User is not logged in yet, so we don't need access token
      // The logout-device endpoint should work without authentication for this use case
      const apiUrl = `${API_BASE_URL}/api/logout-device`;
      console.log('📱 [DeviceLimitModal] Logging out device:', sessionId);

      // Try without authentication first (since user is not logged in)
      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ [DeviceLimitModal] Device logged out successfully');
        
        // Call the callback to handle the logout (e.g., retry login)
        // The parent component will show success message
        if (onDeviceLogout) {
          onDeviceLogout(sessionId, deviceIndex);
        }
      } else {
        const errorText = await response.text();
        console.error('❌ [DeviceLimitModal] Error logging out device:', errorText);
        let errorMessage = 'Failed to logout device. Please try again.';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData?.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        Alert.alert('Error', errorMessage);
      }
    } catch (error) {
      console.error('❌ [DeviceLimitModal] Error logging out device:', error);
      Alert.alert('Error', 'Failed to logout device. Please try again.');
    } finally {
      setLoggingOutDevice(null);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <View style={styles.warningIconContainer}>
                <View style={styles.warningIconCircle}>
                  <Text style={styles.warningIcon}>⚠️</Text>
                </View>
              </View>
              <Text style={styles.title}>Device Limit Reached</Text>
              <View style={styles.messageContainer}>
                <Text style={styles.message}>
                  {message || `You have reached the maximum limit of ${maxDevices} active devices. Currently, you have ${currentDevices} active session${currentDevices > 1 ? 's' : ''}.`}
                </Text>
              </View>
              <View style={styles.actionTextContainer}>
                <Text style={styles.actionText}>
                  Please logout from one device below to continue.
                </Text>
              </View>
            </View>
            <View style={styles.divider} />
          </View>

          {/* Device List */}
          <ScrollView style={styles.deviceList} showsVerticalScrollIndicator={false}>
            {activeDevices && activeDevices.length > 0 ? (
              activeDevices.map((device, index) => (
                <View key={device.session_id || index} style={styles.deviceItem}>
                  <View style={styles.deviceCard}>
                    <View style={styles.deviceHeader}>
                      <View style={styles.deviceIconContainer}>
                        <View style={styles.deviceIconCircle}>
                          <Text style={styles.deviceIcon}>🖥️</Text>
                        </View>
                      </View>
                      <View style={styles.deviceInfo}>
                        <Text style={styles.deviceName}>Device {index + 1}</Text>
                        <View style={styles.statusBadge}>
                          <View style={styles.statusDot} />
                          <Text style={styles.deviceStatus}>Active session</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.deviceDetails}>
                      <View style={styles.detailCard}>
                        <View style={styles.detailRow}>
                          <View style={styles.detailIconContainer}>
                            <Text style={styles.detailIcon}>🌐</Text>
                          </View>
                          <View style={styles.detailContent}>
                            <Text style={styles.detailLabel}>IP Address</Text>
                            <Text style={styles.detailValue}>{device.ip_address || 'N/A'}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.detailCard}>
                        <View style={styles.detailRow}>
                          <View style={styles.detailIconContainer}>
                            <Text style={styles.detailIcon}>🕐</Text>
                          </View>
                          <View style={styles.detailContent}>
                            <Text style={styles.detailLabel}>Login Time</Text>
                            <Text style={styles.detailValue}>{formatDate(device.login_time)}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.detailCard}>
                        <View style={styles.detailRow}>
                          <View style={styles.detailIconContainer}>
                            <Text style={styles.detailIcon}>⏰</Text>
                          </View>
                          <View style={styles.detailContent}>
                            <Text style={styles.detailLabel}>Expires At</Text>
                            <Text style={styles.detailValue}>{formatDate(device.expires_at)}</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.logoutButton,
                        loggingOutDevice === device.session_id && styles.logoutButtonDisabled
                      ]}
                      onPress={() => handleLogoutDevice(device.session_id, index)}
                      disabled={loggingOutDevice === device.session_id}
                      activeOpacity={0.8}
                    >
                      {loggingOutDevice === device.session_id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Text style={styles.logoutButtonText}>Logout Device</Text>
                          <View style={styles.logoutButtonIconContainer}>
                            <Text style={styles.logoutButtonIcon}>↗</Text>
                          </View>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No active devices found</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
  },
  header: {
    padding: 24,
    paddingTop: 28,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: FontWeights.bold,
    lineHeight: 20,
  },
  headerContent: {
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
  },
  warningIconContainer: {
    marginBottom: 16,
  },
  warningIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF4E6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFE0B2',
    shadowColor: '#FF9500',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  warningIcon: {
    fontSize: 44,
  },
  title: {
    fontSize: FontSizes.large + 6,
    fontWeight: FontWeights.bold,
    color: '#1A1A1A',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  messageContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    width: '100%',
  },
  message: {
    fontSize: FontSizes.regular,
    color: '#4A4A4A',
    textAlign: 'center',
    lineHeight: 24,
  },
  boldText: {
    fontWeight: FontWeights.bold,
    color: '#1A1A1A',
  },
  actionTextContainer: {
    backgroundColor: '#FFF8F0',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
    width: '100%',
  },
  actionText: {
    fontSize: FontSizes.regular,
    color: '#FF9500',
    textAlign: 'center',
    fontWeight: FontWeights.semiBold,
    letterSpacing: 0.2,
  },
  divider: {
    height: 2,
    backgroundColor: '#E8E8E8',
    marginTop: 24,
    borderRadius: 1,
  },
  deviceList: {
    maxHeight: 450,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
  },
  deviceItem: {
    marginBottom: 16,
  },
  deviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  deviceIconContainer: {
    marginRight: 16,
  },
  deviceIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F0F7FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E3F2FD',
  },
  deviceIcon: {
    fontSize: 28,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: FontSizes.medium + 2,
    fontWeight: FontWeights.bold,
    color: '#1A1A1A',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 6,
  },
  deviceStatus: {
    fontSize: FontSizes.small,
    color: '#2E7D32',
    fontWeight: FontWeights.semiBold,
  },
  deviceDetails: {
    marginBottom: 20,
  },
  detailCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  detailIcon: {
    fontSize: 18,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: FontSizes.small - 1,
    color: '#808080',
    fontWeight: FontWeights.medium,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: FontSizes.regular,
    color: '#1A1A1A',
    fontWeight: FontWeights.semiBold,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: '#FF3B30',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#E53935',
  },
  logoutButtonDisabled: {
    opacity: 0.6,
  },
  logoutButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
    marginRight: 10,
    letterSpacing: 0.5,
  },
  logoutButtonIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutButtonIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: FontWeights.bold,
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
});

export default DeviceLimitModal;

