import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Theme } from '../styles/colors';
import { FontSizes, FontWeights } from '../styles/fonts';
import { themedStyles } from '../theme';
import { Card, Icon, StatusPill, EmptyState, SkeletonList } from '../components/ui';
import ProjectDropdown from '../components/ProjectDropdown';
import { fetchRectification, updateRectification, uploadPhoto, qcErrorMessage } from '../services/qcApi';
import { formatDateTime } from '../components/qc/qcShared';

const LOCATION_TONE = {
  Pending: { tone: 'warning', label: 'In production' },
  InStockyard: { tone: 'info', label: 'In stockyard' },
  Erected: { tone: 'success', label: 'Erected' },
};

/**
 * Elements on quality hold (rectification). An inspector reviews the fix on site
 * and approves (element is released) or rejects (element is re-created and goes
 * back through production). Params: { projectId?, projectName? }
 */
const RectificationScreen = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const [project, setProject] = useState(
    route.params?.projectId ? { id: route.params.projectId, name: route.params.projectName || 'Project' } : null,
  );
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  // ProjectDropdown auto-selects its first project on load; keep the one we were opened with.
  const ignoreAutoPick = useRef(!!route.params?.projectId);

  const load = useCallback(async () => {
    if (!project?.id) return;
    setError(null);
    try {
      setItems(await fetchRectification(project.id));
    } catch (err) {
      setError(qcErrorMessage(err, "Couldn't load the rectification list."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [project?.id]);

  useEffect(() => {
    if (project?.id) {
      setLoading(true);
      load();
    }
  }, [project?.id, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) =>
      [it.element_id, it.element_name, it.element_type_version].some((v) => String(v || '').toLowerCase().includes(q)),
    );
  }, [items, query]);

  const onDone = (elementId) => {
    setSelected(null);
    setItems((prev) => prev.filter((it) => it.id !== elementId));
  };

  const renderItem = ({ item }) => {
    const loc = LOCATION_TONE[item.status_text] || { tone: 'neutral', label: item.status_text || 'Unknown' };
    return (
      <Card onPress={() => setSelected(item)} style={styles.item} accessibilityRole="button" accessibilityLabel={`Review ${item.element_id}`}>
        <View style={styles.itemAccent} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.itemTop}>
            <Text style={styles.itemCode} numberOfLines={1}>{item.element_id || `#${item.id}`}</Text>
            <StatusPill label={loc.label} tone={loc.tone} />
          </View>
          {!!item.element_name && <Text style={styles.itemSub} numberOfLines={1}>{item.element_name}</Text>}
          <Text style={styles.itemMeta} numberOfLines={1}>
            {[item.element_type_version && `Rev ${item.element_type_version}`, item.update_at && `Updated ${formatDateTime(item.update_at)}`]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <Icon name="chevron-right" size={18} color={Colors.textMuted} />
      </Card>
    );
  };

  const listHeader = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <View style={styles.banner}>
        <Icon name="wrench" size={18} color={Colors.warning} />
        <Text style={styles.bannerText}>
          Elements on quality hold. Inspect the fix, then approve to release it or reject to send it back to production.
        </Text>
      </View>
      {project?.id && (
        <View style={styles.search}>
          <Icon name="search" size={16} color={Colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search element ID or name"
            placeholderTextColor={Colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="characters"
            returnKeyType="search"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Icon name="x-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}
      {project?.id && !loading && !error && items.length > 0 && (
        <Text style={styles.count}>{`${filtered.length} of ${items.length} element${items.length === 1 ? '' : 's'} on hold`}</Text>
      )}
    </View>
  );

  let body;
  if (!project?.id) {
    body = <EmptyState icon="layers" tone="info" title="Choose a project" message="Rectification is tracked per project." />;
  } else if (loading) {
    body = <SkeletonList rows={5} />;
  } else if (error) {
    body = <EmptyState icon="alert-circle" tone="danger" title="Couldn't load" message={error} actionLabel="Retry" onAction={load} />;
  } else {
    body = null;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.picker}>
        <ProjectDropdown
          selectedProject={project?.name || 'Select project'}
          includeAllOption={false}
          onProjectSelect={(p) => {
            if (ignoreAutoPick.current) {
              ignoreAutoPick.current = false;
              if (String(p?.project_id) !== String(project?.id)) return;
            }
            if (p?.project_id) setProject({ id: p.project_id, name: p.name });
          }}
          navigation={navigation}
        />
      </View>

      {body ? (
        <View style={styles.content}>
          {listHeader}
          <Card>{body}</Card>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ListEmptyComponent={
            <Card>
              <EmptyState
                icon="check-circle"
                tone="success"
                title={items.length ? 'No matches' : 'Nothing on hold'}
                message={items.length ? 'Try another search.' : 'No elements in this project need rectification.'}
              />
            </Card>
          }
          keyboardShouldPersistTaps="handled"
        />
      )}

      <ReviewSheet item={selected} projectId={project?.id} onClose={() => setSelected(null)} onDone={onDone} />
    </View>
  );
};

/** Bottom sheet to approve / reject one element with a note and optional photo. */
const ReviewSheet = ({ item, projectId, onClose, onDone }) => {
  const insets = useSafeAreaInsets();
  const [comment, setComment] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(null); // 'Approved' | 'Rejected' | null

  useEffect(() => {
    if (item) {
      setComment('');
      setPhoto(null);
      setBusy(null);
    }
  }, [item]);

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera needed', 'Allow camera access to attach a photo of the fix.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
      if (!res.canceled && res.assets?.[0]) setPhoto(res.assets[0]);
    } catch (err) {
      Alert.alert('Camera error', err?.message || 'Could not open the camera.');
    }
  };

  const submit = async (status) => {
    if (!item || busy) return;
    setBusy(status);
    try {
      let image = '';
      if (photo?.uri) {
        image = await uploadPhoto({ uri: photo.uri, type: photo.mimeType || 'image/jpeg', projectId });
      }
      await updateRectification({ elementId: item.id, projectId, status, comments: comment.trim(), image });
      Alert.alert(
        status === 'Approved' ? 'Element released' : 'Sent back to production',
        status === 'Approved'
          ? `${item.element_id} is approved and back in the normal flow.`
          : `${item.element_id} was rejected. It has been re-created with a new ID and will go through production again.`,
      );
      onDone(item.id);
    } catch (err) {
      Alert.alert('Could not save', qcErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const confirmReject = () => {
    if (!comment.trim()) {
      Alert.alert('Add a reason', 'Please write why the element is rejected before rejecting it.');
      return;
    }
    Alert.alert(
      `Reject ${item.element_id}?`,
      'The element will be archived and re-created with a NEW element ID, then go through production again. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reject', style: 'destructive', onPress: () => submit('Rejected') },
      ],
    );
  };

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.handle} />
            {!!item && (
              <>
                <Text style={styles.sheetTitle}>{item.element_id}</Text>
                {!!item.element_name && <Text style={styles.sheetSub}>{item.element_name}</Text>}

                <Text style={styles.fieldLabel}>Inspection note</Text>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="What did you check? (required to reject)"
                  placeholderTextColor={Colors.textMuted}
                  style={styles.note}
                  multiline
                  maxLength={500}
                  editable={!busy}
                />

                <View style={styles.photoRow}>
                  {photo ? (
                    <View style={styles.photoWrap}>
                      <Image source={{ uri: photo.uri }} style={styles.photo} />
                      <TouchableOpacity style={styles.photoRemove} onPress={() => setPhoto(null)} disabled={!!busy} hitSlop={8}>
                        <Icon name="x" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addPhoto} onPress={takePhoto} disabled={!!busy} activeOpacity={0.8}>
                      <Icon name="camera" size={18} color={Colors.primary} />
                      <Text style={styles.addPhotoText}>Add photo of the fix</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnReject, !!busy && styles.btnDisabled]}
                    onPress={confirmReject}
                    disabled={!!busy}
                    activeOpacity={0.85}
                  >
                    {busy === 'Rejected' ? <ActivityIndicator color={Colors.destructive} /> : <Icon name="x-circle" size={18} color={Colors.destructive} />}
                    <Text style={[styles.btnText, { color: Colors.destructive }]}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnApprove, !!busy && styles.btnDisabled]}
                    onPress={() => submit('Approved')}
                    disabled={!!busy}
                    activeOpacity={0.85}
                  >
                    {busy === 'Approved' ? <ActivityIndicator color="#FFFFFF" /> : <Icon name="check-circle" size={18} color="#FFFFFF" />}
                    <Text style={[styles.btnText, { color: '#FFFFFF' }]}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: Colors.surface },
  picker: { paddingTop: 12 },
  content: { paddingHorizontal: 16, paddingTop: 12 },
  banner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: Colors.warningSoft,
    borderRadius: Theme.radius,
    padding: 12,
  },
  bannerText: { flex: 1, fontSize: FontSizes.small + 1, color: Colors.textPrimary, lineHeight: 19 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: Theme.radius,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  searchInput: { flex: 1, fontSize: FontSizes.regular, color: Colors.textPrimary, paddingVertical: 0 },
  count: { fontSize: FontSizes.small, color: Colors.textSecondary },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden', padding: 14, paddingLeft: 18 },
  itemAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: Colors.warning },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  itemCode: { flex: 1, fontSize: FontSizes.regular + 1, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  itemSub: { fontSize: FontSizes.small + 1, color: Colors.textSecondary },
  itemMeta: { fontSize: FontSizes.small, color: Colors.textMuted },
  backdrop: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, marginBottom: 14 },
  sheetTitle: { fontSize: FontSizes.large, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  sheetSub: { fontSize: FontSizes.regular, color: Colors.textSecondary, marginTop: 2 },
  fieldLabel: { fontSize: FontSizes.small, fontWeight: FontWeights.semiBold, color: Colors.textSecondary, marginTop: 18, marginBottom: 6 },
  note: {
    minHeight: 84,
    maxHeight: 160,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Theme.radius,
    padding: 12,
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  photoRow: { marginTop: 12 },
  addPhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: Theme.radius,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  addPhotoText: { fontSize: FontSizes.regular, fontWeight: FontWeights.semiBold, color: Colors.primary },
  photoWrap: { alignSelf: 'flex-start' },
  photo: { width: 120, height: 120, borderRadius: Theme.radius },
  photoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: Theme.radius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnReject: { borderWidth: 1.5, borderColor: Colors.destructive, backgroundColor: Colors.card },
  btnApprove: { backgroundColor: Colors.success },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: FontSizes.button + 1, fontWeight: FontWeights.bold },
}));

export default RectificationScreen;
