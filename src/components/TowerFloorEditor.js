import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';
import { API_BASE_URL, createAuthHeaders } from '../config/apiConfig';
import { getTokens } from '../services/tokenManager';
import { validateSession } from '../services/authService';
import TowerFloorSelector from './TowerFloorSelector';

const TowerFloorEditor = ({ projectId, onSave }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Blocks state - each block contains tower, floor, and rows
  const [blocks, setBlocks] = useState([
    {
      tower: '',
      floor: '',
      selections: [{ id: Date.now(), category: '', selectedItems: [] }],
    },
  ]);
  
  const [activeIndex, setActiveIndex] = useState(0);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [currentRowId, setCurrentRowId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('');

  // Transform API data
  const transformData = (rawData) => {
    const result = {};
    for (const tower in rawData) {
      result[tower] = {};
      for (const floor in rawData[tower]) {
        result[tower][floor] = {};
        for (const category in rawData[tower][floor]) {
          const item = rawData[tower][floor][category];
          result[tower][floor][category] = [
            {
              element_type_id: item.element_type_id,
              element_type_name: item.element_type_name,
              total_quantity: (item.Balance_elements || 0) + (item['left _elements'] || 0),
              floor_id: item.floor_id,
              balance_elements: item.Balance_elements || 0,
              element_type: item.element_type,
              disable: item.disable || false,
            },
          ];
        }
      }
    }
    return result;
  };

  // Fetch data
  useEffect(() => {
    if (projectId) {
      fetchData();
    }
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { accessToken } = await getTokens();
      if (!accessToken) {
        setGlobalError('Authentication required');
        setLoading(false);
        return;
      }

      // Validate session
      let currentToken = accessToken;
      try {
        const sessionResult = await validateSession();
        if (sessionResult && sessionResult.session_id) {
          currentToken = sessionResult.session_id;
        }
      } catch (validateError) {
        console.log('Session validation failed');
      }

      const url = `${API_BASE_URL}/api/stockyard_item/${projectId}`;
      const headers = createAuthHeaders(currentToken, { useBearer: true });
      
      let response = await fetch(url, { headers });
      
      if (response.status === 401) {
        const headersWithoutBearer = createAuthHeaders(currentToken, { useBearer: false });
        response = await fetch(url, { headers: headersWithoutBearer });
      }

      if (response.ok) {
        const responseData = await response.json();
        const transformed = transformData(responseData);
        setData(transformed);
        setGlobalError(null);
      } else {
        setGlobalError('Error fetching data. Please try again later.');
      }
    } catch (err) {
      setGlobalError('Error fetching data. Please try again later.');
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const currentBlock = blocks[activeIndex];

  // Get total allocated for an item across all blocks
  const getTotalAllocatedForItem = (elementTypeId) => {
    let sum = 0;
    for (const block of blocks) {
      for (const row of block.selections) {
        for (const sel of row.selectedItems) {
          if (sel.item.element_type_id === elementTypeId) {
            sum += sel.chosenQuantity;
          }
        }
      }
    }
    return sum;
  };

  // Remove block
  const removeBlock = (blockIndex) => {
    if (blocks.length === 1) {
      handleReset();
      return;
    }
    setBlocks((prev) => {
      const newBlocks = prev.filter((_, i) => i !== blockIndex);
      let newActiveIndex = activeIndex;
      if (blockIndex === activeIndex) {
        newActiveIndex = 0;
      } else if (blockIndex < activeIndex) {
        newActiveIndex = activeIndex - 1;
      }
      setActiveIndex(newActiveIndex);
      return newBlocks;
    });
  };

  // Add more block
  const handleAddMoreOption = (option) => {
    let newBlock;
    if (option === 'keep-tower-floor') {
      newBlock = {
        tower: currentBlock.tower,
        floor: currentBlock.floor,
        selections: [{ id: Date.now(), category: '', selectedItems: [] }],
      };
    } else if (option === 'keep-tower-change-floor') {
      newBlock = {
        tower: currentBlock.tower,
        floor: '',
        selections: [{ id: Date.now(), category: '', selectedItems: [] }],
      };
    } else if (option === 'change-both') {
      newBlock = {
        tower: '',
        floor: '',
        selections: [{ id: Date.now(), category: '', selectedItems: [] }],
      };
    } else {
      return;
    }
    setBlocks((prev) => {
      const newBlocks = [...prev, newBlock];
      setActiveIndex(newBlocks.length - 1);
      return newBlocks;
    });
  };

  // Update block at index
  const updateBlockAtIndex = (idx, newBlock) => {
    setBlocks((prev) => {
      const copy = [...prev];
      copy[idx] = newBlock;
      return copy;
    });
  };

  // Handle tower selection
  const handleSelectTower = (tower) => {
    const updated = {
      ...currentBlock,
      tower,
      floor: '',
      selections: [{ id: Date.now(), category: '', selectedItems: [] }],
    };
    updateBlockAtIndex(activeIndex, updated);
  };

  // Handle floor selection
  const handleSelectFloor = (floor) => {
    const updated = {
      ...currentBlock,
      floor,
      selections: [{ id: Date.now(), category: '', selectedItems: [] }],
    };
    updateBlockAtIndex(activeIndex, updated);
  };

  // Handle category change
  const handleCategoryChange = (rowId, category) => {
    const newRows = currentBlock.selections.map((row) =>
      row.id === rowId ? { ...row, category, selectedItems: [] } : row
    );
    updateBlockAtIndex(activeIndex, { ...currentBlock, selections: newRows });
  };

  // Toggle item selection
  const toggleItemSelection = (rowId, item) => {
    const newRows = currentBlock.selections.map((row) => {
      if (row.id === rowId) {
        const exists = row.selectedItems.find(
          (sel) => sel.item.element_type_id === item.element_type_id
        );
        if (exists) {
          return {
            ...row,
            selectedItems: row.selectedItems.filter(
              (sel) => sel.item.element_type_id !== item.element_type_id
            ),
          };
        } else {
          const allocatedSoFar = getTotalAllocatedForItem(item.element_type_id);
          const available = item.balance_elements - allocatedSoFar;
          if (available <= 0) return row;
          return {
            ...row,
            selectedItems: [
              ...row.selectedItems,
              { item, chosenQuantity: 0, error: '' },
            ],
          };
        }
      }
      return row;
    });
    updateBlockAtIndex(activeIndex, { ...currentBlock, selections: newRows });
  };

  // Handle quantity change
  const handleQuantityChange = (rowId, itemIndex, newQuantityStr) => {
    const newQuantity = newQuantityStr === '' ? 0 : Number(newQuantityStr);
    const newRows = currentBlock.selections.map((row) => {
      if (row.id === rowId) {
        const updatedSelected = row.selectedItems.map((sel, idx) => {
          if (idx === itemIndex) {
            let errorMsg = '';
            if (newQuantity < 0) {
              errorMsg = 'Quantity cannot be negative.';
              return { ...sel, error: errorMsg };
            }
            const allocatedSoFar =
              getTotalAllocatedForItem(sel.item.element_type_id) -
              sel.chosenQuantity;
            if (newQuantity + allocatedSoFar > sel.item.balance_elements) {
              errorMsg = 'Quantity exceeds available amount.';
              return { ...sel, error: errorMsg };
            }
            return { ...sel, chosenQuantity: newQuantity, error: '' };
          }
          return sel;
        });
        return { ...row, selectedItems: updatedSelected };
      }
      return row;
    });
    updateBlockAtIndex(activeIndex, { ...currentBlock, selections: newRows });
  };

  // Remove row
  const removeRow = (rowId) => {
    const newRows = currentBlock.selections.filter((row) => row.id !== rowId);
    if (newRows.length === 0) {
      newRows.push({ id: Date.now(), category: '', selectedItems: [] });
    }
    updateBlockAtIndex(activeIndex, { ...currentBlock, selections: newRows });
  };

  // Add row
  const addRow = () => {
    const newRow = {
      id: Date.now(),
      category: '',
      selectedItems: [],
    };
    updateBlockAtIndex(activeIndex, {
      ...currentBlock,
      selections: [...currentBlock.selections, newRow],
    });
  };

  // Reset
  const handleReset = () => {
    setBlocks([
      {
        tower: '',
        floor: '',
        selections: [{ id: Date.now(), category: '', selectedItems: [] }],
      },
    ]);
    setActiveIndex(0);
  };

  // Handle submit
  const handleSubmitAll = async () => {
    // Check for errors
    const hasErrors = blocks.some((block) =>
      block.selections.some((row) =>
        row.selectedItems.some((sel) => sel.error && sel.error.trim() !== '')
      )
    );

    if (hasErrors) {
      Alert.alert('Error', 'Please fix quantity errors before submitting.');
      return;
    }

    // Validate blocks
    for (const block of blocks) {
      if (!block.tower || !block.floor) {
        Alert.alert('Error', 'Each block must have a Tower and a Floor selected.');
        return;
      }
    }

    // Transform data
    const output = {};
    blocks.forEach((block) => {
      block.selections.forEach((row) => {
        row.selectedItems.forEach((sel) => {
          const floorId = Number(sel.item.floor_id);
          if (!output[floorId]) output[floorId] = [];
          const existing = output[floorId].find(
            (e) => e.element_type_id === sel.item.element_type_id
          );
          if (existing) {
            existing.quantity += sel.chosenQuantity;
          } else {
            output[floorId].push({
              element_type_id: sel.item.element_type_id,
              quantity: sel.chosenQuantity,
            });
          }
        });
      });
    });

    // Call onSave callback
    if (onSave) {
      setSubmitting(true);
      try {
        await onSave(output);
      } catch (error) {
        console.error('Error saving:', error);
        Alert.alert('Error', 'Failed to save. Please try again.');
      } finally {
        setSubmitting(false);
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (globalError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{globalError}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No data available</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={true}>
      {blocks.map((block, blockIndex) => {
        const isActive = blockIndex === activeIndex;
        return (
          <View key={blockIndex} style={styles.blockContainer}>
            {/* Remove button */}
            {blocks.length > 1 && (
              <TouchableOpacity
                style={styles.removeBlockButton}
                onPress={() => removeBlock(blockIndex)}
              >
                <Text style={styles.removeBlockButtonText}>✕</Text>
              </TouchableOpacity>
            )}

            {/* Edit button for non-active blocks */}
            {!isActive && (
              <TouchableOpacity
                style={styles.editBlockButton}
                onPress={() => setActiveIndex(blockIndex)}
              >
                <Text style={styles.editBlockButtonText}>Edit</Text>
              </TouchableOpacity>
            )}

            {isActive ? (
              <>
                <TowerFloorSelector
                  data={data}
                  selectedTower={block.tower}
                  selectedFloor={block.floor}
                  onSelectTower={handleSelectTower}
                  onSelectFloor={handleSelectFloor}
                />

                {block.tower && block.floor && (
                  <>
                    {block.selections.map((row, rowIndex) => {
                      const categories = Object.keys(data[block.tower][block.floor] || {});
                      const availableCategories = categories.filter(
                        (cat) =>
                          !block.selections.some(
                            (r) => r.category === cat && r.id !== row.id
                          )
                      );

                      const categoryItems =
                        row.category && data[block.tower][block.floor][row.category]
                          ? data[block.tower][block.floor][row.category]
                          : [];

                      // Calculate available for category
                      let categoryAllocated = 0;
                      categoryItems.forEach((it) => {
                        categoryAllocated += getTotalAllocatedForItem(it.element_type_id);
                      });
                      const categoryAvailable =
                        categoryItems[0]?.balance_elements - categoryAllocated;

                      return (
                        <View key={row.id} style={styles.rowContainer}>
                          <View style={styles.rowHeader}>
                            <View style={styles.categorySelectContainer}>
                              <Text style={styles.label}>Select Category</Text>
                              <TouchableOpacity
                                style={styles.selectButton}
                                onPress={() => {
                                  setCurrentRowId(row.id);
                                  setSelectedCategory(row.category);
                                  setCategoryModalVisible(true);
                                }}
                              >
                                <Text style={styles.selectButtonText} numberOfLines={1}>
                                  {row.category || 'Select a category'}
                                </Text>
                                <Text style={styles.arrow}>▼</Text>
                              </TouchableOpacity>
                            </View>

                            {row.category && (
                              <View style={styles.itemSelectContainer}>
                                <Text style={styles.label}>Select Items</Text>
                                <TouchableOpacity
                                  style={styles.selectButton}
                                  onPress={() => {
                                    setCurrentRowId(row.id);
                                    setItemModalVisible(true);
                                  }}
                                >
                                  <Text style={styles.selectButtonText} numberOfLines={1}>
                                    {row.selectedItems.length === 0
                                      ? 'Select Items'
                                      : `${row.selectedItems.length} item(s) selected`}
                                  </Text>
                                  <Text style={styles.arrow}>▼</Text>
                                </TouchableOpacity>
                              </View>
                            )}

                            {rowIndex > 0 && (
                              <TouchableOpacity
                                style={styles.removeRowButton}
                                onPress={() => removeRow(row.id)}
                              >
                                <Text style={styles.removeRowButtonText}>✕</Text>
                              </TouchableOpacity>
                            )}
                          </View>

                          {/* Selected items */}
                          {row.selectedItems.length > 0 && (
                            <View style={styles.selectedItemsContainer}>
                              {row.selectedItems.map((sel, itemIndex) => (
                                <View key={sel.item.element_type_id} style={styles.itemCard}>
                                  <View style={styles.itemCardHeader}>
                                    <Text style={styles.itemName}>
                                      {sel.item.element_type_name}
                                    </Text>
                                  </View>
                                  <View style={styles.itemDetails}>
                                    <View style={styles.itemDetailRow}>
                                      <Text style={styles.itemDetailLabel}>Total Element:</Text>
                                      <Text style={styles.itemDetailValue}>
                                        {sel.item.total_quantity}
                                      </Text>
                                    </View>
                                    <View style={styles.itemDetailRow}>
                                      <Text style={styles.itemDetailLabel}>Remaining Element:</Text>
                                      <Text style={styles.itemDetailValue}>
                                        {sel.item.balance_elements}
                                      </Text>
                                    </View>
                                    <View style={styles.quantityInputContainer}>
                                      <Text style={styles.itemDetailLabel}>Quantity:</Text>
                                      <TextInput
                                        style={[
                                          styles.quantityInput,
                                          sel.error && styles.quantityInputError,
                                        ]}
                                        value={
                                          sel.chosenQuantity === 0
                                            ? ''
                                            : sel.chosenQuantity.toString()
                                        }
                                        onChangeText={(text) =>
                                          handleQuantityChange(row.id, itemIndex, text)
                                        }
                                        keyboardType="numeric"
                                        placeholder="0"
                                      />
                                      {sel.error && (
                                        <Text style={styles.errorText}>{sel.error}</Text>
                                      )}
                                    </View>
                                  </View>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}

                    <TouchableOpacity style={styles.addRowButton} onPress={addRow}>
                      <Text style={styles.addRowButtonText}>+ Add Row</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <View style={styles.blockSummary}>
                <Text style={styles.blockSummaryText}>
                  <Text style={styles.blockSummaryLabel}>Tower:</Text> {block.tower || 'N/A'}
                </Text>
                <Text style={styles.blockSummaryText}>
                  <Text style={styles.blockSummaryLabel}>Floor:</Text> {block.floor || 'N/A'}
                </Text>
                <Text style={styles.blockSummaryText}>
                  <Text style={styles.blockSummaryLabel}>Selections:</Text>
                </Text>
                {block.selections.map((row, i) => (
                  <View key={i} style={styles.blockSummaryRow}>
                    <Text style={styles.blockSummaryText}>
                      <Text style={styles.blockSummaryLabel}>Category:</Text> {row.category || 'N/A'}
                    </Text>
                    {row.selectedItems.map((sel, idx) => (
                      <Text key={idx} style={styles.blockSummaryItem}>
                        {sel.item.element_type_name} – Qty: {sel.chosenQuantity}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}

      {/* Add More Options */}
      <View style={styles.addMoreContainer}>
        <TouchableOpacity
          style={styles.addMoreButton}
          onPress={() => {
            Alert.alert(
              'Add More',
              'Choose an option:',
              [
                {
                  text: 'Keep Tower, Change Floor',
                  onPress: () => handleAddMoreOption('keep-tower-change-floor'),
                },
                {
                  text: 'Change Both',
                  onPress: () => handleAddMoreOption('change-both'),
                },
                { text: 'Cancel', style: 'cancel' },
              ]
            );
          }}
        >
          <Text style={styles.addMoreButtonText}>Add More</Text>
        </TouchableOpacity>
      </View>

      {/* Submit and Reset Buttons */}
      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmitAll}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Submit</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
          <Text style={styles.resetButtonText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Category Modal */}
      <Modal
        visible={categoryModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCategoryModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity
                onPress={() => setCategoryModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={
                currentBlock.tower && currentBlock.floor
                  ? Object.keys(data[currentBlock.tower][currentBlock.floor] || {})
                  : []
              }
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const categoryItems =
                  data[currentBlock.tower][currentBlock.floor][item] || [];
                let categoryAllocated = 0;
                categoryItems.forEach((it) => {
                  categoryAllocated += getTotalAllocatedForItem(it.element_type_id);
                });
                const categoryAvailable =
                  categoryItems[0]?.balance_elements - categoryAllocated;
                const isDisabled = categoryAvailable <= 0;
                const isSelected = currentBlock.selections.find(
                  (r) => r.id === currentRowId
                )?.category === item;

                return (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      isSelected && styles.modalItemSelected,
                      isDisabled && styles.modalItemDisabled,
                    ]}
                    disabled={isDisabled}
                    onPress={() => {
                      handleCategoryChange(currentRowId, item);
                      setCategoryModalVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        isSelected && styles.modalItemTextSelected,
                        isDisabled && styles.modalItemTextDisabled,
                      ]}
                    >
                      {item} ({categoryItems[0]?.balance_elements || 0}/
                      {categoryItems[0]?.total_quantity || 0})
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Item Selection Modal */}
      <Modal
        visible={itemModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setItemModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setItemModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Items</Text>
              <TouchableOpacity
                onPress={() => setItemModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={
                (() => {
                  const row = currentBlock.selections.find((r) => r.id === currentRowId);
                  if (!row || !row.category || !currentBlock.tower || !currentBlock.floor) {
                    return [];
                  }
                  let itemsForCategory =
                    data[currentBlock.tower][currentBlock.floor][row.category] || [];
                  if (!Array.isArray(itemsForCategory)) {
                    itemsForCategory = Object.values(itemsForCategory);
                  }
                  return itemsForCategory;
                })()
              }
              keyExtractor={(item) => item.element_type_id.toString()}
              renderItem={({ item }) => {
                const globalAvail =
                  item.balance_elements - getTotalAllocatedForItem(item.element_type_id);
                const isSelected = currentBlock.selections
                  .find((r) => r.id === currentRowId)
                  ?.selectedItems.some(
                    (sel) => sel.item.element_type_id === item.element_type_id
                  );
                const isDisabled = globalAvail <= 0;

                return (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      isSelected && styles.modalItemSelected,
                      isDisabled && styles.modalItemDisabled,
                    ]}
                    disabled={isDisabled}
                    onPress={() => {
                      toggleItemSelection(currentRowId, item);
                      setItemModalVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        isSelected && styles.modalItemTextSelected,
                        isDisabled && styles.modalItemTextDisabled,
                      ]}
                    >
                      {isSelected ? '✓ ' : '  '}
                      {item.element_type_name} ({globalAvail}/{item.total_quantity})
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: FontSizes.regular,
    color: Colors.textSecondary,
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: FontSizes.regular,
    color: '#FF3B30',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.bold,
  },
  blockContainer: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    backgroundColor: Colors.background,
    position: 'relative',
  },
  removeBlockButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 8,
    zIndex: 10,
  },
  removeBlockButtonText: {
    color: '#FF3B30',
    fontSize: FontSizes.large,
    fontWeight: FontWeights.bold,
  },
  editBlockButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 12,
  },
  editBlockButtonText: {
    color: '#007AFF',
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.medium,
  },
  rowContainer: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  categorySelectContainer: {
    flex: 1,
    minWidth: '45%',
  },
  itemSelectContainer: {
    flex: 1,
    minWidth: '45%',
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
  selectButtonText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    flex: 1,
  },
  arrow: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    marginLeft: 8,
  },
  removeRowButton: {
    padding: 8,
  },
  removeRowButtonText: {
    color: '#FF3B30',
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
  },
  selectedItemsContainer: {
    marginTop: 12,
    gap: 12,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  itemCardHeader: {
    marginBottom: 8,
  },
  itemName: {
    fontSize: FontSizes.medium,
    fontWeight: FontWeights.bold,
    color: Colors.textPrimary,
  },
  itemDetails: {
    gap: 8,
  },
  itemDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDetailLabel: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    fontWeight: FontWeights.medium,
  },
  itemDetailValue: {
    fontSize: FontSizes.small,
    color: Colors.textPrimary,
    fontWeight: FontWeights.regular,
  },
  quantityInputContainer: {
    marginTop: 8,
  },
  quantityInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSizes.regular,
    backgroundColor: '#F5F5F5',
    marginTop: 4,
  },
  quantityInputError: {
    borderColor: '#FF3B30',
  },
  addRowButton: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 6,
    marginTop: 8,
  },
  addRowButtonText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
  },
  blockSummary: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
  },
  blockSummaryText: {
    fontSize: FontSizes.small,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  blockSummaryLabel: {
    fontWeight: FontWeights.bold,
  },
  blockSummaryRow: {
    marginLeft: 16,
    marginTop: 4,
  },
  blockSummaryItem: {
    fontSize: FontSizes.small,
    color: Colors.textSecondary,
    marginLeft: 16,
  },
  addMoreContainer: {
    marginBottom: 16,
  },
  addMoreButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C0C0C0',
  },
  addMoreButtonText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.regular,
    fontWeight: FontWeights.medium,
    textAlign: 'center',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  submitButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
  },
  resetButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButtonText: {
    color: Colors.textPrimary,
    fontSize: FontSizes.small,
    fontWeight: FontWeights.medium,
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
  modalItemDisabled: {
    opacity: 0.5,
  },
  modalItemText: {
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
  },
  modalItemTextSelected: {
    fontWeight: FontWeights.bold,
    color: '#007AFF',
  },
  modalItemTextDisabled: {
    color: Colors.textSecondary,
  },
});

export default TowerFloorEditor;
