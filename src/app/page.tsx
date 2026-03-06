"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PrivacyGauge from "@/components/PrivacyGauge";

const ROYAL_PURPLE = "#4B0082";
const SILVER = "#C0C0C0";
const STORAGE_KEY = "saakshi-audit-history";
const RCM_STORAGE_KEY = "saakshi-rcm-accounts";
const AUDIT_API = "/api/audit";
const GAUGE_SWEEP_MS = 2500;
const FINDINGS_DELAY_MS = GAUGE_SWEEP_MS + 500;

const SECURE_CHECKS = [
  "No Dark Web Activity",
  "Encrypted Credentials",
  "Identity Protected",
] as const;

export type ConsentStatus = "Active" | "Revoked";

export type ConnectedAccount = {
  id: string;
  name: string;
  consentStatus: ConsentStatus;
  isBreached: boolean;
};

const INITIAL_RCM_ACCOUNTS: ConnectedAccount[] = [
  { id: "1", name: "Zomato", consentStatus: "Active", isBreached: true },
  { id: "2", name: "HDFC Bank", consentStatus: "Active", isBreached: false },
  { id: "3", name: "Flipkart", consentStatus: "Revoked", isBreached: true },
  { id: "4", name: "LinkedIn", consentStatus: "Active", isBreached: true },
  { id: "5", name: "Canva", consentStatus: "Active", isBreached: false },
  { id: "6", name: "Adobe", consentStatus: "Revoked", isBreached: true },
  { id: "7", name: "Dark Web Forums", consentStatus: "Active", isBreached: true },
  { id: "8", name: "Swiggy", consentStatus: "Active", isBreached: false },
];

function loadRcmAccounts(): ConnectedAccount[] {
  if (typeof window === "undefined") return INITIAL_RCM_ACCOUNTS;
  try {
    const raw = localStorage.getItem(RCM_STORAGE_KEY);
    if (!raw) return INITIAL_RCM_ACCOUNTS;
    const parsed = JSON.parse(raw) as ConnectedAccount[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_RCM_ACCOUNTS;
  } catch {
    return INITIAL_RCM_ACCOUNTS;
  }
}

function saveRcmAccounts(accounts: ConnectedAccount[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(RCM_STORAGE_KEY, JSON.stringify(accounts));
  } catch {
    /* ignore */
  }
}

function proactiveScore(accounts: ConnectedAccount[]): number {
  let score = 100;
  for (const a of accounts) {
    if (!a.isBreached) continue;
    if (a.consentStatus === "Active") score -= 20;
    else score += 5;
  }
  return Math.max(0, Math.min(100, score));
}

export type AuditEntry = {
  email: string;
  score: number;
  dateTime: string;
};

function loadAudits(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAudits(audits: AuditEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(audits));
  } catch {
    /* ignore */
  }
}

