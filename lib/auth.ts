// lib/auth.ts

export interface UserSession {
  name: string;
  ssn: string;
  role: 'admin' | 'student';
  field?: 'Math' | 'Science';
  token?: string;
}

// دالة مبسطة لتشفير البيانات (Base64) بطريقة متوافقة مع Node.js Buffer
// مهم: يجب أن يتوافق الترميز مع ما يستخدمه الـ Middleware على السيرفر
const encodeBase64 = (data: string) => {
  if (typeof window !== 'undefined') {
    // ترميز UTF-8 متوافق مع Buffer.from(x, 'base64').toString('utf8') في Node.js
    const bytes = new TextEncoder().encode(data);
    let binary = '';
    bytes.forEach(b => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }
  return Buffer.from(data).toString('base64');
};

const decodeBase64 = (data: string) => {
  if (typeof window !== 'undefined') {
    const binary = atob(data);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(data, 'base64').toString('utf8');
};

export function setSession(session: UserSession) {
  if (typeof document !== 'undefined') {
    try {
      const sessionData = JSON.stringify(session);
      const encodedData = encodeBase64(sessionData);

      const expires = new Date();
      expires.setTime(expires.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      document.cookie = `auth_session=${encodeURIComponent(encodedData)};expires=${expires.toUTCString()};path=/;SameSite=Lax${isHttps ? ';Secure' : ''}`;

      try {
        localStorage.setItem('auth_session', sessionData);
      } catch {}
    } catch (e) {
      console.error('Cookie storage error:', e);
    }
  }
}

export function getSession(): UserSession | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(new RegExp('(^| )auth_session=([^;]+)'));
    if (match && match[2]) {
      let rawValue = match[2].trim().replace(/^"|"$/g, '');
      try {
        rawValue = decodeURIComponent(rawValue);
      } catch {}
      rawValue = rawValue.replace(/^"|"$/g, '');

      try {
        const decodedData = decodeBase64(rawValue);
        const parsed = JSON.parse(decodedData) as UserSession;
        if (parsed && parsed.role) {
          try { localStorage.setItem('auth_session', JSON.stringify(parsed)); } catch {}
          return parsed;
        }
      } catch (err) {
        console.warn('Cookie parse failed, falling back to localStorage:', err);
      }
    }

    // Fallback: فحص localStorage في حالة اختفاء الكوكيز أو حدوث خطأ فيها
    const local = localStorage.getItem('auth_session');
    if (local) {
      const parsed = JSON.parse(local) as UserSession;
      if (parsed && parsed.role) {
        // استعادة الكوكيز تلقائياً لمنع خروج المستخدم في الـ Middleware
        setSession(parsed);
        return parsed;
      }
    }
    return null;
  } catch (e) {
    console.error('getSession error:', e);
    try {
      const local = localStorage.getItem('auth_session');
      if (local) {
        const parsed = JSON.parse(local) as UserSession;
        if (parsed && parsed.role) {
          setSession(parsed);
          return parsed;
        }
      }
    } catch {}
    return null;
  }
}

export function clearSession() {
  if (typeof document !== 'undefined') {
    try {
      document.cookie = 'auth_session=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax';
      localStorage.removeItem('auth_session');
    } catch (e) {
      console.error('Cookie clear error:', e);
    }
  }
}
