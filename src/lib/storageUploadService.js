import { getDownloadURL, ref, uploadString } from "firebase/storage";
import { storage } from "./firebase";

function requireStorage() {
  if (!storage) throw new Error("Firebase Storage 尚未設定完成（請檢查 VITE_FIREBASE_STORAGE_BUCKET）。");
}

export async function uploadAudioBase64(uid, base64, filename) {
  requireStorage();
  if (!uid) throw new Error("缺少 uid，無法上傳音檔。");
  if (!base64) throw new Error("缺少音檔內容。");

  const path = `users/${uid}/audio/${filename}.mp3`;
  const fileRef = ref(storage, path);
  await uploadString(fileRef, base64, "base64", { contentType: "audio/mpeg" });
  const url = await getDownloadURL(fileRef);
  return { url, path };
}

export async function uploadImageBase64(uid, base64, filename) {
  requireStorage();
  if (!uid) throw new Error("缺少 uid，無法上傳圖片。");
  if (!base64) throw new Error("缺少圖片內容。");

  const path = `users/${uid}/images/${filename}.jpg`;
  const fileRef = ref(storage, path);
  await uploadString(fileRef, base64, "base64", { contentType: "image/jpeg" });
  const url = await getDownloadURL(fileRef);
  return { url, path };
}
