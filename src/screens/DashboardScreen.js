import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
} from 'react-native';
import CameraQRScanner from '../components/CameraQRScanner';
import BottomNavigation from '../components/BottomNavigation';
import ProjectDropdown from '../components/ProjectDropdown';
import DrawingFilesModal from '../components/DrawingFilesModal';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors, Theme } from '../styles/colors';
import {
  Icon,
  Card,
  StatusPill,
  SegmentedControl,
  IconButton,
  EmptyState,
  SkeletonList,
  Skeleton,
  ActionSheet,
  BusyOverlay,
  Tone,
} from '../components/ui';
import { openElementDetails, resolveElementId } from '../services/elementNavigation';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import { validateSession, refreshSession, logout } from '../services/authService';
import { useNativeAccessGuard } from '../services/appAccess';
import { getTokens } from '../services/tokenManager';
import { validateToken } from '../services/tokenUtils';
import { handle401Error, handleApiError } from '../services/errorHandler';
import { themedStyles } from '../theme';
import QualityCard from '../components/qc/QualityCard';
import { fetchDelaysForProjects } from '../services/qcApi';

const PAGE_SIZE = 25;

const DashboardScreen = ({ navigation, hideBottomNav = false }) => {
  useNativeAccessGuard(navigation, 'Dashboard');
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [selectedFilters, setSelectedFilters] = useState(['All']);
  const [selectedProject, setSelectedProject] = useState('All Projects');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [taskCounts, setTaskCounts] = useState({
    pending: 0,
    completed: 0,
    total: 0,
  });
  const [taskCountsLoading, setTaskCountsLoading] = useState(false);
  const [drawingFilesModalVisible, setDrawingFilesModalVisible] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [selectedElementData, setSelectedElementData] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [selectedJobForMenu, setSelectedJobForMenu] = useState(null);
  const [openingElement, setOpeningElement] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // element id -> { delayDays, ... } from the project task journey (for "late" badges).
  const [delays, setDelays] = useState({});
  const [qualityRefreshKey, setQualityRefreshKey] = useState(0);

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = String(date.getFullYear()).slice(-2);
      return `${day}-${month}-${year}`;
    } catch (error) {
      return dateString;
    }
  };

  // Helper function to load tasks from API for a specific status
  const loadTasksFromAPI = async (token, statusParam) => {
    try {
      
      // Build API URL with query parameters
      let apiUrl = `${API_BASE_URL}/api/app/tasks`;
      const queryParams = [];
      
      // Always include status parameter - it's required for filtering
      // Convert to string, trim, and ensure it's not empty
      const statusValue = statusParam ? String(statusParam).trim().toLowerCase() : '';
      
      
      // Add status parameter to query string if it's a valid non-empty value
      if (statusValue && statusValue.length > 0) {
        queryParams.push(`status=${encodeURIComponent(statusValue)}`);
      } else {
      }
      
      if (selectedProjectId && selectedProjectId !== 'all') {
        queryParams.push(`project_id=${encodeURIComponent(selectedProjectId)}`);
      }
      
      // Build the full URL with query string
      // Always add query string if we have any params
      if (queryParams.length > 0) {
        apiUrl += '?' + queryParams.join('&');
      }


      // First, validate the session to ensure it exists in the database
      let currentToken = token;
      
      try {
        const sessionResult = await validateSession();
        
        if (sessionResult && sessionResult.session_id) {
          // Use the validated session_id as the token
          currentToken = sessionResult.session_id;
        } else {
        }
      } catch (validateError) {
        // Continue with original token
      }

      // Try with Bearer token first (standard format)
      const headersWithBearer = createAuthHeaders(currentToken, { useBearer: true });
      
      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: headersWithBearer,
      });


      // If 401, try without Bearer prefix (some APIs expect just the token)
      if (response.status === 401) {
        const responseText1 = await response.text().catch(() => '');
        
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: headersWithoutBearer,
        });
        
      }


      if (response.ok) {
        const data = await response.json();
        
        // Transform API data to match UI format
        // API returns: { tasks: [...], total_count: 85, filter: "pending" }
        const tasks = data.tasks || [];
        const transformedJobs = tasks.map((item) => {
          // Map status values: "Inprogress" -> "Pending", "Completed" -> "Completed"
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
            priority: 'Medium', // API doesn't provide priority, defaulting
            assignedDate: item.stage_name || 'N/A', // Show stage name in assigned column
            drawing: item.drawings && item.drawings.length > 0 ? 'Available' : 'Pending',
            test: item.stage_name || 'N/A',
            // Mark as NOT from complete-production API (from tasks API)
            fromCompleteProduction: false,
            // Store original data for navigation if needed
            originalData: item,
          };
        });

        return transformedJobs;
      } else {
        const errorText = await response.text();
        
        // If 401, try to refresh token and retry once
        if (response.status === 401) {
          try {
            const { refreshToken } = await getTokens();
            
            if (refreshToken) {
              const refreshResult = await refreshSession();
              
              if (refreshResult && refreshResult.access_token) {
                
                // Validate the new session to get session_id
                let newToken = refreshResult.access_token;
                try {
                  const newSessionResult = await validateSession();
                  
                  if (newSessionResult && newSessionResult.session_id) {
                    newToken = newSessionResult.session_id;
                  } else {
                  }
                } catch (validateError) {
                }
                
                
                // Retry with new token - try Bearer first
                const retryHeadersWithBearer = createAuthHeaders(newToken, { useBearer: true });
                
                let retryResponse = await fetch(apiUrl, {
                  method: 'GET',
                  headers: retryHeadersWithBearer,
                });
                
                
                // If still 401, try without Bearer
                if (retryResponse.status === 401) {
                  const retryErrorText1 = await retryResponse.text().catch(() => '');
                  
                  const retryHeadersWithoutBearer = createAuthHeaders(newToken, { useBearer: false });
                  
                  retryResponse = await fetch(apiUrl, {
                    method: 'GET',
                    headers: retryHeadersWithoutBearer,
                  });
                  
                }
                
                if (retryResponse.ok) {
                  const data = await retryResponse.json();
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
                      test: item.stage_name || 'N/A',
                      fromCompleteProduction: false,
                      originalData: item,
                    };
                  });
                  return transformedJobs;
                } else {
                  const retryErrorText = await retryResponse.text().catch(() => '');
                }
              } else {
              }
            } else {
            }
          } catch (refreshError) {
          }
        }
        
        return [];
      }
    } catch (error) {
      return [];
    }
  };

  // QC distribution: prefer dedicated count API, fall back to list totals
  // (same sources as Recent Jobs — pending from /tasks, completed from /complete-production).
  const loadTaskCounts = async () => {
    try {
      setTaskCountsLoading(true);

      const { accessToken } = await getTokens();
      if (!accessToken) {
        setTaskCounts({ pending: 0, completed: 0, total: 0 });
        return;
      }

      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult?.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (_) {
        // keep access token
      }

      const headers = createAuthHeaders(currentToken);
      const projectQuery =
        selectedProjectId && selectedProjectId !== 'all'
          ? `?project_id=${encodeURIComponent(selectedProjectId)}`
          : '';

      // 1) Dedicated count endpoint (use only when it reports real work)
      try {
        const countRes = await fetch(`${API_BASE_URL}/api/app/tasks/count${projectQuery}`, {
          method: 'GET',
          headers,
        });
        if (countRes.ok) {
          const data = await countRes.json();
          const pending = Number(data?.pending ?? 0);
          const completed = Number(data?.completed ?? 0);
          if (pending > 0 || completed > 0) {
            setTaskCounts({
              pending,
              completed,
              total: pending + completed,
            });
            return;
          }
        }
      } catch (_) {
        // fall through to list-based counts
      }

      // 2) Derive from the same APIs that power Recent Jobs (handles broken/zero count API)
      const [tasksRes, completeRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/app/tasks${projectQuery}`, { method: 'GET', headers }),
        fetch(`${API_BASE_URL}/api/app/complete-production${projectQuery}`, {
          method: 'GET',
          headers,
        }),
      ]);

      let pending = 0;
      let completed = 0;

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        pending = Number(
          tasksData?.total_count ??
            (Array.isArray(tasksData?.tasks) ? tasksData.tasks.length : 0)
        );
      }

      if (completeRes.ok) {
        const completeData = await completeRes.json();
        completed = Number(
          completeData?.total_count ??
            (Array.isArray(completeData?.tasks) ? completeData.tasks.length : 0)
        );
      }

      setTaskCounts({
        pending,
        completed,
        total: pending + completed,
      });
    } catch (error) {
      setTaskCounts({ pending: 0, completed: 0, total: 0 });
    } finally {
      setTaskCountsLoading(false);
    }
  };

  const loadProductionHistory = async (statusFilter = null) => {
    try {
      setJobsLoading(true);
      const { accessToken } = await getTokens();
      
      if (!accessToken) {
        setJobsLoading(false);
        return;
      }

      if (!validateToken(accessToken)) {
        try {
          const sessionResult = await validateSession();
          if (!sessionResult?.session_id) {
            throw new Error('Invalid session');
          }
        } catch (e) {
          // Try to refresh token before logging out
          const shouldContinue = await handle401Error(null, null, navigation);
          if (!shouldContinue) {
            return;
          }
        }
      }

      // Determine status filter - use current filter or default based on selectedFilters
      const currentFilter = statusFilter || (selectedFilters.includes('All') ? 'All' : selectedFilters[0]);
      const filterLower = currentFilter.toLowerCase();

      // If "All" filter is selected, call both APIs in parallel
      if (filterLower === 'all') {
        
        try {
          // Call both APIs in parallel
          const [pendingTasks, completedTasksResponse] = await Promise.all([
            // Call tasks API for pending/inprogress tasks
            loadTasksFromAPI(accessToken, null),
            // Call complete-production API for completed tasks
            (async () => {
              try {
                const apiUrl = `${API_BASE_URL}/api/app/complete-production`;
                
                // Validate session first
                let completeToken = accessToken;
                try {
                  const sessionResult = await validateSession();
                  if (sessionResult && sessionResult.session_id) {
                    completeToken = sessionResult.session_id;
                  }
                } catch (validateError) {
                }
                
                // Try with Bearer token first
                const completeHeaders = createAuthHeaders(completeToken, { useBearer: true });
                
                let response = await fetch(apiUrl, {
                  method: 'GET',
                  headers: completeHeaders,
                });
                
                
                // If 401, try without Bearer prefix
                if (response.status === 401) {
                  const errorText1 = await response.text().catch(() => '');
                  
                  response = await fetch(apiUrl, {
                    method: 'GET',
                    headers: createAuthHeaders(completeToken, { useBearer: false }),
                  });
                  
                }

                if (response.ok) {
                  const data = await response.json();
                  const tasks = data.tasks || data || [];
                  // Transform completed tasks to match UI format
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
                      assignedDate: item.stage_name || 'N/A', // Show stage name in assigned column
                      drawing: item.drawings && item.drawings.length > 0 ? 'Available' : 'Pending',
                      test: item.stage_name || 'N/A',
                      // Mark as from complete-production API
                      fromCompleteProduction: true,
                      originalData: item,
                    };
                  }) : [];
                }
                return [];
              } catch (error) {
                return [];
              }
            })()
          ]);
          
          // Combine results from both APIs
          const allTasks = [...(pendingTasks || []), ...(completedTasksResponse || [])];
          
          setJobs(allTasks);
          setJobsLoading(false);
        } catch (error) {
          // Fallback to just tasks API
          const allTasks = await loadTasksFromAPI(accessToken, null);
          setJobs(allTasks || []);
          setJobsLoading(false);
        }
      } else if (filterLower === 'pending') {
        // Call tasks API without status parameter, then filter on frontend
        const allTasks = await loadTasksFromAPI(accessToken, null); // Get all tasks without status filter
        // Filter for pending/inprogress tasks on frontend
        const pendingTasks = (allTasks || []).filter(task => {
          const taskStatus = task.originalData?.status || task.status || '';
          const statusLower = taskStatus.toLowerCase();
          return statusLower === 'inprogress' || statusLower === 'pending' || statusLower === 'in progress';
        });
        setJobs(pendingTasks);
        setJobsLoading(false);
      } else if (filterLower === 'completed') {
        // Call complete-production API to get completed tasks
        try {
          const apiUrl = `${API_BASE_URL}/api/app/complete-production`;
          
          // Validate session first
          let completeToken = accessToken;
          try {
            const sessionResult = await validateSession();
            if (sessionResult && sessionResult.session_id) {
              completeToken = sessionResult.session_id;
            }
          } catch (validateError) {
          }
          
          // Try GET request first to fetch completed tasks
          // Try with Bearer token first
          
          let response = await fetch(apiUrl, {
            method: 'GET',
            headers: createAuthHeaders(completeToken, { useBearer: true }),
          });
          
          
          // If 401, try without Bearer prefix
          if (response.status === 401) {
            const errorText1 = await response.text().catch(() => '');
            
            response = await fetch(apiUrl, {
              method: 'GET',
              headers: createAuthHeaders(completeToken, { useBearer: false }),
            });
            
          }


          if (response.ok) {
            const data = await response.json();
            
            // Transform API data to match UI format
            // API might return tasks array or different structure
            const tasks = data.tasks || data || [];
            const transformedJobs = Array.isArray(tasks) ? tasks.map((item) => {
              // Map status values: "Inprogress" -> "Pending", "Completed" -> "Completed"
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
                assignedDate: item.stage_name || 'N/A', // Show stage name in assigned column
                drawing: item.drawings && item.drawings.length > 0 ? 'Available' : 'Pending',
                test: item.stage_name || 'N/A',
                // Mark as from complete-production API
                fromCompleteProduction: true,
                // Store original data for navigation if needed
                originalData: item,
              };
            }) : [];
            
            setJobs(transformedJobs);
            setJobsLoading(false);
          } else {
            const errorText = await response.text();
            // Fallback to filtering from tasks API if complete-production doesn't work
            const allTasks = await loadTasksFromAPI(accessToken, null);
            const completedTasks = (allTasks || []).filter(task => {
              const taskStatus = task.originalData?.status || task.status || '';
              return taskStatus.toLowerCase() === 'completed';
            });
            // Fallback items from tasks API should not have green styling
            setJobs(completedTasks);
            setJobsLoading(false);
          }
        } catch (error) {
          // Fallback to filtering from tasks API
          const allTasks = await loadTasksFromAPI(accessToken, null);
          const completedTasks = (allTasks || []).filter(task => {
            const taskStatus = task.originalData?.status || task.status || '';
            return taskStatus.toLowerCase() === 'completed';
          });
          setJobs(completedTasks);
          setJobsLoading(false);
        }
      } else {
        // Default to pending if unknown filter
        const tasks = await loadTasksFromAPI(accessToken, 'pending');
        setJobs(tasks || []);
        setJobsLoading(false);
      }
    } catch (error) {
      Alert.alert('Network Error', 'Failed to load tasks. Please check your internet connection and try again.');
      setJobs([]);
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    loadProductionHistory();
    loadTaskCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Reload when project selection changes
    if (selectedProject) {
      loadProductionHistory();
      loadTaskCounts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, selectedProjectId]);

  

  useEffect(() => {
    let alive = true;
    const projectIds = selectedProjectId
      ? [selectedProjectId]
      : (jobs || []).map((j) => j.originalData?.project_id);
    if (!projectIds.filter(Boolean).length) {
      setDelays({});
      return undefined;
    }
    fetchDelaysForProjects(projectIds)
      .then((map) => alive && setDelays(map))
      .catch(() => alive && setDelays({}));
    return () => {
      alive = false;
    };
  }, [jobs, selectedProjectId]);

  const handleJobPress = (jobId) => {
    // Find the original job data from the jobs list
    const jobData = jobs.find(job => job.id === jobId)?.originalData || null;
    navigation.navigate('JobDetails', { 
      jobId,
      jobData: jobData
    });
  };





  const handleQRScanned = (data, elementData = null) => {
    if (elementData) {
      // Navigate to element details screen with the fetched data
      navigation.navigate('ElementDetails', { 
        elementId: elementData.id,
        elementData: elementData 
      });
    } else {
      // Old behavior for backward compatibility
      Alert.alert(
        'QR Code Scanned',
        `Scanned data: ${data}`,
        [
          { text: 'OK' },
          { 
            text: 'View Job', 
            onPress: () => {
              // Try to extract job ID from QR data
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

  const handleProjectSelect = (projectName, projectId = null) => {
    // Ensure projectName is always a string, not an object
    const name = typeof projectName === 'string' ? projectName : (projectName?.name || 'All Projects');
    const id = projectId === 'all' || projectId === null ? null : projectId;
    setSelectedProject(name);
    setSelectedProjectId(id);
  };

  const handleTabPress = useCallback((tabId, screenName) => {
    setActiveTab(tabId);
    const state = navigation.getState?.();
    const currentRoute = state?.routes?.[state?.index || 0]?.name;
    // If already on the target, do nothing (prevents re-navigate/remount)
    if (currentRoute === screenName || (screenName === 'Dashboard' && currentRoute === 'Dashboard')) {
      return;
    }
    if (screenName && screenName !== 'Dashboard') {
      navigation.navigate(screenName);
    }
  }, [navigation]);

  const handleScanPress = () => {
    setQrScannerVisible(true);
  };

  const FILTERS = ['All', 'Pending', 'Delayed', 'Completed'];

  const toggleFilter = (filter) => {
    if (selectedFilters.includes(filter)) return;
    setSelectedFilters([filter]);
    setVisibleCount(PAGE_SIZE);
    // "Delayed" is pending work that is past its planned end date (filtered below).
    loadProductionHistory(filter === 'Delayed' ? 'Pending' : filter);
  };

  const activeFilter = selectedFilters[0] || 'All';
  const isJobCompleted = (job) =>
    job.fromCompleteProduction || String(job.status).toLowerCase() === 'completed';
  const delayOf = (job) =>
    isJobCompleted(job) ? 0 : delays[job.originalData?.element_id]?.delayDays || 0;
  const filteredJobs =
    activeFilter === 'Delayed'
      ? (jobs || []).filter((j) => delayOf(j) > 0).sort((a, b) => delayOf(b) - delayOf(a))
      : jobs || [];
  const visibleJobs = filteredJobs.slice(0, visibleCount);

  const pending = Number(taskCounts.pending) || 0;
  const completed = Number(taskCounts.completed) || 0;
  const total = Math.max(Number(taskCounts.total) || 0, pending + completed);
  const completionPct = total ? Math.round((completed / total) * 100) : 0;


  const handleOpenElement = async (job) => {
    if (openingElement) return;
    setOpeningElement(true);
    try {
      await openElementDetails(navigation, resolveElementId(job));
    } finally {
      setOpeningElement(false);
    }
  };

  const openDrawings = (job) => {
    setSelectedElementId(resolveElementId(job));
    setSelectedElementData(job.originalData || job);
    setDrawingFilesModalVisible(true);
  };

  const proceedToQC = async (job) => {
    setMenuVisible(false);
    if (!job || job.fromCompleteProduction) return;
    try {
      const { accessToken } = await getTokens();
      if (!accessToken || !validateToken(accessToken)) {
        Alert.alert('Session expired', 'Please log in again.');
        await logout();
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }
      const d = job.originalData || {};
      const paperId = d.paper_id || d.paper?.id || job.paper_id;
      if (!paperId) {
        Alert.alert('QC checklist unavailable', 'No QC paper is linked to this task.');
        return;
      }
      const taskId = d.id || d.task_id || job.id;
      navigation.navigate('Questions', {
        paperId,
        taskId,
        projectId: d.project_id || selectedProjectId,
        stageId: d.stage_id || d.stage?.id,
        activityId: d.activity_id || taskId,
      });
    } catch (error) {
      Alert.alert("Couldn't open QC", error?.message || 'Please try again.');
    }
  };

  const openQcReport = (job) => {
    setMenuVisible(false);
    const d = job?.originalData || {};
    navigation.navigate('QCReport', {
      elementId: resolveElementId(job),
      elementName: job?.id,
      stageName: d.stage_name,
    });
  };

  const openRectification = () => {
    navigation.navigate('Rectification', selectedProjectId
      ? { projectId: selectedProjectId, projectName: selectedProject }
      : undefined);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setQualityRefreshKey((k) => k + 1);
    const currentFilter = selectedFilters.includes('All') ? null : selectedFilters[0];
    await Promise.all([loadProductionHistory(currentFilter), loadTaskCounts()]);
    setRefreshing(false);
  };

  // ---------- Render pieces ----------

  const renderOverview = () => (
    <View style={styles.overview}>
      <View style={styles.overviewTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.overviewEyebrow}>QC OVERVIEW</Text>
          <Text style={styles.overviewTitle} numberOfLines={1}>
            {selectedProject && selectedProject !== 'All Projects' ? selectedProject : 'All projects'}
          </Text>
        </View>
        {taskCountsLoading ? (
          <Skeleton width={56} height={28} style={{ opacity: 0.3 }} />
        ) : (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.overviewPct}>{completionPct}%</Text>
            <Text style={styles.overviewPctLabel}>completed</Text>
          </View>
        )}
      </View>

      {/* Stacked completion bar */}
      <View style={styles.stackTrack}>
        {total > 0 && (
          <>
            <View style={{ flex: completed, backgroundColor: Tone.success.solid }} />
            <View style={{ flex: pending, backgroundColor: Tone.warning.solid }} />
          </>
        )}
      </View>

      <View style={styles.tiles}>
        <StatTile label="Total" value={total} icon="layers" loading={taskCountsLoading} />
        <StatTile label="Pending" value={pending} icon="clock" color={Tone.warning.solid} loading={taskCountsLoading} />
        <StatTile label="Completed" value={completed} icon="check-circle" color={Tone.success.solid} loading={taskCountsLoading} />
      </View>
    </View>
  );

  const renderJob = (job, index) => {
    const done = isJobCompleted(job);
    const d = job.originalData || {};
    const subtitle = [d.element_type_name, d.stage_name || job.assignedDate]
      .filter((v) => v && v !== 'N/A')
      .join(' · ');
    return (
      <Card
        key={`${job.id}-${index}`}
        style={styles.jobCard}
        onPress={() => handleOpenElement(job)}
        accessibilityRole="button"
        accessibilityLabel={`Open element ${job.id}`}
      >
        <View style={[styles.jobAccent, { backgroundColor: done ? Tone.success.solid : Tone.warning.solid }]} />
        <View style={styles.jobBody}>
          <View style={styles.jobTopRow}>
            <Text style={styles.jobCode} numberOfLines={1}>{job.id}</Text>
            {delayOf(job) > 0 && <StatusPill label={`${delayOf(job)}d late`} tone="danger" />}
            <StatusPill label={done ? 'Completed' : 'Pending'} tone={done ? 'success' : 'warning'} />
          </View>
          {!!subtitle && <Text style={styles.jobSub} numberOfLines={1}>{subtitle}</Text>}
          <View style={styles.jobActions}>
            <TouchableOpacity style={styles.jobChipBtn} onPress={() => openDrawings(job)} activeOpacity={0.7}>
              <Icon name="file-text" size={15} color={Colors.primary} />
              <Text style={styles.jobChipText}>Drawings</Text>
            </TouchableOpacity>
            {!done && (
              <TouchableOpacity style={styles.jobChipBtn} onPress={() => proceedToQC(job)} activeOpacity={0.7}>
                <Icon name="clipboard-check" size={15} color={Colors.primary} />
                <Text style={styles.jobChipText}>Start QC</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <IconButton
              name="more-vertical"
              label="More actions"
              size={18}
              style={styles.moreBtn}
              onPress={() => {
                setSelectedJobForMenu(job);
                setMenuVisible(true);
              }}
            />
          </View>
        </View>
      </Card>
    );
  };

  const renderJobs = () => {
    if (jobsLoading) return <SkeletonList rows={5} />;
    if (filteredJobs.length === 0) {
      return (
        <Card>
          <EmptyState
            icon={activeFilter === 'Completed' ? 'check-circle' : 'clipboard'}
            tone={activeFilter === 'Completed' ? 'success' : 'info'}
            title={activeFilter === 'All' ? 'No jobs yet' : `No ${activeFilter.toLowerCase()} jobs`}
            message={activeFilter === 'Delayed'
              ? 'Nothing is past its planned date. Great work!'
              : 'Pull down to refresh, or pick another project or filter.'}
            actionLabel="Refresh"
            onAction={onRefresh}
          />
        </Card>
      );
    }
    return (
      <View style={{ gap: 10 }}>
        {visibleJobs.map(renderJob)}
        {filteredJobs.length > visibleCount && (
          <TouchableOpacity
            style={styles.showMore}
            onPress={() => setVisibleCount((c) => c + PAGE_SIZE)}
            activeOpacity={0.8}
          >
            <Text style={styles.showMoreText}>
              Show more ({filteredJobs.length - visibleCount} remaining)
            </Text>
            <Icon name="chevron-down" size={16} color={Colors.primary} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const menuJob = selectedJobForMenu;
  const menuDone = menuJob ? isJobCompleted(menuJob) : false;

  return (
    <View style={styles.mainContainer}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
        }
      >
        <View style={styles.projectDropdownWrapper}>
          <ProjectDropdown
            selectedProject={typeof selectedProject === 'string' ? selectedProject : (selectedProject?.name || 'All Projects')}
            onProjectSelect={(project) => {
              handleProjectSelect(project?.name || 'All Projects', project?.project_id || null);
            }}
            navigation={navigation}
          />
        </View>

        <View style={styles.section}>{renderOverview()}</View>

        <View style={styles.section}>
          <QualityCard
            projectId={selectedProjectId}
            refreshKey={qualityRefreshKey}
            onOpenRectification={openRectification}
          />
        </View>

        <View style={styles.section}>
          <SegmentedControl
            options={FILTERS.map((f) => ({ key: f, label: f }))}
            value={activeFilter}
            onChange={toggleFilter}
            style={{ marginBottom: 12 }}
          />
          {renderJobs()}
        </View>
      </ScrollView>

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

      <ActionSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title={menuJob?.id}
        subtitle={menuJob?.originalData?.stage_name || menuJob?.assignedDate}
        actions={[
          {
            key: 'detail',
            label: 'Element details',
            icon: 'box',
            onPress: () => {
              setMenuVisible(false);
              if (menuJob) handleOpenElement(menuJob);
            },
          },
          {
            key: 'drawings',
            label: 'Drawings',
            icon: 'file-text',
            onPress: () => {
              setMenuVisible(false);
              if (menuJob) openDrawings(menuJob);
            },
          },
          {
            key: 'report',
            label: 'View QC report',
            icon: 'shield-check',
            hint: menuDone ? 'Answers, photos and inspector' : 'QC of the stages already inspected',
            onPress: () => openQcReport(menuJob),
          },
          {
            key: 'qc',
            label: 'Proceed with QC',
            icon: 'clipboard-check',
            hint: menuDone ? 'Already completed' : 'Open the QC checklist',
            disabled: menuDone,
            onPress: () => proceedToQC(menuJob),
          },
        ]}
      />

      <BusyOverlay visible={openingElement} label="Opening element…" />

      {!hideBottomNav && <BottomNavigation activeTab={activeTab} onTabPress={handleTabPress} />}
    </View>
  );
};

const StatTile = ({ label, value, icon, color = '#FFFFFF', loading }) => (
  <View style={styles.tile}>
    <View style={styles.tileHead}>
      <Icon name={icon} size={14} color={color === '#FFFFFF' ? '#8FA6D6' : color} />
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
    {loading ? (
      <Skeleton width={40} height={20} style={{ opacity: 0.3, marginTop: 4 }} />
    ) : (
      <Text style={[styles.tileValue, color !== '#FFFFFF' && { color }]}>{value}</Text>
    )}
  </View>
);

const styles = themedStyles(() => ({
  mainContainer: { flex: 1, backgroundColor: Colors.surface },
  container: { flex: 1 },
  content: { paddingBottom: 24, flexGrow: 1 },
  projectDropdownWrapper: { marginTop: 12 },
  section: { paddingHorizontal: 16, marginTop: 16 },

  overview: { backgroundColor: Colors.brandNavy, borderRadius: Theme.radiusLg, padding: 16 },
  overviewTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  overviewEyebrow: { fontSize: FontSizes.extraSmall, letterSpacing: 1, color: '#8FA6D6', fontWeight: FontWeights.semiBold },
  overviewTitle: { fontSize: FontSizes.medium, color: Colors.textOnNavy, fontWeight: FontWeights.bold, marginTop: 2 },
  overviewPct: { fontSize: 28, fontWeight: FontWeights.extraBold, color: '#FFFFFF' },
  overviewPctLabel: { fontSize: FontSizes.extraSmall, color: '#8FA6D6', marginTop: -2 },
  stackTrack: {
    flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden',
    backgroundColor: 'rgba(143,166,214,0.25)',
  },
  tiles: { flexDirection: 'row', marginTop: 14, gap: 8 },
  tile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: Theme.radius, padding: 10 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tileLabel: { fontSize: FontSizes.extraSmall + 1, color: '#8FA6D6', fontWeight: FontWeights.medium },
  tileValue: { fontSize: FontSizes.large, fontWeight: FontWeights.bold, color: '#FFFFFF', marginTop: 4 },

  jobCard: { flexDirection: 'row', overflow: 'hidden' },
  jobAccent: { width: 4 },
  jobBody: { flex: 1, padding: 12, paddingLeft: 12 },
  jobTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  jobCode: { flex: 1, fontSize: FontSizes.regular + 1, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  jobSub: { fontSize: FontSizes.small, color: Colors.textSecondary, marginTop: 3 },
  jobActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  jobChipBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 10,
    borderRadius: Theme.radiusSm, backgroundColor: Colors.primarySoft,
  },
  jobChipText: { fontSize: FontSizes.small, color: Colors.primary, fontWeight: FontWeights.semiBold },
  moreBtn: { width: 32, height: 32, backgroundColor: 'transparent' },

  showMore: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: Theme.buttonHeightLg, borderRadius: Theme.radius, borderWidth: 1, borderColor: Colors.borderStrong,
    backgroundColor: Colors.background,
  },
  showMoreText: { fontSize: FontSizes.button, color: Colors.primary, fontWeight: FontWeights.semiBold },
}));

export default DashboardScreen;
