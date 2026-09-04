'use client';

import { useState, useEffect, ChangeEvent } from 'react';
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
interface StudentRecord {
  id: number;
  name: string;
  ssn: string;
  field: 'Math' | 'Science';
  status: 'registered' | 'pending';
  firstChoice: string;
  phoneNumber?: string;
  isRegistrationOpen?: boolean;
  preferences?: { name: string; order?: number }[];
}

interface ProgramRecord {
  id: number;
  name: string;
  groub: string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [session, setSessionState] = useState<UserSession | null>(null);

  // System State
  const [isSystemOpen, setIsSystemOpen] = useState(true);
  const [lastSystemChangeDate, setLastSystemChangeDate] = useState('');

  // Stats
  const [mathCount, setMathCount] = useState(0);
  const [scienceCount, setScienceCount] = useState(0);
  const [registeredMath, setRegisteredMath] = useState(0);
  const [registeredScience, setRegisteredScience] = useState(0);

  // Charts
  const [mathChartData, setMathChartData] = useState<{ name: string; count: number; pct: number }[]>([]);
  const [scienceChartData, setScienceChartData] = useState<{ name: string; count: number; pct: number }[]>([]);

  // Modals & Notifications
  const [downloadModal, setDownloadModal] = useState<{ show: boolean; track: 'Math' | 'Science' | null }>({ show: false, track: null });
  const [addProgramModal, setAddProgramModal] = useState(false);
  const [deleteAllStudentsModal, setDeleteAllStudentsModal] = useState(false);
  const [openRegModal, setOpenRegModal] = useState(false);
  const [openRegSsn, setOpenRegSsn] = useState('');
  const [uploadingState, setUploadingState] = useState<{
    isUploading: boolean;
    title: string;
    fileName: string;
    count?: number;
    statusText?: string;
  } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Students & Search Tab
  const [adminViewTab, setAdminViewTab] = useState<'students' | 'programs'>('students');
  const [ssnSearch, setSsnSearch] = useState('');
  const [ssnSearchLoading, setSsnSearchLoading] = useState(false);
  const [ssnSearchError, setSsnSearchError] = useState('');
  const [searchedStudent, setSearchedStudent] = useState<StudentRecord | null>(null);

