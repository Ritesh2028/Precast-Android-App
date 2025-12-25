import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { getTokens } from '../services/tokenManager';
import { logout } from '../services/authService';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';

const DrawingFilesModal = ({ visible, onClose, elementId, elementData }) => {
  const [drawingFiles, setDrawingFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadingFile, setDownloadingFile] = useState(null);


  useEffect(() => {
    if (visible && elementData) {
      setLoading(true);
      // Extract drawings from elementData (from tasks API response)
      // Expected structure from tasks API:
      // {
      //   "drawings": [
      //     {
      //       "drawing_type_name": "Reinforcement",
      //       "drawing_file": "1751820761-33.jpg",
      //       "drawing_version": "VR-1"
      //     },
      //     {
      //       "drawing_type_name": "Mesh & Mould",
      //       "drawing_file": "751820761-33.jpg",
      //       "drawing_version": "VR-1"
      //     }
      //   ]
      // }
      const drawings = elementData.drawings || [];
      
      console.log('DrawingFilesModal - elementData:', JSON.stringify(elementData, null, 2));
      console.log('DrawingFilesModal - drawings array:', JSON.stringify(drawings, null, 2));
      console.log('DrawingFilesModal - drawings array length:', drawings.length);
      
      // Log each drawing item for debugging
      if (drawings.length > 0) {
        drawings.forEach((drawing, index) => {
          console.log(`DrawingFilesModal - drawing[${index}]:`, JSON.stringify(drawing, null, 2));
        });
      }
      
      if (drawings.length > 0) {
        // Group drawings by drawing_type_name (category)
        const groupedDrawings = {};
        
        drawings.forEach((drawing) => {
          // Extract fields from tasks API response structure
          const category = drawing.drawing_type_name || 'Other';
          const fileName = drawing.drawing_file || '';
          const version = drawing.drawing_version || 'N/A';
          
          if (!groupedDrawings[category]) {
            groupedDrawings[category] = [];
          }
          
          groupedDrawings[category].push({
            version: version,
            fileName: fileName,
            drawingType: category,
            date: new Date().toISOString().split('T')[0], // Use current date as fallback
            comments: '',
          });
        });
        
        // Convert to array format for display
        const formattedDrawings = Object.keys(groupedDrawings).map((category) => ({
          category,
          files: groupedDrawings[category],
        }));
        
        console.log('DrawingFilesModal - formatted drawings:', formattedDrawings);
        setDrawingFiles(formattedDrawings);
      } else {
        console.log('DrawingFilesModal - No drawings found in elementData');
        setDrawingFiles([]);
      }
      setLoading(false);
    } else {
      setDrawingFiles([]);
      setLoading(false);
    }
  }, [visible, elementData]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      const day = date.getDate();
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const year = date.getFullYear();
      return `${month} ${day}, ${year}`;
    } catch {
      return dateString;
    }
  };

  const handleViewFile = async (category, file) => {
    if (!file.fileName) {
      Alert.alert('Error', 'File name not available');
      return;
    }

    try {
      setDownloadingFile(file.fileName);
      
      // Get auth token
      const { accessToken } = await getTokens();
      if (!accessToken) {
        Alert.alert('Error', 'Authentication required. Please login again.');
        return;
      }

      // Build API URL
      const apiUrl = `https://precast.blueinvent.com/api/get-file?file=${encodeURIComponent(file.fileName)}`;
      
      // Download file
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
        // Download file automatically for all platforms
        if (Platform.OS === 'web') {
          // For web, use blob download
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = file.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(objectUrl);
          
          Alert.alert(
            'Download Successful',
            `File "${file.fileName}" has been downloaded successfully.`,
            [{ text: 'OK' }]
          );
        } else {
          // For mobile (iOS/Android), download file directly to device
          try {
            // Get the file extension to determine file type
            const fileExtension = file.fileName.split('.').pop() || 'jpg';
            const fileUri = FileSystem.documentDirectory + file.fileName;
            
            // Show alert that download is starting
            Alert.alert(
              'Download Started',
              `Downloading "${file.fileName}"...`,
              [{ text: 'OK' }]
            );
            
            // Download the file using FileSystem
            const downloadResult = await FileSystem.downloadAsync(apiUrl, fileUri, {
              headers: {
                'Authorization': token,
              },
            });
            
            if (downloadResult.status === 200) {
              // File downloaded successfully
              // Try to save automatically using Sharing
              try {
                const isAvailable = await Sharing.isAvailableAsync();
                
                if (isAvailable) {
                  // Use sharing to save the file - opens native share/save dialog
                  await Sharing.shareAsync(downloadResult.uri, {
                    mimeType: `image/${fileExtension}`,
                    dialogTitle: `Save ${file.fileName}`,
                    UTI: `public.${fileExtension}`,
                  });
                }
              } catch (shareError) {
                console.log('Sharing not available:', shareError);
              }
              
              // Show success alert
              Alert.alert(
                'Download Successful',
                `File "${file.fileName}" has been downloaded and saved to your device.`,
                [{ text: 'OK' }]
              );
            } else {
              throw new Error(`Download failed with status: ${downloadResult.status}`);
            }
          } catch (error) {
            console.log('Error downloading file:', error);
            
            Alert.alert(
              'Download Error',
              `Failed to download file: ${error.message}`,
              [{ text: 'OK' }]
            );
          }
        }
      } else {
        const errorText = await response.text();
        console.log('File download error:', errorText);
        Alert.alert(
          'Download Failed',
          `Failed to download file. Status: ${response.status}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.log('File download error:', error);
      Alert.alert(
        'Download Error',
        `Failed to download file: ${error.message}`,
        [{ text: 'OK' }]
      );
    } finally {
      setDownloadingFile(null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Drawing Files</Text>
              <Text style={styles.subtitle}>View all files related to this element</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading drawing files...</Text>
            </View>
          ) : (
            <ScrollView 
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {drawingFiles.map((categoryData, categoryIndex) => (
                <View key={categoryIndex} style={styles.categoryCard}>
                  <View style={styles.categoryHeader}>
                    <View style={styles.categoryIcon}>
                      <Text style={styles.categoryIconText}>📄</Text>
                    </View>
                    <Text style={styles.categoryTitle}>{categoryData.category}</Text>
                  </View>

                  <View style={styles.tableContainer}>
                    <View style={styles.tableHeader}>
                      <Text style={styles.tableHeaderText}>Version</Text>
                      <Text style={styles.tableHeaderText}>Date</Text>
                      <Text style={styles.tableHeaderText}>Comments</Text>
                      <Text style={styles.tableHeaderText}>Actions</Text>
                    </View>

                    {categoryData.files.map((file, fileIndex) => (
                      <View 
                        key={fileIndex} 
                        style={[
                          styles.tableRow,
                          fileIndex === categoryData.files.length - 1 && styles.lastTableRow
                        ]}
                      >
                        <View style={styles.versionCell}>
                          <View style={styles.versionBadge}>
                            <Text style={styles.versionText}>{file.version}</Text>
                          </View>
                        </View>
                        <View style={styles.dateCell}>
                          <Text style={styles.dateText}>{formatDate(file.date)}</Text>
                        </View>
                        <View style={styles.commentsCell}>
                          <Text style={styles.commentsText}>{file.comments || '-'}</Text>
                        </View>
                        <View style={styles.actionsCell}>
                          <TouchableOpacity 
                            onPress={() => handleViewFile(categoryData.category, file)}
                            disabled={downloadingFile === file.fileName}
                            activeOpacity={0.7}
                          >
                            {downloadingFile === file.fileName ? (
                              <ActivityIndicator size="small" color={Colors.primary} />
                            ) : (
                              <Text style={styles.viewLink}>View</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              ))}

              {drawingFiles.length === 0 && !loading && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No drawing files available</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    minHeight: '60%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.extraLarge,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
  },
  closeButtonText: {
    fontSize: FontSizes.medium,
    color: Colors.textPrimary,
    fontWeight: FontWeights.bold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  categoryCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  categoryIcon: {
    marginRight: 12,
  },
  categoryIconText: {
    fontSize: 20,
  },
  categoryTitle: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tableHeaderText: {
    flex: 1,
    padding: 12,
    fontSize: FontSizes.small,
    fontWeight: FontWeights.semiBold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  lastTableRow: {
    borderBottomWidth: 0,
  },
  versionCell: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionBadge: {
    backgroundColor: '#5AC8FA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  versionText: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.semiBold,
    color: Colors.textWhite,
  },
  dateCell: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
  },
  commentsCell: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentsText: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
  },
  actionsCell: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewLink: {
    fontSize: FontSizes.regular,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
    textDecorationLine: 'underline',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 200,
  },
  loadingText: {
    marginTop: 16,
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
  },
});

export default DrawingFilesModal;

