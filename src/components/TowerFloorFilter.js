import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { FontSizes, FontWeights } from '../styles/fonts';
import { Colors } from '../styles/colors';
import { themedStyles } from '../theme';
import { ActionSheet, Icon } from './ui';

const extractTowerFloor = (item) => {
  const d = item?.originalData || {};
  const tower = d.tower || d.tower_name || d.element_type?.tower || d.element_type?.tower_name || item?.tower || item?.tower_name;
  const floor = d.floor || d.floor_name || d.element_type?.floor || d.element_type?.floor_name || item?.floor || item?.floor_name;
  return { tower, floor };
};

const uniqueSorted = (values) => Array.from(new Set(values.filter((v) => v && v !== 'N/A'))).sort();

/**
 * Tower / Floor filter chips. Picking opens a bottom sheet; floor is enabled once
 * a tower is chosen. Calls onFilterChange({ tower, floor }) on every change.
 */
const TowerFloorFilter = ({ jobs = [], onFilterChange }) => {
  const [tower, setTower] = useState(null);
  const [floor, setFloor] = useState(null);
  const [sheet, setSheet] = useState(null); // 'tower' | 'floor' | null

  const towers = useMemo(() => uniqueSorted(jobs.map((j) => extractTowerFloor(j).tower)), [jobs]);
  const floors = useMemo(
    () => (tower ? uniqueSorted(jobs.filter((j) => extractTowerFloor(j).tower === tower).map((j) => extractTowerFloor(j).floor)) : []),
    [jobs, tower],
  );

  // Drop selections that no longer exist (e.g. after changing project or status filter).
  useEffect(() => {
    if (tower && !towers.includes(tower)) {
      setTower(null);
      setFloor(null);
    }
  }, [towers, tower]);
  useEffect(() => {
    if (floor && !floors.includes(floor)) setFloor(null);
  }, [floors, floor]);

  useEffect(() => {
    onFilterChange?.({ tower, floor });
  }, [tower, floor, onFilterChange]);

  if (towers.length === 0) return null;

  const sheetActions =
    sheet === 'tower'
      ? [
          { key: '__all', label: 'All towers', icon: 'building', hint: !tower ? 'Selected' : undefined, onPress: () => { setTower(null); setFloor(null); setSheet(null); } },
          ...towers.map((t) => ({ key: t, label: t, icon: 'building', hint: t === tower ? 'Selected' : undefined, onPress: () => { setTower(t); setFloor(null); setSheet(null); } })),
        ]
      : [
          { key: '__all', label: 'All floors', icon: 'layers', hint: !floor ? 'Selected' : undefined, onPress: () => { setFloor(null); setSheet(null); } },
          ...floors.map((f) => ({ key: f, label: f, icon: 'layers', hint: f === floor ? 'Selected' : undefined, onPress: () => { setFloor(f); setSheet(null); } })),
        ];

  return (
    <View style={styles.row}>
      <Chip icon="building" label={tower || 'All towers'} active={!!tower} onPress={() => setSheet('tower')} />
      <Chip
        icon="layers"
        label={floor || (tower ? 'All floors' : 'Floor')}
        active={!!floor}
        disabled={!tower}
        onPress={() => setSheet('floor')}
      />
      {(tower || floor) && (
        <TouchableOpacity
          style={styles.clear}
          onPress={() => {
            setTower(null);
            setFloor(null);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear tower and floor filter"
        >
          <Icon name="x-circle" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      )}
      <ActionSheet
        visible={!!sheet}
        onClose={() => setSheet(null)}
        title={sheet === 'tower' ? 'Filter by tower' : `Floors in ${tower || ''}`}
        actions={sheetActions}
      />
    </View>
  );
};

const Chip = ({ icon, label, active, disabled, onPress }) => (
  <TouchableOpacity
    style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
    accessibilityRole="button"
  >
    <Icon name={icon} size={15} color={active ? Colors.primary : Colors.textSecondary} />
    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    <Icon name="chevron-down" size={14} color={active ? Colors.primary : Colors.textMuted} />
  </TouchableOpacity>
);

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  chipActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoft },
  chipDisabled: { opacity: 0.5 },
  chipText: { flexShrink: 1, fontSize: FontSizes.small + 1, fontWeight: FontWeights.medium, color: Colors.textSecondary },
  chipTextActive: { color: Colors.primary, fontWeight: FontWeights.semiBold },
  clear: { padding: 4 },
}));

export default TowerFloorFilter;
