import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import CameraQRScanner from '../components/CameraQRScanner';
import { Colors } from '../styles/colors';

const QCResponseScreen = ({ navigation }) => {
  const [selectedJob, setSelectedJob] = useState(null);
  const [response, setResponse] = useState('');
  const [rating, setRating] = useState(0);
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const mockJobs = [
    { id: 'JOB-001', title: 'Product Inspection - Batch A', status: 'Completed' },
    { id: 'JOB-002', title: 'Quality Check - Component X', status: 'In Progress' },
    { id: 'JOB-003', title: 'Final Review - Product Y', status: 'Completed' },
  ];

  const handleJobSelect = (job) => {
    setSelectedJob(job);
    setResponse('');
    setRating(0);
  };

  const handleRatingSelect = (selectedRating) => {
    setRating(selectedRating);
  };

  const handleSubmitResponse = () => {
    if (!selectedJob) {
      Alert.alert('Error', 'Please select a job first');
      return;
    }
    if (response.trim() === '') {
      Alert.alert('Error', 'Please enter your response');
      return;
    }
    if (rating === 0) {
      Alert.alert('Error', 'Please select a rating');
      return;
    }

    Alert.alert(
      'Response Submitted',
      `QC response submitted for ${selectedJob.title}\nRating: ${rating}/5\nResponse: ${response}`,
      [
        { text: 'OK', onPress: () => {
          setSelectedJob(null);
          setResponse('');
          setRating(0);
        }}
      ]
    );
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return '#34C759';
      case 'In Progress': return '#007AFF';
      case 'Pending': return '#FF9500';
      default: return '#8E8E93';
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Reset selection/inputs to simulate refresh
    setSelectedJob(null);
    setResponse('');
    setRating(0);
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
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
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerContent}>
            <Text style={styles.title}>QC Response</Text>
            <Text style={styles.subtitle}>Submit quality control feedback</Text>
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

      <View style={styles.jobSelectionSection}>
        <Text style={styles.sectionTitle}>Select Job</Text>
        {mockJobs.map((job) => (
          <TouchableOpacity
            key={job.id}
            style={[
              styles.jobCard,
              selectedJob?.id === job.id && styles.selectedJobCard
            ]}
            onPress={() => handleJobSelect(job)}
          >
            <View style={styles.jobHeader}>
              <Text style={styles.jobId}>{job.id}</Text>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(job.status) }]}>
                <Text style={styles.statusText}>{job.status}</Text>
              </View>
            </View>
            <Text style={styles.jobTitle}>{job.title}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedJob && (
        <>
          <View style={styles.ratingSection}>
            <Text style={styles.sectionTitle}>Quality Rating</Text>
            <Text style={styles.ratingSubtitle}>Rate the quality of this job (1-5)</Text>
            <View style={styles.ratingContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  style={styles.starButton}
                  onPress={() => handleRatingSelect(star)}
                >
                  <Text style={[
                    styles.star,
                    star <= rating ? styles.starSelected : styles.starUnselected
                  ]}>
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.ratingText}>
              {rating > 0 ? `${rating}/5 - ${getRatingText(rating)}` : 'Select a rating'}
            </Text>
          </View>

          <View style={styles.responseSection}>
            <Text style={styles.sectionTitle}>Response</Text>
            <Text style={styles.responseSubtitle}>
              Provide detailed feedback about the quality control process
            </Text>
            <TextInput
              style={styles.responseInput}
              value={response}
              onChangeText={setResponse}
              placeholder="Enter your QC response here..."
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.submitSection}>
            <TouchableOpacity style={styles.submitButton} onPress={handleSubmitResponse}>
              <Text style={styles.submitButtonText}>Submit QC Response</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      <CameraQRScanner
        visible={qrScannerVisible}
        onClose={() => setQrScannerVisible(false)}
        onScan={handleQRScanned}
        navigation={navigation}
      />
    </ScrollView>
  );
};

const getRatingText = (rating) => {
  switch (rating) {
    case 1: return 'Poor';
    case 2: return 'Fair';
    case 3: return 'Good';
    case 4: return 'Very Good';
    case 5: return 'Excellent';
    default: return '';
  }
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
  qrButtonText: {
    fontSize: 22,
    color: '#fff',
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
    color: '#fff',
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
    backgroundColor: '#fff',
    transform: [{ translateY: -1 }],
  },
  jobSelectionSection: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  jobCard: {
    backgroundColor: Colors.background,
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedJobCard: {
    borderColor: '#007AFF',
    backgroundColor: '#e3f2fd',
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  jobId: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  jobTitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  ratingSection: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 16,
  },
  ratingSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  starButton: {
    padding: 8,
  },
  star: {
    fontSize: 32,
  },
  starSelected: {
    color: '#FFD700',
  },
  starUnselected: {
    color: '#ddd',
  },
  ratingText: {
    fontSize: 16,
    color: Colors.textPrimary,
    textAlign: 'center',
    fontWeight: '500',
  },
  responseSection: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 16,
  },
  responseSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  responseInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
  },
  submitSection: {
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default QCResponseScreen;
