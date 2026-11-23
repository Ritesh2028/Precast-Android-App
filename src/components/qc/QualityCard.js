import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Colors, Theme } from '../../styles/colors';
import { FontSizes, FontWeights } from '../../styles/fonts';
import { themedStyles } from '../../theme';
import { Card, Icon, Skeleton, Tone } from '../ui';
import { fetchQcStagewise, fetchRejections, fetchRectification } from '../../services/qcApi';

// Backend stage keys look like "pre_pour" / "mesh_&_mould"; show "Pre Pour" / "Mesh & Mould".
const titleCase = (s) =>
  String(s || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Dashboard "Quality" card: rejections in the last 6 weeks (+ the stages that
 * reject most), elements on rectification hold, and stage-wise QC
 * (approved vs pending) for the selected project.
 * Props: projectId (null = all projects), refreshKey, onOpenRectification().
 */
const QualityCard = ({ projectId, refreshKey, onOpenRectification }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ rejections: null, stages: [], onHold: null });

  const load = useCallback(async () => {
    setLoading(true);
    const [rej, stages, hold] = await Promise.allSettled([
      fetchRejections(projectId),
      projectId ? fetchQcStagewise(projectId) : Promise.resolve([]),
      projectId ? fetchRectification(projectId) : Promise.resolve(null),
    ]);
    setData({
      rejections: rej.status === 'fulfilled' ? rej.value : null,
      stages: stages.status === 'fulfilled' ? stages.value.filter((s) => s.approved + s.pending > 0) : [],
      onHold: hold.status === 'fulfilled' && Array.isArray(hold.value) ? hold.value.length : null,
    });
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const rej = data.rejections;
  const topStages = (rej?.stages || []).slice(0, 3);
  const maxStage = Math.max(1, ...data.stages.map((s) => s.approved + s.pending));

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headIcon}>
          <Icon name="shield-check" size={18} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Quality</Text>
          <Text style={styles.subtitle}>{projectId ? 'This project' : 'All your projects'}</Text>
        </View>
      </View>

      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>Rejections · 6 wks</Text>
          {loading ? (
            <Skeleton width={40} height={22} style={{ marginTop: 6 }} />
          ) : (
            <Text style={[styles.tileValue, { color: rej?.total ? Tone.danger.solid : Colors.textPrimary }]}>
              {rej ? rej.total : '–'}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.tile, styles.tileAction]}
          onPress={onOpenRectification}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open rectification queue"
        >
          <View style={styles.tileActionHead}>
            <Text style={styles.tileLabel}>On hold (rectification)</Text>
            <Icon name="chevron-right" size={16} color={Colors.textMuted} />
          </View>
          {loading ? (
            <Skeleton width={40} height={22} style={{ marginTop: 6 }} />
          ) : (
            <Text style={[styles.tileValue, { color: data.onHold ? Tone.warning.solid : Colors.textPrimary }]}>
              {data.onHold == null ? 'Open' : data.onHold}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {!loading && topStages.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.blockTitle}>Most rejections</Text>
          <View style={styles.chips}>
            {topStages.map((s) => (
              <View key={s.stage} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>{titleCase(s.stage)}</Text>
                <Text style={styles.chipCount}>{s.count}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {projectId ? (
        !loading && (
          <View style={styles.block}>
            <View style={styles.legendRow}>
              <Text style={styles.blockTitle}>QC by stage · this year</Text>
              <View style={styles.legend}>
                <View style={[styles.legendDot, { backgroundColor: Tone.success.solid }]} />
                <Text style={styles.legendText}>Approved</Text>
                <View style={[styles.legendDot, { backgroundColor: Tone.warning.solid }]} />
                <Text style={styles.legendText}>Pending</Text>
              </View>
            </View>
            {data.stages.length === 0 ? (
              <Text style={styles.muted}>No QC activity this year.</Text>
            ) : (
              data.stages.map((s) => (
                <View key={s.stage} style={styles.stageRow}>
                  <Text style={styles.stageName} numberOfLines={1}>{titleCase(s.stage)}</Text>
                  <View style={styles.barTrack}>
                    <View style={{ flexDirection: 'row', width: `${((s.approved + s.pending) / maxStage) * 100}%`, height: '100%' }}>
                      <View style={{ flex: s.approved, backgroundColor: Tone.success.solid }} />
                      <View style={{ flex: s.pending, backgroundColor: Tone.warning.solid }} />
                    </View>
                  </View>
                  <Text style={styles.stageCount}>{`${s.approved}/${s.approved + s.pending}`}</Text>
                </View>
              ))
            )}
          </View>
        )
      ) : (
        !loading && <Text style={[styles.muted, styles.block]}>Pick a project above to see QC by stage.</Text>
      )}
    </Card>
  );
};

const styles = themedStyles(() => ({
  card: { gap: 14, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSizes.regular + 2, fontWeight: FontWeights.bold, color: Colors.textPrimary },
  subtitle: { fontSize: FontSizes.small, color: Colors.textSecondary },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, backgroundColor: Colors.muted, borderRadius: Theme.radius, padding: 12 },
  tileAction: { borderWidth: 1, borderColor: Colors.border },
  tileActionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileLabel: { fontSize: FontSizes.small, color: Colors.textSecondary, fontWeight: FontWeights.medium },
  tileValue: { fontSize: FontSizes.large + 2, fontWeight: FontWeights.bold, marginTop: 4 },
  block: { gap: 8 },
  blockTitle: { fontSize: FontSizes.small, fontWeight: FontWeights.bold, color: Colors.textSecondary, letterSpacing: 0.3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: Colors.errorSoft,
    maxWidth: '100%',
  },
  chipText: { fontSize: FontSizes.small, color: Colors.destructive, fontWeight: FontWeights.medium, flexShrink: 1 },
  chipCount: { fontSize: FontSizes.small, color: Colors.destructive, fontWeight: FontWeights.bold },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 6 },
  legendText: { fontSize: FontSizes.extraSmall + 1, color: Colors.textSecondary },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stageName: { width: 104, fontSize: FontSizes.small, color: Colors.textPrimary },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: Colors.chartTrack, overflow: 'hidden' },
  stageCount: { width: 52, textAlign: 'right', fontSize: FontSizes.small, color: Colors.textSecondary, fontWeight: FontWeights.medium },
  muted: { fontSize: FontSizes.small, color: Colors.textMuted },
}));

export default QualityCard;
