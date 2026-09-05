"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { setSession, getSession } from "../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [ssn, setSsn] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // إذا كان المستخدم مسجل دخول بالفعل، نوجهه لصفحته مباشرة
  useEffect(() => {
    const session = getSession();
    if (session && session.role) {
      if (session.role === "admin") {
        router.replace("/admin");
        return;
      } else if (session.role === "student") {
        router.replace("/student");
        return;
      }
    }

    setLoading(false);
    const handlePageShow = (e: PageTransitionEvent) => {
      const currentSession = getSession();
      if (currentSession && currentSession.role) {
        if (currentSession.role === "admin") {
          router.replace("/admin");
          return;
        } else if (currentSession.role === "student") {
          router.replace("/student");
          return;
        }
      }
      setLoading(false);
    };
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", () => setLoading(false));
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [router]);

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const cleanSsn = ssn.trim();
    const cleanPass = password.trim();

    if (!cleanSsn) {
      setErrorMsg("من فضلك أدخل الرقم القومي");
      return;
    }
    if (!cleanPass) {
      setErrorMsg("من فضلك أدخل كلمة المرور");
      return;
    }

    setLoading(true);

    try {
      // استدعاء الـ API Route الجديد (Server-Side) لضمان حفظ الكوكيز صح
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ssn: cleanSsn, password: cleanPass }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (data.session) {
          setSession(data.session);
        }
        window.location.href = data.redirect;
      } else {
        setErrorMsg(data.error || "بيانات الدخول غير صحيحة ❌");
        setLoading(false);
      }
    } catch {
      setErrorMsg("تعذّر الاتصال بالنظام، تحقق من الإنترنت وحاول مرة أخرى");
      setLoading(false);
    }
  };

  return (
    <div className="login-page-bg">
      <div className="login-glass-card">
        {/* Logos */}
        <div className="login-logos-wrapper">
          <div className="logo-box">
            <img
              src="/images/science-logo.png"
              alt="لوجو كلية العلوم"
              className="logo-img"
            />
          </div>
          <div className="logo-box">
            <img
              src="/images/suez-canal-logo.png"
              alt="لوجو جامعة قناة السويس"
              className="logo-img"
            />
          </div>
        </div>

        {/* Titles */}
        <div className="login-title-box">
          <h1 className="login-main-title">التنسيق والتشعيب الداخلي</h1>
          <h2 className="login-sub-title">كلية العلوم – جامعة قناة السويس</h2>
          <p className="login-welcome-text">بوابة الدخول الرسمية</p>
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="login-error-alert">
            <span>⚠️ {errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleFormSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="ssn">الرقم القومي</label>
            <div className="input-relative rtl-input-icon">
              <input
                id="ssn"
                type="text"
                inputMode="numeric"
                value={ssn}
                onChange={(e) => setSsn(e.target.value.replace(/\D/g, ""))}
                placeholder="أدخل الرقم القومي (14 رقم)"
                required
                maxLength={14}
                autoComplete="username"
              />
              <span className="field-icon icon-right">👤</span>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="password">كلمة المرور</label>
            <div className="input-relative ltr-toggle-icon">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="toggle-pass-btn icon-left"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? "👁️" : "🔒"}
              </button>
            </div>
          </div>

          <button type="submit" className="login-submit-btn" disabled={loading}>
            {loading ? "جاري التحقق من البيانات..." : "دخول 🚀"}
          </button>
        </form>
      </div>
    </div>
  );
}
