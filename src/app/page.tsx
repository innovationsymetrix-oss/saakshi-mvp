"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { jsPDF } from "jspdf";
import PrivacyGauge from "@/components/PrivacyGauge";
import RadarSweep from "@/components/RadarSweep";

const ROYAL_PURPLE = "#4B0082";
const SILVER = "#C0C0C0";
const IDENTITY_LABELS: IdentityLabel[] = ["Primary", "Business", "Personal"];
const STORAGE_KEY = "saakshi-audit-history";
const RCM_STORAGE_KEY = "saakshi-rcm-accounts";
const PROFILE_STORAGE_KEY = "saakshi-user-profile";
const IDENTITIES_STORAGE_KEY = "saakshi-identities";
const GOVT_IDS_STORAGE_KEY = "saakshi-govt-identifiers";

export type IdentityLabel = "Primary" | "Business" | "Personal";
export type IdentityItem = { id: string; type: "email" | "mobile"; value: string; verified: boolean; label?: IdentityLabel };

export type GovtIdKind = "aadhaar" | "pan" | "voterId";
export type GovtIdEntry = { value: string; scanStatus: string };
function defaultGovtIds(): Record<GovtIdKind, GovtIdEntry> {
  return {
    aadhaar: { value: "", scanStatus: "Not scanned" },
    pan: { value: "", scanStatus: "Not scanned" },
    voterId: { value: "", scanStatus: "Not scanned" },
  };
}
function loadGovtIds(): Record<GovtIdKind, GovtIdEntry> {
  if (typeof window === "undefined") return defaultGovtIds();
  try {
    const raw = localStorage.getItem(GOVT_IDS_STORAGE_KEY);
    if (!raw) return defaultGovtIds();
    const parsed = JSON.parse(raw) as Record<string, GovtIdEntry>;
    return { ...defaultGovtIds(), ...parsed };
  } catch {
    return defaultGovtIds();
  }
}
function saveGovtIds(ids: Record<GovtIdKind, GovtIdEntry>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GOVT_IDS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function loadIdentities(): IdentityItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(IDENTITIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IdentityItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveIdentities(identities: IdentityItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IDENTITIES_STORAGE_KEY, JSON.stringify(identities));
  } catch {
    /* ignore */
  }
}
const AUDIT_API = "/api/audit";
const GAUGE_SWEEP_MS = 2500;
const FINDINGS_DELAY_MS = GAUGE_SWEEP_MS + 500;

const SECURE_CHECKS = [
  "No Dark Web Activity",
  "Encrypted Credentials",
  "Identity Protected",
] as const;

const DEMO_FINDINGS = {
  email: ["LinkedIn (2021) - Low Risk"],
  mobile: ["Financial Spam List (Dark Web) - High Risk"],
  identity: ["Aadhaar Ping (Unauthorized) - Critical Alert"],
} as const;

export type ConsentStatus = "Active" | "Revoked";

export type ConnectedAccount = {
  id: string;
  name: string;
  consentStatus: ConsentStatus;
  isBreached: boolean;
};

export type PendingConsentRequest = {
  id: string;
  companyName: string;
  accessTo: string[];
};

const INITIAL_PENDING_REQUESTS: PendingConsentRequest[] = [
  { id: "pending-healthstack", companyName: "HealthStack AI", accessTo: ["Full Name", "Date of Birth", "Blood Group"] },
];

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
  verified?: boolean;
  mobile?: string;
  scanType?: "Standard" | "Deep Scan";
  threatCount?: number;
  threatSummary?: string[];
};

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "—";
  const [local, domain] = email.split("@");
  if (!local?.length) return `***@${domain}`;
  return `${local[0]}***@${domain}`;
}

function maskMobile(mobile: string): string {
  const digits = (mobile || "").replace(/\D/g, "");
  if (digits.length < 4) return digits ? "***" : "—";
  return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
}

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

export type UserProfile = {
  name: string;
  primaryEmail: string;
  mobile: string;
  aadhaarLinked: boolean;
  isRegistered: boolean;
};

const DEFAULT_PROFILE: UserProfile = {
  name: "",
  primaryEmail: "",
  mobile: "",
  aadhaarLinked: false,
  isRegistered: false,
};

function loadProfile(): UserProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<UserProfile>;
    return { ...DEFAULT_PROFILE, ...parsed };
  } catch {
    return DEFAULT_PROFILE;
  }
}

function saveProfile(profile: UserProfile) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

const getDeletionNoticeBody = (auditedEmail: string, profileName?: string | null): string => {
  const name = (profileName && profileName.trim()) ? profileName.trim() : (auditedEmail ? formatNameFromEmail(auditedEmail) : "[Your Name]");
  const registeredEmail = auditedEmail || "[Your Email]";
  return `To the Data Protection Officer,\n\nUnder the provisions of the Digital Personal Data Protection Act, 2023, I hereby request the immediate erasure of all my personal data held by your organization.\n\nPlease confirm once the deletion is complete.\n\nRegards,\n${name}\nRegistered Email: ${registeredEmail}`;
};

