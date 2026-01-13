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
  Platform,
  Modal,
  Dimensions,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';
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
  // Use refs to store current color and width so panResponder always has latest values
  const strokeColorRef = useRef('#007AFF');
  const strokeWidthRef = useRef(4);
  const [birdsEyeViewVisible, setBirdsEyeViewVisible] = useState(false);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);
  
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

  // Keep refs in sync with state for panResponder (so it always uses latest color/width)
  useEffect(() => {
    strokeColorRef.current = strokeColor;
    console.log('🎨 [QuestionsScreen] strokeColorRef updated to:', strokeColor);
  }, [strokeColor]);

  useEffect(() => {
    strokeWidthRef.current = strokeWidth;
    console.log('🎨 [QuestionsScreen] strokeWidthRef updated to:', strokeWidth);
  }, [strokeWidth]);

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

    // Request location permission
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission not granted');
      } else {
        console.log('✅ [QuestionsScreen] Location permission granted');
      }
    } catch (error) {
      console.log('⚠️ [QuestionsScreen] Error requesting location permission:', error);
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
      console.log('📸 [QuestionsScreen] Starting image capture...');
      console.log('📸 [QuestionsScreen] Question ID:', questionId);
      
      // Check camera permission
      const { status } = await ImagePicker.getCameraPermissionsAsync();
      console.log('📸 [QuestionsScreen] Camera permission status:', status);
      
      if (status !== 'granted') {
        const { status: newStatus } = await ImagePicker.requestCameraPermissionsAsync();
        console.log('📸 [QuestionsScreen] Requested camera permission, new status:', newStatus);
        if (newStatus !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Camera permission is required to take photos.'
          );
          return;
        }
      }

      // Get location before taking photo
      let locationData = null;
      try {
        const { status: locationStatus } = await Location.getForegroundPermissionsAsync();
        if (locationStatus === 'granted') {
            console.log('📍 [QuestionsScreen] Getting location...');
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
              maximumAge: 10000,
            });
            
            console.log('📍 [QuestionsScreen] Location obtained:', {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
            });

            // Reverse geocode to get address
            try {
              const addresses = await Location.reverseGeocodeAsync({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              });
              
              if (addresses && addresses.length > 0) {
                const address = addresses[0];
                locationData = {
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  altitude: location.coords.altitude,
                  accuracy: location.coords.accuracy,
                  address: {
                    street: address.street || '',
                    city: address.city || '',
                    region: address.region || '',
                    country: address.country || '',
                    postalCode: address.postalCode || '',
                    name: address.name || '',
                    formatted: `${address.street || ''} ${address.city || ''} ${address.region || ''} ${address.country || ''}`.trim(),
                  },
                  timestamp: new Date().toISOString(),
                };
                console.log('📍 [QuestionsScreen] Address obtained:', locationData.address);
              } else {
                locationData = {
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                  altitude: location.coords.altitude,
                  accuracy: location.coords.accuracy,
                  timestamp: new Date().toISOString(),
                };
              }
            } catch (geocodeError) {
              console.log('⚠️ [QuestionsScreen] Reverse geocoding failed:', geocodeError);
              locationData = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                altitude: location.coords.altitude,
                accuracy: location.coords.accuracy,
                timestamp: new Date().toISOString(),
              };
            }
          } else {
            console.log('⚠️ [QuestionsScreen] Location permission not granted');
          }
        } catch (locationError) {
          console.log('⚠️ [QuestionsScreen] Error getting location:', locationError);
      }

      // Launch camera
      console.log('📸 [QuestionsScreen] Launching camera...');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: false,
        quality: 1.0,
        base64: false,
      });

      console.log('📸 [QuestionsScreen] Camera result:', {
        canceled: result.canceled,
        assetsCount: result.assets?.length || 0,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const photoData = {
          uri: asset.uri,
          type: 'image/jpeg',
          name: `photo_${Date.now()}.jpg`,
          width: asset.width,
          height: asset.height,
          location: locationData, // Add location data to photo
        };
        
        console.log('✅ [QuestionsScreen] Image captured successfully:', {
          uri: photoData.uri,
          name: photoData.name,
          width: photoData.width,
          height: photoData.height,
          type: photoData.type,
          hasLocation: !!locationData,
        });
        
        // Open annotation modal instead of directly uploading
        setPhotoToAnnotate(photoData);
        setCurrentQuestionId(questionId);
        setPaths([]);
        setCurrentPath('');
        setAnnotationVisible(true);
        console.log('🎨 [QuestionsScreen] Annotation modal opened');
      } else {
        console.log('ℹ️ [QuestionsScreen] Image capture canceled by user');
      }
    } catch (error) {
      console.log('❌ [QuestionsScreen] Error taking photo:', error);
      console.log('❌ [QuestionsScreen] Error details:', JSON.stringify(error, null, 2));
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
        mediaTypes: 'images',
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
      // React Native FormData format: { uri, type, name }
      const fileUri = photoData.uri;
      const fileType = photoData.type || 'image/jpeg';
      const fileName = photoData.name || `photo_${Date.now()}.jpg`;
      
      console.log('📤 [QuestionsScreen] Preparing file for upload:', {
        uri: fileUri,
        type: fileType,
        name: fileName,
        uriExists: !!fileUri,
        uriType: typeof fileUri,
      });
      
      // Verify file URI is accessible
      if (!fileUri || !fileUri.startsWith('file://') && !fileUri.startsWith('content://') && !fileUri.startsWith('http')) {
        console.log('⚠️ [QuestionsScreen] File URI format might be incorrect:', fileUri);
      }
      
      const formData = new FormData();
      formData.append('file', {
        uri: fileUri,
        type: fileType,
        name: fileName,
      });
      
      console.log('📤 [QuestionsScreen] FormData created successfully');

      // Try with Bearer token first
      // IMPORTANT: Don't set Content-Type for FormData - React Native will set it with boundary
      const headersWithBearer = {
        ...createAuthHeaders(currentToken, { useBearer: true, includeSessionId: true }),
      };
      // Remove Content-Type to let React Native set multipart/form-data with boundary
      delete headersWithBearer['Content-Type'];
      console.log('📱 [QuestionsScreen] Upload - Attempt 1: With Bearer token');
      console.log('📱 [QuestionsScreen] Upload headers:', JSON.stringify(headersWithBearer, null, 2));

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
        // Remove Content-Type to let React Native set multipart/form-data with boundary
        delete headersWithoutBearer['Content-Type'];
        console.log('📱 [QuestionsScreen] Upload headers (no Bearer):', JSON.stringify(headersWithoutBearer, null, 2));
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: headersWithoutBearer,
          body: formData,
        });
        console.log('📱 [QuestionsScreen] Upload Response 2 - Status:', response.status);
      }

      if (response.ok) {
        const responseData = await response.json();
        console.log('✅ [QuestionsScreen] ==========================================');
        console.log('✅ [QuestionsScreen] PHOTO UPLOAD SUCCESSFUL!');
        console.log('✅ [QuestionsScreen] ==========================================');
        console.log('✅ [QuestionsScreen] Response Status:', response.status);
        console.log('✅ [QuestionsScreen] Response Data:', JSON.stringify(responseData, null, 2));
        console.log('✅ [QuestionsScreen] File Name:', responseData.file_name || 'N/A');
        console.log('✅ [QuestionsScreen] File URL:', responseData.url || responseData.file_path || 'N/A');
        console.log('✅ [QuestionsScreen] Full Response:', responseData);
        console.log('✅ [QuestionsScreen] ==========================================');
        
        // Add uploaded photo to photos array with server response data
        const uploadedPhoto = {
          ...photoData,
          serverResponse: responseData,
          file_name: responseData.file_name || responseData.filename || responseData.name, // Save file_name from response
          uploaded: true,
          uploadedAt: new Date().toISOString(),
        };
        
        console.log('📸 [QuestionsScreen] Adding photo to question photos list:', {
          questionId: questionId,
          photoUri: uploadedPhoto.uri,
          fileName: uploadedPhoto.file_name,
        });
        
        if (questionId) {
          // Add to question-specific photos
          const currentQuestionPhotos = questionPhotos[questionId] || [];
          const updatedPhotos = [...currentQuestionPhotos, uploadedPhoto];
          setQuestionPhotos({
            ...questionPhotos,
            [questionId]: updatedPhotos,
          });
          console.log('✅ [QuestionsScreen] Photo added to question photos. Total photos for question:', updatedPhotos.length);
        } else {
          console.log('⚠️ [QuestionsScreen] No questionId provided, photo not added to list');
        }
        
        // Show success alert
        Alert.alert(
          'Success',
          `Photo uploaded successfully!\nFile: ${uploadedPhoto.file_name || 'uploaded'}`,
          [{ text: 'OK' }]
        );
      } else {
        // Response exists but status is not OK
        let errorText = 'Unknown error';
        try {
          errorText = await response.text();
        } catch (textError) {
          console.log('⚠️ [QuestionsScreen] Could not read error response text:', textError);
          errorText = `Status: ${response.status}`;
        }
        console.log('❌ [QuestionsScreen] Error uploading photo');
        console.log('📱 [QuestionsScreen] Error status:', response.status);
        console.log('📱 [QuestionsScreen] Error response:', errorText);
        await handleApiError({ response: { status: response.status, data: { message: errorText } } }, navigation, `Failed to upload photo. Status: ${response.status}`);
      }
    } catch (error) {
      console.log('❌ [QuestionsScreen] Error uploading photo:', error);
      console.log('❌ [QuestionsScreen] Error type:', error?.constructor?.name);
      console.log('❌ [QuestionsScreen] Error message:', error?.message);
      console.log('❌ [QuestionsScreen] Error stack:', error?.stack);
      
      // Check if it's a network error
      if (error?.message?.includes('Network request failed') || error?.message?.includes('Failed to fetch')) {
        Alert.alert(
          'Network Error',
          'Failed to upload photo. Please check your internet connection and try again.',
          [{ text: 'OK' }]
        );
      } else {
      await handleApiError(error, navigation, 'Network error uploading photo.');
      }
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
        const shouldRespond = isDrawing;
        console.log('🎨 [QuestionsScreen] onStartShouldSetPanResponder:', shouldRespond, 'isDrawing:', isDrawing);
        return shouldRespond;
      },
      onMoveShouldSetPanResponder: () => {
        const shouldRespond = isDrawing;
        console.log('🎨 [QuestionsScreen] onMoveShouldSetPanResponder:', shouldRespond);
        return shouldRespond;
      },
      onPanResponderGrant: (evt) => {
        console.log('🎨 [QuestionsScreen] onPanResponderGrant - isDrawing:', isDrawing);
        if (!isDrawing) {
          return;
        }
        const { locationX, locationY } = evt.nativeEvent;
        console.log('🎨 [QuestionsScreen] Drawing started at:', { locationX, locationY });
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
        console.log('🎨 [QuestionsScreen] onPanResponderRelease - saving path');
        console.log('🎨 [QuestionsScreen] Current strokeColor from ref:', strokeColorRef.current);
        console.log('🎨 [QuestionsScreen] Current strokeWidth from ref:', strokeWidthRef.current);
        setCurrentPath((prevPath) => {
          if (prevPath) {
            console.log('🎨 [QuestionsScreen] Path saved:', prevPath.substring(0, 50) + '...');
            setPaths((prevPaths) => {
              // Use ref values to get the latest color and width
              const newPaths = [...prevPaths, { 
                path: prevPath, 
                color: strokeColorRef.current, 
                width: strokeWidthRef.current 
              }];
              console.log('🎨 [QuestionsScreen] Total paths:', newPaths.length);
              console.log('🎨 [QuestionsScreen] Path color:', strokeColorRef.current);
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
      console.log('🎨 [QuestionsScreen] Starting annotation save...');
      
      if (!annotationViewRef.current || !photoToAnnotate) {
        console.log('❌ [QuestionsScreen] Missing annotation ref or photo data');
        return;
      }

      console.log('🎨 [QuestionsScreen] Capturing annotated image...');
      console.log('🎨 [QuestionsScreen] Annotation paths count:', paths.length);
      console.log('🎨 [QuestionsScreen] Current path:', currentPath ? 'exists' : 'empty');
      console.log('🎨 [QuestionsScreen] Stroke color:', strokeColor);
      console.log('🎨 [QuestionsScreen] Stroke width:', strokeWidth);

      // Capture the annotated image
      const uri = await captureRef(annotationViewRef.current, {
        format: 'jpg',
        quality: 0.9,
      });

      console.log('✅ [QuestionsScreen] Annotated image captured:', {
        uri: uri,
        originalUri: photoToAnnotate.uri,
      });

      // Create new photo data with annotated image
      // Preserve location data from original photo
      const annotatedPhotoData = {
        ...photoToAnnotate,
        uri: uri,
        name: `annotated_${Date.now()}.jpg`,
        location: photoToAnnotate.location, // Preserve location data
      };

      console.log('📤 [QuestionsScreen] Prepared annotated photo data:', {
        uri: annotatedPhotoData.uri,
        name: annotatedPhotoData.name,
        type: annotatedPhotoData.type,
        width: annotatedPhotoData.width,
        height: annotatedPhotoData.height,
      });

      // Close annotation modal
      setAnnotationVisible(false);
      setPhotoToAnnotate(null);
      setPaths([]);
      setCurrentPath('');
      console.log('🎨 [QuestionsScreen] Annotation modal closed');

      // Upload the annotated photo
      console.log('📤 [QuestionsScreen] Starting upload of annotated photo...');
      await uploadPhotoToServer(annotatedPhotoData, currentQuestionId);
      setCurrentQuestionId(null);
    } catch (error) {
      console.log('❌ [QuestionsScreen] Error saving annotation:', error);
      console.log('❌ [QuestionsScreen] Error details:', JSON.stringify(error, null, 2));
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
                          <TouchableOpacity
                            onPress={() => {
                              setViewingImage(photo);
                              setImageViewerVisible(true);
                            }}
                            activeOpacity={0.8}
                            style={styles.photoPreviewContainer}
                          >
                            <Image 
                              source={{ uri: photo.uri }} 
                              style={styles.photoPreview}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
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

       
        
      </ScrollView>

      {/* Annotation Modal - Beautiful & User-Friendly */}
      <Modal
        visible={annotationVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={handleCancelAnnotation}
        statusBarTranslucent={true}
      >
        <View style={styles.annotationContainer}>
          {/* Top Toolbar - Modern Design */}
          <View style={styles.annotationHeader}>
            <TouchableOpacity
              onPress={handleCancelAnnotation}
              style={styles.annotationCancelButton}
              activeOpacity={0.7}
            >
              <View style={styles.iconButton}>
                <Text style={styles.iconText}>✕</Text>
              </View>
              <Text style={styles.annotationCancelText}>Cancel</Text>
            </TouchableOpacity>
            <View style={styles.annotationTitleContainer}>
              <Text style={styles.annotationTitle}>Edit Photo</Text>
              <Text style={styles.annotationSubtitle}>Draw on your image</Text>
            </View>
            <TouchableOpacity
              onPress={handleSaveAnnotation}
              style={styles.annotationDoneButton}
              activeOpacity={0.8}
            >
              <Text style={styles.annotationDoneText}>✓ Save</Text>
            </TouchableOpacity>
          </View>

          {/* Image with Drawing Canvas */}
          <View
            ref={annotationViewRef}
            style={styles.annotationImageContainer}
            collapsable={false}
            {...panResponder.panHandlers}
          >
            {photoToAnnotate && (
              <Image
                source={{ uri: photoToAnnotate.uri }}
                style={styles.annotationImage}
                resizeMode="contain"
              />
            )}
            <Svg style={styles.annotationSvg} width={SCREEN_WIDTH} height={SCREEN_HEIGHT * 0.7}>
              {paths.map((pathData, index) => (
                <Path
                  key={index}
                  d={pathData.path}
                  stroke={pathData.color}
                  strokeWidth={pathData.width}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {currentPath && (
                <Path
                  d={currentPath}
                  stroke={strokeColorRef.current || strokeColor}
                  strokeWidth={strokeWidthRef.current || strokeWidth}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </Svg>
          </View>

          {/* Bottom Toolbar - Enhanced Design */}
          <View style={styles.annotationToolbar}>
            {/* Color Picker Button */}
            <TouchableOpacity
              onPress={() => {
                setShowColorPicker(!showColorPicker);
                setShowPenOptions(false);
              }}
              style={[
                styles.annotationToolButton,
                showColorPicker && styles.annotationToolButtonActive
              ]}
              activeOpacity={0.7}
            >
              <View style={[styles.colorPreview, { backgroundColor: strokeColor }]}>
                {showColorPicker && <View style={styles.activeIndicator} />}
              </View>
              <Text style={[
                styles.annotationToolText,
                showColorPicker && styles.annotationToolTextActive
              ]}>Color</Text>
            </TouchableOpacity>

            {/* Pen Size Button */}
            <TouchableOpacity
              onPress={() => {
                setShowPenOptions(!showPenOptions);
                setShowColorPicker(false);
              }}
              style={[
                styles.annotationToolButton,
                showPenOptions && styles.annotationToolButtonActive
              ]}
              activeOpacity={0.7}
            >
              <View style={styles.penSizePreview}>
                <View style={[styles.penSizeDot, { 
                  width: Math.max(strokeWidth * 2, 8), 
                  height: Math.max(strokeWidth * 2, 8), 
                  backgroundColor: strokeColor 
                }]} />
                {showPenOptions && <View style={styles.activeIndicator} />}
              </View>
              <Text style={[
                styles.annotationToolText,
                showPenOptions && styles.annotationToolTextActive
              ]}>Size</Text>
            </TouchableOpacity>

            {/* Clear All Button */}
            <TouchableOpacity
              onPress={handleClearAnnotation}
              style={styles.annotationToolButton}
              activeOpacity={0.7}
            >
              <View style={styles.clearIconContainer}>
                <Text style={styles.clearIcon}>🗑</Text>
              </View>
              <Text style={styles.annotationToolText}>Clear</Text>
            </TouchableOpacity>
          </View>

          {/* Color Picker Popup - Enhanced */}
          {showColorPicker && (
            <View style={styles.colorPickerContainer}>
              <View style={styles.colorPickerHeader}>
                <Text style={styles.colorPickerTitle}>Choose Color</Text>
                <TouchableOpacity
                  onPress={() => setShowColorPicker(false)}
                  style={styles.closePickerButton}
                >
                  <Text style={styles.closePickerText}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.colorPickerGrid}>
                {colorOptions.map((color) => (
                  <TouchableOpacity
                    key={color}
                  onPress={() => {
                    console.log('🎨 [QuestionsScreen] Color selected:', color);
                    setStrokeColor(color);
                    strokeColorRef.current = color; // Update ref immediately
                    setShowColorPicker(false);
                  }}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      strokeColor === color && styles.colorOptionSelected,
                    ]}
                    activeOpacity={0.8}
                  >
                    {strokeColor === color && (
                      <View style={styles.colorCheckmark}>
                        <Text style={styles.colorCheckmarkText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Pen Size Popup - Enhanced */}
          {showPenOptions && (
            <View style={styles.penSizeContainer}>
              <View style={styles.penSizeHeader}>
                <Text style={styles.penSizeTitle}>Pen Size</Text>
                <TouchableOpacity
                  onPress={() => setShowPenOptions(false)}
                  style={styles.closePickerButton}
                >
                  <Text style={styles.closePickerText}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.penSizeGrid}>
                {penSizes.map((size) => (
                  <TouchableOpacity
                    key={size}
                  onPress={() => {
                    console.log('🎨 [QuestionsScreen] Pen size selected:', size);
                    setStrokeWidth(size);
                    strokeWidthRef.current = size; // Update ref immediately
                    setShowPenOptions(false);
                  }}
                    style={[
                      styles.penSizeOption,
                      strokeWidth === size && styles.penSizeOptionSelected,
                    ]}
                    activeOpacity={0.8}
                  >
                    <View style={[
                      styles.penSizeIndicator, 
                      { 
                        width: size * 3, 
                        height: size * 3, 
                        backgroundColor: strokeColor,
                        borderRadius: (size * 3) / 2,
                      }
                    ]} />
                    {strokeWidth === size && (
                      <View style={styles.penSizeCheckmark}>
                        <Text style={styles.penSizeCheckmarkText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Image Viewer Modal - Full Screen */}
      <Modal
        visible={imageViewerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setImageViewerVisible(false);
          setViewingImage(null);
        }}
        statusBarTranslucent={true}
      >
        <View style={styles.imageViewerContainer}>
          <TouchableOpacity
            style={styles.imageViewerCloseButton}
            onPress={() => {
              setImageViewerVisible(false);
              setViewingImage(null);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.imageViewerCloseIcon}>
              <Text style={styles.imageViewerCloseText}>✕</Text>
            </View>
          </TouchableOpacity>
          
          {viewingImage && (
            <>
              <ScrollView
                contentContainerStyle={styles.imageViewerScrollContent}
                maximumZoomScale={3}
                minimumZoomScale={1}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              >
                <Image
                  source={{ uri: viewingImage.uri }}
                  style={styles.imageViewerImage}
                  resizeMode="contain"
                />
              </ScrollView>
              
              {/* Image Info Footer - Only Location */}
              <View style={styles.imageViewerFooter}>
                {/* Location/Geotag Information - White Text */}
                {viewingImage.location && (
                  <View style={styles.imageViewerLocationSection}>
                    <View style={styles.imageViewerLocationHeader}>
                      <Text style={styles.imageViewerLocationIcon}>📍</Text>
                      <Text style={styles.imageViewerLocationTitle}>Location</Text>
                    </View>
                    {viewingImage.location.address?.formatted && (
                      <Text style={styles.imageViewerLocationAddress} numberOfLines={2}>
                        {viewingImage.location.address.formatted}
                      </Text>
                    )}
                    {viewingImage.location.address?.street && (
                      <Text style={styles.imageViewerLocationDetail}>
                        {viewingImage.location.address.street}
                        {viewingImage.location.address.city && `, ${viewingImage.location.address.city}`}
                        {viewingImage.location.address.region && `, ${viewingImage.location.address.region}`}
                        {viewingImage.location.address.country && `, ${viewingImage.location.address.country}`}
                        {viewingImage.location.address.postalCode && ` ${viewingImage.location.address.postalCode}`}
                      </Text>
                    )}
                    <View style={styles.imageViewerLocationCoords}>
                      <Text style={styles.imageViewerLocationCoordText}>
                        Lat: {viewingImage.location.latitude?.toFixed(6) || 'N/A'}
                      </Text>
                      <Text style={styles.imageViewerLocationCoordText}>
                        Long: {viewingImage.location.longitude?.toFixed(6) || 'N/A'}
                      </Text>
                      {viewingImage.location.altitude && (
                        <Text style={styles.imageViewerLocationCoordText}>
                          Alt: {viewingImage.location.altitude.toFixed(2)}m
                        </Text>
                      )}
                      {viewingImage.location.accuracy && (
                        <Text style={styles.imageViewerLocationCoordText}>
                          Accuracy: ±{viewingImage.location.accuracy.toFixed(0)}m
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </Modal>

      {/* Image Viewer Modal - Full Screen */}
      <Modal
        visible={imageViewerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setImageViewerVisible(false);
          setViewingImage(null);
        }}
        statusBarTranslucent={true}
      >
        <View style={styles.imageViewerContainer}>
          <TouchableOpacity
            style={styles.imageViewerCloseButton}
            onPress={() => {
              setImageViewerVisible(false);
              setViewingImage(null);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.imageViewerCloseIcon}>
              <Text style={styles.imageViewerCloseText}>✕</Text>
            </View>
          </TouchableOpacity>
          
          {viewingImage && (
            <>
              <ScrollView
                contentContainerStyle={styles.imageViewerScrollContent}
                maximumZoomScale={3}
                minimumZoomScale={1}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              >
                <Image
                  source={{ uri: viewingImage.uri }}
                  style={styles.imageViewerImage}
                  resizeMode="contain"
                />
              </ScrollView>
              
              {/* Image Info Footer - Only Location */}
              <View style={styles.imageViewerFooter}>
                {/* Location/Geotag Information - White Text */}
                {viewingImage.location && (
                  <View style={styles.imageViewerLocationSection}>
                    <View style={styles.imageViewerLocationHeader}>
                      <Text style={styles.imageViewerLocationIcon}>📍</Text>
                      <Text style={styles.imageViewerLocationTitle}>Location</Text>
                    </View>
                    {viewingImage.location.address?.formatted && (
                      <Text style={styles.imageViewerLocationAddress} numberOfLines={2}>
                        {viewingImage.location.address.formatted}
                      </Text>
                    )}
                    {viewingImage.location.address?.street && (
                      <Text style={styles.imageViewerLocationDetail}>
                        {viewingImage.location.address.street}
                        {viewingImage.location.address.city && `, ${viewingImage.location.address.city}`}
                        {viewingImage.location.address.region && `, ${viewingImage.location.address.region}`}
                        {viewingImage.location.address.country && `, ${viewingImage.location.address.country}`}
                        {viewingImage.location.address.postalCode && ` ${viewingImage.location.address.postalCode}`}
                      </Text>
                    )}
                    <View style={styles.imageViewerLocationCoords}>
                      <Text style={styles.imageViewerLocationCoordText}>
                        Lat: {viewingImage.location.latitude?.toFixed(6) || 'N/A'}
                      </Text>
                      <Text style={styles.imageViewerLocationCoordText}>
                        Long: {viewingImage.location.longitude?.toFixed(6) || 'N/A'}
                      </Text>
                      {viewingImage.location.altitude && (
                        <Text style={styles.imageViewerLocationCoordText}>
                          Alt: {viewingImage.location.altitude.toFixed(2)}m
                        </Text>
                      )}
                      {viewingImage.location.accuracy && (
                        <Text style={styles.imageViewerLocationCoordText}>
                          Accuracy: ±{viewingImage.location.accuracy.toFixed(0)}m
                        </Text>
                      )}
                    </View>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </Modal>

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
  uploadedBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: '#34C759',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 2,
  },
  uploadedBadgeText: {
    color: '#FFFFFF',
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.bold,
  },
  fileNameBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    zIndex: 2,
  },
  fileNameText: {
    color: '#FFFFFF',
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.medium,
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
  // Annotation Modal Styles - Beautiful & User-Friendly
  annotationContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  annotationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  annotationCancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: FontWeights.bold,
  },
  annotationCancelText: {
    color: '#FFFFFF',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.medium,
  },
  annotationTitleContainer: {
    alignItems: 'center',
    flex: 1,
  },
  annotationTitle: {
    color: '#FFFFFF',
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
    marginBottom: 2,
  },
  annotationSubtitle: {
    color: '#999999',
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.regular,
  },
  annotationDoneButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#007AFF',
    borderRadius: 20,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  annotationDoneText: {
    color: '#FFFFFF',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
  },
  annotationImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  annotationImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
    position: 'absolute',
  },
  annotationSvg: {
    position: 'absolute',
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  annotationToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  annotationToolButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: 'transparent',
    minWidth: 80,
  },
  annotationToolButtonActive: {
    backgroundColor: '#2A2A2A',
  },
  colorPreview: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34C759',
    borderWidth: 2,
    borderColor: '#1A1A1A',
  },
  penSizePreview: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  penSizeDot: {
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  annotationToolText: {
    color: '#CCCCCC',
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
    marginTop: 4,
  },
  annotationToolTextActive: {
    color: '#FFFFFF',
    fontWeight: FontWeights.bold,
  },
  clearIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  clearIcon: {
    fontSize: 20,
  },
  colorPickerContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 110 : 100,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  colorPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  colorPickerTitle: {
    color: '#FFFFFF',
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
  },
  closePickerButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePickerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: FontWeights.bold,
  },
  colorPickerGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  colorOption: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginHorizontal: 8,
    marginVertical: 8,
    borderWidth: 3,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorOptionSelected: {
    borderColor: '#FFFFFF',
    transform: [{ scale: 1.1 }],
  },
  colorCheckmark: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorCheckmarkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: FontWeights.bold,
  },
  penSizeContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 110 : 100,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  penSizeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  penSizeTitle: {
    color: '#FFFFFF',
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
  },
  penSizeGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  penSizeOption: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginHorizontal: 8,
    marginVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: '#2A2A2A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
    position: 'relative',
  },
  penSizeOptionSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#1A3A5A',
    transform: [{ scale: 1.1 }],
  },
  penSizeIndicator: {
    borderRadius: 999,
  },
  penSizeCheckmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  penSizeCheckmarkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: FontWeights.bold,
  },
  // Image Viewer Styles
  photoPreviewContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  imageViewerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerCloseButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  imageViewerCloseIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerCloseText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: FontWeights.bold,
  },
  imageViewerScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  imageViewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  imageViewerFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    borderTopWidth: 1,
    borderTopColor: '#333333',
  },
  imageViewerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  imageViewerLabel: {
    color: '#CCCCCC',
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
    marginRight: 8,
  },
  imageViewerValue: {
    color: '#FFFFFF',
    fontSize: FontSizes.small,
    fontWeight: FontWeights.regular,
    flex: 1,
  },
  imageViewerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  imageViewerStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
    marginRight: 8,
  },
  imageViewerStatusText: {
    color: '#34C759',
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
  },
  imageViewerLocationSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  imageViewerLocationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  imageViewerLocationIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  imageViewerLocationTitle: {
    color: '#FFFFFF',
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
  },
  imageViewerLocationAddress: {
    color: '#FFFFFF',
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
    marginBottom: 6,
    lineHeight: 20,
  },
  imageViewerLocationDetail: {
    color: '#FFFFFF',
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.regular,
    marginBottom: 8,
    opacity: 0.9,
  },
  imageViewerLocationCoords: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  imageViewerLocationCoordText: {
    color: '#FFFFFF',
    fontSize: FontSizes.extraSmall,
    fontWeight: FontWeights.regular,
    opacity: 0.85,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});

export default QuestionsScreen;

