import React, { useEffect, useState } from 'react';
import { Image, View, ActivityIndicator } from 'react-native';
import { fileImageSource } from '../../services/qcApi';
import { Colors } from '../../styles/colors';

/** "12 Nov 2026, 3:40 pm" (or the raw value if it is not a date). */
export const formatDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  return `${date}, ${time}`;
};

/** Maps backend QC / activity status strings to a StatusPill tone + label. */
export const qcStatusTone = (status) => {
  const s = String(status || '').toLowerCase();
  if (['approved', 'completed', 'complete', 'pass', 'passed', 'done'].includes(s)) return { tone: 'success', label: 'Approved' };
  if (['rejected', 'fail', 'failed', 'rework'].includes(s)) return { tone: 'danger', label: 'Rejected' };
  if (['inprogress', 'in_progress', 'in progress', 'pending', 'qc pending'].includes(s)) return { tone: 'warning', label: 'Pending' };
  return { tone: 'neutral', label: status ? String(status) : 'Unknown' };
};

/** Image from /api/get-file (needs the auth header, which arrives asynchronously). */
export const AuthImage = ({ fileName, style, resizeMode = 'cover', onError }) => {
  const [source, setSource] = useState(null);
  useEffect(() => {
    let alive = true;
    if (fileName) fileImageSource(fileName).then((src) => alive && setSource(src)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [fileName]);
  if (!source) {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.muted }]}>
        <ActivityIndicator size="small" color={Colors.textSecondary} />
      </View>
    );
  }
  return <Image source={source} style={style} resizeMode={resizeMode} onError={onError} />;
};
