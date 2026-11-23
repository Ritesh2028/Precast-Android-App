import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Image,
  ScrollView,
  Alert,
  LayoutAnimation,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Icon } from '../components/ui';
import api from '../services/apiClient';
import { getTokens } from '../services/tokenManager';
import { API_BASE_URL } from '../config/apiConfig';
import { Colors, Theme } from '../styles/colors';
import { FontSizes, FontWeights } from '../styles/fonts';

// ---------- Stage logic (ported 1:1 from web Plan/BirdEyeView.tsx + planHelpers.tsx) ----------

const STAGE = {
  done: { label: 'Completed', fg: '#1E7B3A', bg: '#E6F4EA', bar: '#34A853' },
  progress: { label: 'In Progress', fg: '#B35C00', bg: '#FFF1E0', bar: '#FF9F40' },
  pending: { label: 'Not Started', fg: Colors.textSecondary, bg: Colors.surface, bar: Colors.border },
};

const norm = (v) => (v ?? '').toString().toLowerCase().replace(/[\s_-]+/g, '');

function stageVisual(status, qcStatus) {
  const s = norm(status);
  const q = norm(qcStatus);
  if (!s || s === 'notstarted' || s === 'pending') return q === 'inprogress' ? 'progress' : 'pending';
  if (s === 'completed') {
    if (q === 'inprogress' || q === 'onhold') return 'progress';
    if (!q || q === 'completed' || q === 'notstarted' || q === 'pending') return 'done';
    return 'progress';
  }
  if (s === 'inprogress' || s === 'onhold' || q === 'inprogress' || q === 'onhold') return 'progress';
  return 'pending';
}

function stageLabel(status, qcStatus, visual) {
  if (visual === 'done') return 'Completed';
  if (visual === 'pending') return 'Not Started';
  const s = norm(status);
  const q = norm(qcStatus);
  if (s === 'completed' && q === 'inprogress') return 'QC In Progress';
  if (s === 'completed' && q === 'onhold') return 'QC On Hold';
  return 'In Progress';
}

function fieldsFor(activity, stage) {
  if (stage === 'Mesh & Mould') return { status: activity.mesh_mold_status, qc: activity.mesh_mold_qc_status };
  if (stage === 'Reinforcement') return { status: activity.reinforcement_status, qc: activity.reinforcement_qc_status };
  return null;
}

function resolveStage(activity, stage, stageNames) {
  const direct = fieldsFor(activity, stage);
  if (direct) return direct;
  const cur = stageNames.indexOf(activity.stage_name);
  const idx = stageNames.indexOf(stage);
  if (idx > cur) {
    for (let i = 0; i < idx; i++) {
      const f = fieldsFor(activity, stageNames[i]) || { status: activity.status, qc: activity.qc_status };
      if (norm(f.status) !== 'completed' || (f.qc && norm(f.qc) !== 'completed')) {
        return { status: 'Not Started', qc: 'Not Started' };
      }
    }
    return { status: 'completed', qc: 'completed' };
  }
  if (idx === cur) return { status: activity.status, qc: activity.qc_status };
  return { status: 'completed', qc: 'completed' };
}

function matchesSearch(a, elementType, q) {
  if (!q) return true;
  return [a.element_id, a.element_code, a.element_name, a.task_name, a.name, a.element_type_name, elementType]
    .some((v) => v != null && String(v).toLowerCase().includes(q));
}