type TabId = "audit" | "vault" | "history" | "profile";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("audit");
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>(() => loadRcmAccounts());
  const [profile, setProfile] = useState<UserProfile>(() => loadProfile());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [aadhaarPan, setAadhaarPan] = useState("");
  const [deepIdentityScan, setDeepIdentityScan] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [breachTags, setBreachTags] = useState<string[]>([]);
  const [mobileThreats, setMobileThreats] = useState<string[]>([]);
  const [aadhaarThreats, setAadhaarThreats] = useState<string[]>([]);
  const [auditScore, setAuditScore] = useState<number | null>(null);
  const [leaksCount, setLeaksCount] = useState(0);
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [showFindings, setShowFindings] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [draftNoticeOpenForId, setDraftNoticeOpenForId] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingConsentRequest[]>(() => [...INITIAL_PENDING_REQUESTS]);
  const [authenticatingRequestId, setAuthenticatingRequestId] = useState<string | null>(null);
  const [verificationPhase, setVerificationPhase] = useState<"spinner" | "checkmark" | null>(null);
  const [consentToastVisible, setConsentToastVisible] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [findingsCategoryFilter, setFindingsCategoryFilter] = useState<"all" | "Email" | "Mobile" | "Identity" | "Consent">("all");
  const [mobileVerified, setMobileVerified] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [mobileScanningAfterVerify, setMobileScanningAfterVerify] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verificationTarget, setVerificationTarget] = useState<"email" | "mobile" | null>(null);
  const [identities, setIdentities] = useState<IdentityItem[]>([]);
  const [addIdentityModalOpen, setAddIdentityModalOpen] = useState(false);
  const [addIdentityType, setAddIdentityType] = useState<"email" | "mobile">("email");
  const [addIdentityValue, setAddIdentityValue] = useState("");
  const [pendingVerifyIdentityId, setPendingVerifyIdentityId] = useState<string | null>(null);
  const [reportModalEntry, setReportModalEntry] = useState<AuditEntry | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [perimeterSubTab, setPerimeterSubTab] = useState<"communications" | "govt">("communications");
  const [govtIds, setGovtIds] = useState<Record<GovtIdKind, GovtIdEntry>>(defaultGovtIds);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const loaded = loadIdentities();
    if (loaded.length > 0) {
      setIdentities(loaded);
    } else {
      const p = loadProfile();
      const seed: IdentityItem[] = [];
      if (p.primaryEmail) seed.push({ id: `e-${Date.now()}`, type: "email", value: p.primaryEmail, verified: true, label: "Primary" });
      if (p.mobile) seed.push({ id: `m-${Date.now()}`, type: "mobile", value: p.mobile, verified: true, label: "Primary" });
      if (seed.length > 0) {
        setIdentities(seed);
        saveIdentities(seed);
      }
    }
    setGovtIds(loadGovtIds());
  }, []);

  useEffect(() => {
    if (!profile.isRegistered) return;
    if (profile.primaryEmail) {
      setEmail(profile.primaryEmail);
      setEmailVerified(true);
    }
    if (profile.name) setName(profile.name);
    if (profile.mobile) setMobile(profile.mobile);
  }, [profile.isRegistered]);

  const rcmScore = useMemo(() => proactiveScore(connectedAccounts), [connectedAccounts]);

  const pillarScores = useMemo(() => {
    const emailPillar = breachTags.length === 0 ? 100 : breachTags.length <= 3 ? 65 : 25;
    const mobilePillar = mobileThreats.length === 0 ? 100 : Math.max(0, 100 - mobileThreats.length * 30);
    const identityPillar = aadhaarThreats.length === 0 ? 100 : Math.max(0, 100 - aadhaarThreats.length * 35);
    const mobileEffective = deepIdentityScan ? mobilePillar : 100;
    const identityEffective = deepIdentityScan ? identityPillar : 100;
    const weighted = Math.round(emailPillar * 0.2 + mobileEffective * 0.2 + identityEffective * 0.6);
    return { emailPillar, mobilePillar, identityPillar, weighted: Math.max(0, Math.min(100, weighted)) };
  }, [breachTags.length, mobileThreats.length, aadhaarThreats.length, deepIdentityScan]);

  const score = auditScore !== null ? pillarScores.weighted : rcmScore;
  const primaryEmail = useMemo(() => identities.find((i) => i.type === "email")?.value ?? email, [identities, email]);
  const primaryMobile = useMemo(() => identities.find((i) => i.type === "mobile")?.value ?? mobile, [identities, mobile]);
  const hasVerifiedEmail = useMemo(() => identities.some((i) => i.type === "email" && i.verified), [identities]);
  const hasVerifiedMobile = useMemo(() => identities.some((i) => i.type === "mobile" && i.verified), [identities]);
  const identitiesWithLabels = useMemo(() => {
    let emailCount = 0, mobileCount = 0;
    return identities.map((i) => {
      const label = i.label ?? (i.type === "email" ? IDENTITY_LABELS[Math.min(emailCount++, IDENTITY_LABELS.length - 1)] : IDENTITY_LABELS[Math.min(mobileCount++, IDENTITY_LABELS.length - 1)]);
      return { ...i, label };
    });
  }, [identities]);
  const activeCount = useMemo(() => connectedAccounts.filter((a) => a.consentStatus === "Active").length, [connectedAccounts]);
  const revokedCount = useMemo(() => connectedAccounts.filter((a) => a.consentStatus === "Revoked").length, [connectedAccounts]);
  const breachedAccounts = useMemo(() => connectedAccounts.filter((a) => a.isBreached), [connectedAccounts]);

  const categorizedFindings = useMemo(() => {
    const rows: { category: "Email" | "Mobile" | "Identity" | "Consent"; finding: string; action?: "deletion" | "copy" | "revoked"; accId?: string; isRevoked?: boolean }[] = [];
    breachTags.forEach((tag) => rows.push({ category: "Email", finding: tag, action: "deletion" }));
    mobileThreats.forEach((t) => rows.push({ category: "Mobile", finding: t }));
    aadhaarThreats.forEach((t) => rows.push({ category: "Identity", finding: t }));
    breachedAccounts.forEach((acc) => rows.push({ category: "Consent", finding: acc.name, action: acc.consentStatus === "Active" ? "deletion" : "revoked", accId: acc.id, isRevoked: acc.consentStatus === "Revoked" }));
    return findingsCategoryFilter === "all" ? rows : rows.filter((r) => r.category === findingsCategoryFilter);
  }, [breachTags, mobileThreats, aadhaarThreats, breachedAccounts, findingsCategoryFilter]);

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

  const handleApprovePending = (request: PendingConsentRequest) => {
    setAuthenticatingRequestId(request.id);
    setVerificationPhase("spinner");
    setTimeout(() => setVerificationPhase("checkmark"), 1000);
    setTimeout(() => {
      const newAccount: ConnectedAccount = {
        id: `new-${Date.now()}`,
        name: request.companyName,
        consentStatus: "Active",
        isBreached: false,
      };
      setConnectedAccounts((prev) => {
        const next = [newAccount, ...prev];
        saveRcmAccounts(next);
        return next;
      });
      setPendingRequests((prev) => prev.filter((r) => r.id !== request.id));
      setAuthenticatingRequestId(null);
      setVerificationPhase(null);
      setConsentToastVisible(true);
      setTimeout(() => setConsentToastVisible(false), 3500);
    }, 1500);
  };

  const handleDenyPending = (id: string) => {
    setPendingRequests((prev) => prev.filter((r) => r.id !== id));
  };

  const runAudit = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setBreachTags([]);
    setMobileThreats([]);
    setAadhaarThreats([]);
    setLeaksCount(0);
    setAuditError(null);

    try {
      const aadhaarForAudit = (govtIds.aadhaar?.value ?? "").trim() || aadhaarPan.trim();
      const res = await fetch(AUDIT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: primaryEmail.trim() || "",
          mobile: primaryMobile.trim().replace(/\D/g, ""),
          aadhaarPan: aadhaarForAudit,
          deepIdentityScan: deepIdentityScan,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      const data = await res.json();
      const tags = Array.isArray(data.breachTags) ? data.breachTags : [];
      const found = typeof data.found === "number" ? data.found : tags.length;
      const mobThreats = Array.isArray(data.mobileThreats) ? data.mobileThreats : [];
      const aadThreats = Array.isArray(data.aadhaarThreats) ? data.aadhaarThreats : [];

      setBreachTags(tags);
      setMobileThreats(mobThreats);
      setAadhaarThreats(aadThreats);
      setAuditScore(1);
      setLeaksCount(found + mobThreats.length + aadThreats.length);
      setGovtIds((prev) => {
        const next = { ...prev, aadhaar: { ...prev.aadhaar, value: prev.aadhaar.value || aadhaarForAudit, scanStatus: aadThreats.length > 0 ? "Unauthorized Ping Detected" : "No Leaks" } };
        saveGovtIds(next);
        return next;
      });

      const eP = tags.length === 0 ? 100 : tags.length <= 3 ? 65 : 25;
      const mP = mobThreats.length === 0 ? 100 : Math.max(0, 100 - mobThreats.length * 30);
      const iP = aadThreats.length === 0 ? 100 : Math.max(0, 100 - aadThreats.length * 35);
      const mE = deepIdentityScan ? mP : 100;
      const iE = deepIdentityScan ? iP : 100;
      const combinedScore = Math.max(0, Math.min(100, Math.round(eP * 0.2 + mE * 0.2 + iE * 0.6)));

      const threatSummary = [...tags, ...mobThreats, ...aadThreats];
      const entry: AuditEntry = {
        email: primaryEmail.trim() || "Anonymous",
        mobile: primaryMobile.trim() || undefined,
        score: combinedScore,
        dateTime: new Date().toISOString(),
        verified: hasVerifiedMobile || hasVerifiedEmail,
        scanType: deepIdentityScan ? "Deep Scan" : "Standard",
        threatCount: threatSummary.length,
        threatSummary: threatSummary.length > 0 ? threatSummary : undefined,
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
    const body = encodeURIComponent(getDeletionNoticeBody(primaryEmail.trim(), profile.name || name));
    window.location.href = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;
  };

  const copyDeletionNotice = async (id: string) => {
    try {
      await navigator.clipboard.writeText(getDeletionNoticeBody(primaryEmail.trim(), profile.name || name));
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

  const handleOtpVerify = () => {
    const digits = otpInput.replace(/\D/g, "").slice(0, 4);
    if (digits.length < 4) return;
    const target = verificationTarget;
    const pendingId = pendingVerifyIdentityId;
    const currentEmail = email.trim();
    const currentMobile = mobile.trim();
    setOtpVerifying(true);
    setTimeout(() => {
      setOtpVerifying(false);
      setOtpSuccess(true);
      setTimeout(() => {
        setOtpModalOpen(false);
        setOtpInput("");
        setOtpSuccess(false);
        setVerificationTarget(null);
        if (pendingId) {
          setIdentities((prev) => {
            const next = prev.map((i) => (i.id === pendingId ? { ...i, verified: true } : i));
            saveIdentities(next);
            const verifiedItem = next.find((i) => i.id === pendingId);
            if (verifiedItem) {
              setProfile((p) => {
                const nextProfile = verifiedItem.type === "email"
                  ? { ...p, primaryEmail: verifiedItem.value }
                  : { ...p, mobile: verifiedItem.value };
                saveProfile(nextProfile);
                return nextProfile;
              });
            }
            return next;
          });
          setPendingVerifyIdentityId(null);
        }
        if (target === "email") {
          setEmailVerified(true);
          if (!pendingId) {
            setProfile((p) => {
              const next = { ...p, primaryEmail: currentEmail || p.primaryEmail };
              saveProfile(next);
              return next;
            });
          }
        } else {
          setMobileVerified(true);
          setDeepIdentityScan(true);
          setMobileScanningAfterVerify(true);
          setTimeout(() => setMobileScanningAfterVerify(false), 2500);
          if (!pendingId) {
            setProfile((p) => {
              const next = { ...p, mobile: currentMobile || p.mobile };
              saveProfile(next);
              return next;
            });
          }
        }
      }, 1500);
    }, 1200);
  };

  const handleResendOtp = () => {
    setResendSecondsLeft(60);
  };

  useEffect(() => {
    if (!otpModalOpen) {
      setResendSecondsLeft(0);
      return;
    }
    setResendSecondsLeft(60);
  }, [otpModalOpen]);

  useEffect(() => {
    if (resendSecondsLeft <= 0) return;
    const t = setInterval(() => setResendSecondsLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendSecondsLeft]);

  useEffect(() => {
    if (exportToast == null) return;
    const t = setTimeout(() => setExportToast(null), 3000);
    return () => clearTimeout(t);
  }, [exportToast]);

  const primaryEmailForExport = profile.primaryEmail || primaryEmail || email || "";
  const sendEmailReport = () => {
    setExportModalOpen(false);
    setExportToast(`Report sent to ${primaryEmailForExport || "[Primary Email]"}`);
  };
  const handleExportDownloadPdf = () => {
    setExportModalOpen(false);
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("SAAKSHI · Audit History Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated ${new Date().toLocaleString()}`, 14, 28);
    let y = 38;
    audits.slice(0, 15).forEach((entry, i) => {
      if (y > 270) return;
      doc.setFontSize(9);
      doc.text(`${new Date(entry.dateTime).toLocaleDateString()} · Score: ${entry.score} · ${entry.scanType || "Standard"}`, 14, y);
      y += 7;
    });
    doc.save("SAAKSHI-Audit-History.pdf");
    setExportToast("PDF downloaded");
  };

  const loadDemoScenario = () => {
    setBreachTags([...DEMO_FINDINGS.email]);
    setMobileThreats([...DEMO_FINDINGS.mobile]);
    setAadhaarThreats([...DEMO_FINDINGS.identity]);
    setAuditScore(1);
    setShowFindings(true);
    setLeaksCount(DEMO_FINDINGS.email.length + DEMO_FINDINGS.mobile.length + DEMO_FINDINGS.identity.length);
  };

  const getNextLabel = (type: "email" | "mobile", current: IdentityItem[]): IdentityLabel => {
    const ofType = current.filter((i) => i.type === type);
    return IDENTITY_LABELS[Math.min(ofType.length, IDENTITY_LABELS.length - 1)];
  };

  const handleAddIdentity = () => {
    const v = addIdentityValue.trim();
    if (!v) return;
    const id = `${addIdentityType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setIdentities((prev) => {
      const label = getNextLabel(addIdentityType, prev);
      const newItem: IdentityItem = { id, type: addIdentityType, value: addIdentityType === "email" ? v : v.replace(/\D/g, ""), verified: false, label };
      const next = [...prev, newItem];
      saveIdentities(next);
      return next;
    });
    setPendingVerifyIdentityId(id);
    setVerificationTarget(addIdentityType);
    setAddIdentityModalOpen(false);
    setAddIdentityValue("");
    setOtpModalOpen(true);
  };

  const removeIdentity = (id: string) => {
    setIdentities((prev) => {
      const next = prev.filter((i) => i.id !== id);
      saveIdentities(next);
      return next;
    });
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
          className="relative w-full max-w-sm rounded-3xl overflow-hidden"
          style={{
            background: "rgba(15, 10, 24, 0.6)",
            border: "1px solid rgba(75, 0, 130, 0.4)",
          }}
          layout
        >
          {(profile.name || name) && (
            <div
              className="absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border"
              style={{
                background: "rgba(75, 0, 130, 0.25)",
                borderColor: "rgba(192, 192, 192, 0.35)",
                color: SILVER,
              }}
            >
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
              Verified Human
            </div>
          )}
          {/* Tab navigation */}
          <div className="flex border-b" style={{ borderColor: "rgba(75, 0, 130, 0.35)" }}>
            {(["audit", "vault", "history", "profile"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="flex-1 py-3.5 text-xs sm:text-sm font-medium transition-colors relative min-w-0"
                style={{
                  color: activeTab === tab ? SILVER : "rgba(192,192,192,0.5)",
                }}
              >
                {tab === "audit" ? "Audit" : tab === "vault" ? "Vault" : tab === "history" ? "History" : "My Profile"}
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
                  {/* Consent ratio — placeholder/spinner until mounted to avoid hydration mismatch */}
                  <div className="flex items-center justify-center gap-4 text-xs font-medium" style={{ color: SILVER }}>
                    {hasMounted ? (
                      <>
                        <span>Active Consents: <span className="tabular-nums" style={{ color: ROYAL_PURPLE }}>{activeCount}</span></span>
                        <span className="opacity-50">|</span>
                        <span>Revoked: <span className="tabular-nums text-emerald-400/90">{revokedCount}</span></span>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-3 w-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "rgba(75, 0, 130, 0.4)" }} aria-hidden />
                        <span className="tabular-nums opacity-80">—</span>
                      </span>
                    )}
                  </div>

                  {/* Gauge or Radar + Risk Breakdown (client-only) */}
                  {hasMounted ? (
                    <>
                      <div className="flex justify-center min-h-[280px] items-center">
                        {deepIdentityScan && isScanning ? (
                          <RadarSweep />
                        ) : (
                          <PrivacyGauge score={score} isScanning={isScanning} />
                        )}
                      </div>
                      {isScanning && !deepIdentityScan && (
                        <p className="text-sm font-medium flex items-center justify-center gap-2" style={{ color: SILVER }}>
                          <span className="w-2 h-2 rounded-full bg-[#4B0082] animate-ping" />
                          Connecting to Secure Servers...
                        </p>
                      )}
                      {/* Risk Breakdown Dashboard — 3 pillars with stagger */}
                      <motion.div
                        className="grid grid-cols-3 gap-2"
                        initial="hidden"
                        animate="visible"
                        variants={{ visible: { transition: { staggerChildren: 0.1 } }, hidden: {} }}
                      >
                        {/* Email Risk — locked if no verified email identity */}
                        <motion.div
                          className={`relative rounded-xl px-3 py-3 text-center ${!hasVerifiedEmail ? "backdrop-blur-sm" : ""}`}
                          style={{
                            background: "rgba(15, 10, 24, 0.8)",
                            border: "1px solid rgba(75, 0, 130, 0.35)",
                          }}
                          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
                        >
                          {!hasVerifiedEmail && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/40 z-10 px-1">
                              <svg className="w-5 h-5 text-amber-400 mb-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                              <span className="text-[9px] font-medium text-amber-200/95 text-center leading-tight">Verify to Scan</span>
                            </div>
                          )}
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: SILVER }}>Email Risk</p>
                          {hasVerifiedEmail && emailVerified && (
                            <span className="inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-400 mb-1">Verified Identity</span>
                          )}
                          <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded ${breachTags.length === 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                            {breachTags.length === 0 ? "Safe" : "Low"}
                          </span>
                          <p className="text-[10px] mt-1.5 opacity-90" style={{ color: SILVER }}>
                            {breachTags.length === 0 ? "No breaches" : `${breachTags.length} Breach${breachTags.length !== 1 ? "es" : ""} Found`}
                          </p>
                        </motion.div>
                        {/* Mobile Risk — locked if no verified mobile or deep scan off */}
                        <motion.div
                          className={`relative rounded-xl px-3 py-3 text-center ${(!hasVerifiedMobile || (!deepIdentityScan && !mobileScanningAfterVerify)) ? "backdrop-blur-sm" : ""}`}
                          style={{
                            background: "rgba(15, 10, 24, 0.8)",
                            border: "1px solid rgba(75, 0, 130, 0.35)",
                          }}
                          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
                        >
                          {(!hasVerifiedMobile || (!deepIdentityScan && !mobileScanningAfterVerify)) && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/40 z-10 px-1">
                              <svg className="w-5 h-5 text-amber-400 mb-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                              <span className="text-[9px] font-medium text-amber-200/95 text-center leading-tight">{!hasVerifiedMobile ? "Verify to Scan" : "High — Locked behind Deep Scan"}</span>
                            </div>
                          )}
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: SILVER }}>Mobile Risk</p>
                          {mobileScanningAfterVerify ? (
                            <>
                              <span className="inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#4B0082]/30 text-purple-300">Deep Scanning...</span>
                              <p className="text-[10px] mt-1.5 opacity-90" style={{ color: SILVER }}>Verifying threats</p>
                            </>
                          ) : (
                            <>
                              <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded ${!mobileVerified ? "bg-gray-500/20 text-gray-400" : mobileThreats.length === 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                                {!mobileVerified ? "Unverified" : mobileThreats.length === 0 ? "Low" : "High"}
                              </span>
                              <p className="text-[10px] mt-1.5 opacity-90" style={{ color: SILVER }}>
                                {!mobileVerified ? "Verify to scan" : mobileThreats.length === 0 ? "No threats" : `${mobileThreats.length} Threat${mobileThreats.length !== 1 ? "s" : ""} Found`}
                              </p>
                            </>
                          )}
                        </motion.div>
                        {/* Identity Risk — Critical - Locked when !deepIdentityScan */}
                        <motion.div
                          className={`relative rounded-xl px-3 py-3 text-center ${!deepIdentityScan ? "backdrop-blur-sm" : ""}`}
                          style={{
                            background: "rgba(15, 10, 24, 0.8)",
                            border: "1px solid rgba(75, 0, 130, 0.35)",
                          }}
                          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
                        >
                          {!deepIdentityScan && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/40 z-10 px-1">
                              <svg className="w-5 h-5 text-amber-400 mb-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                              <span className="text-[9px] font-medium text-amber-200/95 text-center leading-tight">Critical — Locked</span>
                            </div>
                          )}
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: SILVER }}>Identity Risk</p>
                          <span className={`inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded ${aadhaarThreats.length === 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-600/30 text-red-400"}`}>
                            {aadhaarThreats.length === 0 ? "Safe" : "Critical"}
                          </span>
                          <p className="text-[10px] mt-1.5 opacity-90" style={{ color: SILVER }}>
                            {aadhaarThreats.length === 0 ? "No threats" : `${aadhaarThreats.length} Threat${aadhaarThreats.length !== 1 ? "s" : ""} Found`}
                          </p>
                        </motion.div>
                      </motion.div>
                    </>
                  ) : (
                    <div className="h-48 animate-pulse rounded-xl bg-gray-800" />
                  )}

                  {/* Identity Perimeter — Communications vs Govt. Identifiers */}
                  <div
                    className="rounded-xl px-4 py-4 space-y-4"
                    style={{
                      background: "rgba(15, 10, 24, 0.7)",
                      border: "1px solid rgba(75, 0, 130, 0.35)",
                    }}
                  >
                    <h3 className="text-xs font-semibold uppercase tracking-widest opacity-90" style={{ color: SILVER }}>
                      Identity Perimeter
                    </h3>
                    <div className="flex border-b gap-1 pb-1" style={{ borderColor: "rgba(75, 0, 130, 0.3)" }}>
                      <button type="button" onClick={() => setPerimeterSubTab("communications")} className={`flex-1 py-2 text-xs font-medium rounded-lg transition ${perimeterSubTab === "communications" ? "bg-[#4B0082]/25 text-purple-200 border" : "opacity-70 hover:opacity-100 border border-transparent"}`} style={{ borderColor: perimeterSubTab === "communications" ? "rgba(75, 0, 130, 0.5)" : "transparent", color: SILVER }}>
                        Communications
                      </button>
                      <button type="button" onClick={() => setPerimeterSubTab("govt")} className={`flex-1 py-2 text-xs font-medium rounded-lg transition ${perimeterSubTab === "govt" ? "bg-[#4B0082]/25 text-purple-200 border" : "opacity-70 hover:opacity-100 border border-transparent"}`} style={{ borderColor: perimeterSubTab === "govt" ? "rgba(75, 0, 130, 0.5)" : "transparent", color: SILVER }}>
                        Govt. IDs
                      </button>
                    </div>

                    {perimeterSubTab === "communications" && (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          {hasMounted ? identitiesWithLabels.map((item) => (
                            <motion.span
                              key={item.id}
                              layout
                              className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-full border text-xs font-medium"
                              style={{
                                background: "rgba(75, 0, 130, 0.15)",
                                borderColor: "rgba(192, 192, 192, 0.25)",
                                color: SILVER,
                              }}
                            >
                              {item.type === "email" ? (
                                <svg className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL_PURPLE }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                              ) : (
                                <svg className="w-3.5 h-3.5 shrink-0" style={{ color: ROYAL_PURPLE }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                              )}
                              <span className="truncate max-w-[100px]">{item.value}</span>
                              {item.label && (
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase ${item.label === "Primary" ? "bg-[#4B0082]/30 text-purple-200" : item.label === "Business" ? "bg-slate-600/40 text-slate-200" : "bg-amber-900/40 text-amber-200"}`}>
                                  {item.label}
                                </span>
                              )}
                              {item.verified && <span className="text-emerald-400 shrink-0" title="Verified"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg></span>}
                              <button type="button" onClick={() => removeIdentity(item.id)} className="shrink-0 p-0.5 rounded hover:bg-white/10 opacity-70" aria-label="Remove"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                            </motion.span>
                          )) : (
                            <span className="text-xs opacity-70" style={{ color: SILVER }}>—</span>
                          )}
                          <button
                            type="button"
                            onClick={() => { setAddIdentityModalOpen(true); setAddIdentityValue(""); setAddIdentityType("email"); }}
                            disabled={isScanning}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed transition hover:bg-white/5 disabled:opacity-50"
                            style={{ borderColor: "rgba(75, 0, 130, 0.5)", color: ROYAL_PURPLE }}
                            aria-label="Add identity"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4B0082]/20" aria-hidden>
                            <svg className="h-4 w-4" style={{ color: ROYAL_PURPLE }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          </span>
                          <input
                            type="text"
                            placeholder="Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onBlur={() => { if (name.trim()) { setProfile((p) => { const next = { ...p, name: name.trim() }; saveProfile(next); return next; }); } }}
                            onKeyDown={(e) => e.key === "Enter" && runAudit()}
                            disabled={isScanning}
                            className="flex-1 h-11 px-3 rounded-lg bg-white/5 border text-[#e8e6ed] placeholder-[#C0C0C080] focus:outline-none focus:ring-2 focus:ring-[#4B0082] focus:border-transparent transition disabled:opacity-50 text-sm"
                            style={{ borderColor: "rgba(192,192,192,0.25)" }}
                            aria-label="Name"
                          />
                        </div>
                      </>
                    )}

                    {perimeterSubTab === "govt" && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 pb-1" style={{ borderColor: "rgba(120, 127, 140, 0.35)" }}>
                          <svg className="w-4 h-4 shrink-0 opacity-80" style={{ color: "#94a3b8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#94a3b8" }}>Steel Vault · Govt. IDs</span>
                        </div>
                        {hasMounted ? (["aadhaar", "pan", "voterId"] as const).map((kind) => {
                          const entry = govtIds[kind];
                          const status = entry?.scanStatus ?? "Not scanned";
                          const isBreach = status !== "No Leaks" && status !== "Not scanned" && status.length > 0;
                          const label = kind === "aadhaar" ? "Aadhaar" : kind === "pan" ? "PAN" : "Voter ID";
                          const placeholder = kind === "aadhaar" ? "Aadhaar number (optional)" : kind === "pan" ? "PAN (optional)" : "Voter ID (optional)";
                          return (
                            <div
                              key={kind}
                              className="rounded-xl overflow-hidden border relative"
                              style={{
                                background: "linear-gradient(180deg, rgba(55, 60, 68, 0.5) 0%, rgba(28, 30, 36, 0.98) 100%)",
                                borderColor: isBreach ? "rgba(239, 68, 68, 0.5)" : "rgba(148, 163, 184, 0.35)",
                                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.25)",
                              }}
                            >
                              {isBreach && (
                                <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/20 border border-red-500/40">
                                  <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-red-400">Critical Alert</span>
                                </div>
                              )}
                              <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: "rgba(148, 163, 184, 0.2)", background: "rgba(30, 32, 38, 0.5)" }}>
                                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>{label}</span>
                              </div>
                              <div className="p-3 space-y-2">
                                <input
                                  type="text"
                                  placeholder={placeholder}
                                  value={entry?.value ?? ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setGovtIds((prev) => {
                                      const next = { ...prev, [kind]: { ...prev[kind], value: val } };
                                      saveGovtIds(next);
                                      if (kind === "aadhaar") setAadhaarPan(val);
                                      return next;
                                    });
                                  }}
                                  disabled={isScanning}
                                  className="w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#64748b]"
                                  style={{ background: "rgba(15, 17, 22, 0.9)", borderColor: "rgba(148, 163, 184, 0.3)", color: "#e2e8f0" }}
                                />
                                <p className="text-[10px] font-medium flex items-center gap-1.5" style={{ color: "#94a3b8" }}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#64748b]" aria-hidden />
                                  Deep Scan: <span className={status === "No Leaks" ? "text-emerald-400" : isBreach ? "text-red-400" : "text-slate-400"}>{status}</span>
                                </p>
                              </div>
                            </div>
                          );
                        }) : (
                          <div className="py-4 text-center text-xs opacity-70" style={{ color: "#94a3b8" }}>—</div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-medium" style={{ color: SILVER }}>Deep Identity Scan</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={deepIdentityScan}
                        onClick={() => setDeepIdentityScan((v) => !v)}
                        disabled={isScanning}
                        className="relative h-6 w-11 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[#4B0082] focus:ring-offset-0 focus:ring-offset-transparent disabled:opacity-50"
                        style={{
                          background: deepIdentityScan ? ROYAL_PURPLE : "rgba(255,255,255,0.08)",
                          borderColor: "rgba(192,192,192,0.3)",
                        }}
                      >
                        <motion.span
                          className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm"
                          style={{ left: deepIdentityScan ? "22px" : "4px" }}
                          transition={{ type: "spring", stiffness: 500, damping: 35 }}
                        />
                      </button>
                    </div>
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

                  {/* Detailed Findings — categorized table */}
                  <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <h2 className="text-xs font-semibold uppercase tracking-widest opacity-90" style={{ color: SILVER }}>
                        Detailed Findings
                      </h2>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={loadDemoScenario}
                          className="text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 rounded-lg border transition hover:opacity-90"
                          style={{ borderColor: "rgba(75,0,130,0.5)", color: ROYAL_PURPLE, background: "rgba(75,0,130,0.12)" }}
                        >
                          Load demo scenario
                        </button>
                        <select
                          value={findingsCategoryFilter}
                          onChange={(e) => setFindingsCategoryFilter(e.target.value as typeof findingsCategoryFilter)}
                          className="text-[10px] font-medium rounded-lg px-2 py-1.5 bg-white/5 border focus:outline-none focus:ring-1 focus:ring-[#4B0082]"
                          style={{ borderColor: "rgba(192,192,192,0.25)", color: SILVER }}
                        >
                          <option value="all">All</option>
                          <option value="Email">Email</option>
                          <option value="Mobile">Mobile</option>
                          <option value="Identity">Identity</option>
                          <option value="Consent">Consent</option>
                        </select>
                      </div>
                    </div>
                      <div
                        className="rounded-xl overflow-hidden"
                        style={{
                          background: "rgba(15, 10, 24, 0.95)",
                          border: "1px solid rgba(75, 0, 130, 0.4)",
                        }}
                      >
                        {categorizedFindings.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr style={{ borderColor: "rgba(75, 0, 130, 0.3)" }} className="border-b">
                                  <th className="py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider opacity-90" style={{ color: SILVER }}>Category</th>
                                  <th className="py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider opacity-90" style={{ color: SILVER }}>Finding</th>
                                  <th className="py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider opacity-90" style={{ color: SILVER }}>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {categorizedFindings.map((row, i) => (
                                  <tr key={`${row.category}-${row.finding}-${row.accId ?? i}`} className="border-b last:border-b-0" style={{ borderColor: "rgba(75, 0, 130, 0.2)" }}>
                                    <td className="py-2 px-3 font-medium" style={{ color: SILVER }}>{row.category}</td>
                                    <td className="py-2 px-3 truncate max-w-[140px]">{row.isRevoked ? <span className="text-emerald-200/95">{row.finding}</span> : <span className="text-red-200/95">{row.finding}</span>}</td>
                                    <td className="py-2 px-3">
                                      {row.action === "deletion" && row.category === "Email" && (
                                        <button type="button" onClick={() => handleDeletionRequest(row.finding)} className="text-[10px] font-semibold text-red-300 hover:underline">Request Deletion</button>
                                      )}
                                      {row.action === "deletion" && row.category === "Consent" && row.accId && (
                                        <div className="flex items-center gap-1">
                                          <button type="button" onClick={() => handleDeletionRequest(row.finding)} className="text-[10px] font-semibold text-red-300 hover:underline">Request Deletion</button>
                                          <button type="button" onClick={() => setDraftNoticeOpenForId(row.accId ?? null)} className="p-1 rounded border border-[rgba(192,192,192,0.25)]" aria-label="Copy notice"><svg className="w-3.5 h-3.5" style={{ color: SILVER }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg></button>
                                        </div>
                                      )}
                                      {row.action === "revoked" && <span className="text-[10px] text-emerald-400">Threat Neutralized</span>}
                                      {row.category === "Mobile" && <span className="text-[10px] text-red-400 font-medium">High Risk</span>}
                                      {row.category === "Identity" && !row.action && <span className="text-[10px] opacity-70">—</span>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <>
                          {/* RCM breached companies (legacy list when no categorized rows) */}
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
                          <ul className="space-y-2.5 px-4 py-4">
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
                          </>
                        )}
                      </div>
                    </motion.section>

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
                  {hasMounted ? (
                    <>
                  {/* Vault header: consent counts — client-only placeholders to avoid hydration mismatch */}
                  <div className="flex items-center justify-between text-xs font-medium" style={{ color: SILVER }}>
                    <span>Active Consents: <span className="tabular-nums font-semibold" style={{ color: ROYAL_PURPLE }}>{hasMounted ? activeCount : "—"}</span></span>
                    <span>Revoked: <span className="tabular-nums text-emerald-400/90">{hasMounted ? revokedCount : "—"}</span></span>
                  </div>

                  {/* Pending Consent Requests — high-priority card with soft purple pulse */}
                  {pendingRequests.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-widest opacity-90" style={{ color: SILVER }}>
                        Pending Consent Requests
                      </h3>
                      {pendingRequests.map((req) => (
                        <motion.div
                          key={req.id}
                          layout
                          className="relative rounded-xl px-4 py-4 space-y-3 overflow-hidden"
                          style={{
                            background: "rgba(15, 10, 24, 0.95)",
                            border: "1px solid rgba(75, 0, 130, 0.5)",
                            boxShadow: "0 0 0 1px rgba(192,192,192,0.06) inset",
                          }}
                          animate={{
                            boxShadow: [
                              "0 0 0 1px rgba(192,192,192,0.06) inset, 0 0 20px 0 rgba(75, 0, 130, 0.25)",
                              "0 0 0 1px rgba(192,192,192,0.06) inset, 0 0 32px 4px rgba(75, 0, 130, 0.4)",
                              "0 0 0 1px rgba(192,192,192,0.06) inset, 0 0 20px 0 rgba(75, 0, 130, 0.25)",
                            ],
                          }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4B0082]/30">
                              <svg className="h-3.5 w-3.5" style={{ color: ROYAL_PURPLE }} fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                              </svg>
                            </span>
                            <p className="text-sm font-semibold" style={{ color: SILVER }}>
                              {req.companyName}
                            </p>
                          </div>
                          <p className="text-xs opacity-90 pl-8" style={{ color: SILVER }}>
                            Requesting access to: [{" "}
                            {req.accessTo.join(", ")}
                            ]
                          </p>
                          {authenticatingRequestId === req.id ? (
                            <div className="flex items-center gap-3 pt-2">
                              {verificationPhase === "spinner" && (
                                <>
                                  <motion.span
                                    className="h-5 w-5 shrink-0 rounded-full border-2 border-t-transparent"
                                    style={{ borderColor: "rgba(75, 0, 130, 0.6)" }}
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                                  />
                                  <span className="text-sm font-medium" style={{ color: SILVER }}>
                                    Verifying Identity
                                  </span>
                                </>
                              )}
                              {verificationPhase === "checkmark" && (
                                <motion.div
                                  className="flex items-center gap-2"
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                >
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/25 ring-2 ring-emerald-400/40">
                                    <svg className="h-3.5 w-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                    </svg>
                                  </span>
                                  <span className="text-sm font-medium text-emerald-400">Verified</span>
                                </motion.div>
                              )}
                            </div>
                          ) : (
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleApprovePending(req)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-95 active:scale-[0.99]"
                                style={{ background: ROYAL_PURPLE }}
                              >
                                Approve with SAAKSHI
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDenyPending(req.id)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all hover:bg-white/5 active:scale-[0.99]"
                                style={{ borderColor: "rgba(192,192,192,0.5)", color: SILVER }}
                              >
                                Deny
                              </button>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Success toast: Consent Token Issued */}
                  <AnimatePresence>
                    {consentToastVisible && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="rounded-xl px-4 py-3 flex items-center gap-2 border bg-emerald-950/40 border-emerald-500/40 text-emerald-200 text-sm font-medium"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                          <svg className="h-3.5 w-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                        </span>
                        Consent Token Issued & Logged (DPDP Compliant)
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <p className="text-xs font-medium opacity-80" style={{ color: SILVER }}>
                    Manage consent for connected accounts. Revoke to improve your Privacy Score.
                  </p>
                  <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1 -mr-1">
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
                    </>
                  ) : (
                    <div className="h-48 animate-pulse rounded-xl bg-gray-800" />
                  )}
                </motion.div>
              )}

              {activeTab === "history" && (
                <motion.div
                  key="history"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4 px-2 pb-4"
                >
                  {/* Export Privacy Report */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: SILVER }}>
                      Privacy Progress
                    </h3>
                    <button
                      type="button"
                      onClick={() => setExportModalOpen(true)}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border font-medium text-xs transition hover:bg-white/5"
                      style={{ borderColor: "rgba(75, 0, 130, 0.5)", color: ROYAL_PURPLE, background: "rgba(75, 0, 130, 0.15)" }}
                    >
                      Export Privacy Report
                    </button>
                  </div>
                  {exportToast && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs font-medium py-2 px-3 rounded-lg border text-emerald-300 bg-emerald-500/10 border-emerald-500/30">
                      {exportToast}
                    </motion.p>
                  )}
                  {/* Privacy Trend Chart */}
                  {audits.length > 0 && (
                    <div
                      className="rounded-xl overflow-hidden border p-3"
                      style={{
                        background: "rgba(15, 10, 24, 0.9)",
                        borderColor: "rgba(75, 0, 130, 0.35)",
                      }}
                    >
                      <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: SILVER }}>
                        Privacy Health Score · Last {Math.min(10, audits.length)} audits
                      </h3>
                      <div className="h-32 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={[...audits.slice(0, 10)].reverse().map((a, i) => ({
                              index: i + 1,
                              score: a.score,
                              date: new Date(a.dateTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
                            }))}
                            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                          >
                            <defs>
                              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={ROYAL_PURPLE} stopOpacity={0.4} />
                                <stop offset="100%" stopColor={ROYAL_PURPLE} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" tick={{ fontSize: 9, fill: SILVER }} stroke="rgba(192,192,192,0.3)" />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: SILVER }} stroke="rgba(192,192,192,0.3)" width={28} />
                            <Tooltip
                              contentStyle={{
                                background: "rgba(15, 10, 24, 0.98)",
                                border: "1px solid rgba(75, 0, 130, 0.5)",
                                borderRadius: 8,
                                color: SILVER,
                                fontSize: 11,
                              }}
                              labelStyle={{ color: SILVER }}
                              formatter={(value: number | undefined) => [value ?? 0, "Score"]}
                              labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                              itemStyle={{ color: SILVER }}
                              cursor={{ stroke: "rgba(75, 0, 130, 0.5)" }}
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const p = payload[0].payload;
                                return (
                                  <div className="px-2 py-1.5 rounded border" style={{ background: "rgba(15, 10, 24, 0.98)", borderColor: "rgba(75, 0, 130, 0.5)", color: SILVER, fontSize: 11 }}>
                                    <div>{p?.date ?? ""} · Score: {p?.score ?? 0}</div>
                                    <div className="text-[10px] mt-0.5 opacity-90">Score improved after your Deletion Requests were processed.</div>
                                  </div>
                                );
                              }}
                            />
                            <Area type="monotone" dataKey="score" stroke={ROYAL_PURPLE} strokeWidth={2} fill="url(#scoreGradient)" dot={{ fill: ROYAL_PURPLE, r: 3 }} activeDot={{ r: 5 }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <p className="text-[10px] mt-1 opacity-80" style={{ color: SILVER }}>
                        Score improved after your Deletion Requests were processed.
                      </p>
                    </div>
                  )}

                  {/* Audit History Table */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: SILVER }}>
                      Audit History & Progress
                    </h3>
                    {audits.length === 0 ? (
                      <div
                        className="rounded-xl border py-8 px-4 text-center text-sm"
                        style={{
                          background: "rgba(15, 10, 24, 0.9)",
                          borderColor: "rgba(75, 0, 130, 0.35)",
                          color: "rgba(192,192,192,0.7)",
                        }}
                      >
                        No audits yet. Run an audit from the Audit tab to see your privacy progress here.
                      </div>
                    ) : (
                    <div
                      className="rounded-xl overflow-hidden border"
                      style={{
                        background: "rgba(15, 10, 24, 0.9)",
                        borderColor: "rgba(75, 0, 130, 0.35)",
                      }}
                    >
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b" style={{ borderColor: "rgba(75, 0, 130, 0.4)", background: "rgba(75, 0, 130, 0.12)" }}>
                              <th className="py-2 px-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: SILVER }}>Date</th>
                              <th className="py-2 px-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: SILVER }}>Perimeter</th>
                              <th className="py-2 px-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: SILVER }}>Score</th>
                              <th className="py-2 px-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: SILVER }}>Scan</th>
                              <th className="py-2 px-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: SILVER }}>Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {audits.slice(0, 10).map((entry, i) => {
                              const previousScore = audits[i + 1]?.score ?? null;
                              const delta = previousScore !== null ? entry.score - previousScore : null;
                              return (
                                <tr
                                  key={`${entry.dateTime}-${entry.email}-${i}`}
                                  className="border-b last:border-b-0"
                                  style={{
                                    borderColor: "rgba(75, 0, 130, 0.2)",
                                    background: i % 2 === 1 ? "rgba(255,255,255,0.02)" : "transparent",
                                  }}
                                >
                                  <td className="py-2 px-2 font-medium tabular-nums text-xs" style={{ color: SILVER }}>
                                    {new Date(entry.dateTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                  </td>
                                  <td className="py-2 px-2">
                                    <div className="flex flex-wrap gap-1">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: "rgba(75,0,130,0.2)", color: SILVER }}>
                                        <svg className="w-3 h-3 shrink-0" style={{ color: ROYAL_PURPLE }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                        {maskEmail(entry.email)}
                                      </span>
                                      {entry.mobile && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: "rgba(75,0,130,0.2)", color: SILVER }}>
                                          <svg className="w-3 h-3 shrink-0" style={{ color: ROYAL_PURPLE }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                          {maskMobile(entry.mobile)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2">
                                    <div className="flex items-center gap-1">
                                      <span className="tabular-nums font-semibold" style={{ color: SILVER }}>{entry.score}</span>
                                      {delta !== null && delta !== 0 && (
                                        <span
                                          className={`inline-flex shrink-0 ${delta > 0 ? "text-emerald-400" : "text-red-400"}`}
                                          title={delta > 0 ? "Your score improved due to successful Data Deletion requests." : "Score decreased vs previous audit."}
                                          aria-label={delta > 0 ? "Score improved" : "Score decreased"}
                                        >
                                          {delta > 0 ? (
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                                          ) : (
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 px-2">
                                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${entry.scanType === "Deep Scan" ? "bg-[#4B0082]/25 text-purple-300" : ""}`} style={{ color: entry.scanType === "Deep Scan" ? undefined : SILVER }}>
                                      {entry.scanType || "Standard"}
                                    </span>
                                  </td>
                                  <td className="py-2 px-2">
                                    <button
                                      type="button"
                                      onClick={() => setReportModalEntry(entry)}
                                      className="text-[10px] font-semibold underline decoration-[#4B0082] hover:decoration-[#6a0dad] transition"
                                      style={{ color: "rgba(192,192,192,0.95)" }}
                                    >
                                      View Report
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === "profile" && (
                <motion.div
                  key="profile"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <div
                    className="rounded-2xl overflow-hidden border"
                    style={{
                      background: "linear-gradient(145deg, rgba(75, 0, 130, 0.15) 0%, rgba(15, 10, 24, 0.95) 50%)",
                      borderColor: "rgba(192, 192, 192, 0.25)",
                      boxShadow: "0 0 0 1px rgba(75, 0, 130, 0.2) inset",
                    }}
                  >
                    <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(192,192,192,0.15)" }}>
                      <h3 className="text-sm font-semibold uppercase tracking-widest" style={{ color: SILVER }}>
                        Premium Member · Identity Perimeter
                      </h3>
                    </div>
                    <div className="p-4 space-y-4">
                      <div className="rounded-xl px-4 py-3 border" style={{ borderColor: "rgba(192,192,192,0.2)", background: "rgba(0,0,0,0.2)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80 mb-1" style={{ color: SILVER }}>Name</p>
                        <p className="text-sm font-medium" style={{ color: SILVER }}>{profile.name || name || "—"}</p>
                      </div>
                      <div className="rounded-xl px-4 py-3 border" style={{ borderColor: "rgba(192,192,192,0.2)", background: "rgba(0,0,0,0.2)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80 mb-1" style={{ color: SILVER }}>Verified Primary Email</p>
                        <p className="text-sm font-medium flex items-center gap-2" style={{ color: SILVER }}>
                          {profile.primaryEmail || email || "—"}
                          {emailVerified && <span className="text-emerald-400" aria-label="Verified"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg></span>}
                        </p>
                      </div>
                      <div className="rounded-xl px-4 py-3 border" style={{ borderColor: "rgba(192,192,192,0.2)", background: "rgba(0,0,0,0.2)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80 mb-1" style={{ color: SILVER }}>Verified Mobile</p>
                        <p className="text-sm font-medium flex items-center gap-2" style={{ color: SILVER }}>
                          {profile.mobile || mobile || "—"}
                          {mobileVerified && <span className="text-emerald-400" aria-label="Verified"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg></span>}
                        </p>
                      </div>
                      <div className="rounded-xl px-4 py-3 border" style={{ borderColor: "rgba(192,192,192,0.2)", background: "rgba(0,0,0,0.2)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80 mb-1" style={{ color: SILVER }}>Aadhaar / PAN</p>
                        <p className="text-sm font-medium" style={{ color: SILVER }}>{profile.aadhaarLinked ? "Linked" : aadhaarPan ? "Provided (not linked)" : "Not linked"}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs" style={{ color: SILVER }}>
                    <span>Status</span>
                    <button
                      type="button"
                      onClick={() => setProfile((p) => {
                        const next = {
                          ...p,
                          isRegistered: !p.isRegistered,
                          primaryEmail: p.primaryEmail || email.trim() || p.primaryEmail,
                          name: (p.name || name.trim()) ? (p.name || name) : p.name,
                        };
                        saveProfile(next);
                        return next;
                      })}
                      className={`px-2 py-1 rounded font-medium transition ${profile.isRegistered ? "bg-[#4B0082]/30 text-purple-200 border border-[#4B0082]/50" : "border border-[rgba(192,192,192,0.3)] opacity-70 hover:opacity-100"}`}
                    >
                      {profile.isRegistered ? "Registered" : "Not registered (tap to set demo)"}
                    </button>
                  </div>
                  <div className="rounded-xl px-4 py-3 border flex flex-col gap-2" style={{ borderColor: "rgba(192,192,192,0.2)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80" style={{ color: SILVER }}>Update profile name</p>
                    <input
                      type="text"
                      placeholder="Your name (e.g. Ameet Kumar Agarwal)"
                      value={profile.name || name}
                      onChange={(e) => { const v = e.target.value; setName(v); setProfile((p) => { const next = { ...p, name: v }; saveProfile(next); return next; }); }}
                      className="h-10 px-3 rounded-lg bg-white/5 border text-sm focus:outline-none focus:ring-2 focus:ring-[#4B0082]"
                      style={{ borderColor: "rgba(192,192,192,0.25)", color: SILVER }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

      </main>

      {/* View Report Modal */}
      <AnimatePresence>
        {reportModalEntry && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setReportModalEntry(null)}
            style={{ background: "rgba(0,0,0,0.7)" }}
          >
            <motion.div
              className="rounded-2xl border shadow-xl max-w-sm w-full max-h-[80vh] overflow-hidden flex flex-col"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "rgba(15, 10, 24, 0.98)",
                borderColor: "rgba(75, 0, 130, 0.5)",
              }}
            >
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "rgba(75, 0, 130, 0.35)" }}>
                <h3 className="text-sm font-semibold" style={{ color: SILVER }}>Audit Report</h3>
                <button
                  type="button"
                  onClick={() => setReportModalEntry(null)}
                  className="p-1 rounded hover:bg-white/10 transition"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" style={{ color: SILVER }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-4 overflow-y-auto space-y-3">
                <p className="text-xs" style={{ color: SILVER }}>
                  <span className="font-semibold">Date:</span> {new Date(reportModalEntry.dateTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
                <p className="text-xs" style={{ color: SILVER }}>
                  <span className="font-semibold">Score:</span> {reportModalEntry.score}/100 · {reportModalEntry.scanType || "Standard"}
                </p>
                <p className="text-xs" style={{ color: SILVER }}>
                  <span className="font-semibold">Perimeter:</span> {maskEmail(reportModalEntry.email)}
                  {reportModalEntry.mobile && ` · ${maskMobile(reportModalEntry.mobile)}`}
                </p>
                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: SILVER }}>Found threats</p>
                  {reportModalEntry.threatSummary && reportModalEntry.threatSummary.length > 0 ? (
                    <ul className="space-y-1 text-xs" style={{ color: "rgba(192,192,192,0.9)" }}>
                      {reportModalEntry.threatSummary.map((t, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="text-red-400 shrink-0">●</span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-emerald-400/90">No threats found for this scan.</p>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Export Privacy Report Modal */}
      <AnimatePresence>
        {exportModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExportModalOpen(false)}
            style={{ background: "rgba(0,0,0,0.7)" }}
          >
            <motion.div
              className="rounded-2xl border shadow-xl max-w-sm w-full overflow-hidden"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "rgba(15, 10, 24, 0.98)",
                borderColor: "rgba(75, 0, 130, 0.5)",
              }}
            >
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "rgba(75, 0, 130, 0.35)" }}>
                <h3 className="text-sm font-semibold" style={{ color: SILVER }}>Export Privacy Report</h3>
                <button type="button" onClick={() => setExportModalOpen(false)} className="p-1 rounded hover:bg-white/10 transition" aria-label="Close">
                  <svg className="w-5 h-5" style={{ color: SILVER }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-xs opacity-90" style={{ color: SILVER }}>Choose how to export your audit history and privacy progress.</p>
                <button type="button" onClick={sendEmailReport} className="w-full py-3 px-4 rounded-xl font-medium text-sm border transition hover:bg-white/5 flex items-center justify-center gap-2" style={{ borderColor: "rgba(75, 0, 130, 0.5)", color: SILVER }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Email to Verified ID
                </button>
                <button type="button" onClick={handleExportDownloadPdf} className="w-full py-3 px-4 rounded-xl font-medium text-sm border transition hover:bg-white/5 flex items-center justify-center gap-2" style={{ borderColor: "rgba(75, 0, 130, 0.5)", color: SILVER }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Download PDF
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                    {getDeletionNoticeBody(primaryEmail.trim(), profile.name || name)}
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

      {/* Identity Verification — Mock OTP Modal */}
      <AnimatePresence>
        {otpModalOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => { if (!otpVerifying && !otpSuccess) { setOtpModalOpen(false); setOtpInput(""); setOtpVerifying(false); setOtpSuccess(false); setVerificationTarget(null); setPendingVerifyIdentityId(null); } }}
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
                className="pointer-events-auto w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
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
                  <h3 className="text-lg font-semibold mb-2" style={{ color: ROYAL_PURPLE }}>
                    Identity Verification
                  </h3>
                  <p className="text-xs mb-4 opacity-90" style={{ color: SILVER }}>
                    {verificationTarget === "email"
                      ? "A verification code has been sent to your email address."
                      : "A verification code has been sent to your registered mobile number."}
                  </p>
                  {otpSuccess ? (
                    <div className="py-6 flex flex-col items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/25">
                        <svg className="w-6 h-6 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                      </span>
                      <p className="text-sm font-medium text-emerald-300 text-center">Identity Verified & Secured</p>
                    </div>
                  ) : otpVerifying ? (
                    <div className="py-8 flex flex-col items-center gap-3">
                      <motion.span
                        className="h-10 w-10 rounded-full border-2 border-t-transparent"
                        style={{ borderColor: "rgba(75, 0, 130, 0.6)" }}
                        animate={{ rotate: 360 }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                      />
                      <p className="text-sm font-medium" style={{ color: SILVER }}>Verifying...</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-center gap-2 mb-4">
                        {[0, 1, 2, 3].map((i) => (
                          <input
                            key={i}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={otpInput[i] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, "").slice(0, 1);
                              setOtpInput((prev) => {
                                const next = prev.slice(0, i) + v + prev.slice(i + 1);
                                return next.replace(/\D/g, "").slice(0, 4);
                              });
                              if (v && i < 3) (e.target.nextElementSibling as HTMLInputElement)?.focus();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Backspace" && !otpInput[i] && i > 0) (e.target as HTMLElement).previousElementSibling && ((e.target as HTMLElement).previousElementSibling as HTMLInputElement).focus();
                              if (e.key === "Enter" && otpInput.replace(/\D/g, "").length === 4) handleOtpVerify();
                            }}
                            className="w-12 h-12 rounded-xl text-center text-lg font-mono bg-black/30 border focus:outline-none focus:ring-2 focus:ring-[#4B0082] focus:border-transparent"
                            style={{ borderColor: "rgba(75, 0, 130, 0.4)", color: SILVER }}
                            autoFocus={i === 0}
                            aria-label={`Digit ${i + 1}`}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] text-center opacity-80 mb-3" style={{ color: SILVER }}>
                        {resendSecondsLeft > 0 ? `Resend OTP in ${resendSecondsLeft}s` : "Didn't receive the code?"}
                      </p>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendSecondsLeft > 0}
                        className="w-full py-2 text-xs font-medium border rounded-lg transition disabled:opacity-40 disabled:pointer-events-none"
                        style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}
                      >
                        {resendSecondsLeft > 0 ? `Resend OTP (${resendSecondsLeft}s)` : "Resend OTP"}
                      </button>
                    </>
                  )}
                </div>
                {!otpVerifying && !otpSuccess && (
                  <div className="px-6 pb-6 pt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={handleOtpVerify}
                      disabled={otpInput.replace(/\D/g, "").length < 4}
                      className="flex-1 py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
                      style={{ background: ROYAL_PURPLE }}
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOtpModalOpen(false); setOtpInput(""); setOtpVerifying(false); setOtpSuccess(false); setVerificationTarget(null); setPendingVerifyIdentityId(null); }}
                      className="px-4 py-3.5 rounded-xl font-medium border transition hover:bg-white/5"
                      style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add Identity Modal */}
      <AnimatePresence>
        {addIdentityModalOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-50 bg-black/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setAddIdentityModalOpen(false); setAddIdentityValue(""); }}
              aria-hidden
            />
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="pointer-events-auto w-full max-w-sm rounded-2xl overflow-hidden"
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
                  <h3 className="text-lg font-semibold mb-2" style={{ color: ROYAL_PURPLE }}>
                    Add Identity
                  </h3>
                  <p className="text-xs mb-4 opacity-90" style={{ color: SILVER }}>
                    Add an email or mobile number. You will verify it with OTP.
                  </p>
                  <div className="flex gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setAddIdentityType("email")}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${addIdentityType === "email" ? "border-[#4B0082] bg-[#4B0082]/20" : "border-[rgba(192,192,192,0.3)]"}`}
                      style={{ color: addIdentityType === "email" ? ROYAL_PURPLE : SILVER }}
                    >
                      Email
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddIdentityType("mobile")}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition ${addIdentityType === "mobile" ? "border-[#4B0082] bg-[#4B0082]/20" : "border-[rgba(192,192,192,0.3)]"}`}
                      style={{ color: addIdentityType === "mobile" ? ROYAL_PURPLE : SILVER }}
                    >
                      Mobile
                    </button>
                  </div>
                  <input
                    type={addIdentityType === "email" ? "email" : "tel"}
                    placeholder={addIdentityType === "email" ? "name@example.com" : "Mobile number"}
                    value={addIdentityValue}
                    onChange={(e) => setAddIdentityValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddIdentity()}
                    className="w-full py-3.5 px-4 rounded-xl bg-black/30 border focus:outline-none focus:ring-2 focus:ring-[#4B0082] text-sm"
                    style={{ borderColor: "rgba(75, 0, 130, 0.4)", color: SILVER }}
                  />
                </div>
                <div className="px-6 pb-6 pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddIdentity}
                    disabled={!addIdentityValue.trim()}
                    className="flex-1 py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-95 disabled:opacity-50 disabled:pointer-events-none"
                    style={{ background: ROYAL_PURPLE }}
                  >
                    Add & Verify
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAddIdentityModalOpen(false); setAddIdentityValue(""); }}
                    className="px-4 py-3.5 rounded-xl font-medium border transition hover:bg-white/5"
                    style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}
                  >
                    Cancel
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
