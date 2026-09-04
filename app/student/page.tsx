'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, clearSession, UserSession } from '../../lib/auth';

// ─── API Helper ──────────────────────────────────────────────────────────────
async function apiCall(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const session = getSession();
  const isFormData = options.body instanceof FormData;

  const headers: HeadersInit = {
    ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
    ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    ...(options.headers || {}),
  };

  return fetch(endpoint, { ...options, headers });
}

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface ProgramItem {
  id: number;
  name: string;
  groub: string;
}

// ─── Helper to sort programs according to saved preferences ─────────────────
function sortProgramsBySavedOrder(programsList: ProgramItem[], savedOrder: string[]): ProgramItem[] {
  if (!savedOrder || savedOrder.length === 0) return programsList;
  const ordered: ProgramItem[] = [];
  const remaining = [...programsList];

  for (const name of savedOrder) {
    if (!name) continue;
    const cleanName = name.trim().toLowerCase();
    const foundIdx = remaining.findIndex((p) => {
      const pName = p.name.trim().toLowerCase();
      return pName === cleanName || cleanName.includes(pName) || pName.includes(cleanName);
    });
    if (foundIdx !== -1) {
      ordered.push(remaining[foundIdx]);
      remaining.splice(foundIdx, 1);
    }
  }

  return [...ordered, ...remaining];
}

