import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { getTokens } from '../services/tokenManager';
import { logout, refreshSession, validateSession } from '../services/authService';
import { handle401Error, handleApiError } from '../services/errorHandler';
import { createAuthHeaders, API_BASE_URL } from '../config/apiConfig';
import CameraQRScanner from '../components/CameraQRScanner';
import { Colors } from '../styles/colors';

const JobDetailsScreen = ({ route, navigation }) => {
  const { jobId, jobData } = route.params || {};
  
  // Map API status to display status
  const getDisplayStatus = (apiStatus) => {
    if (!apiStatus) return 'In Progress';
    const statusLower = apiStatus.toLowerCase();
    if (statusLower === 'inprogress' || statusLower === 'in progress') {
      return 'Pending';
    } else if (statusLower === 'completed') {
      return 'Completed';
    }
    return apiStatus;
  };
  
  const [status, setStatus] = useState(getDisplayStatus(jobData?.status) || 'In Progress');
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  const validateToken = (token) => {
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
      const payload = JSON.parse(atob(parts[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      return payload.exp > currentTime;
    } catch (error) {
      console.log('Token validation error:', error);
      return false;
    }
  };

  const handleStatusUpdate = async (newStatus) => {
    // If status is "Completed", call the complete-production API
    if (newStatus === 'Completed') {
      await handleCompleteProduction();
    } else {
      setStatus(newStatus);
      Alert.alert('Status Updated', `Job status changed to ${newStatus}`);
    }
  };

  const handleCompleteProduction = async () => {
    try {
      setIsCompleting(true);
      
      // Get auth token
      const { accessToken } = await getTokens();
      if (!accessToken) {
        Alert.alert('Error', 'Authentication required. Please login again.');
        setIsCompleting(false);
        return;
      }

      if (!validateToken(accessToken)) {
        // Try to refresh token instead of logging out immediately
        const shouldContinue = await handle401Error(null, null, navigation);
        if (!shouldContinue) {
        setIsCompleting(false);
        return;
        }
      }

      // Get task_id or element_id from jobData
      const taskId = jobData?.task_id || jobData?.id;
      const elementId = jobData?.element_id;
      
      if (!taskId && !elementId) {
        Alert.alert('Error', 'Task information not available. Cannot complete production.');
        setIsCompleting(false);
        return;
      }

      // Build API URL
      const apiUrl = `${API_BASE_URL}/api/app/complete-production`;
      
      // Prepare request body
      const requestBody = {};
      if (taskId) {
        requestBody.task_id = taskId;
      }
      if (elementId) {
        requestBody.element_id = elementId;
      }

      console.log('📱 [JobDetailsScreen] Completing production:', JSON.stringify(requestBody, null, 2));
      console.log('📱 [JobDetailsScreen] API URL:', apiUrl);
      console.log('📱 [JobDetailsScreen] Access token (first 20 chars):', accessToken ? accessToken.substring(0, 20) + '...' : 'null');

      // First, validate the session to ensure it exists in the database
      let currentToken = accessToken;
      try {
        console.log('📱 [JobDetailsScreen] Validating session before complete-production API call...');
        const sessionResult = await validateSession();
        console.log('📱 [JobDetailsScreen] Session validation response:', JSON.stringify(sessionResult, null, 2));
        
        if (sessionResult && sessionResult.session_id) {
          // Use the validated session_id as the token
          currentToken = sessionResult.session_id;
          console.log('✅ [JobDetailsScreen] Session validated, using session_id for complete-production API');
          console.log('📱 [JobDetailsScreen] Session_id (first 20 chars):', currentToken.substring(0, 20) + '...');
        } else {
          console.log('⚠️ [JobDetailsScreen] Session validation returned no session_id, using original token');
        }
      } catch (validateError) {
        console.log('❌ [JobDetailsScreen] Session validation failed, using original token:', validateError);
        console.log('📱 [JobDetailsScreen] Validation error details:', JSON.stringify(validateError, null, 2));
        // Continue with original token
      }

      // Try with Bearer token first (standard format)
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true });
      console.log('📱 [JobDetailsScreen] Complete-production API - Attempt 1: With Bearer token');
      console.log('📱 [JobDetailsScreen] Request headers:', JSON.stringify(headersWithBearer, null, 2));
      console.log('📱 [JobDetailsScreen] Request body:', JSON.stringify(requestBody, null, 2));
      
      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: headersWithBearer,
        body: JSON.stringify(requestBody),
      });

      console.log('📱 [JobDetailsScreen] Complete-production Response 1 - Status:', response.status);
      console.log('📱 [JobDetailsScreen] Complete-production Response 1 - Headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

      // If 401, try without Bearer prefix (some APIs expect just the token)
      if (response.status === 401) {
        const errorText1 = await response.text().catch(() => '');
        console.log('❌ [JobDetailsScreen] Complete-production API returned 401 with Bearer token');
        console.log('📱 [JobDetailsScreen] Error response:', errorText1);
        console.log('📱 [JobDetailsScreen] Complete-production API - Attempt 2: Without Bearer prefix...');
        
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        console.log('📱 [JobDetailsScreen] Request headers (no Bearer):', JSON.stringify(headersWithoutBearer, null, 2));
        
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: headersWithoutBearer,
          body: JSON.stringify(requestBody),
        });
        
        console.log('📱 [JobDetailsScreen] Complete-production Response 2 - Status:', response.status);
      }

      // If still 401, try to refresh token and retry
      if (response.status === 401) {
        try {
          const { refreshToken } = await getTokens();
          console.log('📱 [JobDetailsScreen] Refresh token available:', refreshToken ? 'Yes' : 'No');
          
          if (refreshToken) {
            console.log('🔄 [JobDetailsScreen] Complete-production API 401 - attempting token refresh...');
            const refreshResult = await refreshSession();
            console.log('📱 [JobDetailsScreen] Token refresh response:', JSON.stringify(refreshResult, null, 2));
            
            if (refreshResult && refreshResult.access_token) {
              console.log('✅ [JobDetailsScreen] Token refreshed successfully');
              console.log('📱 [JobDetailsScreen] New access_token (first 20 chars):', refreshResult.access_token.substring(0, 20) + '...');
              console.log('📱 [JobDetailsScreen] Validating new session before retry...');
              
              // Validate the new session to get session_id
              let newToken = refreshResult.access_token;
              try {
                const newSessionResult = await validateSession();
                console.log('📱 [JobDetailsScreen] New session validation response:', JSON.stringify(newSessionResult, null, 2));
                
                if (newSessionResult && newSessionResult.session_id) {
                  newToken = newSessionResult.session_id;
                  console.log('✅ [JobDetailsScreen] New session validated, using session_id for retry');
                  console.log('📱 [JobDetailsScreen] New session_id (first 20 chars):', newToken.substring(0, 20) + '...');
                } else {
                  console.log('⚠️ [JobDetailsScreen] New session validation returned no session_id, using access_token');
                }
              } catch (validateError) {
                console.log('❌ [JobDetailsScreen] New session validation failed, using access_token:', validateError);
              }
              
              console.log('🔄 [JobDetailsScreen] Retrying complete-production API with refreshed token...');
              console.log('📱 [JobDetailsScreen] Retry URL:', apiUrl);
              
              // Retry with new token - try Bearer first
              const retryHeadersWithBearer = createAuthHeaders(newToken, { useBearer: true });
              console.log('📱 [JobDetailsScreen] Retry headers (Bearer):', JSON.stringify(retryHeadersWithBearer, null, 2));
              
              response = await fetch(apiUrl, {
                method: 'POST',
                headers: retryHeadersWithBearer,
                body: JSON.stringify(requestBody),
              });
              
              console.log('📱 [JobDetailsScreen] Retry Response 1 - Status:', response.status);
              
              // If still 401, try without Bearer
              if (response.status === 401) {
                const retryErrorText1 = await response.text().catch(() => '');
                console.log('❌ [JobDetailsScreen] Retry with Bearer failed');
                console.log('📱 [JobDetailsScreen] Retry error response:', retryErrorText1);
                console.log('📱 [JobDetailsScreen] Retry - Attempt 2: Without Bearer...');
                
                const retryHeadersWithoutBearer = createAuthHeaders(newToken, { useBearer: false });
                console.log('📱 [JobDetailsScreen] Retry headers (no Bearer):', JSON.stringify(retryHeadersWithoutBearer, null, 2));
                
                response = await fetch(apiUrl, {
                  method: 'POST',
                  headers: retryHeadersWithoutBearer,
                  body: JSON.stringify(requestBody),
                });
                
                console.log('📱 [JobDetailsScreen] Retry Response 2 - Status:', response.status);
              }
            } else {
              console.log('❌ [JobDetailsScreen] Token refresh did not return access_token');
              console.log('📱 [JobDetailsScreen] Refresh result:', JSON.stringify(refreshResult, null, 2));
            }
          } else {
            console.log('❌ [JobDetailsScreen] No refresh token available');
          }
        } catch (refreshError) {
          console.log('❌ [JobDetailsScreen] Token refresh failed for complete-production API');
          console.log('📱 [JobDetailsScreen] Refresh error:', refreshError);
          console.log('📱 [JobDetailsScreen] Refresh error details:', JSON.stringify(refreshError, null, 2));
        }
      }

      console.log('📱 [JobDetailsScreen] Complete production API final response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [JobDetailsScreen] Complete-production API Success!');
        console.log('📱 [JobDetailsScreen] Production completed successfully:', JSON.stringify(data, null, 2));
        
        setStatus('Completed');
        Alert.alert(
          'Success',
          'Production has been marked as completed successfully.',
          [
            { 
              text: 'OK', 
              onPress: () => {
                // Navigate back to dashboard to refresh the list
                navigation.goBack();
              }
            }
          ]
        );
      } else {
        const errorText = await response.text().catch(() => '');
        console.log('❌ [JobDetailsScreen] Complete-production API Error');
        console.log('📱 [JobDetailsScreen] Error status:', response.status);
        console.log('📱 [JobDetailsScreen] Error response:', errorText);
        console.log('📱 [JobDetailsScreen] Error response (parsed):', JSON.parse(errorText || '{}'));
        
        const errorInfo = await handleApiError(response, 'Complete-production API');
        
        if (response.status === 401) {
          Alert.alert('Error', 'Failed to complete production. Your session may have expired. Please try again.');
        } else {
          Alert.alert(
            'Error',
            errorInfo.message || `Failed to complete production. Status: ${response.status}`,
            [{ text: 'OK' }]
          );
        }
      }
    } catch (error) {
      console.log('Complete production Network/Request Error:', error);
      Alert.alert(
        'Network Error',
        `Failed to complete production: ${error.message}`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSubmitQC = () => {
    Alert.alert('QC Submitted', 'Quality control report has been submitted successfully');
    navigation.goBack();
  };

  const handleProfile = () => {
    navigation.navigate('UserProfile');
  };

  const handleQRScan = () => {
    setQrScannerVisible(true);
  };

  const handleQRScanned = (data) => {
    Alert.alert(
      'QR Code Scanned',
      `Scanned data: ${data}`,
      [
        { text: 'OK' },
        { 
          text: 'View Job', 
          onPress: () => {
            const jobIdMatch = data.match(/JOB-\d+/);
            if (jobIdMatch) {
              navigation.navigate('JobDetails', { jobId: jobIdMatch[0] });
            } else {
              Alert.alert('Info', 'No job ID found in QR code');
            }
          }
        }
      ]
    );
  };

  const mockJobDetails = {
    'JOB-001': {
      title: 'Product Inspection - Batch A',
      description: 'Complete quality inspection of production batch A including dimensional checks, material verification, and functional testing.',
      assignedTo: 'John Smith',
      dueDate: '2024-01-15',
      priority: 'High',
      checklist: [
        'Dimensional measurements',
        'Material composition check',
        'Surface finish inspection',
        'Functional testing',
        'Documentation review'
      ]
    },
    'JOB-002': {
      title: 'Quality Check - Component X',
      description: 'Thorough inspection of Component X for manufacturing defects and compliance with specifications.',
      assignedTo: 'Sarah Johnson',
      dueDate: '2024-01-16',
      priority: 'Medium',
      checklist: [
        'Visual inspection',
        'Tolerance verification',
        'Stress testing',
        'Compliance check'
      ]
    }
  };

  const job = mockJobDetails[jobId] || {
    title: 'Job Details',
    description: 'No details available for this job.',
    assignedTo: 'N/A',
    dueDate: 'N/A',
    priority: 'Medium',
    checklist: []
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return '#FF3B30';
      case 'Medium': return '#FF9500';
      case 'Low': return '#34C759';
      default: return '#8E8E93';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerContent}>
            <Text style={styles.jobId}>{jobId}</Text>
            <Text style={styles.title}>{job.title}</Text>
            <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(job.priority) }]}>
              <Text style={styles.priorityText}>{job.priority} Priority</Text>
            </View>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity style={styles.qrButton} onPress={handleQRScan}>
              <View style={styles.scanIcon}>
                <View style={styles.scanFrame}>
                  <View style={styles.scanCorner} />
                  <View style={[styles.scanCorner, styles.topRight]} />
                  <View style={[styles.scanCorner, styles.bottomLeft]} />
                  <View style={[styles.scanCorner, styles.bottomRight]} />
                  <View style={styles.scanLine} />
                </View>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileButton} onPress={handleProfile}>
              <Text style={styles.profileButtonText}>👤</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Description</Text>
        <Text style={styles.description}>{job.description}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Job Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Assigned To:</Text>
          <Text style={styles.infoValue}>{job.assignedTo}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Due Date:</Text>
          <Text style={styles.infoValue}>{job.dueDate}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Current Status:</Text>
          <Text style={[styles.infoValue, { color: Colors.primary }]}>{status}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>QC Checklist</Text>
        {job.checklist.map((item, index) => (
          <View key={index} style={styles.checklistItem}>
            <Text style={styles.checklistText}>• {item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status Actions</Text>
        <View style={styles.statusButtons}>
          <TouchableOpacity 
            style={[styles.statusButton, status === 'Pending' && styles.activeStatusButton]}
            onPress={() => handleStatusUpdate('Pending')}
          >
            <Text style={[styles.statusButtonText, status === 'Pending' && styles.activeStatusButtonText]}>
              Pending
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statusButton, status === 'In Progress' && styles.activeStatusButton]}
            onPress={() => handleStatusUpdate('In Progress')}
          >
            <Text style={[styles.statusButtonText, status === 'In Progress' && styles.activeStatusButtonText]}>
              In Progress
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statusButton, status === 'Completed' && styles.activeStatusButton]}
            onPress={() => handleStatusUpdate('Completed')}
            disabled={isCompleting}
          >
            {isCompleting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.statusButtonText, status === 'Completed' && styles.activeStatusButtonText]}>
                Completed
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.submitSection}>
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmitQC}>
          <Text style={styles.submitButtonText}>Submit QC Report</Text>
        </TouchableOpacity>
      </View>

      <CameraQRScanner
        visible={qrScannerVisible}
        onClose={() => setQrScannerVisible(false)}
        onScan={handleQRScanned}
        navigation={navigation}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.background,
    padding: 20,
    marginBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 60,
  },
  headerContent: {
    flex: 1,
  },
  jobId: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  qrButton: {
    backgroundColor: '#007AFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scanIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 20,
    height: 20,
    position: 'relative',
  },
  scanCorner: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderColor: '#fff',
    borderWidth: 2,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    top: 0,
    left: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    left: 'auto',
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    top: 'auto',
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    top: 'auto',
    left: 'auto',
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  scanLine: {
    position: 'absolute',
    top: '50%',
    left: 2,
    right: 2,
    height: 2,
    backgroundColor: Colors.background,
    transform: [{ translateY: -1 }],
  },
  profileButton: {
    backgroundColor: '#34C759',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profileButtonText: {
    fontSize: 22,
    color: Colors.textWhite,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  priorityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  priorityText: {
    color: Colors.textWhite,
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    backgroundColor: Colors.background,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 24,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  checklistItem: {
    marginBottom: 8,
  },
  checklistText: {
    fontSize: 16,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  statusButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: Colors.background,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  activeStatusButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  statusButtonText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  activeStatusButtonText: {
    color: Colors.textWhite,
  },
  submitSection: {
    padding: 20,
    backgroundColor: Colors.background,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: Colors.textWhite,
    fontSize: 18,
    fontWeight: '600',
  },
});

export default JobDetailsScreen;