/** Flatten API payload into task sections with precomputed stage segments + stats. */
function buildSections(listViews) {
  const order = [];
  const map = new Map();
  listViews.forEach((lv) => {
    (lv.activities || []).forEach((raw) => {
      const a = {
        ...raw,
        element_type_name: raw.element_type_name?.trim() || lv.element_type,
        element_type_id: raw.element_type_id || lv.element_type_id,
        floor_id: raw.floor_id || lv.floor_id,
        stages: Array.isArray(raw.stages) ? raw.stages : [],
      };
      let g = map.get(a.task_id);
      if (!g) {
        g = { taskId: a.task_id, taskName: '', elementTypeName: '', activities: [] };
        map.set(a.task_id, g);
        order.push(a.task_id);
      }
      g.activities.push(a);
      if (!g.taskName) g.taskName = a.task_name?.trim() || '';
      if (!g.elementTypeName) g.elementTypeName = a.element_type_name || '';
    });
  });

  return order.map((id) => {
    const g = map.get(id);
    const stageNames = [...new Set(g.activities.flatMap((a) => a.stages))];
    let done = 0, active = 0, queued = 0, doneCells = 0;
    const rows = g.activities.map((a) => {
      const segments = stageNames.map((stage) => {
        if (!a.stages.includes(stage)) return { stage, visual: 'pending', label: '—', na: true };
        const { status, qc } = resolveStage(a, stage, stageNames);
        const visual = stageVisual(status, qc);
        return { stage, visual, label: stageLabel(status, qc, visual), na: false };
      });
      const doneCount = segments.filter((s) => s.visual === 'done').length;
      doneCells += doneCount;
      let state;
      if (stageNames.length > 0 && doneCount === stageNames.length) { done++; state = 'done'; }
      else if (doneCount === 0 && !segments.some((s) => s.visual === 'progress')) { queued++; state = 'pending'; }
      else { active++; state = 'progress'; }
      return { ...a, segments, doneCount, state };
    });
    const totalCells = rows.length * stageNames.length;
    return {
      ...g,
      stageNames,
      rows,
      stats: { done, active, queued, pct: totalCells ? (doneCells / totalCells) * 100 : 0 },
    };
  });
}


// ---------- Small UI pieces ----------

const StatChip = ({ color, hollow, value, label }) => (
  <View style={styles.statChip}>
    <View style={[styles.dot, hollow ? styles.dotHollow : { backgroundColor: color }]} />
    <Text style={styles.statChipText}>
      <Text style={styles.statChipValue}>{value}</Text> {label}
    </Text>
  </View>
);

