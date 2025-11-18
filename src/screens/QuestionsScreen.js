import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../styles/colors';
import { FontSizes, FontWeights } from '../styles/fonts';

const QuestionsScreen = ({ route, navigation }) => {
  const { paperId, taskId, projectId, stageId, activityId } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [paperData, setPaperData] = useState(null);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState('');
  const [photos, setPhotos] = useState([]);
  const [status, setStatus] = useState('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  
  const statusOptions = ['Completed', 'In Progress'];

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

  useEffect(() => {
    loadQuestions();
    requestPermissions();
  }, [paperId]);

  const requestPermissions = async () => {
    // Request camera permission
    const cameraStatus = await ImagePicker.requestCameraPermissionsAsync();
    if (cameraStatus.status !== 'granted') {
      console.log('Camera permission not granted');
    }
    
    // Request media library permission
    const mediaStatus = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (mediaStatus.status !== 'granted') {
      console.log('Media library permission not granted');
    }
  };

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('auth_token');
      
      if (!token) {
        Alert.alert('Authentication Required', 'Please login to view questions.');
        navigation.goBack();
        return;
      }

      if (!validateToken(token)) {
        Alert.alert('Session Expired', 'Your session has expired. Please login again.');
        await AsyncStorage.removeItem('auth_token');
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
        return;
      }

      const apiUrl = `https://precast.blueinvent.com/api/questions/${paperId}`;
      console.log('Fetching questions from:', apiUrl);

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
        console.log('Questions loaded successfully:', data);
        setPaperData(data);
      } else {
        const errorText = await response.text();
        console.log('Error fetching questions:', errorText);
        if (response.status === 401) {
          Alert.alert('Authentication Error', 'Your session has expired. Please login again.');
          await AsyncStorage.removeItem('auth_token');
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        } else {
          Alert.alert('Error', `Failed to fetch questions. Status: ${response.status}`);
        }
      }
    } catch (error) {
      console.log('Error fetching questions:', error);
      Alert.alert('Network Error', `Failed to fetch questions: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (questionId, optionId) => {
    setSelectedOptions({
      ...selectedOptions,
      [questionId]: optionId,
    });
  };

  const handlePickImage = () => {
    // Open camera directly
    handleTakePhoto();
  };

  const handleTakePhoto = async () => {
    try {
      // Check camera permission
      const { status } = await ImagePicker.getCameraPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await ImagePicker.requestCameraPermissionsAsync();
        if (newStatus !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Camera permission is required to take photos.'
          );
          return;
        }
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1.0,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const photoData = {
          uri: asset.uri,
          type: 'image/jpeg',
          name: `photo_${Date.now()}.jpg`,
        };
        
        // Upload photo to server
        await uploadPhotoToServer(photoData);
      }
    } catch (error) {
      console.log('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handleChooseFromGallery = async () => {
    try {
      // Check media library permission
      const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (newStatus !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Media library permission is required to select photos.'
          );
          return;
        }
      }

      // Launch image library
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1.0,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const photoData = {
          uri: asset.uri,
          type: 'image/jpeg',
          name: `photo_${Date.now()}.jpg`,
        };
        
        // Upload photo to server
        await uploadPhotoToServer(photoData);
      }
    } catch (error) {
      console.log('Error choosing photo:', error);
      Alert.alert('Error', 'Failed to choose photo. Please try again.');
    }
  };

  const uploadPhotoToServer = async (photoData) => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        Alert.alert('Authentication Required', 'Please login to upload photos.');
        return;
      }

      if (!validateToken(token)) {
        Alert.alert('Session Expired', 'Your session has expired. Please login again.');
        await AsyncStorage.removeItem('auth_token');
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
        return;
      }

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', {
        uri: photoData.uri,
        type: photoData.type,
        name: photoData.name,
      });

      const apiUrl = 'https://precast.blueinvent.com/api/upload';
      console.log('Uploading photo to:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': token,
          'session_id': token,
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'PrecastApp/1.0',
        },
        body: formData,
      });

      if (response.ok) {
        const responseData = await response.json();
        console.log('Photo uploaded successfully:', responseData);
        
        // Add uploaded photo to photos array with server response data
        const uploadedPhoto = {
          ...photoData,
          serverResponse: responseData,
          file_name: responseData.file_name, // Save file_name from response
          uploaded: true,
        };
        setPhotos([...photos, uploadedPhoto]);
        Alert.alert('Success', 'Photo uploaded successfully!');
      } else {
        const errorText = await response.text();
        console.log('Error uploading photo:', errorText);
        if (response.status === 401) {
          Alert.alert('Authentication Error', 'Your session has expired. Please login again.');
          await AsyncStorage.removeItem('auth_token');
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        } else {
          Alert.alert('Upload Error', `Failed to upload photo. Status: ${response.status}`);
        }
      }
    } catch (error) {
      console.log('Error uploading photo:', error);
      Alert.alert('Network Error', `Failed to upload photo: ${error.message}`);
    }
  };

  const handleRemovePhoto = (index) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
  };

  const handleSubmit = async () => {
    // Check if all questions are answered
    if (!paperData || !paperData.questions) {
      Alert.alert('Error', 'No questions available');
      return;
    }

    const unansweredQuestions = paperData.questions.filter(
      (q) => !selectedOptions[q.id]
    );

    if (unansweredQuestions.length > 0) {
      Alert.alert('Incomplete', 'Please answer all questions before submitting.');
      return;
    }

    try {
      setSubmitting(true);
      const token = await AsyncStorage.getItem('auth_token');
      
      if (!token) {
        Alert.alert('Authentication Required', 'Please login to submit answers.');
        return;
      }

      if (!validateToken(token)) {
        Alert.alert('Session Expired', 'Your session has expired. Please login again.');
        await AsyncStorage.removeItem('auth_token');
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
        return;
      }

      // Get file_name from uploaded photos (use first photo's file_name for all answers, or distribute)
      const fileNames = photos
        .filter(photo => photo.file_name)
        .map(photo => photo.file_name);
      
      // Use first file_name for all answers, or empty string if no photos
      const imagePath = fileNames.length > 0 ? fileNames[0] : '';

      // Prepare submission data according to API structure
      const submissionData = {
        answers: paperData.questions.map((question) => ({
          project_id: projectId || paperData.paper?.project_id || null,
          question_id: question.id,
          option_id: selectedOptions[question.id],
          task_id: taskId || null,
          stage_id: stageId || null,
          comment: comments.trim() || '',
          image_path: imagePath, // Use file_name from uploaded photo
        })),
        status: {
          activity_id: activityId || taskId || null,
          status: status.toLowerCase() === 'completed' ? 'completed' : (status.toLowerCase() === 'in progress' ? 'in progress' : status),
        },
      };

      const apiUrl = 'https://precast.blueinvent.com/api/questions/answers';
      console.log('Submitting answers to:', apiUrl);
      console.log('Submission data:', JSON.stringify(submissionData, null, 2));

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': token,
          'session_id': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'PrecastApp/1.0',
        },
        body: JSON.stringify(submissionData),
      });

      if (response.ok) {
        const responseData = await response.json();
        console.log('Answers submitted successfully:', responseData);
        Alert.alert('Success', 'Your responses have been submitted successfully.', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        const errorText = await response.text();
        console.log('Error submitting answers:', errorText);
        if (response.status === 401) {
          Alert.alert('Authentication Error', 'Your session has expired. Please login again.');
          await AsyncStorage.removeItem('auth_token');
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          });
        } else {
          Alert.alert('Error', `Failed to submit answers. Status: ${response.status}`);
        }
      }
    } catch (error) {
      console.log('Error submitting answers:', error);
      Alert.alert('Network Error', `Failed to submit answers: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading questions...</Text>
      </View>
    );
  }

  if (!paperData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>No questions available</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadQuestions}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Paper Header */}
        <View style={styles.paperHeader}>
          <Text style={styles.paperTitle}>QC Questions</Text>
          <Text style={styles.paperSubtitle}>
            Please answer the following questions to proceed.
          </Text>
        </View>

        {/* Questions List */}
        {paperData.questions && paperData.questions.length > 0 ? (
          paperData.questions.map((question, index) => (
            <View key={question.id} style={styles.questionCard}>
              <View style={styles.questionHeader}>
                <Text style={styles.questionNumber}>Q{index + 1}</Text>
                <Text style={styles.questionText}>{question.question_text}</Text>
              </View>

              {/* Options */}
              <View style={styles.optionsContainer}>
                {question.options && question.options.length > 0 ? (
                  question.options.map((option) => {
                    const isSelected = selectedOptions[question.id] === option.id;
                    return (
                      <TouchableOpacity
                        key={option.id}
                        style={[
                          styles.optionButton,
                          isSelected && styles.optionButtonSelected,
                        ]}
                        onPress={() => handleOptionSelect(question.id, option.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.optionContent}>
                          <View style={[
                            styles.radioButton,
                            isSelected && styles.radioButtonSelected,
                          ]}>
                            {isSelected && <View style={styles.radioButtonInner} />}
                          </View>
                          <Text style={[
                            styles.optionText,
                            isSelected && styles.optionTextSelected,
                          ]}>
                            {option.option_text}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <Text style={styles.noOptionsText}>No options available</Text>
                )}
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No questions available</Text>
          </View>
        )}

        {/* Comments Section */}
        <View style={styles.commentsSection}>
          <Text style={styles.sectionTitle}>Comments</Text>
          <TextInput
            style={styles.commentsInput}
            placeholder="Add your comments here (optional)..."
            placeholderTextColor={Colors.textSecondary}
            multiline
            numberOfLines={4}
            value={comments}
            onChangeText={setComments}
            textAlignVertical="top"
          />
        </View>

        {/* Photo Upload Section */}
        <View style={styles.photosSection}>
          <Text style={styles.sectionTitle}>Photos</Text>
          <View style={styles.photoButtonsContainer}>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={handlePickImage}
              activeOpacity={0.7}
            >
              <Text style={styles.uploadButtonText}>📷 Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chooseButton}
              onPress={handleChooseFromGallery}
              activeOpacity={0.7}
            >
              <Text style={styles.chooseButtonText}>Choose from Device</Text>
            </TouchableOpacity>
          </View>

          {/* Display Selected Photos */}
          {photos.length > 0 && (
            <View style={styles.photosContainer}>
              {photos.map((photo, index) => (
                <View key={index} style={styles.photoItem}>
                  <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                  <TouchableOpacity
                    style={styles.removePhotoButton}
                    onPress={() => handleRemovePhoto(index)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.removePhotoText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Status Section */}
        <View style={styles.statusSection}>
          <Text style={styles.sectionTitle}>Status</Text>
          <TouchableOpacity
            style={styles.statusDropdown}
            onPress={() => setStatusDropdownOpen(!statusDropdownOpen)}
            activeOpacity={0.7}
          >
            <Text style={[styles.statusDropdownText, !status && styles.statusPlaceholder]}>
              {status || 'Select a Status'}
            </Text>
            <Text style={[styles.dropdownArrow, statusDropdownOpen && styles.dropdownArrowOpen]}>
              ▼
            </Text>
          </TouchableOpacity>

          {/* Status Dropdown List - Inline */}
          {statusDropdownOpen && (
            <View style={styles.statusDropdownList}>
              {statusOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.statusOption,
                    status === option && styles.statusOptionSelected,
                  ]}
                  onPress={() => {
                    setStatus(option);
                    setStatusDropdownOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.statusOptionText,
                      status === option && styles.statusOptionTextSelected,
                    ]}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Submit Button */}
        {paperData.questions && paperData.questions.length > 0 && (
          <TouchableOpacity
            style={[
              styles.submitButton,
              submitting && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Answers</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Footer */}
        <View style={styles.paperFooter}>
          <Text style={styles.footerText}>
            Please review all your answers before submitting.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: FontSizes.regular,
    color: '#FF3B30',
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
  },
  paperHeader: {
    backgroundColor: Colors.card,
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  paperTitle: {
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  paperSubtitle: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
  },
  questionCard: {
    backgroundColor: Colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  questionHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  questionNumber: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    marginRight: 12,
    minWidth: 30,
  },
  questionText: {
    flex: 1,
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.medium,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  optionsContainer: {
    marginTop: 8,
  },
  optionButton: {
    padding: 14,
    borderRadius: 8,
    marginBottom: 10,
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  optionButtonSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: Colors.primary,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: Colors.primary,
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  optionText: {
    flex: 1,
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
  },
  optionTextSelected: {
    color: Colors.primary,
    fontWeight: FontWeights.semiBold,
  },
  noOptionsText: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  commentsSection: {
    backgroundColor: Colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  commentsInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  photosSection: {
    backgroundColor: Colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  photoButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  uploadButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.semiBold,
  },
  chooseButton: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    flex: 1,
  },
  chooseButtonText: {
    color: Colors.primary,
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.semiBold,
  },
  photosContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  photoItem: {
    position: 'relative',
    marginRight: 12,
    marginBottom: 12,
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: Colors.background,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  removePhotoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: FontWeights.bold,
  },
  statusSection: {
    backgroundColor: Colors.card,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusDropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
  },
  statusDropdownText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    flex: 1,
    fontWeight: FontWeights.regular,
  },
  statusPlaceholder: {
    color: Colors.textSecondary,
  },
  dropdownArrow: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    marginLeft: 8,
    transform: [{ rotate: '0deg' }],
  },
  dropdownArrowOpen: {
    transform: [{ rotate: '180deg' }],
  },
  statusDropdownList: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    marginTop: 8,
    overflow: 'hidden',
  },
  statusOption: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statusOptionSelected: {
    backgroundColor: Colors.card,
  },
  statusOptionText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    fontWeight: FontWeights.regular,
  },
  statusOptionTextSelected: {
    color: Colors.primary,
    fontWeight: FontWeights.semiBold,
  },
  paperFooter: {
    backgroundColor: Colors.card,
    padding: 20,
    borderRadius: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  footerText: {
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});

export default QuestionsScreen;

