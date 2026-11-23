/**
 * Saves drawing files to a public "PrecastEzy Drawings" folder on Android and
 * opens them with the phone's viewer app.
 *
 * Android 11+ only lets apps write to shared storage through the Storage Access
 * Framework (SAF): the user grants a folder once (we suggest Documents), then we
 * create "PrecastEzy Drawings" inside it and remember the folder for next time.
 * iOS has no shared folder, so it keeps the share-sheet flow.
 */
import { Alert, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';

const { StorageAccessFramework: SAF } = FileSystem;

export const DRAWINGS_FOLDER_NAME = 'PrecastEzy Drawings';
const FOLDER_URI_KEY = 'drawings.folderUri';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

// MIME types Android maps to an extension itself (SAF then appends it to the name).
const KNOWN_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
};
// Types used only to pick a viewer app; the file is created as octet-stream.
const VIEW_MIME = {
  dwg: 'application/acad',
  dxf: 'application/dxf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};

const extOf = (name) => {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
};

const safeFileName = (name) =>
  (name || `drawing_${Date.now()}`).split('/').pop().replace(/[\\:*?"<>|]/g, '_');

/** Last path segment of a SAF URI, decoded ("…/PrecastEzy Drawings/a.jpg" -> "a.jpg"). */
const safName = (uri) => {
  const decoded = decodeURIComponent(uri);
  return decoded.slice(decoded.lastIndexOf('/') + 1);
};

const isFolderUsable = async (uri) => {
  if (!uri) return false;
  try {
    await SAF.readDirectoryAsync(uri);
    return true;
  } catch {
    return false;
  }
};

const explainFolderAccess = () =>
  new Promise((resolve) => {
    Alert.alert(
      'Allow drawing downloads',
      `Drawings are saved in a "${DRAWINGS_FOLDER_NAME}" folder on your phone.\n\n` +
        'On the next screen, open "Documents" (or any folder you like) and tap ' +
        '"Use this folder", then "Allow". The app creates the folder for you. ' +
        'You only need to do this once.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Continue', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });

/**
 * Returns the SAF URI of the "PrecastEzy Drawings" folder, asking the user for
 * folder access the first time (or if access was revoked). Null if declined.
 */
export const getDrawingsFolderUri = async () => {
  const saved = await AsyncStorage.getItem(FOLDER_URI_KEY).catch(() => null);
  if (await isFolderUsable(saved)) return saved;

  if (!(await explainFolderAccess())) return null;

  const permission = await SAF.requestDirectoryPermissionsAsync(
    SAF.getUriForDirectoryInRoot('Documents'),
  );
  if (!permission.granted) return null;
  const parentUri = permission.directoryUri;

  let folderUri;
  if (safName(parentUri).split(':').pop() === DRAWINGS_FOLDER_NAME) {
    // User picked (or created) the drawings folder itself.
    folderUri = parentUri;
  } else {
    const children = await SAF.readDirectoryAsync(parentUri);
    folderUri = children.find((uri) => safName(uri) === DRAWINGS_FOLDER_NAME);
    if (!folderUri) folderUri = await SAF.makeDirectoryAsync(parentUri, DRAWINGS_FOLDER_NAME);
  }

  await AsyncStorage.setItem(FOLDER_URI_KEY, folderUri).catch(() => {});
  return folderUri;
};

const writeToFolder = async (folderUri, fileName, localUri) => {
  const ext = extOf(fileName);
  const knownMime = KNOWN_MIME[ext];
  const mimeType = knownMime || VIEW_MIME[ext] || 'application/octet-stream';

  // Re-downloading the same drawing overwrites it instead of creating "name (1)".
  const children = await SAF.readDirectoryAsync(folderUri);
  const wanted = knownMime && ext === 'jpeg' ? fileName.replace(/\.jpeg$/i, '.jpg') : fileName;
  let targetUri = children.find((uri) => {
    const n = safName(uri);
    return n === fileName || n === wanted;
  });

  if (!targetUri) {
    targetUri = knownMime
      ? await SAF.createFileAsync(folderUri, fileName.replace(/\.[^.]+$/, ''), knownMime)
      : await SAF.createFileAsync(folderUri, fileName, 'application/octet-stream');
  }

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await SAF.writeAsStringAsync(targetUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return { uri: targetUri, mimeType };
};

/** Opens a saved file in the phone's viewer app (Android). */
export const openSavedFile = async (uri, mimeType) => {
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: uri,
      type: mimeType,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
  } catch {
    Alert.alert(
      'No app to open this file',
      `The drawing is saved in "${DRAWINGS_FOLDER_NAME}". Install an app that can open ` +
        `.${extOf(safName(uri)) || 'this'} files, or open it from your Files app.`,
    );
  }
};

const downloadToCache = async (url, accessToken, fileName) => {
  const cacheUri = `${FileSystem.cacheDirectory}${Date.now()}_${fileName}`;
  const result = await FileSystem.downloadAsync(url, cacheUri, {
    headers: { Authorization: accessToken },
  });
  if (result.status !== 200) {
    await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
    const messages = {
      401: 'Your session has expired. Please log in again.',
      403: 'You do not have access to this drawing.',
      404: 'This drawing file was not found on the server.',
    };
    const err = new Error(messages[result.status] || `Server returned status ${result.status}.`);
    err.status = result.status;
    throw err;
  }
  return cacheUri;
};

/**
 * Downloads a drawing, saves it to "PrecastEzy Drawings" and asks to open it.
 * Resolves to { saved: boolean }.
 */
export const downloadDrawing = async ({ url, fileName: rawName, accessToken }) => {
  const fileName = safeFileName(rawName);

  if (Platform.OS !== 'android') {
    const cacheUri = await downloadToCache(url, accessToken, fileName);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(cacheUri, { dialogTitle: `Save ${fileName}` });
    }
    return { saved: true };
  }

  // Ask for the folder first so the user is not waiting on a download they then cancel.
  const folderUri = await getDrawingsFolderUri();
  if (!folderUri) return { saved: false };

  const cacheUri = await downloadToCache(url, accessToken, fileName);
  try {
    const { uri, mimeType } = await writeToFolder(folderUri, fileName, cacheUri);
    Alert.alert(
      'Drawing downloaded',
      `"${safName(uri)}" is saved in the ${DRAWINGS_FOLDER_NAME} folder.`,
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Open', onPress: () => openSavedFile(uri, mimeType) },
      ],
    );
    return { saved: true };
  } catch (error) {
    // Folder was deleted or access revoked: forget it so the next tap asks again.
    if (!(await isFolderUsable(folderUri))) {
      await AsyncStorage.removeItem(FOLDER_URI_KEY).catch(() => {});
      throw new Error(`The "${DRAWINGS_FOLDER_NAME}" folder is no longer available. Tap View again to choose it.`);
    }
    throw error;
  } finally {
    FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
  }
};
