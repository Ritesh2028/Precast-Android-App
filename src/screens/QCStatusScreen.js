import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { getTokens } from '../services/tokenManager';
import { logout, validateSession, refreshSession } from '../services/authService';
import { handle401Error, handleApiError } from '../services/errorHandler';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import CameraQRScanner from '../components/CameraQRScanner';
import BottomNavigation from '../components/BottomNavigation';
import ProjectDropdown from '../components/ProjectDropdown';
import DrawingFilesModal from '../components/DrawingFilesModal';
import TowerFloorFilter from '../components/TowerFloorFilter';
import BirdsEyeViewModal from '../components/BirdsEyeViewModal';
import { Colors } from '../styles/colors';
import { FontSizes, FontWeights } from '../styles/fonts';

const QCStatusScreen = ({ navigation, hideBottomNav = false }) => {
  const [selectedFilters, setSelectedFilters] = useState(['All']);
  const [selectedProject, setSelectedProject] = useState('All Projects');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('task');
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [drawingFilesModalVisible, setDrawingFilesModalVisible] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [selectedElementData, setSelectedElementData] = useState(null);
  const [towerFloorFilter, setTowerFloorFilter] = useState({ tower: null, floor: null });
  const [birdsEyeViewVisible, setBirdsEyeViewVisible] = useState(false);

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

  // Helper function to load tasks from API
  const loadTasksFromAPI = async (token, statusParam, projectId = null) => {
    try {
      let apiUrl = `${API_BASE_URL}/api/app/tasks`;
      const queryParams = [];
      
      const statusValue = statusParam ? String(statusParam).trim().toLowerCase() : '';
      if (statusValue && statusValue.length > 0) {
        queryParams.push(`status=${encodeURIComponent(statusValue)}`);
      }
      
      if (projectId && projectId !== 'all' && projectId !== null) {
        queryParams.push(`project_id=${encodeURIComponent(projectId)}`);
      }
      
      if (queryParams.length > 0) {
        apiUrl += '?' + queryParams.join('&');
      }

      console.log('📱 [QCStatusScreen] loadTasksFromAPI - Starting API call');
      console.log('📱 [QCStatusScreen] Original token (first 20 chars):', token ? token.substring(0, 20) + '...' : 'null');
      console.log('📱 [QCStatusScreen] API URL:', apiUrl);

      // First, validate the session to ensure it exists in the database
      let currentToken = token;
      try {
        console.log('📱 [QCStatusScreen] Validating session before Tasks API call...');
        const sessionResult = await validateSession();
        console.log('📱 [QCStatusScreen] Session validation response:', JSON.stringify(sessionResult, null, 2));
        
        if (sessionResult && sessionResult.session_id) {
          // Use the validated session_id as the token
          currentToken = sessionResult.session_id;
          console.log('✅ [QCStatusScreen] Session validated, using session_id for Tasks API');
          console.log('📱 [QCStatusScreen] Session_id (first 20 chars):', currentToken.substring(0, 20) + '...');
        } else {
          console.log('⚠️ [QCStatusScreen] Session validation returned no session_id, using original token');
        }
      } catch (validateError) {
        console.log('❌ [QCStatusScreen] Session validation failed, using original token:', validateError);
        console.log('📱 [QCStatusScreen] Validation error details:', JSON.stringify(validateError, null, 2));
        // Continue with original token
      }

      // Try with Bearer token first (standard format)
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true });
      console.log('📱 [QCStatusScreen] Tasks API - Attempt 1: With Bearer token');
      console.log('📱 [QCStatusScreen] Request headers:', JSON.stringify(headersWithBearer, null, 2));
      
      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: headersWithBearer,
      });

      console.log('📱 [QCStatusScreen] Tasks API Response 1 - Status:', response.status);
      console.log('📱 [QCStatusScreen] Tasks API Response 1 - Headers:', JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2));

      // If 401, try without Bearer prefix (some APIs expect just the token)
      if (response.status === 401) {
        const responseText1 = await response.text().catch(() => '');
        console.log('❌ [QCStatusScreen] Tasks API returned 401 with Bearer token');
        console.log('📱 [QCStatusScreen] Response body:', responseText1);
        console.log('📱 [QCStatusScreen] Tasks API - Attempt 2: Without Bearer prefix...');
        
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        console.log('📱 [QCStatusScreen] Request headers (no Bearer):', JSON.stringify(headersWithoutBearer, null, 2));
        
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: headersWithoutBearer,
        });
        
        console.log('📱 [QCStatusScreen] Tasks API Response 2 - Status:', response.status);
      }

      console.log('📱 [QCStatusScreen] Tasks API Final response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [QCStatusScreen] Tasks API Success!');
        console.log('📱 [QCStatusScreen] Tasks loaded successfully:', JSON.stringify(data, null, 2));
        
        const tasks = data.tasks || [];
        const transformedJobs = tasks.map((item) => {
          let mappedStatus = item.status || 'Pending';
          if (mappedStatus.toLowerCase() === 'inprogress') {
            mappedStatus = 'Pending';
          } else if (mappedStatus.toLowerCase() === 'completed') {
            mappedStatus = 'Completed';
          }
          
          return {
            id: item.element_name || `ELEM-${item.element_id}`,
            title: `${item.element_type_name || 'Element'} - ${item.stage_name || ''}`,
            status: mappedStatus,
            priority: 'Medium',
            assignedDate: item.stage_name || 'N/A',
            drawing: item.drawings && item.drawings.length > 0 ? 'Available' : 'Pending',
            fromCompleteProduction: false,
            originalData: item,
          };
        });

        return transformedJobs;
      } else {
        const errorText = await response.text();
        console.log('❌ [QCStatusScreen] Tasks API Error');
        console.log('📱 [QCStatusScreen] Error status:', response.status);
        console.log('📱 [QCStatusScreen] Error response:', errorText);
        console.log('📱 [QCStatusScreen] Error response (parsed):', JSON.parse(errorText || '{}'));
        
        // If 401, try to refresh token and retry once
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            console.log('📱 [QCStatusScreen] Refresh token available:', refreshToken ? 'Yes' : 'No');
            
            if (refreshToken) {
              console.log('🔄 [QCStatusScreen] Tasks API 401 - attempting token refresh...');
              const refreshResult = await refreshSession();
              console.log('📱 [QCStatusScreen] Token refresh response:', JSON.stringify(refreshResult, null, 2));
              
              if (refreshResult && refreshResult.access_token) {
                console.log('✅ [QCStatusScreen] Token refreshed successfully');
                console.log('📱 [QCStatusScreen] New access_token (first 20 chars):', refreshResult.access_token.substring(0, 20) + '...');
                console.log('📱 [QCStatusScreen] Validating new session before retry...');
                
                // Validate the new session to get session_id
                let newToken = refreshResult.access_token;
                try {
                  const newSessionResult = await validateSession();
                  console.log('📱 [QCStatusScreen] New session validation response:', JSON.stringify(newSessionResult, null, 2));
                  
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                    console.log('✅ [QCStatusScreen] New session validated, using session_id for retry');
                    console.log('📱 [QCStatusScreen] New session_id (first 20 chars):', newToken.substring(0, 20) + '...');
                  } else {
                    console.log('⚠️ [QCStatusScreen] New session validation returned no session_id, using access_token');
                  }
                } catch (validateError) {
                  console.log('❌ [QCStatusScreen] New session validation failed, using access_token:', validateError);
                }
                
                console.log('🔄 [QCStatusScreen] Retrying Tasks API with refreshed token...');
                console.log('📱 [QCStatusScreen] Retry URL:', apiUrl);
                
                // Retry with new token - try Bearer first
                const retryHeadersWithBearer = createAuthHeaders(newToken, { useBearer: true });
                console.log('📱 [QCStatusScreen] Retry headers (Bearer):', JSON.stringify(retryHeadersWithBearer, null, 2));
                
                let retryResponse = await fetch(apiUrl, {
                  method: 'GET',
                  headers: retryHeadersWithBearer,
                });
                
                console.log('📱 [QCStatusScreen] Retry Response 1 - Status:', retryResponse.status);
                
                // If still 401, try without Bearer
                if (retryResponse.status === 401) {
                  const retryErrorText1 = await retryResponse.text().catch(() => '');
                  console.log('❌ [QCStatusScreen] Retry with Bearer failed');
                  console.log('📱 [QCStatusScreen] Retry error response:', retryErrorText1);
                  console.log('📱 [QCStatusScreen] Retry - Attempt 2: Without Bearer...');
                  
                  const retryHeadersWithoutBearer = createAuthHeaders(newToken, { useBearer: false });
                  console.log('📱 [QCStatusScreen] Retry headers (no Bearer):', JSON.stringify(retryHeadersWithoutBearer, null, 2));
                  
                  retryResponse = await fetch(apiUrl, {
                    method: 'GET',
                    headers: retryHeadersWithoutBearer,
                  });
                  
                  console.log('📱 [QCStatusScreen] Retry Response 2 - Status:', retryResponse.status);
                }
                
                if (retryResponse.ok) {
                  console.log('✅ [QCStatusScreen] Tasks API retry successful!');
                  const data = await retryResponse.json();
                  console.log('📱 [QCStatusScreen] Retry response data:', JSON.stringify(data, null, 2));
                  const tasks = data.tasks || [];
                  const transformedJobs = tasks.map((item) => {
                    let mappedStatus = item.status || 'Pending';
                    if (mappedStatus.toLowerCase() === 'inprogress') {
                      mappedStatus = 'Pending';
                    } else if (mappedStatus.toLowerCase() === 'completed') {
                      mappedStatus = 'Completed';
                    }
                    return {
                      id: item.element_name || `ELEM-${item.element_id}`,
                      title: `${item.element_type_name || 'Element'} - ${item.stage_name || ''}`,
                      status: mappedStatus,
                      priority: 'Medium',
                      assignedDate: item.stage_name || 'N/A',
                      drawing: item.drawings && item.drawings.length > 0 ? 'Available' : 'Pending',
                      fromCompleteProduction: false,
                      originalData: item,
                    };
                  });
                  return transformedJobs;
                } else {
                  const retryErrorText = await retryResponse.text().catch(() => '');
                  console.log('❌ [QCStatusScreen] Tasks API retry still failed');
                  console.log('📱 [QCStatusScreen] Retry error status:', retryResponse.status);
                  console.log('📱 [QCStatusScreen] Retry error response:', retryErrorText);
                }
              } else {
                console.log('❌ [QCStatusScreen] Token refresh did not return access_token');
                console.log('📱 [QCStatusScreen] Refresh result:', JSON.stringify(refreshResult, null, 2));
              }
            } else {
              console.log('❌ [QCStatusScreen] No refresh token available');
            }
          } catch (refreshError) {
            console.log('❌ [QCStatusScreen] Token refresh failed for Tasks API');
            console.log('📱 [QCStatusScreen] Refresh error:', refreshError);
            console.log('📱 [QCStatusScreen] Refresh error details:', JSON.stringify(refreshError, null, 2));
          }
        }
        
        return [];
      }
    } catch (error) {
      console.log('❌ [QCStatusScreen] Error in loadTasksFromAPI:', error);
      console.log('📱 [QCStatusScreen] Error details:', JSON.stringify(error, null, 2));
      return [];
    }
  };

  const loadProductionHistory = async (statusFilter = null) => {
    try {
      setJobsLoading(true);
      const { accessToken } = await getTokens();
      
      if (!accessToken) {
        console.log('No auth token found');
        setJobsLoading(false);
        return;
      }

      if (!validateToken(accessToken)) {
        console.log('Token is invalid or expired, attempting refresh...');
        // Try to refresh token instead of logging out immediately
        const shouldContinue = await handle401Error(null, null, navigation);
        if (!shouldContinue) {
          return;
        }
      }

      const currentFilter = statusFilter || (selectedFilters.includes('All') ? 'All' : selectedFilters[0]);
      const filterLower = currentFilter.toLowerCase();

      if (filterLower === 'all') {
        // Load both pending and completed tasks like DashboardScreen
        console.log('Loading all tasks (pending + completed)...');
        try {
          const [pendingTasks, completedTasksResponse] = await Promise.all([
            // Load pending tasks from tasks API
            loadTasksFromAPI(accessToken, null, selectedProjectId),
            // Load completed tasks from complete-production API
            (async () => {
              try {
                const apiUrl = `${API_BASE_URL}/api/app/complete-production`;
                console.log('📱 [QCStatusScreen] Complete-production API - Starting call');
                console.log('📱 [QCStatusScreen] Complete-production URL:', apiUrl);
                
                // Validate session first
                let completeToken = accessToken;
                try {
                  const sessionResult = await validateSession();
                  console.log('📱 [QCStatusScreen] Complete-production - Session validation:', JSON.stringify(sessionResult, null, 2));
                  if (sessionResult && sessionResult.session_id) {
                    completeToken = sessionResult.session_id;
                    console.log('✅ [QCStatusScreen] Using validated session_id for complete-production');
                  }
                } catch (validateError) {
                  console.log('⚠️ [QCStatusScreen] Session validation failed for complete-production, using original token');
                }
                
                // Try with Bearer token first
                const completeHeaders = createAuthHeaders(completeToken, { useBearer: true });
                console.log('📱 [QCStatusScreen] Complete-production headers:', JSON.stringify(completeHeaders, null, 2));
                
                let response = await fetch(apiUrl, {
                  method: 'GET',
                  headers: completeHeaders,
                });
                
                console.log('📱 [QCStatusScreen] Complete-production Response 1 - Status:', response.status);
                
                // If 401, try without Bearer prefix
                if (response.status === 401) {
                  const errorText1 = await response.text().catch(() => '');
                  console.log('❌ [QCStatusScreen] Complete-production API returned 401 with Bearer');
                  console.log('📱 [QCStatusScreen] Error response:', errorText1);
                  console.log('📱 [QCStatusScreen] Trying without Bearer...');
                  
                  response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: createAuthHeaders(completeToken, { useBearer: false }),
                  });
                  
                  console.log('📱 [QCStatusScreen] Complete-production Response 2 - Status:', response.status);
                }

                if (response.ok) {
                  const data = await response.json();
                  console.log('✅ [QCStatusScreen] Complete-production API Success!');
                  console.log('📱 [QCStatusScreen] Complete-production response:', JSON.stringify(data, null, 2));
                  const tasks = data.tasks || data || [];
                  return Array.isArray(tasks) ? tasks.map((item) => {
                    let mappedStatus = item.status || 'Completed';
                    if (mappedStatus.toLowerCase() === 'inprogress') {
                      mappedStatus = 'Pending';
                    } else if (mappedStatus.toLowerCase() === 'completed') {
                      mappedStatus = 'Completed';
                    }
                    
                    return {
                      id: item.element_name || `ELEM-${item.element_id}`,
                      title: `${item.element_type_name || 'Element'} - ${item.stage_name || ''}`,
                      status: mappedStatus,
                      priority: 'Medium',
                      assignedDate: item.stage_name || 'N/A',
                      drawing: item.drawings && item.drawings.length > 0 ? 'Available' : 'Pending',
                      fromCompleteProduction: true,
                      originalData: item,
                    };
                  }) : [];
                } else {
                  const errorText = await response.text().catch(() => '');
                  console.log('❌ [QCStatusScreen] Complete-production API Error');
                  console.log('📱 [QCStatusScreen] Error status:', response.status);
                  console.log('📱 [QCStatusScreen] Error response:', errorText);
                }
                return [];
              } catch (error) {
                console.log('❌ [QCStatusScreen] Error fetching completed tasks:', error);
                console.log('📱 [QCStatusScreen] Error details:', JSON.stringify(error, null, 2));
                return [];
              }
            })()
          ]);
          
          // Combine results from both APIs
          const allTasks = [...(pendingTasks || []), ...(completedTasksResponse || [])];
          console.log(`Loaded ${allTasks.length} total tasks (${pendingTasks?.length || 0} from tasks API + ${completedTasksResponse?.length || 0} from complete-production API)`);
          
          setJobs(allTasks);
          setJobsLoading(false);
        } catch (error) {
          console.log('Error loading all tasks:', error);
          // Fallback to just tasks API
          const allTasks = await loadTasksFromAPI(accessToken, null, selectedProjectId);
          setJobs(allTasks || []);
          setJobsLoading(false);
        }
      } else if (filterLower === 'pending') {
        const allTasks = await loadTasksFromAPI(accessToken, null, selectedProjectId);
        const pendingTasks = (allTasks || []).filter(task => {
          const taskStatus = task.originalData?.status || task.status || '';
          const statusLower = taskStatus.toLowerCase();
          return statusLower === 'inprogress' || statusLower === 'pending' || statusLower === 'in progress';
        });
        setJobs(pendingTasks);
        setJobsLoading(false);
      } else if (filterLower === 'completed') {
        try {
          const apiUrl = `${API_BASE_URL}/api/app/complete-production`;
          console.log('📱 [QCStatusScreen] Complete-production API (filter) - Starting call');
          console.log('📱 [QCStatusScreen] URL:', apiUrl);
          
          // Validate session first
          let completeToken = accessToken;
          try {
            const sessionResult = await validateSession();
            console.log('📱 [QCStatusScreen] Complete-production (filter) - Session validation:', JSON.stringify(sessionResult, null, 2));
            if (sessionResult && sessionResult.session_id) {
              completeToken = sessionResult.session_id;
              console.log('✅ [QCStatusScreen] Using validated session_id for complete-production');
            }
          } catch (validateError) {
            console.log('⚠️ [QCStatusScreen] Session validation failed, using original token');
          }
          
          // Try GET request first to fetch completed tasks
          // Try with Bearer token first
          const completeHeaders = createAuthHeaders(completeToken, { useBearer: true });
          console.log('📱 [QCStatusScreen] Complete-production headers:', JSON.stringify(completeHeaders, null, 2));
          
          let response = await fetch(apiUrl, {
            method: 'GET',
            headers: completeHeaders,
          });
          
          console.log('📱 [QCStatusScreen] Complete-production Response 1 - Status:', response.status);
          
          // If 401, try without Bearer prefix
          if (response.status === 401) {
            const errorText1 = await response.text().catch(() => '');
            console.log('❌ [QCStatusScreen] Complete-production API returned 401 with Bearer');
            console.log('📱 [QCStatusScreen] Error response:', errorText1);
            console.log('📱 [QCStatusScreen] Trying without Bearer...');
            
            response = await fetch(apiUrl, {
              method: 'GET',
              headers: createAuthHeaders(completeToken, { useBearer: false }),
            });
            
            console.log('📱 [QCStatusScreen] Complete-production Response 2 - Status:', response.status);
          }

          console.log('📱 [QCStatusScreen] Complete-production API final response status:', response.status);

          if (response.ok) {
            const data = await response.json();
            console.log('✅ [QCStatusScreen] Complete-production API Success!');
            console.log('📱 [QCStatusScreen] Completed tasks loaded successfully:', JSON.stringify(data, null, 2));
            
            const tasks = data.tasks || data || [];
            const transformedJobs = Array.isArray(tasks) ? tasks.map((item) => {
              let mappedStatus = item.status || 'Completed';
              if (mappedStatus.toLowerCase() === 'inprogress') {
                mappedStatus = 'Pending';
              } else if (mappedStatus.toLowerCase() === 'completed') {
                mappedStatus = 'Completed';
              }
              
              return {
                id: item.element_name || `ELEM-${item.element_id}`,
                title: `${item.element_type_name || 'Element'} - ${item.stage_name || ''}`,
                status: mappedStatus,
                priority: 'Medium',
                assignedDate: item.stage_name || 'N/A',
                drawing: item.drawings && item.drawings.length > 0 ? 'Available' : 'Pending',
                fromCompleteProduction: true,
                originalData: item,
              };
            }) : [];
            
            setJobs(transformedJobs);
            setJobsLoading(false);
          } else {
            const errorText = await response.text().catch(() => '');
            console.log('❌ [QCStatusScreen] Complete-production API Error');
            console.log('📱 [QCStatusScreen] Error status:', response.status);
            console.log('📱 [QCStatusScreen] Error response:', errorText);
            // Fallback to filtering from tasks API if complete-production doesn't work
            console.log('📱 [QCStatusScreen] Falling back to tasks API with frontend filtering...');
            const allTasks = await loadTasksFromAPI(accessToken, null, selectedProjectId);
            const completedTasks = (allTasks || []).filter(task => {
              const taskStatus = task.originalData?.status || task.status || '';
              return taskStatus.toLowerCase() === 'completed';
            });
            // Fallback items from tasks API should not have green styling
            setJobs(completedTasks);
            setJobsLoading(false);
          }
        } catch (error) {
          console.log('❌ [QCStatusScreen] Complete-production API Error');
          console.log('📱 [QCStatusScreen] Error details:', JSON.stringify(error, null, 2));
          // Fallback to filtering from tasks API
          console.log('📱 [QCStatusScreen] Falling back to tasks API with frontend filtering...');
          const allTasks = await loadTasksFromAPI(accessToken, null, selectedProjectId);
          const completedTasks = (allTasks || []).filter(task => {
            const taskStatus = task.originalData?.status || task.status || '';
            return taskStatus.toLowerCase() === 'completed';
          });
          setJobs(completedTasks);
          setJobsLoading(false);
        }
      } else {
        const tasks = await loadTasksFromAPI(accessToken, 'pending', selectedProjectId);
        setJobs(tasks || []);
        setJobsLoading(false);
      }
    } catch (error) {
      console.log('Tasks Network/Request Error:', error);
      Alert.alert('Network Error', 'Failed to load tasks. Please check your internet connection and try again.');
      setJobs([]);
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    loadProductionHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadProductionHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, selectedProjectId]);

  // Use API jobs directly - filtering is done in loadProductionHistory
  const availableJobs = jobs || [];
  
  // Extract tower and floor from item for filtering
  const extractTowerFloor = (item) => {
    const tower = item.originalData?.tower || item.originalData?.tower_name || item.originalData?.element_type?.tower || item.originalData?.element_type?.tower_name || item.tower || item.tower_name;
    const floor = item.originalData?.floor || item.originalData?.floor_name || item.originalData?.element_type?.floor || item.originalData?.element_type?.floor_name || item.floor || item.floor_name;
    return { tower, floor };
  };

  // Apply tower and floor filters
  let filteredJobs = availableJobs || [];
  if (towerFloorFilter.tower) {
    filteredJobs = filteredJobs.filter(item => {
      const { tower } = extractTowerFloor(item);
      return tower === towerFloorFilter.tower;
    });
  }
  if (towerFloorFilter.floor) {
    filteredJobs = filteredJobs.filter(item => {
      const { floor } = extractTowerFloor(item);
      return floor === towerFloorFilter.floor;
    });
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending': return '#FFB84D'; // Lighter orange
      case 'In Progress': return '#007AFF';
      case 'Completed': return '#6DD47E'; // Lighter green
     
      default: return '#8E8E93';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return '#FF3B30';
      case 'Medium': return '#FFB84D'; // Lighter orange
      case 'Low': return '#6DD47E'; // Lighter green
      default: return '#8E8E93';
    }
  };

  const handleQCItemPress = async (qcItem) => {
    const elementId = qcItem.originalData?.element_id || qcItem.originalData?.id || qcItem.id?.replace('ELEM-', '') || qcItem.id;
    
    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to fetch element details.');
        return;
      }

      if (!validateToken(accessToken)) {
        Alert.alert('Session Expired', 'Your session has expired. Please login again.');
        await logout();
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
        return;
      }

      const apiUrl = `https://precast.blueinvent.com/api/scan_element/${elementId}`;
      console.log('Fetching element details from:', apiUrl);

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
        const elementData = await response.json();
        console.log('Element details fetched successfully:', elementData);
        navigation.navigate('ElementDetails', {
          elementId: elementId,
          elementData: elementData
        });
      } else {
        const errorText = await response.text();
        console.log('Error fetching element details:', errorText);
        if (response.status === 401) {
          const shouldRetry = await handle401Error(response, null, navigation);
          if (!shouldRetry) {
            Alert.alert('Error', 'Failed to fetch element details. Please try again.');
          }
        } else {
          Alert.alert('Error', `Failed to fetch element details. Status: ${response.status}`);
        }
      }
    } catch (error) {
      console.log('Error fetching element details:', error);
      Alert.alert('Network Error', `Failed to fetch element details: ${error.message}`);
    }
  };

  const handleInProgress = async (item, e) => {
    e.stopPropagation();
    
    try {
      const { accessToken } = await getTokens();
      if (!accessToken) {
        Alert.alert('Authentication Required', 'Please login to update task status.');
        return;
      }

      if (!validateToken(accessToken)) {
        Alert.alert('Session Expired', 'Your session has expired. Please login again.');
        await logout();
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
        return;
      }

      // Get paper_id from item data
      const paperId = item.originalData?.paper_id || item.originalData?.paper?.id || item.paper_id;
      
      if (!paperId) {
        Alert.alert('Error', 'Paper ID not found. Cannot proceed with questions.');
        return;
      }

      // Get additional IDs needed for submission
      const taskId = item.originalData?.id || item.originalData?.task_id || item.id;
      const projectId = item.originalData?.project_id || selectedProjectId;
      const stageId = item.originalData?.stage_id || item.originalData?.stage?.id;
      const activityId = item.originalData?.activity_id || taskId;

      // Navigate to QuestionsScreen with all necessary data
      navigation.navigate('Questions', { 
        paperId: paperId,
        taskId: taskId,
        projectId: projectId,
        stageId: stageId,
        activityId: activityId,
      });
    } catch (error) {
      console.log('Error navigating to questions:', error);
      Alert.alert('Network Error', `Failed to load questions: ${error.message}`);
    }
  };

  const handleProfile = () => {
    navigation.navigate('UserProfile');
  };

  const handleQRScan = () => {
    setQrScannerVisible(true);
  };

  const handleQRScanned = (data, elementData = null) => {
    if (elementData) {
      navigation.navigate('ElementDetails', { 
        elementId: elementData.id,
        elementData: elementData 
      });
    } else {
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
    }
  };

  const filterOptions = ['All', 'Completed', 'Pending'];

  const toggleFilter = (filter) => {
    // Single selection behavior - only one filter can be active at a time
    setSelectedFilters([filter]);
    // Reload data with new filter - pass "All" explicitly for All filter
    loadProductionHistory(filter === 'All' ? 'All' : filter);
  };

  const getFilterColor = (filter) => {
    switch (filter) {
      case 'All': return '#007AFF';
      case 'Pending': return '#FF9500';
      case 'Completed': return '#34C759';
      default: return '#007AFF';
    }
  };

  const handleTabPress = (tabId, screenName) => {
    setActiveTab(tabId);
    if (screenName !== 'QCStatus') {
      navigation.navigate(screenName);
    }
  };

  const handleScanPress = () => {
    setQrScannerVisible(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const currentFilter = selectedFilters.includes('All') ? null : selectedFilters[0];
    await loadProductionHistory(currentFilter);
    setRefreshing(false);
  };

  const handleProjectSelect = (project) => {
    const projectName = typeof project === 'string' ? project : (project?.name || 'All Projects');
    const projectId = project?.project_id === 'all' || project?.project_id === null ? null : project?.project_id;
    setSelectedProject(projectName);
    setSelectedProjectId(projectId);
  };

  return (
    <View style={styles.mainContainer}>
      <ScrollView 
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#007AFF"
            colors={["#007AFF"]}
          />
        }
      >
      {/* Project Dropdown Component */}
      <View style={styles.projectDropdownWrapper}>
      <ProjectDropdown
          selectedProject={typeof selectedProject === 'string' ? selectedProject : (selectedProject?.name || 'All Projects')}
          onProjectSelect={(project) => {
            const projectName = project?.name || 'All Projects';
            const projectId = project?.project_id || null;
            handleProjectSelect(projectName, projectId);
          }}
        navigation={navigation}
      />
      </View>

      <View style={styles.qcListSection}>
        {/* Filter Buttons */}
        <View style={styles.filterWrapper}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterContainer}
            style={styles.filterScrollView}
          >
            {(filterOptions || []).map((filter) => {
              const isSelected = selectedFilters.includes(filter);
              return (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterButton,
                    isSelected && styles.filterButtonSelected,
                    { 
                      backgroundColor: isSelected ? getFilterColor(filter) : '#FFFFFF',
                      borderColor: getFilterColor(filter),
                      borderWidth: isSelected ? 2 : 1,
                    }
                  ]}
                  onPress={() => toggleFilter(filter)}
            >
              <Text style={[
                    styles.filterText,
                    { 
                      color: isSelected ? '#FFFFFF' : getFilterColor(filter),
                      fontWeight: isSelected ? '700' : '600'
                    }
                  ]}>
                    {filter}
              </Text>
            </TouchableOpacity>
              );
            })}
            {/* Bird's Eye View Button */}
            <TouchableOpacity
              style={[
                styles.filterButton,
                styles.birdsEyeViewButton,
                { 
                  backgroundColor: '#FFFFFF',
                  borderColor: '#007AFF',
                  borderWidth: 1,
                }
              ]}
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
          </ScrollView>
      </View>

        {/* Tower and Floor Filters */}
        <TowerFloorFilter 
          jobs={availableJobs}
          onFilterChange={setTowerFloorFilter}
        />

        {jobsLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#000000" />
            <Text style={styles.loadingText}>Loading tasks...</Text>
          </View>
        ) : filteredJobs.length > 0 ? (
          filteredJobs.map((item, index) => (
          <TouchableOpacity
              key={`${item.id}-${index}`}
              style={[
                styles.qcCard,
                item.fromCompleteProduction && styles.qcCardCompleted,
                !item.fromCompleteProduction && (item.status === 'Pending' || item.status === 'In Progress') && styles.qcCardPending,
              ]}
            onPress={() => handleQCItemPress(item)}
              activeOpacity={0.8}
            >
              <View style={styles.qcCardHeader}>
                <View style={styles.qcCardHeaderLeft}>
                  <View style={[
                    styles.statusIndicator,
                    { backgroundColor: getStatusColor(item.status) }
                  ]} />
              <Text style={styles.qcId}>{item.id}</Text>
              </View>
              <View style={styles.statusBadge}>
                {item.status === 'Completed' ? (
                  <Image 
                    source={require('../icons/complete.png')} 
                    style={styles.statusIcon} 
                    resizeMode="contain" 
                  />
                ) : (
                  <Image 
                    source={require('../icons/pending.png')} 
                    style={styles.statusIcon} 
                    resizeMode="contain" 
                  />
                )}
            </View>
            </View>
              
            <Text style={styles.qcTitle}>{item.title}</Text>
              
            <View style={styles.qcDetails}>
              <View style={styles.detailRow}>
                <View style={styles.detailLabelContainer}>
                  <Image 
                    source={require('../icons/tawer.png')} 
                    style={styles.detailLabelIconImg} 
                    resizeMode="contain" 
                  />
                  <Text style={styles.detailLabel}>Tower:</Text>
                </View>
                <Text style={styles.detailValue}>
                  {item.originalData?.tower || item.originalData?.tower_name || item.originalData?.element_type?.tower || item.originalData?.element_type?.tower_name || item.tower || item.tower_name || 'N/A'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <View style={styles.detailLabelContainer}>
                  <Image 
                    source={require('../icons/floor.png')} 
                    style={styles.detailLabelIconImg} 
                    resizeMode="contain" 
                  />
                  <Text style={styles.detailLabel}>Floor:</Text>
                </View>
                <Text style={styles.detailValue}>
                  {item.originalData?.floor || item.originalData?.floor_name || item.originalData?.element_type?.floor || item.originalData?.element_type?.floor_name || item.floor || item.floor_name || 'N/A'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                  <View style={styles.detailLabelContainer}>
                    <Image 
                      source={require('../icons/stage.png')} 
                      style={styles.detailLabelIconImg} 
                      resizeMode="contain" 
                    />
                    <Text style={styles.detailLabel}>Stage:</Text>
              </View>
                  <Text style={styles.detailValue}>{item.assignedDate}</Text>
            </View>
              <View style={styles.detailRow}>
                  <View style={styles.detailLabelContainer}>
                    <Image 
                      source={require('../icons/drawing.png')} 
                      style={styles.detailLabelIconImg} 
                      resizeMode="contain" 
                    />
                    <Text style={styles.detailLabel}>Drawing:</Text>
              </View>
                  <View style={styles.drawingContainer}>
                    {item.drawing === 'Available' && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          const elementId = item.originalData?.element_id || item.originalData?.id || item.id?.replace('ELEM-', '') || item.id;
                          setSelectedElementId(elementId);
                          setSelectedElementData(item.originalData || item);
                          setDrawingFilesModalVisible(true);
                        }}
                        activeOpacity={0.7}
                        style={styles.downloadButton}
                      >
                        <Image 
                          source={require('../icons/downloads.png')} 
                          style={styles.downloadImg} 
                          resizeMode="contain" 
                        />
                      </TouchableOpacity>
                    )}
            </View>
              </View>
              {/* In Progress Button for Pending tasks */}
              {!item.fromCompleteProduction && item.status === 'Pending' && (
                <View style={styles.actionButtonContainer}>
                  <TouchableOpacity
                    style={styles.inProgressButton}
                    onPress={(e) => handleInProgress(item, e)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.inProgressButtonText}>QC Progress</Text>
          </TouchableOpacity>
                </View>
              )}
              </View>
          </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No tasks found for selected filters</Text>
          </View>
        )}
      </View>

      <CameraQRScanner
        visible={qrScannerVisible}
        onClose={() => setQrScannerVisible(false)}
        onScan={handleQRScanned}
        navigation={navigation}
      />

      <DrawingFilesModal
        visible={drawingFilesModalVisible}
        onClose={() => {
          setDrawingFilesModalVisible(false);
          setSelectedElementId(null);
          setSelectedElementData(null);
        }}
        elementId={selectedElementId}
        elementData={selectedElementData}
      />

      <BirdsEyeViewModal
        visible={!!birdsEyeViewVisible}
        onClose={() => setBirdsEyeViewVisible(false)}
        projectId={selectedProjectId || null}
      />
      </ScrollView>

      {!hideBottomNav && (
        <BottomNavigation
          activeTab={activeTab}
          onTabPress={handleTabPress}
          onScanPress={handleScanPress}
        />
      )}
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
  mainContainer: {
    flex: 1,
    backgroundColor: BWTheme.background,
  },
  container: {
    flex: 1,
    backgroundColor: BWTheme.background,
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
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
    backgroundColor: '#6DD47E', // Lighter green
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
    color: '#fff',
  },
  statsSection: {
    backgroundColor: Colors.background,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
    letterSpacing: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  filterWrapper: {
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  filterScrollView: {
    flexGrow: 0,
  },
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginHorizontal: 6,
    minWidth: 100,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  filterButtonSelected: {
    transform: [{ scale: 1.05 }],
  },
  filterText: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.semiBold,
  },
  birdsEyeViewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  birdsEyeViewIcon: {
    width: 20,
    height: 20,
    tintColor: '#007AFF',
  },
  qcListSection: {
    padding: 24,
    backgroundColor: BWTheme.background,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  qcCard: {
    backgroundColor: BWTheme.card,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: BWTheme.border,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  qcCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: BWTheme.divider,
  },
  qcCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  qcId: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: BWTheme.textPrimary,
    letterSpacing: 0.5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIcon: {
    width: 20,
    height: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  qcTitle: {
    fontSize: FontSizes.regular,
    color: BWTheme.textSecondary,
    marginBottom: 10,
    fontWeight: FontWeights.medium,
    lineHeight: 18,
  },
  qcDetails: {
    marginBottom: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BWTheme.divider,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 4,
  },
  detailLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detailLabelIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  detailLabelIconImg: {
    width: 18,
    height: 18,
    marginRight: 8,
    tintColor: BWTheme.textPrimary,
  },
  detailLabel: {
    fontSize: FontSizes.small,
    color: BWTheme.textSecondary,
    fontWeight: FontWeights.medium,
  },
  detailValue: {
    fontSize: FontSizes.small,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.semiBold,
    flex: 1,
    textAlign: 'right',
  },
  drawingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  drawingAvailable: {
    color: '#6DD47E', // Lighter green
    marginRight: 8,
    fontWeight: FontWeights.bold,
  },
  downloadButton: {
    padding: 6,
    marginLeft: 4,
    borderRadius: 4,
    backgroundColor: BWTheme.surface,
  },
  downloadImg: {
    width: 20,
    height: 20,
    tintColor: BWTheme.textPrimary,
  },
  actionButtonContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BWTheme.divider,
  },
  inProgressButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  inProgressButtonText: {
    color: '#fff',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  qcFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BWTheme.divider,
  },
  priorityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  priorityText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.5,
  },
  projectDropdownWrapper: {
    marginTop: 16,
  },
  qcCardCompleted: {
    borderColor: '#6DD47E', // Lighter green
    borderWidth: 2,
  },
  qcCardPending: {
    borderColor: '#FFB84D', // Lighter orange
    borderWidth: 2,
  },
  loadingContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 20,
    fontSize: FontSizes.regular,
    color: BWTheme.textPrimary,
    fontWeight: FontWeights.medium,
  },
  emptyState: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: FontSizes.regular,
    color: BWTheme.textSecondary,
    textAlign: 'center',
    fontWeight: FontWeights.medium,
  },
});

export default QCStatusScreen;