export default function StudentPreferencesPage() {
  const router = useRouter();
  const [session, setSessionState] = useState<UserSession | null>(null);
  const [studentName, setStudentName] = useState<string>('');
  const [studentField, setStudentField] = useState<string>('');
  const [studentResult, setStudentResult] = useState<string>('');

  const [programs, setPrograms] = useState<ProgramItem[]>([]);

  // System & Registration State
  const [isSystemOpen, setIsSystemOpen] = useState<boolean>(true);
  const [canStudentRegister, setCanStudentRegister] = useState<boolean>(true);
  const [registrationStateReason, setRegistrationStateReason] = useState<'open' | 'ended' | 'not_started'>('open');

  const [loadingData, setLoadingData] = useState(true);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phone, setPhone] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // ─── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== 'student') {
      router.push('/');
      return;
    }
    setSessionState(s);
    if (s.name && s.name !== 'طالب') {
      setStudentName(s.name);
    }
    if (s.field) {
      setStudentField(s.field === 'Math' ? 'علمي رياضة' : s.field === 'Science' ? 'علمي علوم' : s.field);
    }
    loadStudentData(s.ssn);
  }, [router]);

  // ─── Load Data ─────────────────────────────────────────────────────────────
  const loadStudentData = async (ssn: string) => {
    setLoadingData(true);
    try {
      // 1. التحقق هل مسموح للطالب بالتسجيل حالياً عبر endpoint الطالب
      let studentCanReg = false;
      try {
        const checkRes = await apiCall(`/api/Student/registration-can/${ssn}`);
        if (checkRes.ok) {
          const checkText = (await checkRes.text()).trim();
          try {
            const checkJson = JSON.parse(checkText);
            if (typeof checkJson === 'boolean') studentCanReg = checkJson;
            else if (typeof checkJson?.data === 'boolean') studentCanReg = checkJson.data;
            else if (checkJson?.canRegister !== undefined) studentCanReg = Boolean(checkJson.canRegister);
            else if (checkJson?.isAllowed !== undefined) studentCanReg = Boolean(checkJson.isAllowed);
            else studentCanReg = checkText.toLowerCase() === 'true';
          } catch {
            studentCanReg = checkText.toLowerCase() === 'true';
          }
        }
      } catch {
        studentCanReg = false;
      }

      setCanStudentRegister(studentCanReg);
      setIsSystemOpen(studentCanReg);
      setRegistrationStateReason(studentCanReg ? 'open' : 'ended');

      // 2. التحقق دائماً من وجود نتيجة معلنة للطالب
      try {
        const resultRes = await apiCall(`/api/Student/get-student-result/${ssn}`);
        if (resultRes.ok) {
          const rawText = await resultRes.text().catch(() => '');
          let resStr = '';
          try {
            const resJson = JSON.parse(rawText);
            resStr = typeof resJson === 'string' ? resJson : (resJson?.data || resJson?.result || resJson?.programName || '');
          } catch {
            resStr = rawText.trim().replace(/^"|"$/g, '');
          }
          if (
            resStr &&
            typeof resStr === 'string' &&
            resStr.trim() !== '' &&
            !resStr.toLowerCase().includes('no result') &&
            !resStr.toLowerCase().includes('not found') &&
            resStr !== 'No result available.'
          ) {
            setStudentResult(resStr.trim());
          }
        }
      } catch { /* silent */ }

      // 3. جلب قائمة البرامج المتاحة للطالب
      let fetchedPrograms: ProgramItem[] = [];
      try {
        const progRes = await apiCall(`/api/Student/get-available-programs/${ssn}`);
        if (progRes.ok) {
          const data = await progRes.json().catch(() => null);
          const list = Array.isArray(data) ? data : (data?.$values || data?.data || data?.programs || []);
          if (Array.isArray(list) && list.length > 0) {
            fetchedPrograms = list.map((p: any, idx: number) => ({
              id: p.id ?? idx + 1,
              name: typeof p === 'string' ? p : p.name ?? '',
              groub: typeof p === 'object' ? (p.groub ?? p.group ?? p.department ?? '') : '',
            }));
          }
        }
      } catch { /* silent */ }

      // لو لم نجد برامج عبر endpoint الطالب، نجلب البرامج العامة من GetAllPrograms
      if (fetchedPrograms.length === 0) {
        try {
          const allProgRes = await apiCall('/api/Program/GetAllPrograms');
          if (allProgRes.ok) {
            const allData = await allProgRes.json().catch(() => null);
            const allList = Array.isArray(allData) ? allData : (allData?.$values || allData?.data || []);
            if (Array.isArray(allList) && allList.length > 0) {
              fetchedPrograms = allList.map((p: any, idx: number) => ({
                id: p.id ?? idx + 1,
                name: typeof p === 'string' ? p : p.name ?? '',
                groub: typeof p === 'object' ? (p.groub ?? p.group ?? '') : '',
              }));
            }
          }
        } catch { /* silent */ }
      }

      // 4. قراءة الرغبات المحفوظة محلياً للمتصفح
      let savedOrderFromLocal: string[] = [];
      try {
        const localSaved = localStorage.getItem(`student_prefs_${ssn}`);
        if (localSaved) {
          const parsed = JSON.parse(localSaved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            savedOrderFromLocal = parsed;
          }
        }
        const localSubmitted = localStorage.getItem(`student_submitted_${ssn}`);
        if (localSubmitted === 'true') setIsSubmitted(true);
        const localPhone = localStorage.getItem(`student_phone_${ssn}`);
        if (localPhone) setPhone(localPhone);
      } catch { /* silent */ }

      // 5. تطبيق ترتيب الرغبات المحفوظ مسبقاً
      if (savedOrderFromLocal.length > 0 && fetchedPrograms.length > 0) {
        fetchedPrograms = sortProgramsBySavedOrder(fetchedPrograms, savedOrderFromLocal);
      }

      setPrograms(fetchedPrograms);
    } catch {
      showToast('تعذّر جلب بعض البيانات، تحقق من الاتصال بالنظام', 'error');
    } finally {
      setLoadingData(false);
    }
  };

  // ─── Toast ─────────────────────────────────────────────────────────────────
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ─── Move Up/Down ──────────────────────────────────────────────────────────
  const moveUp = (idx: number) => {
    if (idx <= 0 || isReadOnly) return;
    const updated = [...programs];
    [updated[idx], updated[idx - 1]] = [updated[idx - 1], updated[idx]];
    setPrograms(updated);
  };

  const moveDown = (idx: number) => {
    if (idx >= programs.length - 1 || isReadOnly) return;
    const updated = [...programs];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    setPrograms(updated);
  };

  // ─── Dropdown Rank Change ──────────────────────────────────────────────────
  const handleRankChange = (currentIdx: number, targetRank: number) => {
    if (isReadOnly) return;
    const targetIdx = targetRank - 1;
    if (currentIdx === targetIdx) return;
    const updated = [...programs];
    const [item] = updated.splice(currentIdx, 1);
    updated.splice(targetIdx, 0, item);
    setPrograms(updated);
    showToast(`تم ترتيب (${item.name}) كـ رغبة رقم ${targetRank}`);
  };

  // ─── Submit Preferences ────────────────────────────────────────────────────
  const handleFinalSubmit = async () => {
    if (!phone.trim() || !/^01[0125]\d{8}$/.test(phone.trim())) {
      showToast('يرجى إدخال رقم هاتف مصري صحيح مكون من 11 رقماً', 'error');
      return;
    }

    setSubmitLoading(true);
    try {
      const payload = {
        ssn: session?.ssn?.trim(),
        preferences: programs.map((p, index) => ({
          name: p.name?.trim(),
          order: index + 1,
        })),
      };

      const res = await apiCall('/api/Student/submit-preferences', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const rawText = await res.text().catch(() => '');
      const cleanText = rawText.trim().replace(/^"|"$/g, '');

      // التحقق الصارم من استجابة السيرفر
      const isError = !res.ok ||
        cleanText.toLowerCase().includes('not found') ||
        cleanText.toLowerCase().includes('error') ||
        cleanText.toLowerCase().includes('closed') ||
        cleanText.toLowerCase().includes('fail') ||
        cleanText.includes('غير موجود') ||
        cleanText.includes('مغلق');

      if (!isError) {
        // حفظ رقم الهاتف في قاعدة البيانات عبر Endpoint الجديد
        if (session?.ssn) {
          try {
            await apiCall(`/api/Student/${encodeURIComponent(session.ssn.trim())}/phone-number`, {
              method: 'PUT',
              body: JSON.stringify({ phoneNumber: phone.trim() }),
            });
          } catch { /* silent */ }
        }

        setShowPhoneModal(false);
        setIsSubmitted(true);
        try {
          if (session?.ssn) {
            localStorage.setItem(`student_prefs_${session.ssn}`, JSON.stringify(programs.map((p) => p.name)));
            localStorage.setItem(`student_submitted_${session.ssn}`, 'true');
            localStorage.setItem(`student_phone_${session.ssn}`, phone.trim());
          }
        } catch { /* silent */ }
        showToast('تم حفظ وتأكيد ترتيب رغباتك بنجاح في النظام ✅');
      } else {
        let displayError = cleanText;
        if (cleanText.toLowerCase().includes('user not found') || cleanText.includes('غير موجود')) {
          displayError = `الرقم القومي (${session?.ssn}) غير مسجل في كشوفات الطلاب المرفوعة في النظام. تأكد من قيام الإدارة برفع ملف إكسيل بيانات الطلاب.`;
        } else if (cleanText.toLowerCase().includes('closed') || cleanText.includes('مغلق')) {
          displayError = 'فترة تسجيل الرغبات مغلقة حالياً في النظام من قبل إدارة الكلية.';
        }
        showToast(`لم يتم الحفظ: ${displayError || 'حدث خطأ في النظام'} ❌`, 'error');
      }
    } catch {
      showToast('تعذّر إرسال الرغبات، تحقق من الاتصال بالنظام ❌', 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  // ─── Calculations ──────────────────────────────────────────────────────────
  // الصفحة read-only إذا: النظام مغلق، أو الطالب لا يستطيع التسجيل، أو ظهرت النتيجة
  const isReadOnly = !isSystemOpen || !canStudentRegister || !!studentResult;

  const displayed = programs;

  // ─── Loading Screen ────────────────────────────────────────────────────────
  if (loadingData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: '1.2rem', background: 'var(--bg-dark)' }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid rgba(0, 212, 184, 0.2)',
          borderTop: '4px solid var(--accent)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <h3 style={{ color: 'var(--text-main)', fontSize: '1.1rem' }}>جاري تحميل بيانات الطالب والبرامج...</h3>
      </div>
    );
  }

  // ─── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)', paddingBottom: '3rem' }}>
      {/* Header */}
      <header className="app-header">
        <div className="header-brand">
          <img src="/images/science-logo.png" alt="Logo" className="header-logo" />
          <div>
            <div className="header-title" style={{ fontWeight: 800 }}>كلية العلوم – جامعة قناة السويس</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>منظومة التنسيق الداخلي للفرقة الأولى</div>
          </div>
        </div>

        <div className="header-user">
          <div style={{ textAlign: 'left', lineHeight: '1.3' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {studentName || 'طالب الفرقة الأولى'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', direction: 'ltr' }}>
              •••••{session?.ssn ? session.ssn.slice(-5) : ''}
            </div>
          </div>
          <button onClick={() => { clearSession(); window.location.href = '/'; }} className="btn-logout" title="تسجيل الخروج">
            تسجيل الخروج
          </button>
        </div>
      </header>

      <main className="student-container">
        {/* Banner */}
        <section className="student-info-banner">
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-main)', margin: '0 0 0.35rem 0' }}>
              أهلاً بك في كلية العلوم.. كلية العظماء ومصنع العلماء
            </h2>
            <p style={{ color: 'var(--accent)', fontSize: '0.95rem', fontWeight: 700, margin: '0.2rem 0 0.4rem 0' }}>
              مرحباً بك يا {studentName || 'طالب المستقبل'}، خطوتك الأولى نحو التميز العلمي والابتكار.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: 0 }}>
              {studentResult
                ? `🎉 تهانينا! تم إعلان نتيجة التنسيق والتشعيب الداخلي الخاصة بك: تم ترشيحك لبرنامج (${studentResult})`
                : isReadOnly
                ? registrationStateReason === 'ended'
                  ? 'انتهت فترة التسجيل... ستظهر النتيجة قريباً ⏳'
                  : 'فترة تسجيل الرغبات لم تبدأ بعد لهذا الحساب. يمكنك الاطلاع على البرامج المتاحة لحين فتح باب التسجيل.'
                : isSubmitted
                  ? 'تم حفظ رغباتك مسبقاً. يمكنك تعديل ترتيب الرغبات والضغط على "تعديل وحفظ ترتيب الرغبات" في أي وقت طالما فترة التسجيل مفتوحة.'
                  : 'قم بترتيب الرغبات حسب أولوياتك واضغط على "حفظ وتأكيد ترتيب الرغبات" عند الانتهاء.'}
            </p>
          </div>

          <div className="student-info-pills">
            <span className="pill-badge" style={{ background: 'rgba(0, 212, 184, 0.12)', color: 'var(--accent)', direction: 'ltr' }}>
              الرقم القومي: •••••{session?.ssn ? session.ssn.slice(-5) : ''}
            </span>
            {studentField && (
              <span className="pill-badge" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}>
                الشعبة: {studentField}
              </span>
            )}
            <span className="pill-badge">
              عدد البرامج: {programs.length}
            </span>
          </div>
        </section>

        {/* Status Alert Banners */}
        {studentResult ? (
          <div style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(6, 95, 70, 0.35) 100%)',
            border: '2px solid rgba(16, 185, 129, 0.75)',
            color: '#ffffff',
            padding: '1.6rem 2rem',
            borderRadius: 'var(--radius)',
            marginBottom: '1.8rem',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(16, 185, 129, 0.25)',
          }}>
            <div style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>🎉 🎓 🎉</div>
            <div style={{ fontSize: '1.05rem', color: '#a7f3d0', fontWeight: 700, marginBottom: '0.4rem' }}>
              ظهرت النتيجة الرسمية للتنسيق والتشعيب الداخلي
            </div>
            <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#34d399', margin: '0.5rem 0 0.3rem 0' }}>
              نتيجتك هي:{' '}
              <span style={{
                color: '#ffffff',
                textDecoration: 'underline',
                padding: '2px 12px',
                background: 'rgba(255,255,255,0.12)',
                borderRadius: '6px',
              }}>
                {studentResult}
              </span>
            </div>
            <p style={{ fontSize: '0.92rem', color: '#d1fae5', margin: '0.6rem 0 0 0' }}>
              ألف مبروك! مع أطيب تمنيات إدارة الكلية بالتوفيق والنجاح 🌟
            </p>
            <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', margin: '0.35rem 0 0 0' }}>
              ⚠️ انتهت فترة تعديل الرغبات — ترتيب رغباتك المحفوظ معروض أدناه للاطلاع فقط.
            </p>
          </div>
        ) : (
          registrationStateReason === 'ended' && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#fca5a5',
              padding: '1.2rem 1.5rem',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '1.5rem',
              fontWeight: 800,
              fontSize: '1.05rem',
              lineHeight: '1.6',
              textAlign: 'center',
            }}>
              انتهت فترة التسجيل... ستظهر النتيجة قريباً ⏳
            </div>
          )
        )}

        {registrationStateReason === 'not_started' && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            color: '#fde68a',
            padding: '1.1rem 1.4rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.5rem',
            fontWeight: 700,
            fontSize: '0.95rem',
            lineHeight: '1.6'
          }}>
            فترة تسجيل الرغبات لم تبدأ بعد لهذا الحساب. يمكنك الاطلاع على البرامج المتاحة لحين فتح باب التسجيل.
          </div>
        )}

        {isSubmitted && !isReadOnly && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            color: '#6ee7b7',
            padding: '1.1rem 1.4rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.5rem',
            fontWeight: 700,
            fontSize: '0.95rem',
            lineHeight: '1.6'
          }}>
            تم حفظ وتأكيد رغباتك بنجاح في النظام ✅ يمكنك تعديل ترتيب الرغبات والضغط على "تعديل وحفظ ترتيب الرغبات" في أي وقت طالما باب التسجيل مفتوح.
          </div>
        )}

        {/* Instructions Card (Only when editing is allowed) */}
        {!isReadOnly && (
          <section className="preferences-instructions">
            <div style={{ flex: 1 }}>
              <strong>طريقة الترتيب:</strong> يمكنك تغيير ترتيب أي رغبة إما باختيار رقم الرغبة من القائمة المنسدلة، أو باستخدام أزرار التقديم والتأخير بجانب كل برنامج.
            </div>
          </section>
        )}

        {/* Programs List */}
        {programs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: 'var(--surface-card)', borderRadius: 'var(--radius)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
            لا توجد برامج متاحة حالياً. يرجى مراجعة إدارة الكلية.
          </div>
        ) : (
          <section className="preferences-list">
            {displayed.map((program) => {
              const realIdx = programs.findIndex((p) => p.id === program.id);
              const rank = realIdx + 1;
              return (
                <div
                  key={program.id}
                  className="preference-item-card"
                  style={{
                    borderColor: rank === 1 ? 'var(--accent)' : 'var(--border-color)',
                    background: rank === 1 ? 'rgba(0, 212, 184, 0.06)' : 'var(--surface-card)',
                  }}
                >
                  {/* Main Info (Rank + Name + Badges) */}
                  <div className="pref-main-info">
                    <div className="pref-rank-badge" style={{
                      background: rank === 1 ? 'var(--primary)' : 'rgba(0, 168, 150, 0.18)',
                      color: rank === 1 ? '#ffffff' : 'var(--accent)',
                    }}>
                      {rank}
                    </div>

                    <div className="pref-title-group">
                      <div className="pref-title">{program.name}</div>
                      {program.groub && (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                          <span className="badge badge-ghost" style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}>
                            {program.groub === 'Math' ? 'علمي رياضة' : program.groub === 'Science' ? 'علمي علوم' : program.groub === 'Both' ? 'علمي علوم ورياضة' : program.groub}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Controls (Select + Move Buttons) - Fully Responsive */}
                  <div className="pref-card-controls">
                    <select
                      className="form-select pref-select-mobile"
                      style={{
                        padding: '0.45rem 0.75rem',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: 'var(--accent)',
                        opacity: isReadOnly ? 0.7 : 1,
                        cursor: isReadOnly ? 'not-allowed' : 'pointer'
                      }}
                      value={rank}
                      onChange={(e) => handleRankChange(realIdx, Number(e.target.value))}
                      disabled={isReadOnly}
                    >
                      {programs.map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          الرغبة رقم {i + 1}
                        </option>
                      ))}
                    </select>

                    <div className="pref-controls">
                      <button
                        type="button"
                        className="btn-move"
                        onClick={() => moveUp(realIdx)}
                        disabled={realIdx === 0 || isReadOnly}
                        title="تقديم لأعلى"
                        aria-label="تقديم لأعلى"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="btn-move"
                        onClick={() => moveDown(realIdx)}
                        disabled={realIdx === programs.length - 1 || isReadOnly}
                        title="تأخير لأسفل"
                        aria-label="تأخير لأسفل"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Submit Button or Closed Notice */}
        {programs.length > 0 && (
          isReadOnly ? (
            registrationStateReason === 'ended' ? (
              <div style={{
                textAlign: 'center',
                padding: '1.2rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
                color: '#fca5a5',
                fontWeight: 800,
                fontSize: '1.1rem',
                marginTop: '1.8rem'
              }}>
                انتهت فترة التسجيل... ستظهر النتيجة قريباً ⏳
              </div>
            ) : null
          ) : (
            <button type="button" className="btn-submit-preferences" onClick={() => setShowPhoneModal(true)}>
              {isSubmitted ? 'تعديل وحفظ ترتيب الرغبات' : 'حفظ وتأكيد ترتيب الرغبات'}
            </button>
          )
        )}
      </main>

      {/* Modal: Phone Confirmation */}
      {showPhoneModal && (
        <div className="modal-overlay" onClick={() => setShowPhoneModal(false)}>
          <div className="modal-content-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title" style={{ fontSize: '1.25rem', marginBottom: '0.6rem' }}>تأكيد حفظ الرغبات</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.2rem', lineHeight: 1.6 }}>
              يرجى إدخال رقم هاتفك المحمول لتأكيد اعتماد الترتيب الحالي في النظام.
            </p>

            {/* Preview: Top 3 Choices */}
            <div style={{ background: 'var(--surface-dark)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.85rem', marginBottom: '1.2rem', fontSize: '0.88rem' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem', fontWeight: 700 }}>معاينة الرغبات الأولى:</div>
              {programs.slice(0, 3).map((p, i) => (
                <div key={p.id} style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-main)', marginBottom: 4 }}>
                  <strong>الرغبة {i + 1}:</strong> {p.name}
                </div>
              ))}
              {programs.length > 3 && (
                <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                  ... بالإضافة إلى {programs.length - 3} رغبات أخرى
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">رقم الهاتف المحمول (11 رقماً) *</label>
              <input
                className="form-input"
                type="tel"
                placeholder="01012345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                maxLength={11}
                inputMode="numeric"
              />
            </div>

            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setShowPhoneModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleFinalSubmit} disabled={submitLoading}>
                {submitLoading ? 'جاري الحفظ...' : 'تأكيد وحفظ نهائي'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
