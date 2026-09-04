import { NextRequest, NextResponse } from 'next/server';

const BACKEND = 'http://internalplacementapiversion2.runasp.net';

function encodeSession(session: object): string {
  const json = JSON.stringify(session);
  return Buffer.from(json).toString('base64');
}

export async function POST(request: NextRequest) {
  try {
    const { ssn, password } = await request.json();

    if (!ssn || !password) {
      return NextResponse.json({ error: 'الرقم القومي وكلمة المرور مطلوبان' }, { status: 400 });
    }

    // 1. محاولة تسجيل الدخول عبر Identity
    const loginRes = await fetch(`${BACKEND}/api/Auth/LoginAdmin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssn, password }),
    });

    if (loginRes.ok) {
      const data = await loginRes.json().catch(() => ({}));
      const token = data?.token || '';
      const userName = data?.name || data?.userName || '';
      const studentField = data?.studentField || data?.field || '';
      const role = (data?.role || data?.roles || '').toString().toLowerCase();

      const session = {
        name: role === 'admin' ? (userName || 'مدير النظام') : (userName || 'طالب'),
        ssn,
        role: role === 'admin' ? 'admin' : 'student',
        field: studentField === 'Math' ? 'Math' : studentField === 'Science' ? 'Science' : studentField,
        token,
      };

      const encoded = encodeSession(session);
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const res = NextResponse.json({
        success: true,
        role: session.role,
        redirect: session.role === 'admin' ? '/admin' : '/student',
        session,
      });

      res.cookies.set('auth_session', encoded, {
        expires,
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
      });

      return res;
    }

    // 2. تحقق من كشوف الطلاب
    try {
      const studentRes = await fetch(`${BACKEND}/api/Admin/Get-Student-By-SSN/${encodeURIComponent(ssn)}`);

      if (studentRes.ok) {
        const sData = await studentRes.json().catch(() => ({}));
        if (sData && (sData.name || sData.ssn)) {
          const session = {
            name: sData.name || 'طالب',
            ssn,
            role: 'student',
            field: sData.field === 'Math' ? 'Math' : 'Science',
            token: '',
          };

          const encoded = encodeSession(session);
          const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

          const res = NextResponse.json({
            success: true,
            role: 'student',
            redirect: '/student',
            session,
          });

          res.cookies.set('auth_session', encoded, {
            expires,
            path: '/',
            sameSite: 'lax',
            httpOnly: false,
          });

          return res;
        }
      }
    } catch { /* silent */ }

    // 3. فشل
    let errMsg = 'الرقم القومي أو كلمة المرور غير صحيحة ❌';
    try {
      const errData = await loginRes.json();
      if (errData?.message) errMsg = errData.message;
    } catch { /* use default */ }

    return NextResponse.json({ success: false, error: errMsg }, { status: 401 });
  } catch {
    return NextResponse.json({ success: false, error: 'خطأ داخلي في السيرفر' }, { status: 500 });
  }
}
