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
import { validateToken } from '../services/tokenUtils';
import { logout, validateSession, refreshSession } from '../services/authService';
import { useNativeAccessGuard } from '../services/appAccess';
import { handle401Error } from '../services/errorHandler';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import CameraQRScanner from '../components/CameraQRScanner';
import BottomNavigation from '../components/BottomNavigation';
import ProjectDropdown from '../components/ProjectDropdown';
import DrawingFilesModal from '../components/DrawingFilesModal';
import TowerFloorFilter from '../components/TowerFloorFilter';
import { Colors, Theme } from '../styles/colors';
import { Icon, SegmentedControl, StatusPill, EmptyState, SkeletonList, Tone } from '../components/ui';
import { FontSizes, FontWeights } from '../styles/fonts';

const QCStatusScreen = ({ navigation, hideBottomNav = false }) => {
  useNativeAccessGuard(navigation, 'Dashboard');
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
      case 'In Progress': return Colors.primary;
      case 'Completed': return '#6DD47E'; // Lighter green
     
      default: return '#8E8E93';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High': return Colors.error;
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
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      let tokenToUse = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult?.session_id) {
          tokenToUse = sessionResult.session_id;
        }
      } catch {}

      const apiUrl = `${API_BASE_URL}/api/scan_element/${elementId}`;

      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: createAuthHeaders(tokenToUse, { useBearer: true }),
      });

      if (response.status === 401) {
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: createAuthHeaders(tokenToUse, { useBearer: false }),
        });
      }

      if (response.ok) {
        const elementData = await response.json();
        navigation.navigate('ElementDetails', {
          elementId: elementId,
          elementData: elementData,
        });
      } else if (response.status === 401) {
        const shouldRetry = await handle401Error(response, null, navigation);
        if (!shouldRetry) {
          Alert.alert('Error', 'Failed to fetch element details. Please try again.');
        }
      } else {
        Alert.alert('Error', `Failed to fetch element details. Status: ${response.status}`);
      }
    } catch (error) {
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
      case 'All': return Colors.primary;
      case 'Pending': return Colors.warning;
      case 'Completed': return Colors.success;
      default: return Colors.primary;
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

  const getTower = (item) =>
    item.originalData?.tower || item.originalData?.tower_name || item.originalData?.element_type?.tower ||
    item.originalData?.element_type?.tower_name || item.tower || item.tower_name || 'N/A';
  const getFloor = (item) =>
    item.originalData?.floor || item.originalData?.floor_name || item.originalData?.element_type?.floor ||
    item.originalData?.element_type?.floor_name || item.floor || item.floor_name || 'N/A';

  const openBirdsEyeView = () => {
    const pid = selectedProjectId || jobs[0]?.originalData?.project_id || jobs[0]?.project_id || null;
    if (!pid) {
      Alert.alert("Bird's Eye View", 'Please select a project first.');
      return;
    }
    navigation.navigate('BirdsEyeView', {
      projectId: pid,
      projectName: selectedProject && selectedProject !== 'All Projects' ? selectedProject : undefined,
    });
  };

  const openDrawings = (item, e) => {
    e?.stopPropagation?.();
    const elementId = item.originalData?.element_id || item.originalData?.id || item.id?.replace('ELEM-', '') || item.id;
    setSelectedElementId(elementId);
    setSelectedElementData(item.originalData || item);
    setDrawingFilesModalVisible(true);
  };

  const renderCard = (item, index) => {
    const tone = statusTone(item.status);
    const isPending = !item.fromCompleteProduction && item.status === 'Pending';
    const hasDrawing = item.drawing === 'Available';
    return (
      <TouchableOpacity
        key={`${item.id}-${index}`}
        style={styles.card}
        onPress={() => handleQCItemPress(item)}
        activeOpacity={0.85}
      >
        <View style={[styles.cardAccent, { backgroundColor: tone.bar }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardHead}>
            <Text style={styles.qcId} numberOfLines={1}>{item.id}</Text>
            <StatusPill label={item.status || 'Unknown'} tone={tone.key} />
          </View>
          {!!item.title && <Text style={styles.qcTitle} numberOfLines={2}>{item.title}</Text>}

          <View style={styles.metaGrid}>
            <MetaItem icon="building" label="Tower" value={getTower(item)} />
            <MetaItem icon="layers" label="Floor" value={getFloor(item)} />
            <MetaItem icon="list-checks" label="Stage" value={item.assignedDate || 'N/A'} />
          </View>

          <View style={styles.cardFooter}>
            {hasDrawing && (
              <TouchableOpacity style={styles.outlineBtn} onPress={(e) => openDrawings(item, e)} activeOpacity={0.7}>
                <Icon name="download" size={16} color={Colors.primary} />
                <Text style={styles.outlineBtnText}>Drawings</Text>
              </TouchableOpacity>
            )}
            {isPending ? (
              <TouchableOpacity style={styles.primaryBtn} onPress={(e) => handleInProgress(item, e)} activeOpacity={0.85}>
                <Icon name="clipboard-check" size={16} color={Colors.primaryForeground} />
                <Text style={styles.primaryBtnText}>QC Progress</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.detailsLink}>
                <Text style={styles.detailsLinkText}>View details</Text>
                <Icon name="chevron-right" size={16} color={Colors.textSecondary} />
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.mainContainer}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
      >
        <View style={styles.projectDropdownWrapper}>
          <ProjectDropdown
            selectedProject={typeof selectedProject === 'string' ? selectedProject : (selectedProject?.name || 'All Projects')}
            onProjectSelect={handleProjectSelect}
            navigation={navigation}
          />
        </View>

        <View style={styles.content}>
          {/* Status segmented control */}
          <SegmentedControl
            style={styles.segment}
            options={filterOptions.map((f) => ({ key: f, label: f }))}
            value={selectedFilters[0] || 'All'}
            onChange={toggleFilter}
          />

          {/* Bird's Eye View entry */}
          <TouchableOpacity style={styles.birdCard} onPress={openBirdsEyeView} activeOpacity={0.85}>
            <View style={styles.birdIconWrap}>
              <Icon name="eye" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.birdTitle}>Bird's Eye View</Text>
              <Text style={styles.birdSub} numberOfLines={1}>Production progress by task and stage</Text>
            </View>
            <Icon name="chevron-right" size={20} color="#8FA6D6" />
          </TouchableOpacity>

          {/* Tower and Floor Filters */}
          <TowerFloorFilter jobs={availableJobs} onFilterChange={setTowerFloorFilter} />

          {/* List header */}
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>Tasks</Text>
            {!jobsLoading && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{filteredJobs.length}</Text>
              </View>
            )}
          </View>

          {jobsLoading ? (
            <SkeletonList rows={4} />
          ) : filteredJobs.length > 0 ? (
            filteredJobs.map(renderCard)
          ) : (
            <EmptyState
              icon="clipboard"
              title="No tasks found"
              message="Try a different project, status or tower filter."
              actionLabel="Refresh"
              onAction={onRefresh}
            />
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
      </ScrollView>

      {!hideBottomNav && (
        <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} onScanPress={handleScanPress} />
      )}
    </View>
  );
};

const statusTone = (status) => {
  const key =
    status === 'Completed' ? 'success'
      : status === 'Pending' ? 'warning'
      : status === 'In Progress' ? 'info'
      : 'neutral';
  return { key, bar: Tone[key].solid };
};

const MetaItem = ({ icon, label, value }) => (
  <View style={styles.metaItem}>
    <View style={styles.metaIcon}>
      <Icon name={icon} size={14} color={Colors.primary} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
    </View>
  </View>
);

const cardShadow = {
  shadowColor: Colors.shadow,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 1,
  shadowRadius: 6,
  elevation: 2,
};

const styles = StyleSheet.create({
  mainContainer: { flex: 1, backgroundColor: Colors.surface },
  container: { flex: 1, backgroundColor: Colors.surface },
  scrollContent: { paddingBottom: 24 },
  projectDropdownWrapper: { marginTop: 12 },
  content: { paddingHorizontal: 16, paddingTop: 4 },

  // Segmented status filter
  segment: { marginBottom: 12 },

  // Bird's Eye View card
  birdCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.brandNavy,
    borderRadius: Theme.radiusLg, padding: 14, marginBottom: 12,
  },
  birdIconWrap: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  birdTitle: { fontSize: FontSizes.regular + 1, fontWeight: FontWeights.bold, color: Colors.textOnNavy },
  birdSub: { fontSize: FontSizes.small, color: '#8FA6D6', marginTop: 2 },

  // List header
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 10 },
  listTitle: { fontSize: FontSizes.medium, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  countBadge: { backgroundColor: Colors.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countBadgeText: { fontSize: FontSizes.small, fontWeight: FontWeights.bold, color: Colors.primary },

  // Task card
  card: {
    flexDirection: 'row', backgroundColor: Colors.background, borderRadius: Theme.radiusLg, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...cardShadow,
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qcId: { flex: 1, fontSize: FontSizes.regular + 2, fontWeight: FontWeights.bold, color: Colors.primary },
  qcTitle: { fontSize: FontSizes.small + 1, color: Colors.textSecondary, marginTop: 4, fontWeight: FontWeights.medium },

  metaGrid: {
    flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, paddingTop: 12, rowGap: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  metaItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 },
  metaIcon: {
    width: 28, height: 28, borderRadius: Theme.radiusSm, backgroundColor: Colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  metaLabel: { fontSize: FontSizes.extraSmall + 1, color: Colors.textSecondary },
  metaValue: { fontSize: FontSizes.small + 1, color: Colors.textPrimary, fontWeight: FontWeights.semiBold, marginTop: 1 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: Theme.buttonHeight,
    paddingHorizontal: 14, borderRadius: Theme.radius, borderWidth: 1, borderColor: Colors.borderStrong,
    backgroundColor: Colors.primarySoft,
  },
  outlineBtnText: { fontSize: FontSizes.small + 1, color: Colors.primary, fontWeight: FontWeights.semiBold },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: Theme.buttonHeight, borderRadius: Theme.radius, backgroundColor: Colors.primary,
  },
  primaryBtnText: { fontSize: FontSizes.button, color: Colors.primaryForeground, fontWeight: FontWeights.bold },
  detailsLink: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 2 },
  detailsLinkText: { fontSize: FontSizes.small, color: Colors.textSecondary, fontWeight: FontWeights.medium },

});

export default QCStatusScreen;
