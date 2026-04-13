import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { storage } from "./firebase";

function requireStorage() {
  if (!storage) {
    throw new Error("Firebase Storage 尚未設定完成（請檢查 VITE_FIREBASE_STORAGE_BUCKET）。");
  }
}

function normalizeStorageError(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");

  if (code === "storage/retry-limit-exceeded") {
    return new Error(
      "Firebase Storage 連線逾時（retry-limit-exceeded）。請檢查網路、Storage bucket 名稱、Storage rules，以及是否已登入後再試。",
    );
  }

  if (code === "storage/unauthorized") {
    return new Error("沒有上傳權限（storage/unauthorized）。請確認已登入，並檢查 storage.rules 的 users/{uid} 存取規則。");
  }

  if (code === "storage/invalid-checksum" || code === "storage/canceled") {
    return new Error("檔案上傳中斷，請重試一次。");
  }

  if (msg) return new Error(msg);
  return error instanceof Error ? error : new Error("Firebase Storage 上傳失敗。");
}

async function uploadBase64({ uid, base64, filename, contentType, folder }) {
  requireStorage();
  if (!uid) throw new Error("缺少 uid，無法上傳檔案。");
  if (!base64) throw new Error("缺少檔案內容。");

  const path = `users/${uid}/${folder}/${filename}`;
  const fileRef = ref(storage, path);

  try {
    await uploadString(fileRef, base64, "base64", { contentType });
    const url = await getDownloadURL(fileRef);
    return { url, path };
  } catch (error) {
    throw normalizeStorageError(error);
  }
}

export async function uploadAudioBase64(uid, base64, filename) {
  return uploadBase64({
    uid,
    base64,
    filename: `${filename}.mp3`,
    contentType: "audio/mpeg",
    folder: "audio",
  });
}

export async function uploadImageBase64(uid, base64, filename) {
  return uploadBase64({
    uid,
    base64,
    filename: `${filename}.jpg`,
    contentType: "image/jpeg",
    folder: "images",
  });
}