  // Programs Management
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTrack, setFilterTrack] = useState<'All' | 'Math' | 'Science'>('All');
  const [newProgram, setNewProgram] = useState({ name: '', groub: 'Math' });
  const [deleteProgramConfirm, setDeleteProgramConfirm] = useState<{ id: number; name: string } | null>(null);

  // ─── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== 'admin') {
      router.push('/');
      return;
    }
    setSessionState(s);
    fetchSystemStatus();
    fetchStats();
    fetchCharts();
    fetchPrograms();
  }, [router]);

  // ─── Toast ─────────────────────────────────────────────────────────────────
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 5000);
  };

  // ─── System Status ─────────────────────────────────────────────────────────
  // GET /api/Admin/Get-Registration-Status
  const fetchSystemStatus = async () => {
    try {
      const res = await apiCall('/api/Admin/Get-Registration-Status');
      if (res.ok) {
        const text = (await res.text()).trim().replace(/^"|"$/g, '').toLowerCase();
        const isOpen = text === 'open' || text === 'true';
        setIsSystemOpen(isOpen);
        // استرجاع التاريخ المحفوظ من localStorage
        const savedDate = localStorage.getItem('reg_last_change_date');
        const savedState = localStorage.getItem('reg_last_state');
        if (savedDate) {
          setLastSystemChangeDate(savedDate);
        } else {
          // لو مفيش تاريخ محفوظ نعرض اليوم كتاريخ افتراضي
          setLastSystemChangeDate(new Date().toLocaleDateString('ar-EG'));
        }
        // لو الحالة اتغيرت من برّا النظام (مثلاً أدمن تاني فتح/قفل)
        if (savedState && savedState !== (isOpen ? 'open' : 'closed')) {
          const now = new Date().toLocaleDateString('ar-EG');
          setLastSystemChangeDate(now);
          localStorage.setItem('reg_last_change_date', now);
          localStorage.setItem('reg_last_state', isOpen ? 'open' : 'closed');
        } else if (!savedState) {
          localStorage.setItem('reg_last_state', isOpen ? 'open' : 'closed');
        }
      }
    } catch { /* silent */ }
  };

  // POST /api/Admin/Open-Registration  → { ssn: null, start: date }
  // POST /api/Admin/Close-Registration → { ssn: null, end: date }
  const toggleSystemState = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayAr = new Date().toLocaleDateString('ar-EG');
      const adminSsn = session?.ssn || null;
      if (isSystemOpen) {
        const res = await apiCall('/api/Admin/Close-Registration', {
          method: 'POST',
          body: JSON.stringify({ ssn: adminSsn, end: today }),
        });
        if (res.ok) {
          setIsSystemOpen(false);
          setLastSystemChangeDate(todayAr);
          localStorage.setItem('reg_last_change_date', todayAr);
          localStorage.setItem('reg_last_state', 'closed');
          showToast('تم قفل نظام التنسيق بنجاح 🔒');
        } else {
          const err = await res.text().catch(() => '');
          showToast(`تعذّر قفل النظام: ${err || 'حاول مجدداً'} ❌`, 'error');
        }
      } else {
        const res = await apiCall('/api/Admin/Open-Registration', {
          method: 'POST',
          body: JSON.stringify({ ssn: adminSsn, start: today }),
        });
        if (res.ok) {
          setIsSystemOpen(true);
          setLastSystemChangeDate(todayAr);
          localStorage.setItem('reg_last_change_date', todayAr);
          localStorage.setItem('reg_last_state', 'open');
          showToast('تم فتح نظام التنسيق بنجاح ✅');
        } else {
          const err = await res.text().catch(() => '');
          showToast(`تعذّر فتح النظام: ${err || 'حاول مجدداً'} ❌`, 'error');
        }
      }
    } catch {
      showToast('خطأ في الاتصال بالنظام ❌', 'error');
    }
  };

  // ─── Fetch Stats ─────────────────────────────────────────────────────────
  // GET /api/Admin/GetCountStudent (إجمالي طلاب الكلية)
  // GET /api/Admin/Get-Registration-Count-Per-Field (الطلاب المسجلين)
  const fetchStats = async () => {
    try {
      const [countRes, regRes] = await Promise.all([
        apiCall('/api/Admin/GetCountStudent').catch(() => null),
        apiCall('/api/Admin/Get-Registration-Count-Per-Field').catch(() => null),
      ]);

      if (countRes && countRes.ok) {
        const countData = await countRes.json().catch(() => ({}));
        setMathCount(countData.Math ?? countData.math ?? 0);
        setScienceCount(countData.Science ?? countData.science ?? 0);
      }

      if (regRes && regRes.ok) {
        const regData = await regRes.json().catch(() => ({}));
        let m = 0;
        let s = 0;
        if (Array.isArray(regData)) {
          for (const item of regData) {
            const field = (item.field || item.name || item.track || '').toString().toLowerCase();
            const val = Number(item.count || item.total || item.registered || 0);
            if (field.includes('math') || field.includes('رياض')) m += val;
            if (field.includes('sci') || field.includes('علوم')) s += val;
          }
        } else if (typeof regData === 'object' && regData !== null) {
          m = Number(regData.Math ?? regData.math ?? regData['علمي رياضة'] ?? regData['رياضة'] ?? 0);
          s = Number(regData.Science ?? regData.science ?? regData['علمي علوم'] ?? regData['علوم'] ?? 0);
        }
        setRegisteredMath(m);
        setRegisteredScience(s);
      }
    } catch { /* silent */ }
  };

  // ─── Fetch Programs ───────────────────────────────────────────────────────
  // GET /api/Program/GetAllPrograms
  const fetchPrograms = async () => {
    try {
      const res = await apiCall('/api/Program/GetAllPrograms');
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.$values || data?.data || []);
        if (Array.isArray(list)) {
          setPrograms(list.map((p: any, idx: number) => ({
            id: p.id ?? idx + 1,
            name: typeof p === 'string' ? p : (p.name ?? ''),
            groub: typeof p === 'object' ? (p.groub ?? p.group ?? 'Both') : 'Both',
          })));
        }
      }
    } catch { /* silent */ }
  };

  // ─── Fetch Charts ─────────────────────────────────────────────────────────
  // GET /api/Admin/Get-First-Choice-Statistics/{field}
  const fetchCharts = async () => {
    try {
      const [mRes, sRes] = await Promise.all([
        apiCall('/api/Admin/Get-First-Choice-Statistics/Math').catch(() => null),
        apiCall('/api/Admin/Get-First-Choice-Statistics/Science').catch(() => null),
      ]);
      if (mRes?.ok) {
        const d = await mRes.json().catch(() => []);
        const list = Array.isArray(d) ? d : (d?.$values || d?.data || []);
        if (Array.isArray(list)) {
          const total = list.reduce((sum: number, x: any) => sum + (Number(x.count || x.studentCount) || 0), 0) || 1;
          setMathChartData(list.map((x: any) => ({
            name: x.name || x.programName || x.program || '—',
            count: Number(x.count || x.studentCount || 0),
            pct: Math.round(((Number(x.count || x.studentCount || 0)) / total) * 100)
          })));
        }
      }
      if (sRes?.ok) {
        const d = await sRes.json().catch(() => []);
        const list = Array.isArray(d) ? d : (d?.$values || d?.data || []);
        if (Array.isArray(list)) {
          const total = list.reduce((sum: number, x: any) => sum + (Number(x.count || x.studentCount) || 0), 0) || 1;
          setScienceChartData(list.map((x: any) => ({
            name: x.name || x.programName || x.program || '—',
            count: Number(x.count || x.studentCount || 0),
            pct: Math.round(((Number(x.count || x.studentCount || 0)) / total) * 100)
          })));
        }
      }
    } catch { /* silent */ }
  };

  const handleLogout = () => { clearSession(); router.push('/'); };

  // ─── Excel Upload (Students & Results) ─────────────────────────────────────
  // POST /api/Excel/importStudentData   (الملف: file)
  // POST /api/Excel/importStudentResult (الملف: file)
  const handleExcelUpload = async (e: ChangeEvent<HTMLInputElement>, type: 'Placement' | 'Result') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const title = type === 'Placement' ? 'رفع وتجهيز بيانات الطلاب' : 'رفع وتجهيز نتيجة التنسيق';
    const initialTotal = (mathCount || 0) + (scienceCount || 0);

    setUploadingState({
      isUploading: true,
      title,
      fileName: file.name,
      count: initialTotal,
      statusText: 'جاري إرسال الملف وبدء حفظ البيانات في قاعدة البيانات...',
    });

    const formData = new FormData();
    formData.append('file', file);
    const endpoint = type === 'Placement' ? '/api/Excel/importStudentData' : '/api/Excel/importStudentResult';

    // فحص عدد الطلاب المسجلين حالياً من قاعدة البيانات
    const checkLiveCount = async (): Promise<number> => {
      try {
        const cRes = await apiCall('/api/Admin/GetCountStudent');
        if (cRes.ok) {
          const cData = await cRes.json().catch(() => ({}));
          const m = Number(cData.Math ?? cData.math ?? 0);
          const s = Number(cData.Science ?? cData.science ?? 0);
          setMathCount(m);
          setScienceCount(s);
          return m + s;
        }
      } catch { /* silent */ }
      return -1;
    };

    let isPolling = true;
    let latestCount = initialTotal;

    // متابعة مستمرة للعدد كل ثانيتين
    const pollInterval = setInterval(async () => {
      if (!isPolling) return;
      if (type === 'Placement') {
        const live = await checkLiveCount();
        if (live >= 0) {
          latestCount = live;
          setUploadingState((prev) =>
            prev
              ? {
                  ...prev,
                  count: live,
                  statusText:
                    live > initialTotal
                      ? `جاري حفظ الطلاب في قاعدة البيانات... تم تسجيل ${live} طالب حتى الآن`
                      : 'جاري قراءة واستيراد بيانات الطلاب في قاعدة البيانات...',
                }
              : null
          );
        }
      }
    }, 2000);

    try {
      const res = await apiCall(endpoint, { method: 'POST', body: formData });

      if (res.ok) {
        // انتهى الطلب بنجاح
        isPolling = false;
        clearInterval(pollInterval);
        await Promise.all([fetchStats(), fetchCharts(), fetchPrograms()]);
        showToast(`تم رفع ومعالجة ملف ${type === 'Placement' ? 'بيانات الطلاب' : 'النتيجة'} (${file.name}) بنجاح ✅`);
        setUploadingState(null);
      } else {
        const errText = await res.text().catch(() => '');

        // إذا كان ملف طلاب والطلب انتهى أو عمل timeout لكن الطلاب عمالين يزيدوا في قاعدة البيانات:
        if (type === 'Placement') {
          setUploadingState((prev) =>
            prev
              ? {
                  ...prev,
                  statusText: 'جاري التحقق من استمرار استيراد الطلاب في قاعدة البيانات...',
                }
              : null
          );

          await new Promise((r) => setTimeout(r, 2500));
          const countAfter = await checkLiveCount();

          if (countAfter > initialTotal) {
            // السيرفر ما زال يدرج الطلاب في الخلفية! ننتظر حتى يستقر العدد لـ 3 دورات متتالية
            let stableRounds = 0;
            let lastObserved = countAfter;

            while (stableRounds < 3) {
              await new Promise((r) => setTimeout(r, 2500));
              const currentObserved = await checkLiveCount();
              if (currentObserved > lastObserved) {
                lastObserved = currentObserved;
                stableRounds = 0;
                setUploadingState((prev) =>
                  prev
                    ? {
                        ...prev,
                        count: currentObserved,
                        statusText: `السيرفر يواصل حفظ الطلاب في قاعدة البيانات... تم تسجيل ${currentObserved} طالب حتى الآن`,
                      }
                    : null
                );
              } else {
                stableRounds++;
              }
            }

            isPolling = false;
            clearInterval(pollInterval);
            await Promise.all([fetchStats(), fetchCharts(), fetchPrograms()]);
            showToast(`اكتمل استيراد بيانات الطلاب بنجاح (إجمالي الطلاب: ${lastObserved}) ✅`);
            setUploadingState(null);
            return;
          }
        }

        isPolling = false;
        clearInterval(pollInterval);
        showToast(`فشل معالجة الملف: ${errText || 'حدث خطأ أثناء قراءة ملف الإكسيل'} ❌`, 'error');
        setUploadingState(null);
      }
    } catch {
      // في حالة انقطاع اتصال fetch أو timeout بالشبكة:
      if (type === 'Placement') {
        setUploadingState((prev) =>
          prev
            ? {
                ...prev,
                statusText: 'استغرق الرفع وقتاً، جاري متابعة استكمال السيرفر لتخزين البيانات...',
              }
            : null
        );

        await new Promise((r) => setTimeout(r, 2500));
        const countAfter = await checkLiveCount();

        if (countAfter > initialTotal) {
          let stableRounds = 0;
          let lastObserved = countAfter;

          while (stableRounds < 3) {
            await new Promise((r) => setTimeout(r, 2500));
            const currentObserved = await checkLiveCount();
            if (currentObserved > lastObserved) {
              lastObserved = currentObserved;
              stableRounds = 0;
              setUploadingState((prev) =>
                prev
                  ? {
                      ...prev,
                      count: currentObserved,
                      statusText: `السيرفر يواصل حفظ الطلاب في قاعدة البيانات... (${currentObserved} طالب)`,
                    }
                  : null
              );
            } else {
              stableRounds++;
            }
          }

          isPolling = false;
          clearInterval(pollInterval);
          await Promise.all([fetchStats(), fetchCharts(), fetchPrograms()]);
          showToast(`اكتمل استيراد وحفظ بيانات الطلاب في قاعدة البيانات (إجمالي الطلاب: ${lastObserved}) ✅`);
          setUploadingState(null);
          return;
        }
      }

      isPolling = false;
      clearInterval(pollInterval);
      showToast('تعذّر إرسال الملف، تحقق من الاتصال بالنظام ❌', 'error');
      setUploadingState(null);
    } finally {
      isPolling = false;
      clearInterval(pollInterval);
      e.target.value = '';
    }
  };

  // ─── Download PDF for specific student ────────────────────────────────────
  // GET /api/Admin/Generate-Student-Preferences-Pdf/{ssn}
  const handleDownloadStudentPdf = async (ssn: string, name: string) => {
    showToast(`جاري تجهيز استمارة رغبات (${name})... ⏳`);
    try {
      const res = await apiCall(`/api/Admin/Generate-Student-Preferences-Pdf/${encodeURIComponent(ssn)}`);

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `رغبات_${name || ssn}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        showToast(`تم تحميل استمارة رغبات (${name}) بنجاح 📄`);
      } else {
        const errText = await res.text().catch(() => '');
        const cleanErr = errText.trim().replace(/^"|"$/g, '');
        if (cleanErr.toLowerCase().includes('no data') || cleanErr.toLowerCase().includes('not found')) {
          showToast(`لم يسجّل الطالب (${name}) رغباته بعد في النظام ⚠️`, 'error');
        } else {
          showToast(`فشل استخراج الاستمارة (${res.status}): ${cleanErr || 'حدث خطأ'} ❌`, 'error');
        }
      }
    } catch {
      showToast('تعذّر تحميل الاستمارة، تحقق من الاتصال بالنظام ❌', 'error');
    }
  };

  // ─── Download Modal Handler ───────────────────────────────────────────────
  const handleFileDownload = async (type: 'Excel' | 'PDF' | 'RegisteredPDF' | 'AllExcel') => {
    const track = downloadModal.track || 'Math';
    const trackLabel = track === 'Math' ? 'علمي_رياضة' : 'علمي_علوم';
    let fileName = '';
    let endpoint = '';

    if (type === 'Excel') {
      fileName = `${trackLabel}.xlsx`;
      endpoint = `/api/Admin/Export-File/${encodeURIComponent(track)}`;
    } else if (type === 'AllExcel') {
      fileName = `جميع_الطلاب.xlsx`;
      endpoint = `/api/Admin/Export-File/All`;
    } else if (type === 'PDF') {
      fileName = `${trackLabel}_استمارات_الرغبات.pdf`;
      endpoint = `/api/Admin/Generate-All-Students-Preferences-Pdf?filter=${encodeURIComponent(track)}`;
    } else if (type === 'RegisteredPDF') {
      fileName = `${trackLabel}_المسجلين_فقط.pdf`;
      endpoint = `/api/Admin/registered-students-pdf?filter=${encodeURIComponent(track)}`;
    }

    showToast(`جاري تجهيز وتحميل ملف ${fileName}... ⏳`);
    try {
      const res = await apiCall(endpoint);

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        showToast(`تم تحميل ملف ${fileName} بنجاح ✅`);
      } else {
        const errText = await res.text().catch(() => '');
        showToast(`فشل تحميل الملف (${res.status}): ${errText || 'حدث خطأ'} ❌`, 'error');
      }
    } catch {
      showToast('تعذّر تحميل الملف، تحقق من الاتصال بالنظام ❌', 'error');
    }
    setDownloadModal({ show: false, track: null });
  };

  // ─── Search Student by SSN ────────────────────────────────────────────────
  // GET /api/Admin/Get-Student-By-SSN/{ssn}
  const handleSsnSearch = async () => {
    if (!ssnSearch.trim() || ssnSearch.trim().length < 5) {
      setSsnSearchError('أدخل رقم قومي صحيح للبحث');
      return;
    }
    setSsnSearchLoading(true);
    setSsnSearchError('');
    setSearchedStudent(null);
    try {
      const res = await apiCall(`/api/Admin/Get-Student-By-SSN/${ssnSearch.trim()}`);
      if (res.ok) {
        const data = await res.json();
        const rawPrefs = data.preferences?.$values || (Array.isArray(data.preferences) ? data.preferences : []);
        const prefs = rawPrefs.map((p: any, idx: number) => ({
          name: typeof p === 'string' ? p : p.name || p.programName || `رغبة #${idx + 1}`,
          order: typeof p === 'object' ? (p.order ?? idx + 1) : idx + 1,
        }));
        const isOpen = data.isRegistrationOpen ?? data.isRegister ?? true;
        setSearchedStudent({
          id: data.id || Date.now(),
          ssn: data.ssn || ssnSearch.trim(),
          name: data.name || data.studentName || 'غير معروف',
          field: data.field || data.track || 'Math',
          status: data.isRegistered ? 'registered' : 'pending',
          phoneNumber: data.phoneNumber || data.phone || '',
          isRegistrationOpen: isOpen,
          firstChoice: data.firstChoice || data.firstPreference || (prefs[0]?.name) || '—',
          preferences: prefs,
        });
      } else if (res.status === 404) {
        setSsnSearchError('لم يُعثر على طالب بهذا الرقم القومي');
      } else {
        setSsnSearchError('حدث خطأ أثناء البحث');
      }
    } catch { setSsnSearchError('تعذّر الاتصال بالنظام'); }
    finally { setSsnSearchLoading(false); }
  };

  // ─── Open / Close Registration for Student ────────────────────────────────
  // POST /api/Admin/Open-RegisterationToStudent  →  { ssn, isRegister: bool }
  const handleToggleStudentReg = async (ssn: string, shouldOpen: boolean) => {
    if (!ssn.trim()) return;
    try {
      const res = await apiCall('/api/Admin/Open-RegisterationToStudent', {
        method: 'POST',
        body: JSON.stringify({ ssn: ssn.trim(), isRegister: shouldOpen }),
      });
      if (res.ok) {
        showToast(shouldOpen ? `تم فتح التسجيل للطالب (${ssn}) بنجاح 🔓` : `تم قفل التسجيل للطالب (${ssn}) بنجاح 🔒`);
        if (searchedStudent && searchedStudent.ssn === ssn) {
          setSearchedStudent({ ...searchedStudent, isRegistrationOpen: shouldOpen });
        }
        setOpenRegModal(false);
        setOpenRegSsn('');
      } else {
        showToast('فشل تعديل حالة تسجيل الطالب ❌', 'error');
      }
    } catch { showToast('تعذّر الاتصال بالنظام ❌', 'error'); }
  };

  const handleOpenRegForStudent = async () => {
    if (!openRegSsn.trim()) { showToast('أدخل الرقم القومي أولاً ❌', 'error'); return; }
    await handleToggleStudentReg(openRegSsn.trim(), true);
  };

  // ─── Delete All Students ──────────────────────────────────────────────────
  // DELETE /api/Admin/delete-all-students
  const handleDeleteAllStudents = async () => {
    try {
      const res = await apiCall('/api/Admin/delete-all-students', { method: 'DELETE' });
      if (res.ok) {
        setSearchedStudent(null);
        setMathCount(0); setScienceCount(0);
        setRegisteredMath(0); setRegisteredScience(0);
        setMathChartData([]); setScienceChartData([]);
        setDeleteAllStudentsModal(false);
        showToast('تم مسح جميع بيانات الطلاب بالكامل من النظام ⚠️', 'error');
      } else { showToast('فشل المسح ❌', 'error'); }
    } catch { showToast('تعذّر الاتصال بالنظام ❌', 'error'); }
  };

  // ─── Add Program ──────────────────────────────────────────────────────────
  // POST /api/Program/AddNewProgram  →  { name, groub }
  const handleAddProgram = async () => {
    if (!newProgram.name.trim()) { showToast('يرجى كتابة اسم البرنامج ❌', 'error'); return; }
    try {
      const res = await apiCall('/api/Program/AddNewProgram', {
        method: 'POST',
        body: JSON.stringify({ name: newProgram.name.trim(), groub: newProgram.groub.trim() }),
      });
      if (res.ok) {
        await fetchPrograms();
        setAddProgramModal(false);
        setNewProgram({ name: '', groub: 'Math' });
        showToast(`تمت إضافة البرنامج (${newProgram.name}) بنجاح ✅`);
      } else { showToast('فشل الإضافة ❌', 'error'); }
    } catch { showToast('تعذّر الاتصال بالنظام ❌', 'error'); }
  };

  // ─── Delete Program ───────────────────────────────────────────────────────
  // DELETE /api/Program/DeleteProgram/{name}
  const handleDeleteProgram = async (id: number, name: string) => {
    try {
      const res = await apiCall(`/api/Program/DeleteProgram/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchPrograms();
        showToast(`تم حذف البرنامج (${name}) 🗑️`);
      } else { showToast('فشل حذف البرنامج ❌', 'error'); }
    } catch { showToast('تعذّر الاتصال بالنظام ❌', 'error'); }
  };

  // ─── Filtered lists ───────────────────────────────────────────────────────
  const filteredPrograms = programs.filter((p) => {
    const matchSearch = p.name.includes(searchQuery) || p.groub.includes(searchQuery);
    const matchTrack = filterTrack === 'All' || p.groub === filterTrack || p.groub === 'Both';
    return matchSearch && matchTrack;
  });

  const mathRegPct    = mathCount    > 0 ? Math.round((registeredMath    / mathCount)    * 100) : 0;
  const scienceRegPct = scienceCount > 0 ? Math.round((registeredScience / scienceCount) * 100) : 0;

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* App Header */}
      <header className="app-header">
        <div className="header-brand">
          <img src="/images/science-logo.png" alt="Logo" className="header-logo" />
          <div>
            <div className="header-title" style={{ fontWeight: 800 }}>لوحة تحكم الإدارة – كلية العلوم</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>منظومة التنسيق الداخلي والتشعيب</div>
          </div>
        </div>
        <div className="header-user">
          <div style={{ textAlign: 'left', lineHeight: '1.3' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {session?.name || 'مدير النظام'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--accent)' }}>
              حساب المشرف
            </div>
          </div>
          <button onClick={handleLogout} className="btn-logout">تسجيل الخروج</button>
        </div>
      </header>

      <main className="dashboard-container">

        {/* Row 1: Key Metrics */}
        <section className="stats-grid">
          <div className="stat-card-widget">
            <div className="stat-widget-info">
              <div className="val">{mathCount}</div>
              <div className="lbl">إجمالي طلاب علمي رياضة</div>
            </div>
          </div>
          <div className="stat-card-widget">
            <div className="stat-widget-info">
              <div className="val">{scienceCount}</div>
              <div className="lbl">إجمالي طلاب علمي علوم</div>
            </div>
          </div>
          <div className="stat-card-widget">
            <div className="stat-widget-info">
              <div className="val" style={{ color: isSystemOpen ? 'var(--success)' : 'var(--danger)', fontSize: '1.4rem' }}>
                {isSystemOpen ? 'مفتوح للتسجيل' : 'مغلق'}
              </div>
              <div className="lbl">حالة نظام تنسيق الرغبات</div>
            </div>
          </div>
          <div className="stat-card-widget">
            <div className="stat-widget-info">
              <div className="val" style={{ fontSize: '1.15rem' }}>{lastSystemChangeDate}</div>
              <div className="lbl">{isSystemOpen ? 'تاريخ فتح النظام' : 'تاريخ إغلاق النظام'}</div>
            </div>
          </div>
        </section>

        {/* Row 2: Action Buttons */}
        <section className="controls-panel">
          <button className="action-card-btn" onClick={() => setDownloadModal({ show: true, track: 'Math' })}>
            <span>تحميل بيانات – علمي رياضة</span>
          </button>
          <button className="action-card-btn" onClick={() => setDownloadModal({ show: true, track: 'Science' })}>
            <span>تحميل بيانات – علمي علوم</span>
          </button>
          <label className="action-card-btn success" style={{ cursor: 'pointer' }}>
            <span>رفع ملف طلاب جدد (Excel)</span>
            <input type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={(e) => handleExcelUpload(e, 'Placement')} />
          </label>
          <label className="action-card-btn success" style={{ cursor: 'pointer' }}>
            <span>رفع نتيجة التنسيق (Excel)</span>
            <input type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={(e) => handleExcelUpload(e, 'Result')} />
          </label>
          <button className={`action-card-btn ${isSystemOpen ? 'danger' : 'success'}`} onClick={toggleSystemState}>
            <span>{isSystemOpen ? 'قفل نظام التسجيل' : 'فتح نظام التسجيل'}</span>
          </button>
        </section>

        {/* Row 3: Progress Bars */}
        <section className="progress-section">
          <h2 className="progress-section-title">إحصائيات تسجيل رغبات طلاب الفرقة الأولى</h2>
          <div className="progress-track-item">
            <div className="progress-track-meta">
              <span>علمي رياضة ({registeredMath} مسجل من أصل {mathCount} طالب)</span>
              <span style={{ color: 'var(--accent)' }}>{mathRegPct}%</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${mathRegPct}%` }} />
            </div>
          </div>
          <div className="progress-track-item">
            <div className="progress-track-meta">
              <span>علمي علوم ({registeredScience} مسجل من أصل {scienceCount} طالب)</span>
              <span style={{ color: 'var(--accent)' }}>{scienceRegPct}%</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${scienceRegPct}%`, background: 'linear-gradient(90deg,#38bdf8,#818cf8)' }} />
            </div>
          </div>
        </section>

        {/* Row 4: Charts */}
        <section className="charts-grid">
          <div className="chart-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <h3 style={{ margin: 0 }}>توزيع الرغبة الأولى – علمي رياضة</h3>
              <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>{mathChartData.length} برامج</span>
            </div>
            <div className="bar-chart-visual" style={{ maxHeight: '250px', overflowY: 'auto', paddingLeft: '1.2rem', paddingRight: '1.2rem', scrollbarGutter: 'stable' }}>
              {mathChartData.length === 0
                ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0' }}>لا توجد بيانات بعد</p>
                : mathChartData.map((item, idx) => (
                  <div key={idx} className="chart-bar-row">
                    <span className="chart-bar-label" title={item.name}>{item.name}</span>
                    <div className="chart-bar-container">
                      <div className="chart-bar-fill-inner" style={{ width: `${item.pct}%` }} />
                    </div>
                    <span className="chart-bar-count" style={{ minWidth: '40px', textAlign: 'center', margin: '0 0.6rem' }}>{item.count}</span>
                  </div>
                ))
              }
            </div>
          </div>
          <div className="chart-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
              <h3 style={{ margin: 0 }}>توزيع الرغبة الأولى – علمي علوم</h3>
              <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>{scienceChartData.length} برامج</span>
            </div>
            <div className="bar-chart-visual" style={{ maxHeight: '250px', overflowY: 'auto', paddingLeft: '1.2rem', paddingRight: '1.2rem', scrollbarGutter: 'stable' }}>
              {scienceChartData.length === 0
                ? <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '1.5rem 0' }}>لا توجد بيانات بعد</p>
                : scienceChartData.map((item, idx) => (
                  <div key={idx} className="chart-bar-row">
                    <span className="chart-bar-label" title={item.name}>{item.name}</span>
                    <div className="chart-bar-container">
                      <div className="chart-bar-fill-inner" style={{ width: `${item.pct}%`, background: 'linear-gradient(90deg,#34d399,#00d4b8)' }} />
                    </div>
                    <span className="chart-bar-count" style={{ minWidth: '40px', textAlign: 'center', margin: '0 0.6rem' }}>{item.count}</span>
                  </div>
                ))
              }
            </div>
          </div>
        </section>

        {/* Row 5: Table Card */}
        <section className="card">
          <div className="page-header" style={{ marginBottom: '1.2rem' }}>
            <div>
              <h2 className="page-title" style={{ fontSize: '1.4rem' }}>
                {adminViewTab === 'students' ? 'إدارة بيانات طلاب الكلية' : 'إدارة البرامج الأكاديمية'}
              </h2>
              <p className="page-subtitle">
                {adminViewTab === 'students'
                  ? 'البحث المباشر بالرقم القومي للتحكم في التسجيل وطباعة استمارات الرغبات'
                  : 'إضافة برامج جديدة وحذف البرامج الأكاديمية'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {adminViewTab === 'students' ? (
                <button className="btn btn-danger" onClick={() => setDeleteAllStudentsModal(true)}>
                  حذف كل الطلاب
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => setAddProgramModal(true)}>
                  إضافة برنامج جديد
                </button>
              )}
            </div>
          </div>

          {/* Tab Switcher + Search + Filter */}
          <div className="toolbar" style={{ marginBottom: '1.2rem' }}>
            <div className="tabs" style={{ margin: 0 }}>
              <button className={`tab-btn ${adminViewTab === 'students' ? 'active' : ''}`} onClick={() => setAdminViewTab('students')}>
                الطلاب
              </button>
              <button className={`tab-btn ${adminViewTab === 'programs' ? 'active-credit' : ''}`} onClick={() => setAdminViewTab('programs')}>
                البرامج الأكاديمية ({programs.length})
              </button>
            </div>
            {adminViewTab === 'programs' && (
              <>
                <div className="search-wrapper" style={{ flex: 1, maxWidth: 320 }}>
                  <input
                    className="search-input"
                    placeholder="بحث باسم البرنامج..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="tabs" style={{ margin: 0 }}>
                  <button className={`tab-btn ${filterTrack === 'All' ? 'active' : ''}`} onClick={() => setFilterTrack('All')}>الكل</button>
                  <button className={`tab-btn ${filterTrack === 'Math' ? 'active' : ''}`} onClick={() => setFilterTrack('Math')}>علمي رياضة</button>
                  <button className={`tab-btn ${filterTrack === 'Science' ? 'active' : ''}`} onClick={() => setFilterTrack('Science')}>علمي علوم</button>
                </div>
              </>
            )}
          </div>

          {/* Students Tab */}
          {adminViewTab === 'students' && (
            <div>
              {/* Direct SSN Search Card */}
              <div style={{
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                padding: '1.25rem',
                marginBottom: '1.5rem'
              }}>
                <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 700 }}>
                  بحث بالرقم القومي للتحكم المباشر في بيانات الطالب:
                </label>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <input
                    className="form-input"
                    style={{ flex: 1, minWidth: '240px' }}
                    placeholder="أدخل الرقم القومي للطالب (14 رقم)"
                    value={ssnSearch}
                    maxLength={14}
                    inputMode="numeric"
                    onChange={(e) => setSsnSearch(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && handleSsnSearch()}
                  />
                  <button className="btn btn-primary" onClick={handleSsnSearch} disabled={ssnSearchLoading}>
                    {ssnSearchLoading ? 'جاري البحث...' : 'بحث عن الطالب'}
                  </button>
                </div>

                {ssnSearchError && (
                  <div style={{ color: 'var(--danger)', marginTop: '0.75rem', fontSize: '0.9rem' }}>
                    {ssnSearchError}
                  </div>
                )}
              </div>

              {/* Searched Student Result */}
              {searchedStudent && (
                <div style={{
                  background: 'rgba(0, 212, 184, 0.05)',
                  border: '1px solid var(--accent)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1.25rem',
                  marginBottom: '1.5rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
                          {searchedStudent.name}
                        </h4>
                        <span className={`badge ${searchedStudent.isRegistrationOpen ? 'badge-success' : 'badge-danger'}`}>
                          {searchedStudent.isRegistrationOpen ? 'التسجيل مفتوح' : 'التسجيل مغلق'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '1.2rem', color: 'var(--text-muted)', fontSize: '0.9rem', flexWrap: 'wrap' }}>
                        <span>الرقم القومي: <strong style={{ color: 'var(--text-main)', direction: 'ltr', display: 'inline-block' }}>{searchedStudent.ssn}</strong></span>
                        <span>الشعبة: <strong style={{ color: 'var(--accent)' }}>{searchedStudent.field === 'Math' ? 'علمي رياضة' : 'علمي علوم'}</strong></span>
                        <span>رقم الهاتف: <strong style={{ color: searchedStudent.phoneNumber ? '#38bdf8' : 'var(--text-dim)', direction: 'ltr', display: 'inline-block', fontWeight: 700 }}>{searchedStudent.phoneNumber || '— (لم يُسجّل)'}</strong></span>
                        {searchedStudent.firstChoice && <span>الرغبة الأولى: <strong style={{ color: 'var(--accent)' }}>{searchedStudent.firstChoice}</strong></span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {searchedStudent.isRegistrationOpen ? (
                        <button
                          className="btn btn-danger"
                          style={{ fontWeight: 700 }}
                          onClick={() => handleToggleStudentReg(searchedStudent.ssn, false)}
                        >
                          قفل التسجيل للطالب
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary"
                          style={{ fontWeight: 700 }}
                          onClick={() => handleToggleStudentReg(searchedStudent.ssn, true)}
                        >
                          فتح التسجيل للطالب
                        </button>
                      )}
                      <button
                        className="btn btn-ghost"
                        style={{ fontWeight: 700, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                        onClick={() => handleDownloadStudentPdf(searchedStudent.ssn, searchedStudent.name)}
                      >
                        طباعة استمارة الرغبات PDF
                      </button>
                    </div>
                  </div>

                  {/* Student Ranked Preferences List */}
                  {searchedStudent.preferences && searchedStudent.preferences.length > 0 && (
                    <div style={{ marginTop: '1.2rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                      <h5 style={{ margin: '0 0 0.8rem 0', color: 'var(--accent)', fontSize: '0.95rem' }}>
                        استمارة رغبات الطالب مرتبة ({searchedStudent.preferences.length} رغبة):
                      </h5>
                      <div className="table-wrapper" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                        <table className="data-table" style={{ fontSize: '0.88rem' }}>
                          <thead>
                            <tr>
                              <th style={{ width: '80px' }}>الترتيب</th>
                              <th>اسم البرنامج الأكاديمي</th>
                            </tr>
                          </thead>
                          <tbody>
                            {searchedStudent.preferences.map((p, idx) => (
                              <tr key={idx}>
                                <td>
                                  <span className={`badge ${idx === 0 ? 'badge-primary' : 'badge-ghost'}`} style={{ fontWeight: 700 }}>
                                    #{p.order || idx + 1}
                                  </span>
                                </td>
                                <td style={{ fontWeight: idx === 0 ? 800 : 500, color: idx === 0 ? 'var(--accent)' : 'inherit' }}>
                                  {p.name}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Programs Table */}
          {adminViewTab === 'programs' && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>اسم البرنامج</th>
                    <th>الشعبة</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPrograms.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                        لا توجد برامج مضافة – اضغط "إضافة برنامج جديد"
                      </td>
                    </tr>
                  ) : (
                    filteredPrograms.map((prog, idx) => (
                      <tr key={prog.id}>
                        <td style={{ color: 'var(--text-dim)' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 800 }}>{prog.name}</td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {prog.groub === 'Math' ? 'علمي رياضة (Math)' : prog.groub === 'Science' ? 'علمي علوم (Science)' : prog.groub === 'Both' ? 'كلاهما (Both)' : (prog.groub || '—')}
                        </td>
                        <td>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteProgramConfirm({ id: prog.id, name: prog.name })}>
                            حذف البرنامج
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Modal: Download */}
      {downloadModal.show && (
        <div className="modal-overlay" onClick={() => setDownloadModal({ show: false, track: null })}>
          <div className="modal-content-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">
              تحميل ملفات – {downloadModal.track === 'Math' ? 'علمي رياضة' : 'علمي علوم'}
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.2rem' }}>
              اختر نوع الملف الذي تريد تحميله
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <button className="btn btn-primary" style={{ textAlign: 'right', padding: '0.85rem 1.2rem' }} onClick={() => handleFileDownload('Excel')}>
                📊 ملف Excel لبيانات الطلاب
              </button>
              <button className="btn btn-ghost" style={{ textAlign: 'right', padding: '0.85rem 1.2rem' }} onClick={() => handleFileDownload('PDF')}>
                📄 استمارات الرغبات PDF (جميع الطلاب)
              </button>
              <button className="btn btn-ghost" style={{ textAlign: 'right', padding: '0.85rem 1.2rem' }} onClick={() => handleFileDownload('RegisteredPDF')}>
                ✅ استمارات المسجلين فقط (PDF)
              </button>
              <button className="btn btn-danger btn-sm" style={{ marginTop: '0.3rem' }} onClick={() => setDownloadModal({ show: false, track: null })}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Program */}
      {addProgramModal && (
        <div className="modal-overlay" onClick={() => setAddProgramModal(false)}>
          <div className="modal-content-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">إضافة برنامج دراسي جديد</h3>
            <div className="form-group">
              <label className="form-label">اسم البرنامج *</label>
              <input
                className="form-input"
                value={newProgram.name}
                onChange={(e) => setNewProgram({ ...newProgram, name: e.target.value })}
                placeholder="مثال: الكيمياء التطبيقية"
              />
            </div>
            <div className="form-group">
              <label className="form-label">الشعبة التابع لها البرنامج *</label>
              <select
                className="form-select"
                value={newProgram.groub}
                onChange={(e) => setNewProgram({ ...newProgram, groub: e.target.value })}
              >
                <option value="Math">Math (علمي رياضة)</option>
                <option value="Science">Science (علمي علوم)</option>
                <option value="Both">Both (كلاهما)</option>
              </select>
            </div>
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setAddProgramModal(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleAddProgram}>حفظ البرنامج</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Open Reg for One Student */}
      {openRegModal && (
        <div className="modal-overlay" onClick={() => { setOpenRegModal(false); setOpenRegSsn(''); }}>
          <div className="modal-content-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">فتح التسجيل لطالب واحد</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.2rem' }}>
              فتح التسجيل لهذا الطالب منفرداً بغض النظر عن حالة النظام العامة.
            </p>
            <div className="form-group">
              <label className="form-label">الرقم القومي *</label>
              <input className="form-input" inputMode="numeric" maxLength={14}
                value={openRegSsn}
                onChange={(e) => setOpenRegSsn(e.target.value.replace(/\D/g, ''))}
                placeholder="14 رقم" />
            </div>
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => { setOpenRegModal(false); setOpenRegSsn(''); }}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleOpenRegForStudent}>تأكيد الفتح</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete All */}
      {deleteAllStudentsModal && (
        <div className="modal-overlay" onClick={() => setDeleteAllStudentsModal(false)}>
          <div className="modal-content-box" style={{ borderColor: 'var(--danger)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title" style={{ color: 'var(--danger)' }}>تحذير: مسح جميع الطلاب بالكامل</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '1.5rem' }}>
              هل أنت متأكد من حذف <strong>جميع بيانات الطلاب</strong> من قاعدة البيانات؟ هذه العملية لا يمكن التراجع عنها!
            </p>
            <div className="form-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteAllStudentsModal(false)}>إلغاء وحفظ البيانات</button>
              <button className="btn btn-danger" onClick={handleDeleteAllStudents}>تأكيد حذف كل الطلاب</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Uploading Loading Overlay */}
      {uploadingState && (
        <div className="modal-overlay" style={{ backdropFilter: 'blur(8px)', zIndex: 9999 }}>
          <div className="modal-content-box" style={{ textAlign: 'center', padding: '2.5rem 2rem', maxWidth: '480px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              border: '5px solid rgba(0, 212, 184, 0.2)',
              borderTop: '5px solid var(--accent)',
              borderRadius: '50%',
              margin: '0 auto 1.5rem auto',
              animation: 'spin 1s linear infinite'
            }} />
            <h3 style={{ margin: '0 0 0.8rem 0', fontSize: '1.3rem', color: 'var(--text-main)', fontWeight: 800 }}>
              ⏳ {uploadingState.title}
            </h3>
            <p style={{ color: 'var(--accent)', fontWeight: 700, margin: '0 0 0.8rem 0', direction: 'ltr' }}>
              📁 {uploadingState.fileName}
            </p>
            {uploadingState.count !== undefined && uploadingState.count > 0 && (
              <div style={{
                background: 'rgba(0, 212, 184, 0.12)',
                border: '1px solid rgba(0, 212, 184, 0.3)',
                color: 'var(--accent)',
                padding: '0.6rem 1rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 800,
                fontSize: '1rem',
                marginBottom: '1rem',
              }}>
                📊 إجمالي الطلاب المسجلين حالياً: {uploadingState.count} طالب
              </div>
            )}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: '1.7', margin: 0 }}>
              {uploadingState.statusText || 'جاري معالجة البيانات وتخزينها في قاعدة البيانات...'}<br />
              <span style={{ color: '#f59e0b', fontWeight: 600 }}>يرجى عدم إغلاق الصفحة لحين اكتمال العملية.</span>
            </p>
          </div>
        </div>
      )}

      {/* Modal: Delete Program Confirmation */}
      {deleteProgramConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteProgramConfirm(null)}>
          <div className="modal-content-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <h3 className="modal-title" style={{ color: '#f87171', fontSize: '1.15rem', marginBottom: '0.8rem' }}>
              🗑️ تأكيد حذف البرنامج
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: '0.6rem', lineHeight: 1.6 }}>
              هل أنت متأكد من حذف البرنامج التالي نهائياً من النظام؟
            </p>
            <p style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-main)', background: 'var(--surface-dark)', padding: '0.6rem 0.9rem', borderRadius: 8, marginBottom: '1.4rem', border: '1px solid var(--border-color)' }}>
              {deleteProgramConfirm.name}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteProgramConfirm(null)}>
                إلغاء
              </button>
              <button className="btn btn-danger" onClick={async () => {
                await handleDeleteProgram(deleteProgramConfirm.id, deleteProgramConfirm.name);
                setDeleteProgramConfirm(null);
              }}>
                تأكيد الحذف
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
