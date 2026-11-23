import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Share, Modal, Pressable } from 'react-native';
import { Colors, Theme } from '../styles/colors';
import { FontSizes, FontWeights } from '../styles/fonts';
import { themedStyles } from '../theme';
import { Card, Icon, StatusPill, EmptyState, SkeletonList } from '../components/ui';
import { fetchElementQcReport, sameStage, qcErrorMessage } from '../services/qcApi';
import { AuthImage, formatDateTime, qcStatusTone } from '../components/qc/qcShared';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const hasText = (v) => !!(v && String(v).trim());

/**
 * Read-only QC report for one element: one tab per QC'd stage with the inspector,
 * date, every checklist answer (comment + photo when recorded) and the decision
 * history. Params: { elementId, elementName?, stageName? } — stageName picks the
 * tab that opens first.
 */
const QCReportScreen = ({ route }) => {
  const { elementId, elementName, stageName } = route.params || {};
  const [report, setReport] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [viewer, setViewer] = useState(null);

  const load = useCallback(async () => {
    if (!elementId) {
      setLoading(false);
      setError('This task has no element, so its QC report cannot be found.');
      return;
    }
    setError(null);
    try {
      const data = await fetchElementQcReport(elementId);
      setReport(data);
      setSelected((prev) => {
        if (prev && data.stages.some((st) => st.name === prev)) return prev;
        const match = data.stages.find((st) => sameStage(st.name, stageName));
        return (match || data.stages[data.stages.length - 1])?.name || null;
      });
    } catch (err) {
      setError(qcErrorMessage(err, "Couldn't load the QC report."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [elementId, stageName]);

  useEffect(() => {
    load();
  }, [load]);

  const stage = useMemo(() => report?.stages.find((st) => st.name === selected) || null, [report, selected]);
  const title = elementName || report?.elementCode || 'Element';

  const handleShare = async () => {
    if (!stage) return;
    const lines = [
      `QC report – ${title}`,
      `Stage: ${stage.name}`,
      stage.qcUser ? `Inspector: ${stage.qcUser}` : null,
      stage.qcAt ? `Date: ${formatDateTime(stage.qcAt)}` : null,
      '',
      ...stage.answers.map((a, i) => {
        const note = hasText(a.comment) ? `\n   Note: ${String(a.comment).trim()}` : '';
        return `${i + 1}. ${a.question_text}\n   Answer: ${a.option_text || '—'}${note}`;
      }),
      '',
      'Shared from PrecastEzy',
    ].filter((l) => l !== null);
    try {
      await Share.share({ message: lines.join('\n'), title: 'QC report' });
    } catch {
      // User dismissed the share sheet.
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const renderBody = () => {
    if (loading) return <SkeletonList rows={4} />;
    if (error) {
      return (
        <Card>
          <EmptyState icon="alert-circle" tone="danger" title="Couldn't load report" message={error} actionLabel={elementId ? 'Retry' : undefined} onAction={load} />
        </Card>
      );
    }
    if (!report?.stages.length) {
      return (
        <Card>
          <EmptyState icon="clipboard" tone="info" title="No QC recorded yet" message="No stage of this element has been inspected yet." actionLabel="Refresh" onAction={load} />
        </Card>
      );
    }
    const photos = stage ? stage.answers.filter((a) => a.image_path).length : 0;
    const notes = stage ? stage.answers.filter((a) => hasText(a.comment)).length : 0;
    return (
      <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {report.stages.map((st) => {
            const active = st.name === selected;
            return (
              <TouchableOpacity
                key={st.name}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setSelected(st.name)}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{st.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {stage && (
          <>
            <Card style={styles.metaCard}>
              <MetaRow icon="user" label="Inspector" value={stage.qcUser || '—'} />
              <MetaRow icon="clock" label="Inspected" value={stage.qcAt ? formatDateTime(stage.qcAt) : '—'} />
              <MetaRow
                icon="list-checks"
                label="Checks"
                value={[plural(stage.answers.length, 'question'), plural(photos, 'photo'), plural(notes, 'note')].join(' · ')}
                last
              />
            </Card>

            {stage.answers.length === 0 ? (
              <Card>
                <EmptyState icon="clipboard" tone="neutral" title="No checklist answers" message="This stage was decided without a recorded checklist." />
              </Card>
            ) : (
              stage.answers.map((a, i) => (
                <Card key={a.qc_answer_id || a.id || i} style={styles.qCard}>
                  <View style={styles.qHead}>
                    <Text style={styles.qNum}>{i + 1}</Text>
                    <Text style={styles.qText}>{a.question_text}</Text>
                  </View>
                  <View style={styles.answerRow}>
                    <Text style={styles.answerLabel}>Answer</Text>
                    <StatusPill label={a.option_text || 'No answer'} tone={a.option_text ? 'info' : 'neutral'} />
                  </View>
                  {hasText(a.comment) && <Text style={styles.comment}>{String(a.comment).trim()}</Text>}
                  {!!a.image_path && (
                    <TouchableOpacity onPress={() => setViewer(a.image_path)} activeOpacity={0.85} accessibilityLabel="Open photo">
                      <AuthImage fileName={a.image_path} style={styles.photo} />
                    </TouchableOpacity>
                  )}
                </Card>
              ))
            )}

            {stage.history.length > 0 && (
              <Card style={styles.historyCard}>
                <Text style={styles.historyTitle}>Decision history</Text>
                {stage.history.map((h, i) => {
                  const t = qcStatusTone(h.to || h.event);
                  return (
                    <View key={`${h.at}-${i}`} style={[styles.historyRow, i > 0 && styles.historyRowBorder]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyActor}>{h.actor || 'Unknown'}</Text>
                        <Text style={styles.historyMeta}>{formatDateTime(h.at)}</Text>
                      </View>
                      <StatusPill label={t.tone === 'neutral' ? String(h.to || h.event || '—') : t.label} tone={t.tone} />
                    </View>
                  );
                })}
              </Card>
            )}
          </>
        )}
      </>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Icon name="shield-check" size={22} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>QC REPORT</Text>
            <Text style={styles.heroTitle} numberOfLines={1}>{title}</Text>
            {!!(stage?.name || stageName) && <Text style={styles.heroSub}>{stage?.name || stageName}</Text>}
          </View>
          {!!stage?.answers.length && (
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.8} accessibilityLabel="Share QC report">
              <Icon name="share" size={18} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
        {renderBody()}
      </ScrollView>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewer(null)}>
          {!!viewer && <AuthImage fileName={viewer} style={styles.viewerImage} resizeMode="contain" />}
          <View style={styles.viewerClose}>
            <Icon name="x" size={22} color="#FFFFFF" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const MetaRow = ({ icon, label, value, last }) => (
  <View style={[styles.metaRow, !last && styles.metaRowBorder]}>
    <Icon name={icon} size={16} color={Colors.textSecondary} />
    <Text style={styles.metaLabel}>{label}</Text>
    <Text style={styles.metaValue} numberOfLines={2}>{value}</Text>
  </View>
);

const styles = themedStyles(() => ({
  screen: { flex: 1, backgroundColor: Colors.surface },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEyebrow: { fontSize: FontSizes.extraSmall, letterSpacing: 1, color: Colors.textSecondary, fontWeight: FontWeights.semiBold },
  heroTitle: { fontSize: FontSizes.large, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  heroSub: { fontSize: FontSizes.small, color: Colors.textSecondary, marginTop: 1 },
  shareBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: { gap: 8, paddingVertical: 2 },
  tab: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontSize: FontSizes.small + 1, fontWeight: FontWeights.semiBold, color: Colors.textSecondary },
  tabTextActive: { color: Colors.primaryForeground },
  metaCard: { paddingVertical: 4, paddingHorizontal: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  metaRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  metaLabel: { width: 82, fontSize: FontSizes.small, color: Colors.textSecondary },
  metaValue: { flex: 1, fontSize: FontSizes.regular, color: Colors.textPrimary, fontWeight: FontWeights.medium },
  qCard: { gap: 10, padding: 14 },
  qHead: { flexDirection: 'row', gap: 10 },
  qNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    backgroundColor: Colors.primarySoft,
  },
  qText: { flex: 1, fontSize: FontSizes.regular + 1, fontWeight: FontWeights.semiBold, color: Colors.textPrimary, lineHeight: 21 },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 34 },
  answerLabel: { fontSize: FontSizes.small, color: Colors.textSecondary },
  comment: {
    marginLeft: 34,
    fontSize: FontSizes.regular,
    color: Colors.textPrimary,
    backgroundColor: Colors.muted,
    borderRadius: Theme.radiusSm,
    padding: 10,
  },
  photo: { marginLeft: 34, height: 180, borderRadius: Theme.radius, backgroundColor: Colors.muted },
  historyCard: { padding: 14 },
  historyTitle: { fontSize: FontSizes.small, fontWeight: FontWeights.bold, color: Colors.textSecondary, letterSpacing: 0.4, marginBottom: 4 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  historyRowBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  historyActor: { fontSize: FontSizes.regular, fontWeight: FontWeights.semiBold, color: Colors.textPrimary },
  historyMeta: { fontSize: FontSizes.small, color: Colors.textSecondary, marginTop: 1 },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export default QCReportScreen;
