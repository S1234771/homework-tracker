import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Вставьте сюда объект firebaseConfig из консоли Firebase:
// Project settings → General → "Your apps" → веб-приложение → SDK setup and configuration
const firebaseConfig = {
  apiKey: "ВАШ_API_KEY",
  authDomain: "ВАШ_ПРОЕКТ.firebaseapp.com",
  projectId: "ВАШ_ПРОЕКТ_ID",
  storageBucket: "ВАШ_ПРОЕКТ.appspot.com",
  messagingSenderId: "ВАШ_SENDER_ID",
  appId: "ВАШ_APP_ID",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
