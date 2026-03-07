"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const ROYAL_PURPLE = "#4B0082";
const SILVER = "#C0C0C0";
const GOLD = "#d4af37";

type AuthStep = "phone_input" | "otp_input";

type LoginScreenProps = {
  onLogin: () => void;
};

const OTP_LENGTH = 6;

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [authStep, setAuthStep] = useState<AuthStep>("phone_input");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [isLoading, setIsLoading] = useState(false);
  const [otpSentToast, setOtpSentToast] = useState(false);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleGetOtp = () => {
    const trimmed = phoneNumber.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setAuthStep("otp_input");
      setOtpSentToast(true);
      setTimeout(() => setOtpSentToast(false), 2500);
    }, 600);
  };

  const trimmedPhone = phoneNumber.trim();
  const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const isPhoneValid = trimmedPhone.length >= 10 && (isEmail(trimmedPhone) || /^\d{10}$/.test(trimmedPhone.replace(/\D/g, "")));

  const otpString = otpCode.join("");
  const isOtpValid = otpString.length >= 4;

  const setOtpDigit = useCallback((index: number, value: string) => {
    if (value.length > 1) {
      const digits = value.replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
      setOtpCode((prev) => {
        const next = [...prev];
        digits.forEach((d, i) => { next[Math.min(index + i, OTP_LENGTH - 1)] = d; });
        return next;
      });
      const nextFocus = Math.min(index + digits.length, OTP_LENGTH - 1);
      otpInputRefs.current[nextFocus]?.focus();
      return;
    }
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtpCode((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) otpInputRefs.current[index + 1]?.focus();
  }, []);

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
      setOtpDigit(index - 1, "");
    }
  };

  const handleVerifyAndLogin = () => {
    if (!isOtpValid) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLogin();
    }, 400);
  };

  const handleResend = () => {
    setOtpCode(Array(OTP_LENGTH).fill(""));
    setOtpSentToast(true);
    setTimeout(() => setOtpSentToast(false), 2500);
  };

  const displayPhone = trimmedPhone ? (isEmail(trimmedPhone) ? trimmedPhone : trimmedPhone.replace(/\D/g, "").replace(/(\d{2})(\d{4})(\d{4})/, "$1 **** $3")) : "—";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f0a18] text-[#e8e6ed] font-sans antialiased px-6 relative overflow-hidden">
      {/* OTP sent toast */}
      <AnimatePresence>
        {otpSentToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute top-8 left-1/2 -translate-x-1/2 z-10 rounded-xl px-4 py-2.5 border flex items-center gap-2 shadow-lg"
            style={{ background: "rgba(15, 10, 24, 0.95)", borderColor: "rgba(34, 197, 94, 0.4)", color: "#86efac" }}
          >
            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            <span className="text-sm font-medium">OTP sent securely.</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-sm flex flex-col items-center">
        <motion.div
          key="logo"
          className="mb-8 flex flex-col items-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: ROYAL_PURPLE }}>
            SAAKSHI
          </h1>
          <p className="text-xs mt-2 tracking-widest uppercase opacity-80" style={{ color: SILVER }}>
            Privacy Audit · DPDP RCM
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {authStep === "phone_input" && (
            <motion.div
              key="phone_input"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="w-full rounded-2xl overflow-hidden border px-5 py-6 space-y-5"
              style={{ background: "rgba(15, 10, 24, 0.7)", borderColor: "rgba(75, 0, 130, 0.4)" }}
            >
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wider opacity-90" style={{ color: SILVER }}>Mobile or Email</span>
                <input
                  type="text"
                  inputMode="email"
                  placeholder="Enter mobile number or email"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && isPhoneValid && handleGetOtp()}
                  className="mt-2 w-full h-12 px-4 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#4B0082] focus:ring-offset-0 placeholder:opacity-50"
                  style={{ background: "rgba(0,0,0,0.3)", borderColor: "rgba(75, 0, 130, 0.35)", color: "#e8e6ed" }}
                />
              </label>
              <button
                type="button"
                onClick={handleGetOtp}
                disabled={!isPhoneValid || isLoading}
                className="w-full h-12 rounded-xl font-semibold text-white transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                style={{ background: ROYAL_PURPLE }}
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-t-transparent border-current animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Get Secure OTP"
                )}
              </button>
            </motion.div>
          )}

          {authStep === "otp_input" && (
            <motion.div
              key="otp_input"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="w-full rounded-2xl overflow-hidden border px-5 py-6 space-y-6"
              style={{ background: "rgba(15, 10, 24, 0.7)", borderColor: "rgba(75, 0, 130, 0.4)" }}
            >
              <p className="text-sm text-center" style={{ color: SILVER }}>
                Enter the 6-digit code sent to <span className="font-semibold text-white">{displayPhone}</span>
              </p>

              <div className="flex justify-center gap-2">
                {otpCode.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { otpInputRefs.current[index] = el; }}
                    type="tel"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={(e) => setOtpDigit(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className="w-11 h-12 rounded-xl border-2 text-center text-xl font-bold tabular-nums transition-all duration-200 focus:outline-none focus:ring-0 focus:border-[rgba(212,175,55,0.9)] focus:shadow-[0_0_14px_3px_rgba(212,175,55,0.3)]"
                    style={{
                      background: "rgba(0,0,0,0.55)",
                      borderColor: "rgba(212, 175, 55, 0.35)",
                      color: "#fff",
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={handleVerifyAndLogin}
                disabled={!isOtpValid || isLoading}
                className="w-full h-12 rounded-xl font-semibold text-white transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #22c55e 0%, #16a34a 55%)" }}
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-t-transparent border-current animate-spin" />
                    Verifying…
                  </>
                ) : (
                  "Verify & Login"
                )}
              </button>

              <button
                type="button"
                onClick={handleResend}
                className="w-full text-center text-xs font-medium opacity-80 hover:opacity-100 transition"
                style={{ color: SILVER }}
              >
                Didn&apos;t receive code? <span className="underline">Resend</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[10px] mt-6 text-center opacity-70" style={{ color: SILVER }}>
          By continuing, you agree to use SAAKSHI as your Registered Consent Manager under DPDP Act 2023.
        </p>
      </div>
    </div>
  );
}