const ProgressBar = ({ pct, height = 6 }) => (
  <View style={[styles.track, { height, borderRadius: height / 2 }]}>
    <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, pct))}%`, borderRadius: height / 2 }]} />
  </View>
);

const MiniStepper = ({ segments }) => (
  <View style={styles.stepper}>
    {segments.map((s, i) => (
      <View key={`${s.stage}-${i}`} style={[styles.stepSeg, { backgroundColor: STAGE[s.visual].bar }]} />
    ))}
  </View>
);

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'progress', label: 'Active' },
  { key: 'pending', label: 'Queued' },
  { key: 'done', label: 'Done' },
];

// ---------- Screen ----------

const BirdsEyeViewScreen = ({ navigation, route }) => {
  const projectId = route?.params?.projectId;
  const projectName = route?.params?.projectName;
  const insets = useSafeAreaInsets();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState({});
  const [openingElement, setOpeningElement] = useState(null);
  const [qrLoading, setQrLoading] = useState(null);
  const [qr, setQr] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [towers, setTowers] = useState([]);

  const towerLabel = useMemo(() => towers.map((t) => t.name).filter(Boolean).join(', '), [towers]);
  const totalFloors = useMemo(() => towers.reduce((n, t) => n + (Number(t.child_count) || 0), 0), [towers]);

  useEffect(() => {
    navigation.setOptions({
      title: "Bird's Eye View",
      headerTitleStyle: { fontSize: FontSizes.medium, fontWeight: FontWeights.bold, color: Colors.textPrimary },
    });
  }, [navigation]);

  const load = useCallback(async (isRefresh = false) => {
    if (!projectId) {
      setError('Please select a project first.');
      setLoading(false);
      return;
    }
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [res, towerRes] = await Promise.all([
        api.get(`/api/get_allview/${projectId}`),
        api.get(`/api/dashboard/towers/${projectId}`).catch(() => null),
      ]);
      const list = Array.isArray(res.data) ? res.data : [];
      setData(list);
      setTowers(Array.isArray(towerRes?.data?.towers) ? towerRes.data.towers : []);
      // Web opens every task group expanded by default — match that.
      const ids = {};
      list.forEach((lv) => (lv.activities || []).forEach((a) => { if (a.task_id != null) ids[a.task_id] = true; }));
      setExpanded(ids);
    } catch (err) {
      const status = err?.response?.status;
      setError(
        status === 403 ? 'Access denied. Please contact your administrator.'
          : status === 401 ? 'Session expired. Please log in again.'
          : err?.response?.data?.error || err?.response?.data?.message || 'Failed to load project data.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const allSections = useMemo(() => buildSections(data), [data]);

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allSections
      .map((s) => {
        const rows = s.rows.filter(
          (r) => matchesSearch(r, s.elementTypeName, q) && (filter === 'all' || r.state === filter)
        );
        return { ...s, visibleRows: rows };
      })
      .filter((s) => s.visibleRows.length > 0);
  }, [allSections, search, filter]);

  const totals = useMemo(() => {
    let elements = 0, done = 0, active = 0, queued = 0, pctSum = 0, cells = 0;
    allSections.forEach((s) => {
      elements += s.rows.length;
      done += s.stats.done;
      active += s.stats.active;
      queued += s.stats.queued;
      const c = s.rows.length * s.stageNames.length;
      pctSum += (s.stats.pct / 100) * c;
      cells += c;
    });
    return { tasks: allSections.length, elements, done, active, queued, pct: cells ? (pctSum / cells) * 100 : 0 };
  }, [allSections]);

  const allExpanded = sections.length > 0 && sections.every((s) => expanded[s.taskId]);
  const searching = search.trim().length > 0 || filter !== 'all';

  const toggle = (taskId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((p) => ({ ...p, [taskId]: !p[taskId] }));
  };

  const toggleAll = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (allExpanded) setExpanded({});
    else setExpanded(Object.fromEntries(sections.map((s) => [s.taskId, true])));
  };

  const openElement = async (elementId) => {
    if (!elementId || openingElement) return;
    setOpeningElement(elementId);
    try {
      const res = await api.get(`/api/scan_element/${elementId}`);
      navigation.navigate('ElementDetails', { elementId, elementData: res.data });
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to fetch element details. Please try again.');
    } finally {
      setOpeningElement(null);
    }
  };

  const openQr = async (elementId) => {
    if (qrLoading) return;
    setQrLoading(elementId);
    try {
      const res = await api.get(`/api/generate-qr/${elementId}`, { params: { format: 'json' } });
      const d = res.data || {};
      if (!d.qr_png_base64) {
        Alert.alert('Error', 'QR code image missing from response.');
        return;
      }
      const s = (v) => (v == null || v === '' ? 'N/A' : String(v));
      setQr({
        elementId: Number(d.element_id ?? elementId),
        uri: `data:image/png;base64,${d.qr_png_base64}`,
        project: s(d.project), tower: s(d.tower), floor: s(d.floor),
        castingDate: s(d.casting_date), volume: s(d.volume), weight: s(d.weight),
        cementGrade: s(d.cement_grade), stockyard: s(d.stockyard), rack: s(d.rack),
      });
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to generate QR code.');
    } finally {
      setQrLoading(null);
    }
  };

  const downloadQr = async () => {
    if (!qr?.elementId || downloading) return;
    setDownloading(true);
    try {
      const { accessToken } = await getTokens();
      const fileUri = `${FileSystem.documentDirectory}element-qr-tag-${qr.elementId}.jpg`;
      const result = await FileSystem.downloadAsync(`${API_BASE_URL}/api/generate-qr/${qr.elementId}`, fileUri, {
        headers: { Authorization: accessToken || '' },
      });
      if (result.status !== 200) throw new Error(`Status ${result.status}`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: 'image/jpeg', dialogTitle: 'Save or share QR tag' });
      } else {
        Alert.alert('Saved', 'QR tag saved to app storage.');
      }
    } catch {
      Alert.alert('Error', 'Failed to download QR tag. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  // ---------- Render ----------

  const renderHeader = () => (
    <View>
      {/* Overview card */}
      <View style={styles.overview}>
        <View style={styles.overviewTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.overviewEyebrow}>PRODUCTION OVERVIEW</Text>
            <Text style={styles.overviewTitle} numberOfLines={1}>
              {projectName || towerLabel || 'Project'}
            </Text>
            {towers.length > 0 && (
              <Text style={styles.overviewMeta} numberOfLines={1}>
                Tower: {towerLabel}  ·  Total Floors: {totalFloors}
              </Text>
            )}
          </View>
          <View style={styles.pctBadge}>
            <Text style={styles.pctBadgeValue}>{totals.pct.toFixed(0)}%</Text>
            <Text style={styles.pctBadgeLabel}>complete</Text>
          </View>
        </View>
        <ProgressBar pct={totals.pct} height={8} />
        <View style={styles.kpiRow}>
          <Kpi value={totals.tasks} label="Tasks" />
          <Kpi value={totals.elements} label="Elements" />
          <Kpi value={totals.active} label="Active" color={STAGE.progress.bar} />
          <Kpi value={totals.done} label="Done" color={STAGE.done.bar} />
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Icon name="search" size={20} color={Colors.textSecondary} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search element, task or type"
          placeholderTextColor={Colors.textSecondary}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
            <Icon name="x-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Legend (same as web) */}
      <View style={styles.legendRow}>
        {['done', 'progress', 'pending'].map((k) => (
          <View key={k} style={styles.statChip}>
            <View style={[styles.dot, k === 'pending' ? styles.dotHollow : { backgroundColor: STAGE[k].bar }]} />
            <Text style={styles.statChipText}>{STAGE[k].label}</Text>
          </View>
        ))}
      </View>

      {/* Filters + expand toggle */}
      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {sections.length > 0 && (
          <TouchableOpacity onPress={toggleAll} style={styles.foldBtn} hitSlop={8}>
            <Icon name={allExpanded ? 'chevrons-down-up' : 'chevrons-up-down'} size={18} color={Colors.primary} />
            <Text style={styles.foldBtnText}>{allExpanded ? 'Collapse' : 'Expand'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderElement = (row, stageNames) => {
    const code = row.element_code?.trim() || row.element_name?.trim() || `#${row.element_id}`;
    const stateStyle = STAGE[row.state];
    return (
      <View key={row.id ?? `${row.element_id}-${row.task_id}`} style={styles.elementCard}>
        <View style={styles.elementHead}>
          <TouchableOpacity
            style={styles.elementCodeWrap}
            onPress={() => openElement(row.element_id)}
            activeOpacity={0.7}
          >
            <View style={[styles.stateBar, { backgroundColor: stateStyle.bar }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.elementCode} numberOfLines={1}>{code}</Text>
              <Text style={styles.elementSub}>
                {row.doneCount}/{stageNames.length} stages · {stateStyle.label}
              </Text>
            </View>
            {openingElement === row.element_id ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Icon name="chevron-right" size={20} color={Colors.textSecondary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.qrBtn}
            onPress={() => openQr(row.element_id)}
            disabled={qrLoading === row.element_id}
            activeOpacity={0.7}
          >
            {qrLoading === row.element_id ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Icon name="qr" size={18} color={Colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        <MiniStepper segments={row.segments} />

        <View style={styles.stageList}>
          {row.segments.map((s) => {
            const st = STAGE[s.visual];
            return (
              <View key={s.stage} style={styles.stageRow}>
                <Text style={styles.stageName} numberOfLines={1}>{s.stage}</Text>
                {s.na ? (
                  <Text style={styles.stageNa}>—</Text>
                ) : (
                  <View style={[styles.pill, { backgroundColor: st.bg }]}>
                    <View style={[styles.pillDot, { backgroundColor: s.visual === 'pending' ? Colors.textSecondary : st.bar }]} />
                    <Text style={[styles.pillText, { color: st.fg }]}>{s.label}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderSection = ({ item }) => {
    const isOpen = !!expanded[item.taskId];
    const { stats } = item;
    return (
      <View style={[styles.group, isOpen && styles.groupOpen]}>
        <TouchableOpacity onPress={() => toggle(item.taskId)} activeOpacity={0.8} style={styles.groupHead}>
          <View style={styles.groupTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.groupTitle} numberOfLines={2}>{item.taskName || 'Untitled task'}</Text>
              <View style={styles.metaRow}>
                {!!item.elementTypeName && (
                  <View style={styles.typeTag}>
                    <Icon name="box" size={12} color={Colors.accentForeground} />
                    <Text style={styles.typeTagText} numberOfLines={1}>{item.elementTypeName}</Text>
                  </View>
                )}
                <Text style={styles.metaText}>
                  {searching ? `${item.visibleRows.length} of ${item.rows.length}` : item.rows.length} in production
                </Text>
              </View>
            </View>
            <View style={[styles.chevronWrap, isOpen && styles.chevronOpen]}>
              <Icon name="chevron-down" size={22} color={Colors.textPrimary} />
            </View>
          </View>

          <View style={styles.progressRow}>
            <View style={{ flex: 1 }}><ProgressBar pct={stats.pct} /></View>
            <Text style={styles.progressPct}>{stats.pct.toFixed(0)}%</Text>
          </View>

          <View style={styles.statRow}>
            <StatChip color={STAGE.done.bar} value={stats.done} label="done" />
            <StatChip color={STAGE.progress.bar} value={stats.active} label="active" />
            <StatChip hollow value={stats.queued} label="queued" />
          </View>
        </TouchableOpacity>

        {isOpen && (
          <View style={styles.groupBody}>
            {item.visibleRows.map((r) => renderElement(r, item.stageNames))}
          </View>
        )}
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Icon name={data.length ? 'search' : 'clipboard'} size={44} color={Colors.borderStrong} />
      <Text style={styles.emptyTitle}>{data.length ? 'No matches' : 'No tasks available'}</Text>
      <Text style={styles.emptyText}>
        {data.length ? 'Try a different search or filter.' : 'No tasks have been assigned to this project yet.'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.centerText}>Loading tasks…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Icon name="alert-circle" size={44} color={Colors.error} />
        <Text style={styles.emptyTitle}>Couldn't load view</Text>
        <Text style={styles.emptyText}>{error}</Text>
        {!!projectId && (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => load()}>
            <Icon name="refresh" size={18} color={Colors.primaryForeground} />
            <Text style={styles.primaryBtnText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sections}
        keyExtractor={(s) => String(s.taskId)}
        renderItem={renderSection}
        ListHeaderComponent={renderHeader()}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
      />

      {/* QR tag sheet */}
      <Modal visible={!!qr} transparent animationType="slide" onRequestClose={() => setQr(null)}>
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setQr(null)} />
          <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Element QR Tag</Text>
                {!!qr && (
                  <Text style={styles.sheetSubtitle} numberOfLines={1}>
                    {[qr.project, qr.tower, qr.floor].filter((p) => p && p !== 'N/A').join(' · ')}
                  </Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setQr(null)} style={styles.closeBtn} hitSlop={8}>
                <Icon name="x" size={20} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {!!qr && (
              <ScrollView contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                <View style={styles.qrFrame}>
                  <Image source={{ uri: qr.uri }} style={styles.qrImage} resizeMode="contain" />
                  <Text style={styles.qrIdLabel}>ELEMENT ID</Text>
                  <Text style={styles.qrId}>{qr.elementId}</Text>
                </View>

                <View style={styles.specGrid}>
                  <Spec label="Casting Date" value={formatDate(qr.castingDate)} full />
                  <Spec label="Volume" value={qr.volume} unit={qr.volume !== 'N/A' ? 'm³' : null} />
                  <Spec label="Weight" value={qr.weight} unit={qr.weight !== 'N/A' ? 't' : null} />
                  <Spec label="Cement Grade" value={qr.cementGrade} full />
                  <Spec label="Stockyard" value={qr.stockyard} chip={isUnassigned(qr.stockyard)} />
                  <Spec label="Rack" value={qr.rack} chip={isUnassigned(qr.rack)} />
                </View>
              </ScrollView>
            )}

            <View style={styles.sheetFooter}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setQr(null)}>
                <Text style={styles.secondaryBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, styles.footerPrimary]} onPress={downloadQr} disabled={downloading}>
                {downloading ? (
                  <ActivityIndicator size="small" color={Colors.primaryForeground} />
                ) : (
                  <Icon name="download" size={18} color={Colors.primaryForeground} />
                )}
                <Text style={styles.primaryBtnText}>Download Tag</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const Kpi = ({ value, label, color }) => (
  <View style={styles.kpi}>
    <Text style={[styles.kpiValue, color && { color }]}>{value}</Text>
    <Text style={styles.kpiLabel}>{label}</Text>
  </View>
);

const isUnassigned = (v) => !v || v === 'N/A' || v.toLowerCase() === 'unassigned';

const formatDate = (raw) => {
  if (!raw || raw === 'N/A') return 'N/A';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  return raw;
};

const Spec = ({ label, value, unit, chip, full }) => (
  <View style={[styles.spec, full && styles.specFull]}>
    <Text style={styles.specLabel}>{label}</Text>
    {chip ? (
      <View style={styles.unassigned}><Text style={styles.unassignedText}>Unassigned</Text></View>
    ) : (
      <Text style={styles.specValue}>
        {value}
        {!!unit && <Text style={styles.specUnit}> {unit}</Text>}
      </Text>
    )}
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
  container: { flex: 1, backgroundColor: Colors.surface },
  listContent: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: Colors.surface },
  centerText: { marginTop: 12, fontSize: FontSizes.regular, color: Colors.textSecondary },

  // Overview
  overview: { backgroundColor: Colors.brandNavy, borderRadius: Theme.radiusLg, padding: 16, marginBottom: 14 },
  overviewTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  overviewEyebrow: { fontSize: FontSizes.extraSmall, letterSpacing: 1, color: '#8FA6D6', fontWeight: FontWeights.semiBold },
  overviewTitle: { fontSize: FontSizes.medium, color: Colors.textOnNavy, fontWeight: FontWeights.bold, marginTop: 2 },
  overviewMeta: { fontSize: FontSizes.small, color: '#8FA6D6', marginTop: 4 },
  pctBadge: { alignItems: 'flex-end' },
  pctBadgeValue: { fontSize: 26, fontWeight: FontWeights.extraBold, color: '#FFFFFF' },
  pctBadgeLabel: { fontSize: FontSizes.extraSmall, color: '#8FA6D6', marginTop: -2 },
  kpiRow: { flexDirection: 'row', marginTop: 14 },
  kpi: { flex: 1 },
  kpiValue: { fontSize: FontSizes.medium, fontWeight: FontWeights.bold, color: '#FFFFFF' },
  kpiLabel: { fontSize: FontSizes.extraSmall, color: '#8FA6D6', marginTop: 2 },

  track: { backgroundColor: 'rgba(143,166,214,0.25)', overflow: 'hidden', width: '100%' },
  fill: { height: '100%', backgroundColor: STAGE.done.bar },

  // Search + toolbar
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, borderRadius: Theme.radius,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, height: 44, gap: 8,
  },
  searchInput: { flex: 1, fontSize: FontSizes.regular, color: Colors.textPrimary, paddingVertical: 0 },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 12, paddingHorizontal: 2 },
  toolbar: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 12 },
  filterRow: { gap: 8, paddingRight: 8 },
  filterChip: {
    paddingHorizontal: 14, height: 32, borderRadius: 16, justifyContent: 'center',
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: FontSizes.small, color: Colors.textPrimary, fontWeight: FontWeights.medium },
  filterChipTextActive: { color: Colors.primaryForeground, fontWeight: FontWeights.semiBold },
  foldBtn: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', paddingLeft: 8, gap: 2 },
  foldBtnText: { fontSize: FontSizes.small, color: Colors.primary, fontWeight: FontWeights.semiBold },

  // Task group
  group: {
    backgroundColor: Colors.background, borderRadius: Theme.radiusLg, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...cardShadow,
  },
  groupOpen: { borderColor: Colors.borderStrong },
  groupHead: { padding: 14 },
  groupTitleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  groupTitle: { fontSize: FontSizes.regular + 1, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6, gap: 8 },
  typeTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primarySoft,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, maxWidth: 200,
  },
  typeTagText: { fontSize: FontSizes.small, color: Colors.accentForeground, fontWeight: FontWeights.medium },
  metaText: { fontSize: FontSizes.small, color: Colors.textSecondary },
  chevronWrap: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  progressPct: { fontSize: FontSizes.small, fontWeight: FontWeights.bold, color: Colors.textPrimary, minWidth: 34, textAlign: 'right' },
  statRow: { flexDirection: 'row', marginTop: 10, gap: 14 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statChipText: { fontSize: FontSizes.small, color: Colors.textSecondary },
  statChipValue: { color: Colors.textPrimary, fontWeight: FontWeights.bold },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotHollow: { borderWidth: 1.5, borderColor: Colors.textSecondary },

  groupBody: { backgroundColor: Colors.surface, padding: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, gap: 10 },

  // Element card
  elementCard: { backgroundColor: Colors.background, borderRadius: Theme.radius, padding: 12, borderWidth: 1, borderColor: Colors.border },
  elementHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  elementCodeWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  stateBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  elementCode: { fontSize: FontSizes.regular, fontWeight: FontWeights.bold, color: Colors.primary },
  elementSub: { fontSize: FontSizes.extraSmall + 1, color: Colors.textSecondary, marginTop: 2 },
  qrBtn: {
    width: 38, height: 38, borderRadius: Theme.radiusSm, borderWidth: 1, borderColor: Colors.borderStrong,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySoft,
  },
  stepper: { flexDirection: 'row', gap: 4, marginTop: 12 },
  stepSeg: { flex: 1, height: 5, borderRadius: 3 },
  stageList: { marginTop: 10 },
  stageRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border,
  },
  stageName: { flex: 1, fontSize: FontSizes.small, color: Colors.textPrimary, marginRight: 10 },
  stageNa: { fontSize: FontSizes.small, color: Colors.textSecondary },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: FontSizes.extraSmall + 1, fontWeight: FontWeights.semiBold },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: FontSizes.medium, fontWeight: FontWeights.bold, color: Colors.textPrimary, marginTop: 12 },
  emptyText: { fontSize: FontSizes.regular, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },

  // Buttons
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary,
    height: Theme.buttonHeightLg, borderRadius: Theme.radius, paddingHorizontal: 20, marginTop: 16,
  },
  primaryBtnText: { color: Colors.primaryForeground, fontSize: FontSizes.button, fontWeight: FontWeights.semiBold },
  secondaryBtn: {
    flex: 1, height: Theme.buttonHeightLg, borderRadius: Theme.radius, borderWidth: 1, borderColor: Colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { color: Colors.textPrimary, fontSize: FontSizes.button, fontWeight: FontWeights.semiBold },

  // QR sheet
  sheetBackdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 8, maxHeight: '90%',
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  sheetTitle: { fontSize: FontSizes.medium, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  sheetSubtitle: { fontSize: FontSizes.small, color: Colors.textSecondary, marginTop: 2 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' },
  qrFrame: {
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderRadius: Theme.radiusLg,
    paddingVertical: 16, marginTop: 8, backgroundColor: Colors.background,
  },
  qrImage: { width: 200, height: 200 },
  qrIdLabel: { fontSize: FontSizes.extraSmall, letterSpacing: 1, color: Colors.textSecondary, marginTop: 8 },
  qrId: { fontSize: FontSizes.large, fontWeight: FontWeights.extraBold, color: Colors.textPrimary },
  specGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, borderWidth: 1, borderColor: Colors.border, borderRadius: Theme.radiusLg, overflow: 'hidden' },
  spec: { width: '50%', padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Colors.border },
  specFull: { width: '100%' },
  specLabel: { fontSize: FontSizes.extraSmall + 1, color: Colors.textSecondary, marginBottom: 3 },
  specValue: { fontSize: FontSizes.regular, fontWeight: FontWeights.semiBold, color: Colors.textPrimary },
  specUnit: { fontSize: FontSizes.small, color: Colors.textSecondary, fontWeight: FontWeights.regular },
  unassigned: { alignSelf: 'flex-start', backgroundColor: Colors.warningSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  unassignedText: { fontSize: FontSizes.small, color: '#B35C00', fontWeight: FontWeights.semiBold },
  sheetFooter: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  footerPrimary: { flex: 1.4, marginTop: 0 },
});

export default BirdsEyeViewScreen;
