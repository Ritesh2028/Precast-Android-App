import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Colors } from '../../styles/colors';
import { FontSizes, FontWeights } from '../../styles/fonts';
import { themedStyles } from '../../theme';
import { Icon, StatusPill, Skeleton } from '../ui';
import { fetchElementTimeline, qcErrorMessage } from '../../services/qcApi';
import { formatDateTime, qcStatusTone } from './qcShared';

/**
 * Element journey (production -> stockyard -> dispatch -> erected) plus every QC
 * check, from /api/dashboard/element_timeline/:id. Renders content only; the
 * caller provides the surrounding section card.
 */
const ElementTimeline = ({ elementId }) => {
  const [state, setState] = useState({ loading: true, error: null, data: null });

  const load = useCallback(async () => {
    if (!elementId) {
      setState({ loading: false, error: 'This element has no ID.', data: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchElementTimeline(elementId);
      setState({ loading: false, error: null, data });
    } catch (err) {
      setState({ loading: false, error: qcErrorMessage(err, "Couldn't load the timeline."), data: null });
    }
  }, [elementId]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) {
    return (
      <View style={{ gap: 12 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} height={34} />)}
      </View>
    );
  }

  if (state.error) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>{state.error}</Text>
        <TouchableOpacity onPress={load} style={styles.retry} activeOpacity={0.7}>
          <Icon name="refresh" size={14} color={Colors.primary} />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const steps = state.data?.steps || [];
  const qc = state.data?.qc || [];
  // The last completed step is "current"; the first not-done step after it is "next".
  const lastDone = steps.reduce((acc, s, i) => (s.done ? i : acc), -1);

  return (
    <View>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const current = i === lastDone;
        return (
          <View key={step.key || i} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, step.done && styles.dotDone, current && styles.dotCurrent]}>
                {step.done && <Icon name="check" size={11} color={Colors.textWhite} strokeWidth={3.5} />}
              </View>
              {!isLast && <View style={[styles.line, step.done && i < lastDone && styles.lineDone]} />}
            </View>
            <View style={styles.body}>
              <Text style={[styles.label, !step.done && styles.labelPending]}>{step.label}</Text>
              {step.done ? (
                <Text style={styles.meta} numberOfLines={2}>
                  {[formatDateTime(step.at), step.user_name].filter(Boolean).join(' · ')}
                </Text>
              ) : (
                <Text style={styles.metaPending}>Not yet</Text>
              )}
              {!!step.detail && <Text style={styles.detail} numberOfLines={2}>{step.detail}</Text>}
            </View>
          </View>
        );
      })}

      <Text style={styles.qcTitle}>QC checks</Text>
      {qc.length === 0 ? (
        <Text style={styles.metaPending}>No QC checks recorded yet.</Text>
      ) : (
        qc.map((q, i) => {
          const t = qcStatusTone(q.status);
          return (
            <View key={`${q.stage}-${i}`} style={styles.qcRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.qcStage} numberOfLines={1}>{q.stage}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[formatDateTime(q.at), q.user_name].filter(Boolean).join(' · ') || '—'}
                </Text>
              </View>
              <StatusPill label={t.label} tone={t.tone} />
            </View>
          );
        })
      )}
    </View>
  );
};

const DOT = 18;

const styles = themedStyles(() => ({
  row: { flexDirection: 'row' },
  rail: { width: DOT, alignItems: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  dotCurrent: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  line: { flex: 1, width: 2, minHeight: 18, backgroundColor: Colors.border, marginVertical: 2 },
  lineDone: { backgroundColor: Colors.success },
  body: { flex: 1, paddingLeft: 12, paddingBottom: 14 },
  label: { fontSize: FontSizes.regular, fontWeight: FontWeights.semiBold, color: Colors.textPrimary },
  labelPending: { color: Colors.textSecondary, fontWeight: FontWeights.medium },
  meta: { fontSize: FontSizes.small, color: Colors.textSecondary, marginTop: 2 },
  metaPending: { fontSize: FontSizes.small, color: Colors.textMuted, marginTop: 2 },
  detail: { fontSize: FontSizes.small, color: Colors.textSecondary, marginTop: 2, fontStyle: 'italic' },
  qcTitle: {
    fontSize: FontSizes.small,
    fontWeight: FontWeights.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 4,
    marginBottom: 6,
  },
  qcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  qcStage: { fontSize: FontSizes.regular, fontWeight: FontWeights.semiBold, color: Colors.textPrimary },
  errorBox: { alignItems: 'center', paddingVertical: 12, gap: 8 },
  errorText: { fontSize: FontSizes.small, color: Colors.textSecondary, textAlign: 'center' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  retryText: { fontSize: FontSizes.small, color: Colors.primary, fontWeight: FontWeights.semiBold },
}));

export default ElementTimeline;
