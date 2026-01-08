import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';

const TowerFloorSelector = ({
  data,
  selectedTower,
  selectedFloor,
  onSelectTower,
  onSelectFloor,
}) => {
  const [towerModalVisible, setTowerModalVisible] = useState(false);
  const [floorModalVisible, setFloorModalVisible] = useState(false);
  
  const towers = data ? Object.keys(data) : [];
  const floors = selectedTower && data[selectedTower] 
    ? Object.keys(data[selectedTower]) 
    : [];

  return (
    <View style={styles.container}>
      <View style={styles.selectContainer}>
        <Text style={styles.label}>Select Tower</Text>
        <TouchableOpacity
          style={styles.selectButton}
          onPress={() => setTowerModalVisible(true)}
        >
          <Text style={styles.selectButtonText} numberOfLines={1}>
            {selectedTower || 'Select a tower'}
          </Text>
          <Text style={styles.arrow}>▼</Text>
        </TouchableOpacity>
        
        <Modal
          visible={towerModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setTowerModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setTowerModalVisible(false)}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Tower</Text>
                <TouchableOpacity
                  onPress={() => setTowerModalVisible(false)}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={towers}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      selectedTower === item && styles.modalItemSelected
                    ]}
                    onPress={() => {
                      onSelectTower(item);
                      setTowerModalVisible(false);
                    }}
                  >
                    <Text style={[
                      styles.modalItemText,
                      selectedTower === item && styles.modalItemTextSelected
                    ]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
      
      <View style={styles.selectContainer}>
        <Text style={styles.label}>Select Floor</Text>
        <TouchableOpacity
          style={[styles.selectButton, !selectedTower && styles.selectButtonDisabled]}
          disabled={!selectedTower}
          onPress={() => selectedTower && setFloorModalVisible(true)}
        >
          <Text style={[styles.selectButtonText, !selectedTower && styles.selectButtonTextDisabled]} numberOfLines={1}>
            {selectedFloor || (selectedTower ? 'Select a floor' : 'Select a tower first')}
          </Text>
          <Text style={[styles.arrow, !selectedTower && styles.arrowDisabled]}>▼</Text>
        </TouchableOpacity>
        
        <Modal
          visible={floorModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setFloorModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setFloorModalVisible(false)}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Floor</Text>
                <TouchableOpacity
                  onPress={() => setFloorModalVisible(false)}
                  style={styles.modalCloseButton}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={floors}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      selectedFloor === item && styles.modalItemSelected
                    ]}
                    onPress={() => {
                      onSelectFloor(item);
                      setFloorModalVisible(false);
                    }}
                  >
                    <Text style={[
                      styles.modalItemText,
                      selectedFloor === item && styles.modalItemTextSelected
                    ]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  selectContainer: {
    flex: 1,
  },
  label: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  selectButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 44,
  },
  selectButtonDisabled: {
    backgroundColor: '#F5F5F5',
    opacity: 0.6,
  },
  selectButtonText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    fontWeight: FontWeights.regular,
    flex: 1,
  },
  selectButtonTextDisabled: {
    color: Colors.textSecondary,
  },
  arrow: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    marginLeft: 8,
  },
  arrowDisabled: {
    color: Colors.textSecondary,
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    width: '80%',
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: FontSizes.large,
    color: Colors.textSecondary,
    fontWeight: FontWeights.bold,
  },
  modalItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalItemSelected: {
    backgroundColor: '#F0F7FF',
  },
  modalItemText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
  },
  modalItemTextSelected: {
    fontWeight: FontWeights.bold,
    color: '#007AFF',
  },
});

export default TowerFloorSelector;