const formatNameFromEmail = (email: string): string => {
  const local = (email || "").split("@")[0] || "";
  const withSpaces = local.replace(/[._]/g, " ").trim();
  if (!withSpaces) return "[Your Name]";
  return withSpaces
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const getDeletionNoticeBody = (auditedEmail: string): string => {
  const name = auditedEmail ? formatNameFromEmail(auditedEmail) : "[Your Name]";
  const registeredEmail = auditedEmail || "[Your Email]";
  return `To the Data Protection Officer,\n\nUnder the provisions of the Digital Personal Data Protection Act, 2023, I hereby request the immediate erasure of all my personal data held by your organization.\n\nPlease confirm once the deletion is complete.\n\nRegards,\n${name}\nRegistered Email: ${registeredEmail}`;
};

type TabId = "audit" | "vault";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("audit");
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>(() => loadRcmAccounts());
  const [email, setEmail] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [breachTags, setBreachTags] = useState<string[]>([]);
  const [leaksCount, setLeaksCount] = useState(0);
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [showFindings, setShowFindings] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [draftNoticeOpenForId, setDraftNoticeOpenForId] = useState<string | null>(null);

  const rcmScore = useMemo(() => proactiveScore(connectedAccounts), [connectedAccounts]);
  const score = rcmScore;
  const activeCount = useMemo(() => connectedAccounts.filter((a) => a.consentStatus === "Active").length, [connectedAccounts]);
  const revokedCount = useMemo(() => connectedAccounts.filter((a) => a.consentStatus === "Revoked").length, [connectedAccounts]);
  const breachedAccounts = useMemo(() => connectedAccounts.filter((a) => a.isBreached), [connectedAccounts]);

  useEffect(() => {
    setAudits(loadAudits());
  }, []);

  useEffect(() => {
    setShowFindings(true);
  }, [connectedAccounts]);

  const handleRevoke = (id: string) => {
    setConnectedAccounts((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, consentStatus: "Revoked" as const } : a));
      saveRcmAccounts(next);
      return next;
    });
  };

  const runAudit = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setBreachTags([]);
    setLeaksCount(0);
    setAuditError(null);

    try {
      const res = await fetch(AUDIT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || "" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      const tags = Array.isArray(data.breachTags) ? data.breachTags : [];
      const found = typeof data.found === "number" ? data.found : tags.length;

      setBreachTags(tags);
      setLeaksCount(found);

      const entry: AuditEntry = {
        email: email.trim() || "Anonymous",
        score: rcmScore,
        dateTime: new Date().toISOString(),
      };
      setAudits((prev) => {
        const next = [entry, ...prev].slice(0, 50);
        saveAudits(next);
        return next;
      });
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : "Audit failed. Please try again.");
    } finally {
      setIsScanning(false);
    }
  };

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  const shareOnWhatsApp = () => {
    const breachCount = breachedAccounts.length;
    const text =
      `🚨 I just audited my digital footprint with SAAKSHI. My Privacy Health Score is ${score}/100. 🔓 ${breachCount} of my accounts are compromised on the Dark Web. Check your Data Risk for free here: ${appUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const handleDeletionRequest = (companyName: string) => {
    const recipientEmail = `privacy@${companyName.toLowerCase().replace(/\s+/g, "")}.com`;
    const subject = encodeURIComponent("Urgent: Data Deletion Request under DPDP Act 2023");
    const body = encodeURIComponent(getDeletionNoticeBody(email.trim()));
    window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
  };

  const copyDeletionNotice = async (id: string) => {
    try {
      await navigator.clipboard.writeText(getDeletionNoticeBody(email.trim()));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  const handleCopyAndCloseModal = async () => {
    if (draftNoticeOpenForId) {
      await copyDeletionNotice(draftNoticeOpenForId);
      setDraftNoticeOpenForId(null);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-between bg-[#0f0a18] text-[#e8e6ed] font-sans antialiased"
      style={{ background: "var(--background)" }}
    >
      <main className="flex flex-col flex-1 w-full max-w-lg mx-auto items-center justify-center px-6 py-12">
        {/* Header */}
        <h1 className="text-2xl font-semibold tracking-tight mb-1" style={{ color: ROYAL_PURPLE }}>
          SAAKSHI
        </h1>
        <p className="text-sm mb-6" style={{ color: SILVER }}>
          Privacy Audit by SYRO Labs · DPDP RCM
        </p>

        {/* Main card with tabbed navigation */}
        <motion.div
          className="w-full max-w-sm rounded-3xl overflow-hidden"
          style={{
            background: "rgba(15, 10, 24, 0.6)",
            border: "1px solid rgba(75, 0, 130, 0.4)",
          }}
          layout
        >
          {/* Tab navigation */}
          <div className="flex border-b" style={{ borderColor: "rgba(75, 0, 130, 0.35)" }}>
            {(["audit", "vault"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="flex-1 py-3.5 text-sm font-medium transition-colors relative"
                style={{
                  color: activeTab === tab ? SILVER : "rgba(192,192,192,0.5)",
                }}
              >
                {tab === "audit" ? "Audit Dashboard" : "Consent Vault"}
                {activeTab === tab && (
                  <motion.div
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ background: ROYAL_PURPLE }}
                    layoutId="tabIndicator"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          <div className="p-6">
            <AnimatePresence mode="wait">
              {activeTab === "audit" && (
                <motion.div
                  key="audit"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {/* Consent ratio */}
                  <div className="flex items-center justify-center gap-4 text-xs font-medium" style={{ color: SILVER }}>
                    <span>Active Consents: <span className="tabular-nums" style={{ color: ROYAL_PURPLE }}>{activeCount}</span></span>
                    <span className="opacity-50">|</span>
                    <span>Revoked: <span className="tabular-nums text-emerald-400/90">{revokedCount}</span></span>
                  </div>

                  {/* Privacy Gauge */}
                  <div className="flex justify-center">
                    <PrivacyGauge score={score} isScanning={isScanning} />
                  </div>

                  {isScanning && (
                    <p className="text-sm font-medium flex items-center justify-center gap-2" style={{ color: SILVER }}>
                      <span className="w-2 h-2 rounded-full bg-[#4B0082] animate-ping" />
                      Connecting to Secure Servers...
                    </p>
                  )}

                  {/* Email + Audit Now */}
                  <div className="space-y-4">
                    <input
                      type="email"
                      placeholder="Email Address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && runAudit()}
                      disabled={isScanning}
                      className="w-full h-12 px-4 rounded-xl bg-white/5 border text-[#e8e6ed] placeholder-[#C0C0C080] focus:outline-none focus:ring-2 focus:ring-[#4B0082] focus:border-transparent transition disabled:opacity-50"
                      style={{ borderColor: "rgba(192,192,192,0.25)" }}
                      aria-label="Email Address"
                    />
                    <button
                      type="button"
                      onClick={() => runAudit()}
                      disabled={isScanning}
                      className="w-full h-12 rounded-xl font-semibold text-white transition-all hover:opacity-95 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                      style={{ background: ROYAL_PURPLE }}
                    >
                      {isScanning ? "Scanning…" : "Audit Now"}
                    </button>
                  </div>

                  {auditError && (
                    <p className="text-sm text-red-400 text-center" role="alert">{auditError}</p>
                  )}

                  {/* Detailed Findings — RCM-driven */}
                  {showFindings && (
                    <motion.section
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <h2 className="text-xs font-semibold uppercase tracking-widest mb-3 opacity-90" style={{ color: SILVER }}>
                        Detailed Findings
                      </h2>
                      <div
                        className="rounded-xl px-4 py-4 space-y-3"
                        style={{
                          background: "rgba(15, 10, 24, 0.95)",
                          border: "1px solid rgba(75, 0, 130, 0.4)",
                        }}
                      >
                        {breachedAccounts.length > 0 ? (
                          <ul className="space-y-3">
                            {breachedAccounts.map((acc) => (
                              <li key={acc.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between gap-y-2 rounded-lg py-1">
                                <div className="flex items-center gap-3 min-w-0">
                                  {acc.consentStatus === "Active" ? (
                                    <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-red-500/20" aria-hidden>
                                      <svg className="w-3 h-3 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M8.485 2.495c.823-1.427 2.799-1.427 3.622 0l7.07 12.252c.823 1.427-.206 3.21-1.81 3.21H3.225c-1.604 0-2.634-1.783-1.81-3.21L8.485 2.495z" clipRule="evenodd" />
                                      </svg>
                                    </span>
                                  ) : (
                                    <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.4)]" aria-hidden>
                                      <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4 9a1 1 0 011-1h10a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1V9zm12-4.5A1.5 1.5 0 0014.5 3h-9A1.5 1.5 0 004 4.5v5A1.5 1.5 0 005.5 11h9a1.5 1.5 0 001.5-1.5v-5z" clipRule="evenodd" />
                                      </svg>
                                    </span>
                                  )}
                                  <span className={`text-sm font-medium truncate ${acc.consentStatus === "Active" ? "text-red-200/95" : "text-emerald-200/95"}`}>
                                    {acc.name}
                                  </span>
                                </div>
                                {acc.consentStatus === "Active" ? (
                                  <div className="shrink-0 flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleDeletionRequest(acc.name)}
                                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-500/50 bg-red-500/15 text-red-300 hover:bg-red-500/25 hover:border-red-400/60 transition-colors cursor-pointer"
                                    >
                                      Request Deletion
                                    </button>
                                    <span className="relative inline-flex">
                                      <button
                                        type="button"
                                        onClick={() => setDraftNoticeOpenForId(acc.id)}
                                        className="p-1.5 rounded-md border border-[rgba(192,192,192,0.25)] bg-white/5 text-[#C0C0C0] hover:bg-white/10 hover:border-[rgba(192,192,192,0.4)] transition-colors"
                                        aria-label="Open draft legal notice"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                      </button>
                                      {copiedId === acc.id && (
                                        <motion.span
                                          initial={{ opacity: 0, y: 4 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium rounded bg-emerald-600 text-white whitespace-nowrap shadow-lg z-10"
                                        >
                                          Copied!
                                        </motion.span>
                                      )}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400/95">
                                    <span className="text-emerald-400">Threat Neutralized: Consent Withdrawn</span>
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <ul className="space-y-2.5">
                            {SECURE_CHECKS.map((item) => (
                              <li key={item} className="flex items-center gap-3">
                                <span className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center bg-emerald-500/20" aria-hidden>
                                  <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                  </svg>
                                </span>
                                <span className="text-sm font-medium text-emerald-200/95">{item}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </motion.section>
                  )}

                  {/* Recent Audits - keep below card */}
                </motion.div>
              )}

              {activeTab === "vault" && (
                <motion.div
                  key="vault"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <p className="text-xs font-medium opacity-80" style={{ color: SILVER }}>
                    Manage consent for connected accounts. Revoke to improve your Privacy Score.
                  </p>
                  <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1 -mr-1">
                    {connectedAccounts.map((acc) => (
                      <motion.div
                        key={acc.id}
                        layout
                        className="flex items-center justify-between gap-4 rounded-xl px-4 py-3"
                        style={{
                          background: "rgba(15, 10, 24, 0.8)",
                          border: "1px solid rgba(75, 0, 130, 0.3)",
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`text-sm font-medium truncate`} style={{ color: SILVER }}>{acc.name}</span>
                          {acc.isBreached && (
                            <span className="shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Breached</span>
                          )}
                          <span className={`shrink-0 text-[10px] font-medium ${acc.consentStatus === "Active" ? "text-amber-400/90" : "text-emerald-400/90"}`}>
                            {acc.consentStatus}
                          </span>
                        </div>
                        {acc.consentStatus === "Active" ? (
                          <button
                            type="button"
                            onClick={() => handleRevoke(acc.id)}
                            className="shrink-0 relative w-11 h-6 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[#4B0082] focus:ring-offset-0 focus:ring-offset-transparent"
                            style={{
                              background: ROYAL_PURPLE,
                              borderColor: "rgba(192,192,192,0.3)",
                            }}
                            aria-label={`Revoke consent for ${acc.name}`}
                          >
                            <motion.span
                              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
                              style={{ left: "4px" }}
                              layout
                              transition={{ type: "spring", stiffness: 500, damping: 35 }}
                              animate={{ x: 22 }}
                            />
                          </button>
                        ) : (
                          <div className="shrink-0 relative w-11 h-6 rounded-full border bg-white/5" style={{ borderColor: "rgba(192,192,192,0.2)" }} aria-label="Revoked">
                            <motion.span
                              className="absolute top-1 left-1 w-4 h-4 rounded-full bg-emerald-500/90"
                              layout
                              transition={{ type: "spring", stiffness: 500, damping: 35 }}
                            />
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Recent Audits - outside card */}
        {audits.length > 0 && (
          <section className="w-full max-w-sm mt-12">
            <h2 className="text-sm font-semibold mb-3 tracking-wide" style={{ color: SILVER }}>
              Recent Audits
            </h2>
            <ul className="space-y-3">
              {audits.slice(0, 3).map((entry, i) => (
                <li
                  key={`${entry.dateTime}-${entry.email}-${i}`}
                  className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                  style={{
                    background: "rgba(15, 10, 24, 0.9)",
                    border: "1px solid rgba(75, 0, 130, 0.35)",
                    color: SILVER,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" style={{ color: SILVER }}>
                      {entry.email}
                    </p>
                    <p className="text-xs mt-0.5 opacity-80">
                      {new Date(entry.dateTime).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-lg font-bold tabular-nums">
                      {entry.score}
                      <span className="text-xs font-normal opacity-70">/100</span>
                    </span>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        entry.score < 50
                          ? "bg-red-500/20 text-red-400"
                          : "bg-emerald-500/20 text-emerald-400"
                      }`}
                    >
                      {entry.score < 50 ? "High Risk" : "Secure"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

      </main>

      {/* Footer */}
      <footer className="w-full py-6 px-6 text-center border-t space-y-4" style={{ borderColor: "rgba(192,192,192,0.15)" }}>
        {score !== null && !isScanning && (
          <button
            type="button"
            onClick={shareOnWhatsApp}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-xl font-medium border transition hover:bg-white/5"
            style={{ borderColor: "rgba(192,192,192,0.35)", color: SILVER }}
          >
            Share my Score on WhatsApp
          </button>
        )}
        <p className="text-xs" style={{ color: SILVER, opacity: 0.9 }}>
          Powered by SYRO Labs & Compliant with DPDP Act 2023 ·{" "}
          <a
            href="https://leakcheck.io"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-90"
          >
            Powered by LeakCheck
          </a>
        </p>
      </footer>

      {/* Draft Legal Notice Modal */}
      <AnimatePresence>
        {draftNoticeOpenForId && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDraftNoticeOpenForId(null)}
              aria-hidden
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <motion.div
                className="pointer-events-auto w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
                style={{
                  background: "rgba(15, 10, 24, 0.98)",
                  border: "1px solid rgba(75, 0, 130, 0.5)",
                  boxShadow: "0 0 0 1px rgba(192,192,192,0.1), 0 25px 50px -12px rgba(0,0,0,0.5)",
                }}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 pt-6 pb-4">
                  <h3 className="text-lg font-semibold mb-4" style={{ color: ROYAL_PURPLE }}>
                    Draft Legal Notice
                  </h3>
                  <p className="text-xs mb-3 opacity-90" style={{ color: SILVER }}>
                    Review the text below. Copy it to paste into your email client if mailto is unavailable.
                  </p>
                  <pre
                    className="w-full p-4 rounded-xl text-sm font-mono whitespace-pre-wrap break-words overflow-x-auto max-h-[240px] overflow-y-auto border"
                    style={{
                      background: "rgba(0, 0, 0, 0.4)",
                      color: "#c0c0c0",
                      borderColor: "rgba(75, 0, 130, 0.35)",
                    }}
                  >
                    {getDeletionNoticeBody(email.trim())}
                  </pre>
                </div>
                <div className="px-6 pb-6 pt-2">
                  <button
                    type="button"
                    onClick={handleCopyAndCloseModal}
                    className="w-full py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-95 active:scale-[0.99]"
                    style={{ background: ROYAL_PURPLE }}
                  >
                    Copy to Clipboard & Close
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftNoticeOpenForId(null)}
                    className="w-full mt-3 py-2.5 rounded-xl font-medium border transition hover:bg-white/5"
                    style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
