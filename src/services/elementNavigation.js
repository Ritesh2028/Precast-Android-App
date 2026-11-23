import { Alert } from 'react-native';
import api from './apiClient';

/**
 * Fetch an element via /api/scan_element/:id and open ElementDetails.
 * Auth + 401 refresh are handled by the shared axios client.
 * Returns true on success.
 */
export async function openElementDetails(navigation, elementId) {
  if (!elementId) {
    Alert.alert('Element not found', 'This item has no element ID.');
    return false;
  }
  try {
    const res = await api.get(`/api/scan_element/${elementId}`);
    navigation.navigate('ElementDetails', { elementId, elementData: res.data });
    return true;
  } catch (err) {
    const status = err?.response?.status;
    if (status === 401) {
      Alert.alert('Session expired', 'Please log in again.');
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      return false;
    }
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      (status ? `Request failed (${status}).` : 'Check your internet connection and try again.');
    Alert.alert("Couldn't open element", msg);
    return false;
  }
}

/** Resolve the numeric element id from the various task shapes the APIs return. */
export function resolveElementId(job) {
  return (
    job?.originalData?.element_id ||
    job?.originalData?.id ||
    (typeof job?.id === 'string' ? job.id.replace('ELEM-', '') : job?.id)
  );
}
