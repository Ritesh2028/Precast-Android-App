import React, { useState, useEffect, useRef } from 'react';
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
  Modal,
  Dimensions,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '../styles/colors';
import { FontSizes, FontWeights } from '../styles/fonts';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import { getTokens } from '../services/tokenManager';
import { logout, validateSession, refreshSession } from '../services/authService';
import { handle401Error, handleApiError } from '../services/errorHandler';
import BirdsEyeViewModal from '../components/BirdsEyeViewModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const QuestionsScreen = ({ route, navigation }) => {
  const { paperId, taskId, projectId, stageId, activityId } = route.params || {};
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [paperData, setPaperData] = useState(null);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [questionComments, setQuestionComments] = useState({}); // Comments per question: { questionId: 'comment text' }
  const [questionPhotos, setQuestionPhotos] = useState({}); // Photos per question: { questionId: [photo1, photo2, ...] }
  const [status, setStatus] = useState('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [annotationVisible, setAnnotationVisible] = useState(false);
  const [photoToAnnotate, setPhotoToAnnotate] = useState(null);
  const [currentQuestionId, setCurrentQuestionId] = useState(null);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState('');
  const [isDrawing, setIsDrawing] = useState(true);
  const [strokeColor, setStrokeColor] = useState('#007AFF');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showPenOptions, setShowPenOptions] = useState(false);
  const annotationViewRef = useRef(null);
  const [birdsEyeViewVisible, setBirdsEyeViewVisible] = useState(false);
  
  const statusOptions = ['Completed', 'In Progress'];
  
  // Color options for annotation
  const colorOptions = [
    '#007AFF', // Blue (Primary)
    '#FF3B30', // Red
    '#34C759', // Green
    '#FF9500', // Orange
    '#5856D6', // Purple
    '#000000', // Black
  ];
  
  // Pen size options
  const penSizes = [3, 5, 7, 10];

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
      const { accessToken } = await getTokens();
      
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to view questions.');
        navigation.goBack();
        return;
      }

      const apiUrl = `${API_BASE_URL}/api/questions/${paperId}`;
      console.log('📱 [QuestionsScreen] Fetching questions from:', apiUrl);
      console.log('📱 [QuestionsScreen] Access token (first 20 chars):', accessToken ? accessToken.substring(0, 20) + '...' : 'null');

      // First, validate the session to ensure it exists in the database
      let currentToken = accessToken;
      try {
        console.log('📱 [QuestionsScreen] Validating session before Questions API call...');
        const sessionResult = await validateSession();
        console.log('📱 [QuestionsScreen] Session validation response:', JSON.stringify(sessionResult, null, 2));
        
        if (sessionResult && sessionResult.session_id) {
          // Use the validated session_id as the token
          currentToken = sessionResult.session_id;
          console.log('✅ [QuestionsScreen] Session validated, using session_id for Questions API');
          console.log('📱 [QuestionsScreen] Session_id (first 20 chars):', currentToken.substring(0, 20) + '...');
        } else {
          console.log('⚠️ [QuestionsScreen] Session validation returned no session_id, using original token');
        }
      } catch (validateError) {
        console.log('❌ [QuestionsScreen] Session validation failed, using original token:', validateError);
        // Continue with original token
      }

      // Try with Bearer token first (standard format)
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      console.log('📱 [QuestionsScreen] Questions API - Attempt 1: With Bearer token');
      console.log('📱 [QuestionsScreen] Request headers:', JSON.stringify(headersWithBearer, null, 2));
      
      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: headersWithBearer,
      });

      console.log('📱 [QuestionsScreen] Questions API Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix (some APIs expect just the token)
      if (response.status === 401) {
        const responseText1 = await response.text().catch(() => '');
        console.log('❌ [QuestionsScreen] Questions API returned 401 with Bearer token');
        console.log('📱 [QuestionsScreen] Response body:', responseText1);
        console.log('📱 [QuestionsScreen] Questions API - Attempt 2: Without Bearer prefix...');
        
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true });
        console.log('📱 [QuestionsScreen] Request headers (no Bearer):', JSON.stringify(headersWithoutBearer, null, 2));
        
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: headersWithoutBearer,
        });
        
        console.log('📱 [QuestionsScreen] Questions API Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [QuestionsScreen] Questions API Success!');
        console.log('📱 [QuestionsScreen] Questions loaded successfully:', JSON.stringify(data, null, 2));
        setPaperData(data);
      } else {
        const errorText = await response.text();
        console.log('❌ [QuestionsScreen] Questions API Error');
        console.log('📱 [QuestionsScreen] Error status:', response.status);
        console.log('📱 [QuestionsScreen] Error response:', errorText);
        
        // If 401, try to refresh token and retry
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              console.log('🔄 [QuestionsScreen] Questions API 401 - attempting token refresh...');
              const refreshResult = await refreshSession();
              if (refreshResult && refreshResult.access_token) {
                console.log('✅ [QuestionsScreen] Token refreshed successfully');
                
                // Validate the new session to get session_id
                let newToken = refreshResult.access_token;
                try {
                  const newSessionResult = await validateSession();
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                    console.log('✅ [QuestionsScreen] New session validated, using session_id for retry');
                  }
                } catch (validateError) {
                  console.log('⚠️ [QuestionsScreen] New session validation failed, using access_token');
                }
                
                console.log('🔄 [QuestionsScreen] Retrying Questions API with refreshed token...');
                // Retry with new token - try Bearer first
                response = await fetch(apiUrl, {
                  method: 'GET',
                  headers: createAuthHeaders(newToken, { useBearer: true, includeSessionId: true }),
                });
                
                // If still 401, try without Bearer
                if (response.status === 401) {
                  response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: createAuthHeaders(newToken, { useBearer: false, includeSessionId: true }),
                  });
                }
                
                if (response.ok) {
                  const data = await response.json();
                  console.log('✅ [QuestionsScreen] Questions API retry successful!');
                  setPaperData(data);
                  return;
                }
              }
            }
          } catch (refreshError) {
            console.log('❌ [QuestionsScreen] Token refresh failed:', refreshError);
          }
        }
        
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to fetch questions. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [QuestionsScreen] Error fetching questions:', error);
      await handleApiError(error, navigation, 'Network error fetching questions.');
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


  const handleTakePhoto = async (questionId = null) => {
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
        base64: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const photoData = {
          uri: asset.uri,
          type: 'image/jpeg',
          name: `photo_${Date.now()}.jpg`,
          width: asset.width,
          height: asset.height,
        };
        
        // Open annotation modal instead of directly uploading
        setPhotoToAnnotate(photoData);
        setCurrentQuestionId(questionId);
        setPaths([]);
        setCurrentPath('');
        setAnnotationVisible(true);
      }
    } catch (error) {
      console.log('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handleChooseFromGallery = async (questionId = null) => {
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
          width: asset.width,
          height: asset.height,
        };
        
        // Open annotation modal instead of directly uploading
        setPhotoToAnnotate(photoData);
        setCurrentQuestionId(questionId);
        setPaths([]);
        setCurrentPath('');
        setAnnotationVisible(true);
      }
    } catch (error) {
      console.log('Error choosing photo:', error);
      Alert.alert('Error', 'Failed to choose photo. Please try again.');
    }
  };

  const uploadPhotoToServer = async (photoData, questionId = null) => {
    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to upload photos.');
        return;
      }

      const apiUrl = `${API_BASE_URL}/api/upload`;
      console.log('📱 [QuestionsScreen] Uploading photo to:', apiUrl);

      // Validate session first
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
          console.log('✅ [QuestionsScreen] Using validated session_id for upload');
        }
      } catch (validateError) {
        console.log('⚠️ [QuestionsScreen] Session validation failed, using original token');
      }

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', {
        uri: photoData.uri,
        type: photoData.type,
        name: photoData.name,
      });

      // Try with Bearer token first
      const headersWithBearer = {
        ...createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true }),
        // Let fetch set multipart boundaries automatically
      };
      console.log('📱 [QuestionsScreen] Upload - Attempt 1: With Bearer token');

      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: headersWithBearer,
        body: formData,
      });

      console.log('📱 [QuestionsScreen] Upload Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [QuestionsScreen] Upload returned 401 with Bearer, trying without...');
        const headersWithoutBearer = {
          ...createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true }),
        };
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: headersWithoutBearer,
          body: formData,
        });
        console.log('📱 [QuestionsScreen] Upload Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ [QuestionsScreen] Photo uploaded successfully:', JSON.stringify(responseData, null, 2));
        
        // Add uploaded photo to photos array with server response data
        const uploadedPhoto = {
          ...photoData,
          serverResponse: responseData,
          file_name: responseData.file_name, // Save file_name from response
          uploaded: true,
        };
        
        if (questionId) {
          // Add to question-specific photos
          const currentQuestionPhotos = questionPhotos[questionId] || [];
          setQuestionPhotos({
            ...questionPhotos,
            [questionId]: [...currentQuestionPhotos, uploadedPhoto],
          });
        }
      } else {
        const errorText = await response.text();
        console.log('❌ [QuestionsScreen] Error uploading photo');
        console.log('📱 [QuestionsScreen] Error status:', response.status);
        console.log('📱 [QuestionsScreen] Error response:', errorText);
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to upload photo. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [QuestionsScreen] Error uploading photo:', error);
      await handleApiError(error, navigation, 'Network error uploading photo.');
    }
  };

  const handleRemovePhoto = (questionId, photoIndex) => {
    // Remove from question-specific photos
    const questionPhotosList = questionPhotos[questionId] || [];
    const newPhotos = questionPhotosList.filter((_, i) => i !== photoIndex);
    setQuestionPhotos({
      ...questionPhotos,
      [questionId]: newPhotos,
    });
  };

  // PanResponder for drawing on the image
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        return isDrawing;
      },
      onMoveShouldSetPanResponder: () => {
        return isDrawing;
      },
      onPanResponderGrant: (evt) => {
        if (!isDrawing) {
          return;
        }
        const { locationX, locationY } = evt.nativeEvent;
        const newPath = `M${locationX},${locationY}`;
        setCurrentPath(newPath);
      },
      onPanResponderMove: (evt) => {
        if (!isDrawing) return;
        const { locationX, locationY } = evt.nativeEvent;
        setCurrentPath((prevPath) => {
          if (!prevPath) {
            return `M${locationX},${locationY}`;
          }
          return `${prevPath} L${locationX},${locationY}`;
        });
      },
      onPanResponderRelease: () => {
        setCurrentPath((prevPath) => {
          if (prevPath) {
            setPaths((prevPaths) => {
              const newPaths = [...prevPaths, { path: prevPath, color: strokeColor, width: strokeWidth }];
              return newPaths;
            });
          }
          return '';
        });
      },
    })
  ).current;

  const handleSaveAnnotation = async () => {
    try {
      if (!annotationViewRef.current || !photoToAnnotate) {
        return;
      }

      // Capture the annotated image
      const uri = await captureRef(annotationViewRef.current, {
        format: 'jpg',
        quality: 0.9,
      });

      // Create new photo data with annotated image
      const annotatedPhotoData = {
        ...photoToAnnotate,
        uri: uri,
        name: `annotated_${Date.now()}.jpg`,
      };

      // Close annotation modal
      setAnnotationVisible(false);
      setPhotoToAnnotate(null);
      setPaths([]);
      setCurrentPath('');

      // Upload the annotated photo
      await uploadPhotoToServer(annotatedPhotoData, currentQuestionId);
      setCurrentQuestionId(null);
    } catch (error) {
      console.log('Error saving annotation:', error);
      Alert.alert('Error', 'Failed to save annotated photo. Please try again.');
    }
  };

  const handleCancelAnnotation = () => {
    setAnnotationVisible(false);
    setPhotoToAnnotate(null);
    setPaths([]);
    setCurrentPath('');
    setCurrentQuestionId(null);
  };

  const handleClearAnnotation = () => {
    setPaths([]);
    setCurrentPath('');
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
      const { accessToken } = await getTokens();
      
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to submit answers.');
        return;
      }

      if (!validateToken(accessToken)) {
        // Try to refresh token instead of logging out immediately
        const shouldContinue = await handle401Error(null, null, navigation);
        if (!shouldContinue) {
          return;
        }
      }

      // Prepare submission data according to API structure
      const submissionData = {
        answers: paperData.questions.map((question) => {
          // Get question-specific photos or fallback to global photos
          const questionSpecificPhotos = questionPhotos[question.id] || [];
          const questionPhotoFileNames = questionSpecificPhotos
            .filter(photo => photo.file_name)
            .map(photo => photo.file_name);
          
          // Use first photo's file_name for this question, or empty string if no photos
          const imagePath = questionPhotoFileNames.length > 0 ? questionPhotoFileNames[0] : '';
          
          // Get question-specific comment
          const questionComment = questionComments[question.id] || '';
          
          return {
            project_id: projectId || paperData.paper?.project_id || null,
            question_id: question.id,
            option_id: selectedOptions[question.id],
            task_id: taskId || null,
            stage_id: stageId || null,
            comment: questionComment,
            image_path: imagePath, // Use file_name from uploaded photo for this question
          };
        }),
        status: {
          activity_id: activityId || taskId || null,
          status: status.toLowerCase() === 'completed' ? 'completed' : (status.toLowerCase() === 'in progress' ? 'in progress' : status),
        },
      };

      const apiUrl = `${API_BASE_URL}/api/questions/answers`;
      console.log('📱 [QuestionsScreen] Submitting answers to:', apiUrl);
      console.log('📱 [QuestionsScreen] Submission data:', JSON.stringify(submissionData, null, 2));

      // Validate session first
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
          console.log('✅ [QuestionsScreen] Using validated session_id for submission');
        }
      } catch (validateError) {
        console.log('⚠️ [QuestionsScreen] Session validation failed, using original token');
      }

      // Try with Bearer token first
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true });
      console.log('📱 [QuestionsScreen] Submit - Attempt 1: With Bearer token');
      
      let response = await fetch(apiUrl, {
        method: 'POST',
        headers: headersWithBearer,
        body: JSON.stringify(submissionData),
      });

      console.log('📱 [QuestionsScreen] Submit Response 1 - Status:', response.status);

      // If 401, try without Bearer prefix
      if (response.status === 401) {
        console.log('❌ [QuestionsScreen] Submit returned 401 with Bearer, trying without...');
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: createAuthHeaders(currentToken, { useBearer: false, includeSessionId: true }),
          body: JSON.stringify(submissionData),
        });
        console.log('📱 [QuestionsScreen] Submit Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ [QuestionsScreen] Answers submitted successfully:', JSON.stringify(responseData, null, 2));
        Alert.alert('Success', 'Your responses have been submitted successfully.', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        const errorText = await response.text();
        console.log('❌ [QuestionsScreen] Error submitting answers');
        console.log('📱 [QuestionsScreen] Error status:', response.status);
        console.log('📱 [QuestionsScreen] Error response:', errorText);
        
        // If 401, try to refresh token and retry
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            if (refreshToken) {
              console.log('🔄 [QuestionsScreen] Submit API 401 - attempting token refresh...');
              const refreshResult = await refreshSession();
              if (refreshResult && refreshResult.access_token) {
                // Validate the new session
                let newToken = refreshResult.access_token;
                try {
                  const newSessionResult = await validateSession();
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                  }
                } catch (validateError) {
                  console.log('⚠️ [QuestionsScreen] New session validation failed');
                }
                
                console.log('🔄 [QuestionsScreen] Retrying submit with refreshed token...');
                // Retry with new token
                response = await fetch(apiUrl, {
                  method: 'POST',
                  headers: createAuthHeaders(newToken, { useBearer: true, includeSessionId: true }),
                  body: JSON.stringify(submissionData),
                });
                
                if (response.status === 401) {
                  response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: createAuthHeaders(newToken, { useBearer: false, includeSessionId: true }),
                    body: JSON.stringify(submissionData),
                  });
                }
                
                if (response.ok) {
                  const responseData = await response.json();
                  console.log('✅ [QuestionsScreen] Submit retry successful!');
                  Alert.alert('Success', 'Your responses have been submitted successfully.', [
                    {
                      text: 'OK',
                      onPress: () => navigation.goBack(),
                    },
                  ]);
                  return;
                }
              }
            }
          } catch (refreshError) {
            console.log('❌ [QuestionsScreen] Token refresh failed:', refreshError);
          }
        }
        
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to submit answers. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [QuestionsScreen] Error submitting answers:', error);
      await handleApiError(error, navigation, 'Network error submitting answers.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
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
          <View style={styles.paperHeaderContent}>
            <View style={styles.paperHeaderText}>
              <Text style={styles.paperTitle}>QC Questions</Text>
              <Text style={styles.paperSubtitle}>
                Please answer the following questions to proceed.
              </Text>
            </View>
            {/* Bird's Eye View Button */}
            <TouchableOpacity
              style={styles.birdsEyeViewButton}
              onPress={() => {
                setBirdsEyeViewVisible(true);
              }}
              activeOpacity={0.7}
            >
              <Image 
                source={require('../icons/show.png')} 
                style={styles.birdsEyeViewIcon} 
                resizeMode="contain" 
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Questions List */}
        {paperData.questions && paperData.questions.length > 0 ? (
          paperData.questions.map((question, index) => {
            const questionPhotosList = questionPhotos[question.id] || [];
            const questionComment = questionComments[question.id] || '';
            
            return (
              <View key={question.id} style={styles.questionCard}>
                <View style={styles.questionHeader}>
                  <View style={styles.questionNumberBadge}>
                    <Text style={styles.questionNumber}>Q{index + 1}</Text>
                  </View>
                  <Text style={styles.questionText}>{question.question_text}</Text>
                </View>

                {/* Options */}
                <View style={styles.optionsContainer}>
                  {question.options && question.options.length > 0 ? (
                    <View style={styles.optionsRow}>
                      {question.options.map((option) => {
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
                              ]} numberOfLines={2}>
                                {option.option_text}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.noOptionsText}>No options available</Text>
                  )}
                </View>

                {/* Comment Section for this Question */}
                <View style={styles.questionCommentSection}>
                  <Text style={styles.questionSectionTitle}>Add Comment</Text>
                  <TextInput
                    style={styles.questionCommentInput}
                    placeholder="Add your comment here (optional)..."
                    placeholderTextColor={BWTheme.textSecondary}
                    multiline
                    numberOfLines={3}
                    value={questionComment}
                    onChangeText={(text) => {
                      setQuestionComments({
                        ...questionComments,
                        [question.id]: text,
                      });
                    }}
                    textAlignVertical="top"
                  />
                </View>

                {/* Photo Upload Section for this Question */}
                <View style={styles.questionPhotoSection}>
                  <Text style={styles.questionSectionTitle}>Add Photo</Text>
                  <TouchableOpacity
                    style={styles.uploadButton}
                    onPress={() => handleTakePhoto(question.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.uploadButtonText}>Take Photo</Text>
                  </TouchableOpacity>

                  {/* Display Selected Photos for this Question */}
                  {questionPhotosList.length > 0 && (
                    <View style={styles.photosContainer}>
                      {questionPhotosList.map((photo, photoIndex) => (
                        <View key={photoIndex} style={styles.photoItem}>
                          <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                          <TouchableOpacity
                            style={styles.removePhotoButton}
                            onPress={() => handleRemovePhoto(question.id, photoIndex)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.removePhotoText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No questions available</Text>
          </View>
        )}

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

      {/* Bird's Eye View Modal */}
      <BirdsEyeViewModal
        visible={!!birdsEyeViewVisible}
        onClose={() => setBirdsEyeViewVisible(false)}
        projectId={projectId || null}
      />
    </View>
  );
};

// White Background and Black Font Theme
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BWTheme.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BWTheme.background,
    padding: 60,
  },
  loadingText: {
    marginTop: 20,
    fontSize: FontSizes.regular,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.medium,
  },
  errorText: {
    fontSize: FontSizes.regular,
    color: '#FF3B30',
    marginBottom: 16,
    fontWeight: FontWeights.medium,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
  },
  paperHeader: {
    backgroundColor: BWTheme.card,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  paperHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  paperHeaderText: {
    flex: 1,
  },
  paperTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 4,
  },
  paperSubtitle: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
  },
  birdsEyeViewButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  birdsEyeViewIcon: {
    width: 20,
    height: 20,
    tintColor: '#007AFF',
  },
  questionCard: {
    backgroundColor: BWTheme.card,
    padding: 10,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  questionHeader: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.divider,
  },
  questionNumberBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  questionNumber: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: '#FFFFFF',
  },
  questionText: {
    flex: 1,
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.semiBold,
    color: BWTheme.textPrimary,
    lineHeight: 20,
    letterSpacing: 0.3,
  },
  questionCommentSection: {
    marginTop: 6,
    marginBottom: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: BWTheme.divider,
  },
  questionSectionTitle: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 4,
  },
  questionCommentInput: {
    backgroundColor: BWTheme.background,
    borderWidth: 1,
    borderColor: BWTheme.border,
    borderRadius: 8,
    padding: 8,
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    minHeight: 50,
    textAlignVertical: 'top',
  },
  questionPhotoSection: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: BWTheme.divider,
  },
  uploadButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  photosContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  photoItem: {
    position: 'relative',
    marginRight: 8,
    marginBottom: 8,
  },
  photoPreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: BWTheme.surface,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  removePhotoButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  removePhotoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: FontWeights.bold,
  },
  optionsContainer: {
    marginTop: 4,
    marginBottom: 6,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    minWidth: '48%',
    padding: 8,
    borderRadius: 8,
    backgroundColor: BWTheme.background,
    borderWidth: 1.5,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  optionButtonSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: BWTheme.border,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonSelected: {
    borderColor: '#007AFF',
  },
  radioButtonInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#007AFF',
  },
  optionText: {
    flex: 1,
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.medium,
  },
  optionTextSelected: {
    color: '#007AFF',
    fontWeight: FontWeights.semiBold,
  },
  noOptionsText: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    fontStyle: 'italic',
  },
  emptyContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: FontSizes.regular,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 3,
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
  sectionTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 12,
  },
  statusSection: {
    backgroundColor: BWTheme.card,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statusDropdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: BWTheme.background,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: BWTheme.border,
    borderRadius: 8,
  },
  statusDropdownText: {
    fontSize: FontSizes.regular,
    color: BWTheme.textPrimary,
    flex: 1,
    fontWeight: FontWeights.regular,
  },
  statusPlaceholder: {
    color: BWTheme.textSecondary,
  },
  dropdownArrow: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    marginLeft: 8,
    transform: [{ rotate: '0deg' }],
  },
  dropdownArrowOpen: {
    transform: [{ rotate: '180deg' }],
  },
  statusDropdownList: {
    backgroundColor: BWTheme.background,
    borderWidth: 1,
    borderColor: BWTheme.border,
    borderRadius: 8,
    marginTop: 8,
    overflow: 'hidden',
  },
  statusOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.divider,
  },
  statusOptionSelected: {
    backgroundColor: BWTheme.card,
  },
  statusOptionText: {
    fontSize: FontSizes.regular,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.regular,
  },
  statusOptionTextSelected: {
    color: '#007AFF',
    fontWeight: FontWeights.semiBold,
  },
  paperFooter: {
    backgroundColor: BWTheme.card,
    padding: 12,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: BWTheme.border,
  },
  footerText: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    textAlign: 'center',
    fontWeight: FontWeights.medium,
  },
});

export default QuestionsScreen;

