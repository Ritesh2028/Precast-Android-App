import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTokens } from '../services/tokenManager';
import { logout, validateSession, refreshSession } from '../services/authService';
import { handle401Error, handleApiError } from '../services/errorHandler';
import { validateToken } from '../services/tokenUtils';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';
import DrawingFilesModal from '../components/DrawingFilesModal';

// Black and White Theme Colors - White Background
const BWTheme = {
  background: '#FFFFFF',
  card: '#FAFAFA',
  surface: '#F5F5F5',
  textPrimary: '#000000',
  textSecondary: '#4A4A4A',
  textTertiary: '#808080',
  border: '#E0E0E0',
  borderLight: '#D0D0D0',
  divider: '#E0E0E0',
  accent: '#000000',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

const ElementDetailsScreen = ({ route, navigation }) => {
  const { elementData: initialElementData, elementId } = route.params || {};
  const [elementData, setElementData] = useState(initialElementData);
  const [loading, setLoading] = useState(!initialElementData && elementId);
  const [drawingFilesModalVisible, setDrawingFilesModalVisible] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(null);
  const insets = useSafeAreaInsets();

  const formatDate = (dateString, format = 'date') => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (format === 'time') {
        return date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        });
      }
      if (format === 'full') {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      }
      const day = date.getDate();
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status) => {
    if (!status) return BWTheme.textTertiary;
    const statusLower = status.toLowerCase();
    if (statusLower.includes('completed')) return '#000000';
    if (statusLower.includes('pending')) return '#4A4A4A';
    if (statusLower.includes('rejected')) return '#808080';
    return '#000000';
  };

  const fetchElementDetails = async (elementId) => {
    try {
      setLoading(true);
      console.log('[ElementDetailsScreen] Fetching element details for:', elementId);
      
      const { accessToken } = await getTokens();
      
      if (!accessToken) {
        console.log('[ElementDetailsScreen] No access token found');
        Alert.alert('Authentication Required', 'Please login to fetch element details.');
        setLoading(false);
        return null;
      }

      // Validate session first to get session_id (same pattern as tasks API)
      let tokenToUse = accessToken;
      console.log('[ElementDetailsScreen] Validating session before API call...');
      try {
        const sessionResult = await validateSession();
        console.log('[ElementDetailsScreen] Session validation response:', JSON.stringify(sessionResult, null, 2));
        
        if (sessionResult && sessionResult.session_id) {
          // Use the validated session_id as the token
          tokenToUse = sessionResult.session_id;
          console.log('✅ [ElementDetailsScreen] Session validated, using session_id');
        } else {
          console.log('⚠️ [ElementDetailsScreen] Session validation returned no session_id, using original token');
        }
      } catch (validateError) {
        console.log('❌ [ElementDetailsScreen] Session validation failed, using original token:', validateError);
      }

      const apiUrl = `${API_BASE_URL}/api/scan_element/${elementId}`;
      console.log('[ElementDetailsScreen] Making API call:', apiUrl);

      // Try with Bearer token first (standard format)
      let headers = createAuthHeaders(tokenToUse, { useBearer: true });
      console.log('[ElementDetailsScreen] Attempt 1: With Bearer token');
      
      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: headers,
      });

      console.log('[ElementDetailsScreen] Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix (some APIs expect just the token)
      if (response.status === 401) {
        const responseText1 = await response.text().catch(() => '');
        console.log('❌ [ElementDetailsScreen] 401 with Bearer token');
        console.log('[ElementDetailsScreen] Response body:', responseText1);
        console.log('[ElementDetailsScreen] Attempt 2: Without Bearer prefix...');
        
        headers = createAuthHeaders(tokenToUse, { useBearer: false });
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: headers,
        });
        
        console.log('[ElementDetailsScreen] Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [ElementDetailsScreen] Element details fetched successfully');
        setElementData(data);
        setLoading(false);
        return data;
      } else {
        // If still 401, try to refresh token and retry once
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            console.log('[ElementDetailsScreen] Refresh token available:', refreshToken ? 'Yes' : 'No');
            
            if (refreshToken) {
              console.log('🔄 [ElementDetailsScreen] 401 error, attempting token refresh...');
              const refreshResult = await refreshSession();
              console.log('[ElementDetailsScreen] Token refresh response:', JSON.stringify(refreshResult, null, 2));
              
              if (refreshResult && (refreshResult.access_token || refreshResult.message)) {
                // Get new token after refresh
                const { accessToken: newAccessToken } = await getTokens();
                let newToken = newAccessToken;
                
                // Validate new session
                try {
                  const newSessionResult = await validateSession();
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                    console.log('✅ [ElementDetailsScreen] New session validated, using session_id');
                  }
                } catch (validateError) {
                  console.log('⚠️ [ElementDetailsScreen] New session validation failed, using access_token');
                }
                
                console.log('🔄 [ElementDetailsScreen] Retrying with refreshed token...');
                
                // Retry with new token - try Bearer first
                let retryHeaders = createAuthHeaders(newToken, { useBearer: true });
                let retryResponse = await fetch(apiUrl, {
                  method: 'GET',
                  headers: retryHeaders,
                });
                
                console.log('[ElementDetailsScreen] Retry Response 1 - Status:', retryResponse.status);
                
                // If still 401, try without Bearer
                if (retryResponse.status === 401) {
                  retryHeaders = createAuthHeaders(newToken, { useBearer: false });
                  retryResponse = await fetch(apiUrl, {
                    method: 'GET',
                    headers: retryHeaders,
                  });
                  
                  console.log('[ElementDetailsScreen] Retry Response 2 - Status:', retryResponse.status);
                }
                
                if (retryResponse.ok) {
                  const data = await retryResponse.json();
                  console.log('✅ [ElementDetailsScreen] Element details fetched successfully after retry');
                  setElementData(data);
                  setLoading(false);
                  return data;
                } else {
                  const errorInfo = await handleApiError(retryResponse, 'Element Details API');
                  Alert.alert('Error', errorInfo.message);
                  setLoading(false);
                  return null;
                }
              } else {
                throw new Error('Token refresh failed - no access token in response');
              }
            } else {
              throw new Error('No refresh token available');
            }
          } catch (refreshError) {
            console.error('❌ [ElementDetailsScreen] Token refresh failed:', refreshError);
            Alert.alert('Session Expired', 'Your session has expired. Please login again.');
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
            setLoading(false);
            return null;
          }
        } else {
          const errorInfo = await handleApiError(response, 'Element Details API');
          Alert.alert('Error', errorInfo.message);
          setLoading(false);
          return null;
        }
      }
    } catch (error) {
      console.error('[ElementDetailsScreen] Error fetching element details:', error);
      setLoading(false);
      Alert.alert(
        'Error',
        error?.message || 'Failed to fetch element details. Please verify the QR code and try again.'
      );
      return null;
    }
  };

  useEffect(() => {
    if (elementId && !initialElementData) {
      fetchElementDetails(elementId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementId]);

  const handleViewFile = async (fileName) => {
    if (!fileName) {
      Alert.alert('Error', 'File name not available');
      return;
    }

    try {
      setDownloadingFile(fileName);
      
      const { accessToken } = await getTokens();
      if (!accessToken) {
        Alert.alert('Error', 'Authentication required. Please login again.');
        setDownloadingFile(null);
        return;
      }

      const apiUrl = `${API_BASE_URL}/api/get-file?file=${encodeURIComponent(fileName)}`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'PrecastApp/1.0',
        },
      });

      if (response.ok) {
        if (Platform.OS === 'web') {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(objectUrl);
          Alert.alert('Success', 'File downloaded successfully');
        } else {
          const fileUri = `${FileSystem.documentDirectory}${fileName}`;
          const downloadResult = await FileSystem.downloadAsync(apiUrl, fileUri, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });

          if (downloadResult.status === 200) {
            const isAvailable = await Sharing.isAvailableAsync();
            if (isAvailable) {
              await Sharing.shareAsync(downloadResult.uri);
              Alert.alert('Success', 'File ready to view or share');
            } else {
              Alert.alert('Success', 'File downloaded successfully');
            }
          } else {
            throw new Error('Download failed');
          }
        }
      } else {
        const errorText = await response.text();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      Alert.alert('Error', `Failed to download file: ${error.message}`);
    } finally {
      setDownloadingFile(null);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BWTheme.textPrimary} />
          <Text style={styles.loadingText}>Loading element details...</Text>
        </View>
      </View>
    );
  }

  if (!elementData) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>No element data available</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Header Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroContent}>
            <Text style={styles.heroId}>{elementData.element_id || 'N/A'}</Text>
            {elementData.CurrentStatus && (
              <View style={[styles.statusBadge, { borderColor: getStatusColor(elementData.CurrentStatus) }]}>
                <Text style={[styles.statusText, { color: getStatusColor(elementData.CurrentStatus) }]}>
                  {elementData.CurrentStatus}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.heroDivider} />
        </View>

        {/* Main Content */}
        <View style={styles.mainContent}>
          {/* Basics Section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLine} />
              <Text style={styles.sectionTitle}>BASICS</Text>
              <View style={styles.sectionHeaderLine} />
            </View>
            
            <View style={styles.infoGrid}>
              <InfoItem 
                label="Element Name" 
                value={elementData.element_id || 'N/A'} 
              />
            
            {elementData.element_type?.element_type && (
                <InfoItem 
                  label="Element Type Version" 
                  value={elementData.element_type.element_type || 'N/A'} 
                />
            )}
            
            {elementData.element_type?.element_type_name && (
                <InfoItem 
                  label="Element Type Name" 
                  value={elementData.element_type.element_type_name || 'N/A'} 
                />
            )}
            
              {elementData.element_type?.element_type_version && (
                <InfoItem 
                  label="Version" 
                  value={elementData.element_type.element_type_version || 'N/A'} 
                />
              )}
              
              <InfoItem 
                label="Tower Name" 
                value={elementData.element_type?.tower_name || '-'} 
              />
            
              {elementData.element_type?.floor_name && (
                <InfoItem 
                  label="Floor Name" 
                  value={elementData.element_type.floor_name || '-'} 
                />
              )}
              
              <InfoItem 
                label="Element Stressing Type" 
                value="Reinforced" 
              />
            
            {elementData.created_by && (
                <InfoItem 
                  label="Created By" 
                  value={`${elementData.created_by} ${elementData.created_at ? formatDate(elementData.created_at, 'full') : ''}`} 
                />
            )}
            
            {elementData.created_at && (
                <InfoItem 
                  label="Created At" 
                  value={formatDate(elementData.created_at)} 
                />
            )}
            
            {elementData.update_at && (
                <InfoItem 
                  label="Updated At" 
                  value={formatDate(elementData.update_at)} 
                />
            )}
            </View>
            
            {/* Dimensions Grid */}
            <View style={styles.dimensionsGrid}>
              <DimensionCard label="Thickness" value={elementData.element_type?.thickness || '-'} />
              <DimensionCard label="Length" value={elementData.element_type?.length || '-'} />
              <DimensionCard label="Height" value={elementData.element_type?.height || '-'} />
              <DimensionCard label="Weight" value={elementData.element_type?.mass || '-'} />
            </View>
          </View>

          {/* Drawings & Materials Section */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeaderLine} />
              <Text style={styles.sectionTitle}>DRAWINGS & MATERIALS</Text>
              <View style={styles.sectionHeaderLine} />
            </View>
            
            {/* Drawings Table */}
            {elementData.element_type?.drawings && elementData.element_type.drawings.length > 0 && (
              <View style={styles.tableWrapper}>
                <View style={styles.tableHeader}>
                  <Text style={styles.tableHeaderText}>NAME</Text>
                  <Text style={styles.tableHeaderText}>VERSION</Text>
                  <Text style={styles.tableHeaderText}>ACTION</Text>
                </View>
                {elementData.element_type.drawings.map((drawing, index) => (
                  <View key={index} style={[styles.tableRow, index === elementData.element_type.drawings.length - 1 && styles.tableRowLast]}>
                    <Text style={styles.tableCell}>{drawing.drawing_type_name || 'N/A'}</Text>
                    <Text style={styles.tableCell}>{drawing.current_version || 'N/A'}</Text>
                    <View style={styles.actionCell}>
                      {downloadingFile === drawing.file ? (
                        <ActivityIndicator size="small" color={BWTheme.textPrimary} />
                      ) : (
                        <TouchableOpacity 
                          style={styles.viewButton}
                          onPress={() => handleViewFile(drawing.file)}
                          disabled={downloadingFile !== null}
                        >
                          <Text style={styles.viewButtonText}>VIEW</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
            
            {/* Bill of Materials */}
            {elementData.element_type?.products && elementData.element_type.products.length > 0 && (
              <View style={styles.bomWrapper}>
                <Text style={styles.bomTitle}>BILL OF MATERIALS</Text>
                <View style={styles.tableWrapper}>
                  <View style={styles.tableHeader}>
                    <Text style={styles.tableHeaderText}>PRODUCT NAME</Text>
                    <Text style={styles.tableHeaderText}>QUANTITY</Text>
                  </View>
                  {elementData.element_type.products.map((product, index) => (
                    <View key={index} style={[styles.tableRow, index === elementData.element_type.products.length - 1 && styles.tableRowLast]}>
                      <Text style={styles.tableCell}>{product.product_name || 'N/A'}</Text>
                      <Text style={styles.tableCell}>{product.quantity || 'N/A'}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Lifecycle Section */}
          {(() => {
            const lifecycleData = elementData?.lifecycle || elementData?.life_cycle || elementData?.lifeCycle || elementData?.life_cycle_history || [];
            const hasLifecycle = Array.isArray(lifecycleData) && lifecycleData.length > 0;
            
            return (
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderLine} />
                  <Text style={styles.sectionTitle}>LIFECYCLE</Text>
                  <View style={styles.sectionHeaderLine} />
                </View>
                {hasLifecycle ? (
                  <View style={styles.lifecycleContainer}>
                    {lifecycleData.map((stage, index) => {
                      const timestamp = stage?.timestamp || stage?.created_at || stage?.date || stage?.time;
                      const hasValidTimestamp = timestamp && typeof timestamp === 'string' && timestamp.trim() !== '';
                      const isLast = index === lifecycleData.length - 1;
                      
                      return (
                        <View key={index} style={styles.lifecycleItem}>
                          <View style={styles.lifecycleTimeline}>
                            <View style={[styles.lifecycleDot, hasValidTimestamp && styles.lifecycleDotActive]} />
                            {!isLast && <View style={styles.lifecycleLine} />}
                          </View>
                          <View style={styles.lifecycleContent}>
                            <Text style={styles.lifecycleLabel}>
                              {stage?.label || stage?.stage_name || stage?.name || stage?.status || 'N/A'}
                            </Text>
                            {hasValidTimestamp ? (
                              <View style={styles.lifecycleDateTime}>
                                <Text style={styles.lifecycleDateText}>
                                  {formatDate(timestamp, 'date')}
                                </Text>
                                <Text style={styles.lifecycleTimeText}>
                                  {formatDate(timestamp, 'time')}
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.lifecyclePendingText}>PENDING</Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.emptyStateContainer}>
                    <Text style={styles.emptyStateText}>No lifecycle data available</Text>
                  </View>
                )}
              </View>
            );
          })()}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <DrawingFilesModal
        visible={drawingFilesModalVisible}
        onClose={() => setDrawingFilesModalVisible(false)}
        elementId={elementData.element_id || elementId}
        elementData={elementData}
      />
    </View>
  );
};

// Info Item Component
const InfoItem = ({ label, value }) => (
  <View style={styles.infoItem}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
    <View style={styles.infoDivider} />
  </View>
);

// Dimension Card Component
const DimensionCard = ({ label, value }) => (
  <View style={styles.dimensionCard}>
    <Text style={styles.dimensionLabel}>{label}</Text>
    <Text style={styles.dimensionValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BWTheme.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BWTheme.background,
  },
  loadingText: {
    marginTop: 20,
    fontSize: FontSizes.regular,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
  },
  errorText: {
    fontSize: FontSizes.medium,
    color: BWTheme.textSecondary,
    textAlign: 'center',
    marginTop: 50,
  },
  heroSection: {
    backgroundColor: BWTheme.surface,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.border,
  },
  heroContent: {
    alignItems: 'center',
  },
  heroId: {
    fontSize: 20,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    letterSpacing: 1,
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  statusText: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  heroDivider: {
    height: 1,
    backgroundColor: BWTheme.border,
    marginTop: 12,
    width: '50%',
    alignSelf: 'center',
  },
  mainContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  sectionCard: {
    backgroundColor: BWTheme.card,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.border,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: BWTheme.border,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    letterSpacing: 2,
    marginHorizontal: 10,
  },
  infoGrid: {
    padding: 12,
  },
  infoItem: {
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 11,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
    letterSpacing: 0.3,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 13,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.regular,
    marginBottom: 6,
  },
  infoDivider: {
    height: 1,
    backgroundColor: BWTheme.border,
  },
  dimensionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    paddingTop: 0,
    gap: 8,
  },
  dimensionCard: {
    width: '48%',
    backgroundColor: BWTheme.surface,
    padding: 10,
    borderWidth: 1,
    borderColor: BWTheme.border,
    borderRadius: 6,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  dimensionLabel: {
    fontSize: 10,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  dimensionValue: {
    fontSize: 15,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.bold,
  },
  tableWrapper: {
    borderTopWidth: 1,
    borderTopColor: BWTheme.border,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BWTheme.surface,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.border,
    paddingVertical: 8,
  },
  tableHeaderText: {
    flex: 1,
    fontSize: 10,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    textAlign: 'center',
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.border,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableCell: {
    flex: 1,
    fontSize: 12,
    color: BWTheme.textPrimary,
    textAlign: 'center',
    fontWeight: FontWeights.regular,
  },
  actionCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewButton: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: BWTheme.textPrimary,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  viewButtonText: {
    fontSize: 10,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  bomWrapper: {
    padding: 12,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: BWTheme.border,
    marginTop: 12,
  },
  bomTitle: {
    fontSize: 11,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    letterSpacing: 1.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  lifecycleContainer: {
    padding: 12,
  },
  lifecycleItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  lifecycleTimeline: {
    width: 28,
    alignItems: 'center',
    marginRight: 12,
  },
  lifecycleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: BWTheme.border,
    backgroundColor: BWTheme.surface,
  },
  lifecycleDotActive: {
    backgroundColor: BWTheme.textPrimary,
    borderColor: BWTheme.textPrimary,
  },
  lifecycleLine: {
    width: 2,
    flex: 1,
    backgroundColor: BWTheme.border,
    marginTop: 3,
    minHeight: 24,
  },
  lifecycleContent: {
    flex: 1,
    paddingTop: 0,
  },
  lifecycleLabel: {
    fontSize: 13,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 3,
  },
  lifecycleDateTime: {
    marginTop: 2,
  },
  lifecycleDateText: {
    fontSize: 11,
    color: BWTheme.textSecondary,
    marginBottom: 2,
    fontWeight: FontWeights.regular,
  },
  lifecycleTimeText: {
    fontSize: 11,
    color: BWTheme.textTertiary,
    fontWeight: FontWeights.regular,
  },
  lifecyclePendingText: {
    fontSize: 11,
    color: BWTheme.textTertiary,
    fontStyle: 'italic',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  emptyStateContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: BWTheme.textTertiary,
    textAlign: 'center',
  },
});

export default ElementDetailsScreen;
