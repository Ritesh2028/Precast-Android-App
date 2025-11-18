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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTokens } from '../services/tokenManager';
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
      
      let token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        const { accessToken } = await getTokens();
        token = accessToken || '';
      }
      
      if (!token) {
        Alert.alert('Authentication Required', 'Please login to fetch element details.');
        setLoading(false);
        return null;
      }
      
      const apiUrl = `https://precast.blueinvent.com/api/scan_element/${elementId}`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': token,
          'session_id': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'PrecastApp/1.0',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setElementData(data);
        setLoading(false);
        return data;
      } else {
        const errorText = await response.text();
        
        if (response.status === 400 || response.status === 401 || response.status === 404) {
          const altResponse = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Authorization': `${token}`,
              'session_id': token,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-Requested-With': 'XMLHttpRequest',
              'User-Agent': 'PrecastApp/1.0',
            },
          });
          
          if (altResponse.ok) {
            const data = await altResponse.json();
            setElementData(data);
            setLoading(false);
            return data;
          } else {
            const altErrorText = await altResponse.text();
            throw new Error(altErrorText || `Request failed with status ${altResponse.status}`);
          }
        } else {
          throw new Error(errorText || `Request failed with status ${response.status}`);
        }
      }
    } catch (error) {
      console.error('Error fetching element details:', error);
      
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
      
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        Alert.alert('Error', 'Authentication required. Please login again.');
        setDownloadingFile(null);
        return;
      }

      const apiUrl = `https://precast.blueinvent.com/api/get-file?file=${encodeURIComponent(fileName)}`;
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': token,
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
              'Authorization': token,
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
  // Hero Section
  heroSection: {
    backgroundColor: BWTheme.surface,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.border,
  },
  heroContent: {
    alignItems: 'center',
  },
  heroId: {
    fontSize: 32,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    letterSpacing: 2,
    marginBottom: 16,
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  statusText: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    letterSpacing: 1,
  },
  heroDivider: {
    height: 1,
    backgroundColor: BWTheme.border,
    marginTop: 24,
    width: '60%',
    alignSelf: 'center',
  },
  // Main Content
  mainContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  // Section Card
  sectionCard: {
    backgroundColor: BWTheme.card,
    borderRadius: 0,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: BWTheme.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.border,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: BWTheme.border,
  },
  sectionTitle: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    letterSpacing: 3,
    marginHorizontal: 16,
  },
  // Info Grid
  infoGrid: {
    padding: 24,
  },
  infoItem: {
    marginBottom: 20,
  },
  infoLabel: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: FontSizes.regular,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.regular,
    marginBottom: 12,
  },
  infoDivider: {
    height: 1,
    backgroundColor: BWTheme.border,
  },
  // Dimensions Grid
  dimensionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 24,
    paddingTop: 0,
    gap: 12,
  },
  dimensionCard: {
    width: '48%',
    backgroundColor: BWTheme.surface,
    padding: 20,
    borderWidth: 1,
    borderColor: BWTheme.border,
    alignItems: 'center',
    minHeight: 100,
    justifyContent: 'center',
  },
  dimensionLabel: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  dimensionValue: {
    fontSize: FontSizes.large,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.bold,
    letterSpacing: 1,
  },
  // Table Styles
  tableWrapper: {
    borderTopWidth: 1,
    borderTopColor: BWTheme.border,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BWTheme.surface,
    borderBottomWidth: 2,
    borderBottomColor: BWTheme.border,
    paddingVertical: 16,
  },
  tableHeaderText: {
    flex: 1,
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    textAlign: 'center',
    letterSpacing: 1.5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.border,
    paddingVertical: 16,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableCell: {
    flex: 1,
    fontSize: FontSizes.regular,
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
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: BWTheme.textPrimary,
    backgroundColor: 'transparent',
  },
  viewButtonText: {
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.bold,
    letterSpacing: 1,
  },
  // BOM Styles
  bomWrapper: {
    padding: 24,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: BWTheme.border,
    marginTop: 24,
  },
  bomTitle: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    letterSpacing: 2,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  // Lifecycle Styles
  lifecycleContainer: {
    padding: 24,
  },
  lifecycleItem: {
    flexDirection: 'row',
    marginBottom: 32,
  },
  lifecycleTimeline: {
    width: 40,
    alignItems: 'center',
    marginRight: 20,
  },
  lifecycleDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
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
    marginTop: 4,
    minHeight: 40,
  },
  lifecycleContent: {
    flex: 1,
    paddingTop: 0,
  },
  lifecycleLabel: {
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  lifecycleDateTime: {
    marginTop: 4,
  },
  lifecycleDateText: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    marginBottom: 4,
    fontWeight: FontWeights.regular,
  },
  lifecycleTimeText: {
    fontSize: FontSizes.small,
    color: BWTheme.textTertiary,
    fontWeight: FontWeights.regular,
  },
  lifecyclePendingText: {
    fontSize: FontSizes.small,
    color: BWTheme.textTertiary,
    fontStyle: 'italic',
    marginTop: 4,
    letterSpacing: 1,
  },
  emptyStateContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: FontSizes.regular,
    color: BWTheme.textTertiary,
    textAlign: 'center',
  },
});

export default ElementDetailsScreen;
