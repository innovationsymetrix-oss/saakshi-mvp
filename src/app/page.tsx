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
import LoginScreen from "@/components/LoginScreen";

const ROYAL_PURPLE = "#4B0082";
const SILVER = "#C0C0C0";
const IDENTITY_LABELS: IdentityLabel[] = ["Primary", "Business", "Personal"];
const STORAGE_KEY = "saakshi-audit-history";
const RCM_STORAGE_KEY = "saakshi-rcm-accounts";
const PROFILE_STORAGE_KEY = "saakshi-user-profile";
const IDENTITIES_STORAGE_KEY = "saakshi-identities";
const GOVT_IDS_STORAGE_KEY = "saakshi-govt-identifiers";
const CREDITS_STORAGE_KEY = "saakshi-standard-credits";
function loadStandardCredits(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(CREDITS_STORAGE_KEY);
    if (raw === null) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 0;
  }
}
function saveStandardCredits(credits: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CREDITS_STORAGE_KEY, String(Math.max(0, credits)));
  } catch {
    /* ignore */
  }
}

export type IdentityLabel = "Primary" | "Business" | "Personal";
export type IdentityItem = { id: string; type: "email" | "mobile"; value: string; verified: boolean; label?: string };

export type GovtIdKind = "aadhaar" | "pan" | "voterId" | "dl" | "passport";
const ALL_GOVT_ID_KINDS: GovtIdKind[] = ["aadhaar", "pan", "voterId", "dl", "passport"];
function govtIdLabel(kind: GovtIdKind): string {
  return kind === "aadhaar" ? "Aadhaar" : kind === "pan" ? "PAN" : kind === "voterId" ? "Voter ID" : kind === "dl" ? "Driving Licence" : "Passport";
}
export type GovtIdEntry = { value: string; scanStatus: string; verified?: boolean; verifiedVia?: string };
function defaultGovtIds(): Record<GovtIdKind, GovtIdEntry> {
  return {
    aadhaar: { value: "", scanStatus: "Pending" },
    pan: { value: "", scanStatus: "Pending" },
    voterId: { value: "", scanStatus: "Pending" },
    dl: { value: "", scanStatus: "Pending" },
    passport: { value: "", scanStatus: "Pending" },
  };
}
function maskLast4(value: string): string {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length < 4) return "—";
  return `****${digits.slice(-4)}`;
}
function maskAadhaarDisplay(value: string): string {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length < 4) return "XXXX XXXX —";
  return `XXXX XXXX ${digits.slice(-4)}`;
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
const ADD_COST = 50; // Credits to add a new alternate email/mobile in Profile
const SCAN_COST_PER_ALTERNATE = 5; // Credits per alternate identifier when scanning in Audit

const SUBSCRIPTION_PLANS: { id: string; name: string; scope: string; features: string[]; accent: string }[] = [
  { id: "free", name: "Basic (Free)", scope: "1 Primary Mobile + 1 Primary Email", features: ["Scan Only", "No Actions", "View findings", "Privacy score"], accent: "slate" },
  { id: "standard", name: "Standard", scope: "1 Primary Mobile + 1 Primary Email", features: ["Full Audit & Consent Control", "Request Erasure", "Consent Toggle", "OTP verification"], accent: "purple" },
  { id: "premium", name: "Premium", scope: "Standard + 3 Govt IDs", features: ["All Standard", "Aadhaar, PAN, Voter ID", "Deep Identity Scan", "Premium vault"], accent: "amber" },
  { id: "premiumPlus", name: "Premium Plus", scope: "Premium + 2 Govt IDs", features: ["All Premium", "Driving Licence & Passport", "All 5 Govt IDs", "Full identity perimeter"], accent: "amber" },
];

const GLOBAL_VERIFIED_IDS: string[] = ["breach@example.com", "9999888877", "123456789012"]; // Mock: IDs already linked to other accounts (email, mobile, aadhaar)
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

export type ConsentStatus = "pending" | "active" | "revoked" | "denied";

export type ConnectedAccount = {
  id: string;
  /** Display name of the company (e.g. 'Zomato', 'LinkedIn'). */
  companyName: string;
  /** @deprecated Use companyName. Kept for migration. */
  name?: string;
  /** Ledger status for 4-pillar consent flow (Double Opt-In). */
  status: ConsentStatus;
  /** @deprecated Use status. Kept for migration from stored data. */
  consentStatus?: "Active" | "Revoked";
  /** ISO timestamp of last status/action; used for audit trail. */
  lastUpdated: string;
  /** Set when consent is revoked (ISO); used for "Revoked on [date time]". */
  revokedAt?: string;
  /** Section 12: user requested force erasure; default false. */
  erasureRequested?: boolean;
  /** When the erasure notice was sent (ISO); 72h compliance window. */
  erasureDate?: string;
  /** Optional: what data scope was requested (for pending from requests). */
  accessTo?: string[];
  /** Scope of consent: e.g. ['Primary Email'], ['Primary Mobile', 'Location'], ['Alternate Email', 'PAN Card']. */
  dataScope?: string[];
  isBreached: boolean;
};

export type PendingConsentRequest = {
  id: string;
  companyName: string;
  accessTo: string[];
  /** Scope of data requested: e.g. ['Primary Mobile', 'Location'], ['Alternate Email', 'PAN Card']. */
  dataScope?: string[];
  /** When the request was received (ISO); for audit display. */
  lastUpdated?: string;
};

/** Format ISO timestamp for consent cards: "Mar 07, 2026 - 14:30 IST". */
function formatConsentTimestamp(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const date = d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "Asia/Kolkata" });
    const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
    return `${date} - ${time} IST`;
  } catch {
    return "—";
  }
}

/** Data types stored in the SAAKSHI Vault (Core Identity). Badges matching these use vault styling; others are App Usage Data (permissions). */
const VAULT_IDENTIFIERS = ["Primary Email", "Primary Mobile", "Primary Mobile Number", "Alternate Email", "Alternate Mobile", "Full Name", "Aadhaar", "PAN", "Passport", "Voter ID", "Driving License"] as const;

const INITIAL_PENDING_REQUESTS: PendingConsentRequest[] = [
  { id: "pending-healthstack", companyName: "HealthStack AI", accessTo: ["Full Name", "Date of Birth", "Blood Group"], dataScope: ["Primary Email", "Fitness Metrics", "Heart Rate"], lastUpdated: "2026-03-07T08:00:00.000Z" },
  { id: "pending-loanpro", companyName: "LoanPro", accessTo: ["Full Name", "Primary Mobile Number", "PAN"], dataScope: ["PAN", "Credit Score", "Primary Mobile"], lastUpdated: "2026-03-07T09:30:00.000Z" },
];

/** Distinct companies only; realistic DPDP identifiers per company type. No generic 'Consent Data' / 'Info' / 'Details'. */
const INITIAL_RCM_ACCOUNTS: ConnectedAccount[] = [
  { id: "1", companyName: "Zomato", status: "active", lastUpdated: "2026-01-15T10:00:00.000Z", isBreached: true, dataScope: ["Primary Mobile", "Live Location", "Order History"] },
  { id: "2", companyName: "HDFC Bank", status: "active", lastUpdated: "2026-01-15T10:00:00.000Z", isBreached: false, dataScope: ["PAN", "Credit Score", "Primary Mobile"] },
  { id: "3", companyName: "Flipkart", status: "revoked", lastUpdated: "2026-02-01T14:20:00.000Z", revokedAt: "2026-02-01T14:20:00.000Z", isBreached: true, dataScope: ["Primary Email", "Delivery Address", "Purchase History"] },
  { id: "4", companyName: "LinkedIn", status: "active", lastUpdated: "2026-01-15T10:00:00.000Z", isBreached: true, dataScope: ["Primary Email", "Professional Profile", "Employment History"] },
  { id: "5", companyName: "Canva", status: "active", lastUpdated: "2026-01-15T10:00:00.000Z", isBreached: false, dataScope: ["Primary Email", "Profile Photo", "Design Assets"] },
  { id: "6", companyName: "Adobe", status: "revoked", lastUpdated: "2026-02-01T14:20:00.000Z", revokedAt: "2026-02-01T14:20:00.000Z", isBreached: true, dataScope: ["Primary Email", "Alternate Email", "Creative Cloud ID"] },
  { id: "7", companyName: "Dark Web Forums", status: "active", lastUpdated: "2026-01-15T10:00:00.000Z", isBreached: true, dataScope: ["Primary Email", "Aadhaar", "PAN"] },
  { id: "8", companyName: "Swiggy", status: "active", lastUpdated: "2026-01-15T10:00:00.000Z", isBreached: false, dataScope: ["Primary Mobile", "Live Location", "Order History"] },
];

function normalizeAccount(a: ConnectedAccount & { name?: string }): ConnectedAccount {
  const status = a.status ?? (a.consentStatus === "Revoked" ? "revoked" : "active");
  const companyName = a.companyName ?? a.name ?? "—";
  const lastUpdated = a.lastUpdated ?? new Date().toISOString();
  const erasureRequested = a.erasureRequested ?? false;
  const dataScope = (a.dataScope && a.dataScope.length > 0) ? a.dataScope : (a.accessTo && a.accessTo.length > 0) ? a.accessTo : ["Primary Email", "Account Identifiers"];
  return { ...a, status, companyName, lastUpdated, erasureRequested, dataScope, consentStatus: undefined, name: undefined };
}

function loadRcmAccounts(): ConnectedAccount[] {
  if (typeof window === "undefined") return INITIAL_RCM_ACCOUNTS;
  try {
    const raw = localStorage.getItem(RCM_STORAGE_KEY);
    if (!raw) return INITIAL_RCM_ACCOUNTS;
    const parsed = JSON.parse(raw) as ConnectedAccount[];
    if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_RCM_ACCOUNTS;
    return parsed.map(normalizeAccount);
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
    if (a.status === "active") score -= 20;
    else score += 5;
  }
  return Math.max(0, Math.min(100, score));
}

export type ReportCategory = "Primary Email" | "Primary Mobile" | "Alternate Emails" | "Alternate Mobiles" | "Govt IDs";

/** Single breach in a report: source name + what data was stolen. */
export type FoundThreat = { source: string; compromisedData: string[] };

export type AuditEntry = {
  id?: string;
  email: string;
  score: number;
  dateTime: string;
  /** Display date string e.g. 'Mar 07, 2026' */
  date?: string;
  verified?: boolean;
  mobile?: string;
  scanType?: "Standard" | "Identity Audit";
  threatCount?: number;
  threatSummary?: string[];
  /** Structured threats for Threat Dossier UI: source + compromisedData per breach. */
  foundThreats?: FoundThreat[];
  /** Identifiers that were scanned (e.g. ['name@business.com', '+91 98XXXXXX']). */
  scannedIdentifiers?: string[];
  /** Category for Reports filter (derived from compromisedVectors if missing). */
  category?: ReportCategory;
  /** Number of threats/leaks found in this scan. */
  threatsFound?: number;
  /** Precise vectors affected: ['Primary Email'], ['Primary Mobile'], or both. Used for filter. */
  compromisedVectors?: string[];
  /** Data points exposed in this breach (e.g. ['Primary Email', 'IP Address']). Vault items shown first in side panel. */
  breachedDataPoints?: string[];
};

const REPORT_FILTERS: ReportCategory[] = ["Primary Email", "Primary Mobile", "Alternate Emails", "Alternate Mobiles", "Govt IDs"];

/** Hardcoded mock reports: exact structure for Reports tab filters and Threat Dossier. */
const SEED_AUDIT_REPORTS: AuditEntry[] = [
  {
    id: "rep-email",
    category: "Primary Email",
    date: "Mar 07, 2026",
    dateTime: "2026-03-07T00:00:00.000Z",
    email: "user@company.com",
    score: 72,
    threatsFound: 14,
    foundThreats: [
      { source: "LinkedIn (2012-05)", compromisedData: ["Primary Email", "Passwords", "Job History"] },
      { source: "Canva (2019-05)", compromisedData: ["Primary Email", "Passwords", "Location"] },
    ],
  },
  {
    id: "rep-mobile",
    category: "Primary Mobile",
    date: "Mar 07, 2026",
    dateTime: "2026-03-07T00:00:00.000Z",
    email: "",
    score: 85,
    threatsFound: 2,
    foundThreats: [
      { source: "Telecom Provider Leak", compromisedData: ["Primary Mobile Number", "SMS Logs"] },
    ],
  },
];

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

function normalizeAuditEntry(e: AuditEntry & { category?: ReportCategory | "Primary Identity" }): AuditEntry {
  const threatsFound = e.threatsFound ?? e.threatCount ?? 0;
  const scannedIdentifiers = e.scannedIdentifiers ?? [e.email, e.mobile].filter(Boolean);
  const rawCategory = e.category ?? "Primary Email";
  const category: ReportCategory = rawCategory === "Primary Identity" ? "Primary Email" : rawCategory as ReportCategory;
  const compromisedVectors = e.compromisedVectors && e.compromisedVectors.length > 0 ? e.compromisedVectors : [category];
  const breachedDataPoints = e.breachedDataPoints ?? (e.threatsFound ?? e.threatCount) ? compromisedVectors : [];
  const fallbackData = breachedDataPoints.length > 0 ? breachedDataPoints : compromisedVectors;
  const foundThreats = e.foundThreats && e.foundThreats.length > 0 ? e.foundThreats : (e.threatSummary && e.threatSummary.length > 0 ? e.threatSummary.map((source) => ({ source, compromisedData: fallbackData })) : []);
  const scanType = e.scanType === "Deep Scan" ? "Identity Audit" : (e.scanType ?? "Standard");
  return { ...e, threatsFound, scannedIdentifiers, category, compromisedVectors, breachedDataPoints, foundThreats, scanType };
}

function loadAudits(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_AUDIT_REPORTS.map(normalizeAuditEntry);
    const parsed = JSON.parse(raw) as AuditEntry[];
    const list = Array.isArray(parsed) && parsed.length > 0 ? parsed.map(normalizeAuditEntry) : SEED_AUDIT_REPORTS.map(normalizeAuditEntry);
    return list;
  } catch {
    return SEED_AUDIT_REPORTS.map(normalizeAuditEntry);
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
  /** Date of birth; empty string until user adds it via Profile. */
  dob: string;
  /** Whether DOB verification is activated (consumes 1 credit when turned on). */
  isDobActivated: boolean;
  aadhaarLinked: boolean;
  isRegistered: boolean;
};

const DEFAULT_PROFILE: UserProfile = {
  name: "",
  primaryEmail: "",
  mobile: "",
  dob: "",
  isDobActivated: false,
  aadhaarLinked: false,
  isRegistered: false,
};

/** Convert display DOB (e.g. "16 Mar 1986") to YYYY-MM-DD for <input type="date" />. */
function dobToInputValue(dob: string): string {
  if (!dob.trim()) return "";
  const d = new Date(dob.trim());
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

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

/** Generates the official DPDP Legal Notice of Erasure. Returns subject and body for mailto or future AWS SES backend. */
function generateErasureNotice(
  companyName: string,
  userProfile: { name: string; dob: string },
  specificIdentifier: string
): { subject: string; body: string } {
  const name = (userProfile.name && userProfile.name.trim()) || "[Your Name]";
  const dob = (userProfile.dob && userProfile.dob.trim()) || "[DOB]";
  const subject = `URGENT: Legal Notice for Erasure of Personal Data under DPDP Act 2023 - Request for ${companyName}`;
  const body = `To the Grievance Officer / Data Protection Officer,
${companyName}

Subject: Formal Request for Erasure of Personal Data under Section 12 of the Digital Personal Data Protection (DPDP) Act, 2023.

I, ${name} (DOB: ${dob}), am writing to formally exercise my Right to Erasure under the DPDP Act 2023 regarding my personal data processed by your organization.

Through an audit conducted by my Registered Consent Manager (SAAKSHI), I have identified that your organization holds my personal data linked to the following verified identifier:

Identifier: ${specificIdentifier}

Legal Demand:

I hereby demand the immediate and permanent erasure of all personal data, behavioral profiles, and shadow profiles associated with this identifier from your active servers, backups, and third-party processors.

I formally withdraw any previously granted consent for the processing of this data.

Compliance Timeline:
Under the DPDP Act 2023, you are required to acknowledge this request and execute the erasure without undue delay. Failure to comply, or failure to provide a valid legal exemption, will result in a formal grievance being filed with the Data Protection Board of India (DPBI), which may subject your organization to significant financial penalties.

Please reply to this email within 72 hours with written confirmation that the erasure has been completed.

Issued securely via SAAKSHI Identity Command Center on behalf of the Data Principal.`;
  return { subject, body };
}

/** @deprecated Use generateErasureNotice for DPDP-compliant notices. Kept for backward compatibility. */
const getDeletionNoticeBody = (auditedEmail: string, profileName?: string | null): string => {
  const name = (profileName && profileName.trim()) ? profileName.trim() : (auditedEmail ? formatNameFromEmail(auditedEmail) : "[Your Name]");
  const registeredEmail = auditedEmail || "[Your Email]";
  return `To the Data Protection Officer,\n\nUnder the provisions of the Digital Personal Data Protection Act, 2023, I hereby request the immediate erasure of all my personal data held by your organization.\n\nPlease confirm once the deletion is complete.\n\nRegards,\n${name}\nRegistered Email: ${registeredEmail}`;
};

type TabId = "audit" | "vault" | "consents" | "reports" | "profile";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("audit");
  const [activeReportFilter, setActiveReportFilter] = useState<ReportCategory | "All">("All");
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
  const [draftNoticeContext, setDraftNoticeContext] = useState<{ companyName: string; specificIdentifier: string } | null>(null);
  const [deletionPendingKeys, setDeletionPendingKeys] = useState<Set<string>>(new Set());
  const [pendingRequests, setPendingRequests] = useState<PendingConsentRequest[]>(() => [...INITIAL_PENDING_REQUESTS]);
  const [authenticatingRequestId, setAuthenticatingRequestId] = useState<string | null>(null);
  const [verificationPhase, setVerificationPhase] = useState<"spinner" | "checkmark" | null>(null);
  const [consentToastVisible, setConsentToastVisible] = useState(false);
  const [consentActionToast, setConsentActionToast] = useState<"revoked" | "regranted" | "registered" | "movedToPending" | null>(null);
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
  const [pendingAddConsumesCredits, setPendingAddConsumesCredits] = useState(false);
  const [pendingVerifyIdentityId, setPendingVerifyIdentityId] = useState<string | null>(null);
  const [reportModalEntry, setReportModalEntry] = useState<AuditEntry | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState<"pdf" | "excel" | "email" | null>(null);
  const [perimeterSubTab, setPerimeterSubTab] = useState<"communications" | "govt">("communications");
  const [govtIds, setGovtIds] = useState<Record<GovtIdKind, GovtIdEntry>>(defaultGovtIds);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showBuyCreditsModal, setShowBuyCreditsModal] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState<"standard" | "premium" | null>(null);
  const [subscriptionTier, setSubscriptionTier] = useState<"free" | "standard" | "premium" | "premiumPlus">("standard");
  const [standardCredits, setStandardCredits] = useState(0);
  const [profileNameEditing, setProfileNameEditing] = useState(false);
  const [profileNameEditValue, setProfileNameEditValue] = useState("");
  const [isEditingDob, setIsEditingDob] = useState(false);
  const [tempDob, setTempDob] = useState("");
  const [dobActivatedToast, setDobActivatedToast] = useState(false);
  const [activeConsentView, setActiveConsentView] = useState<"pending" | "active" | "revoked" | "denied">("pending");
  const [selectedIdentityIdsForScan, setSelectedIdentityIdsForScan] = useState<Set<string>>(new Set());
  const [showSubscriptionPlanModal, setShowSubscriptionPlanModal] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [addIdentityCustomLabel, setAddIdentityCustomLabel] = useState("");
  const [addIdentityStep, setAddIdentityStep] = useState<"form" | "otp">("form");
  const [addIdentityOtpInput, setAddIdentityOtpInput] = useState("");
  const [identityAddedToast, setIdentityAddedToast] = useState(false);
  const [showDigiLockerModal, setShowDigiLockerModal] = useState(false);
  const [govtIdForVerify, setGovtIdForVerify] = useState<GovtIdKind | null>(null);
  const [showVaultLimitModal, setShowVaultLimitModal] = useState(false);
  const [showErasureModal, setShowErasureModal] = useState(false);
  const [selectedErasureId, setSelectedErasureId] = useState<string | null>(null);
  const [erasureToast, setErasureToast] = useState<string | null>(null);
  const [showGlossary, setShowGlossary] = useState(false);
  const [showTakedownModal, setShowTakedownModal] = useState(false);
  const [takedownToast, setTakedownToast] = useState<string | null>(null);
  const [emailScore, setEmailScore] = useState(72);
  const [mobileScore, setMobileScore] = useState(85);
  const [vaultScore, setVaultScore] = useState(90);
  const [securityBreachToast, setSecurityBreachToast] = useState(false);
  const canTakeAction = subscriptionTier !== "free";
  const isPremium = subscriptionTier === "premium" || subscriptionTier === "premiumPlus";
  const hasAadhaarVerified = govtIds.aadhaar?.verified === true;
  const verifiedGovtIdsCount = useMemo(() => ALL_GOVT_ID_KINDS.filter((k) => govtIds[k]?.verified === true).length, [govtIds]);
  const verifiedGovtIdLabels = useMemo(() => ALL_GOVT_ID_KINDS.filter((k) => govtIds[k]?.verified === true).map(govtIdLabel), [govtIds]);

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
    setStandardCredits(loadStandardCredits());
  }, []);

  useEffect(() => {
    if (!profile.isRegistered) return;
    if (profile.primaryEmail) {
      setEmail(profile.primaryEmail);
      setEmailVerified(true);
    }
    if (profile.name) setName(profile.name);
    if (profile.mobile) {
      setMobile(profile.mobile);
      setMobileVerified(true);
    }
  }, [profile.isRegistered, profile.primaryEmail, profile.name, profile.mobile]);


  const rcmScore = useMemo(() => proactiveScore(connectedAccounts), [connectedAccounts]);

  const hasScannedVault = isPremium;
  const activeScores = hasScannedVault ? [emailScore, mobileScore, vaultScore] : [emailScore, mobileScore];
  const masterPrivacyScore = activeScores.length > 0 ? Math.round(activeScores.reduce((a, b) => a + b, 0) / activeScores.length) : 0;

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
  const getSpecificIdentifierForCategory = (category: "Email" | "Mobile" | "Identity" | "Consent"): string => {
    switch (category) {
      case "Email":
      case "Consent":
        return primaryEmail?.trim() || "[Email]";
      case "Mobile":
        return primaryMobile?.trim() || "[Mobile]";
      case "Identity":
        return govtIds.aadhaar?.value || govtIds.pan?.value || "Government ID";
      default:
        return primaryEmail?.trim() || primaryMobile?.trim() || "[Identifier]";
    }
  };
  const deletionPendingKey = (companyName: string, specificIdentifier: string) => `${companyName}::${specificIdentifier}`;
  const isDeletionPending = (companyName: string, specificIdentifier: string) => deletionPendingKeys.has(deletionPendingKey(companyName, specificIdentifier));
  const hasVerifiedEmail = useMemo(() => identities.some((i) => i.type === "email" && i.verified), [identities]);
  const hasVerifiedMobile = useMemo(() => identities.some((i) => i.type === "mobile" && i.verified), [identities]);
  const identitiesWithLabels = useMemo(() => {
    const firstEmail = identities.find((i) => i.type === "email");
    const firstMobile = identities.find((i) => i.type === "mobile");
    let emailCount = 0, mobileCount = 0;
    return identities.map((i) => {
      const isPrimary = (i.type === "email" && i.id === firstEmail?.id) || (i.type === "mobile" && i.id === firstMobile?.id);
      const label = isPrimary ? "Primary" : (i.label?.trim() || (i.type === "email" ? IDENTITY_LABELS[Math.min(emailCount++, IDENTITY_LABELS.length - 1)] : IDENTITY_LABELS[Math.min(mobileCount++, IDENTITY_LABELS.length - 1)]));
      return { ...i, label };
    });
  }, [identities]);
  const primaryIdentityIds = useMemo(() => {
    const firstEmail = identities.find((i) => i.type === "email");
    const firstMobile = identities.find((i) => i.type === "mobile");
    return new Set([firstEmail?.id, firstMobile?.id].filter(Boolean) as string[]);
  }, [identities]);
  const alternateIdentities = useMemo(() => identitiesWithLabels.filter((i) => i.verified && !primaryIdentityIds.has(i.id)), [identitiesWithLabels, primaryIdentityIds]);
  const selectedAlternateCount = useMemo(() => alternateIdentities.filter((i) => selectedIdentityIdsForScan.has(i.id)).length, [alternateIdentities, selectedIdentityIdsForScan]);
  const scanCreditCost = selectedAlternateCount * SCAN_COST_PER_ALTERNATE;
  const selectedEmailForScan = primaryEmail;
  const selectedMobileForScan = primaryMobile;
  const consentPendingCount = useMemo(() => pendingRequests.length + connectedAccounts.filter((c) => c.status === "pending").length, [pendingRequests, connectedAccounts]);
  const consentActiveCount = useMemo(() => connectedAccounts.filter((c) => c.status === "active").length, [connectedAccounts]);
  const consentRevokedCount = useMemo(() => connectedAccounts.filter((c) => c.status === "revoked").length, [connectedAccounts]);
  const consentDeniedCount = useMemo(() => connectedAccounts.filter((c) => c.status === "denied").length, [connectedAccounts]);
  const activeCount = useMemo(() => connectedAccounts.filter((a) => a.status === "active").length, [connectedAccounts]);
  const revokedCount = useMemo(() => connectedAccounts.filter((a) => a.status === "revoked").length, [connectedAccounts]);
  const breachedAccounts = useMemo(() => connectedAccounts.filter((a) => a.isBreached), [connectedAccounts]);
  const filteredReports = useMemo(() => {
    if (activeReportFilter === "All") return audits;
    return audits.filter((e) => e.category === activeReportFilter);
  }, [audits, activeReportFilter]);

  const categorizedFindings = useMemo(() => {
    const rows: { category: "Email" | "Mobile" | "Identity" | "Consent"; finding: string; action?: "deletion" | "copy" | "revoked"; accId?: string; isRevoked?: boolean }[] = [];
    breachTags.forEach((tag) => rows.push({ category: "Email", finding: tag, action: "deletion" }));
    mobileThreats.forEach((t) => rows.push({ category: "Mobile", finding: t }));
    aadhaarThreats.forEach((t) => rows.push({ category: "Identity", finding: t }));
    breachedAccounts.forEach((acc) => rows.push({ category: "Consent", finding: acc.companyName ?? acc.name ?? "—", action: acc.status === "active" ? "deletion" : "revoked", accId: acc.id, isRevoked: acc.status === "revoked" }));
    return findingsCategoryFilter === "all" ? rows : rows.filter((r) => r.category === findingsCategoryFilter);
  }, [breachTags, mobileThreats, aadhaarThreats, breachedAccounts, findingsCategoryFilter]);

  const findingsGroupedByIdentity = useMemo(() => {
    const groups: { label: string; identifier: string; category: "Email" | "Mobile" | "Identity" | "Consent"; rows: typeof categorizedFindings }[] = [];
    const byCategory = { Email: categorizedFindings.filter((r) => r.category === "Email"), Mobile: categorizedFindings.filter((r) => r.category === "Mobile"), Identity: categorizedFindings.filter((r) => r.category === "Identity"), Consent: categorizedFindings.filter((r) => r.category === "Consent") };
    if (byCategory.Email.length) groups.push({ label: "Email", identifier: maskEmail(primaryEmail || ""), category: "Email", rows: byCategory.Email });
    if (byCategory.Mobile.length) groups.push({ label: "Mobile", identifier: maskMobile(primaryMobile || ""), category: "Mobile", rows: byCategory.Mobile });
    if (byCategory.Identity.length) groups.push({ label: "Identity", identifier: "Govt. ID", category: "Identity", rows: byCategory.Identity });
    if (byCategory.Consent.length) groups.push({ label: "Consent", identifier: "Connected accounts", category: "Consent", rows: byCategory.Consent });
    return groups;
  }, [categorizedFindings, primaryEmail, primaryMobile]);

  const hasPrimaryEmail = useMemo(() => identities.some((i) => i.type === "email"), [identities]);
  const hasPrimaryMobile = useMemo(() => identities.some((i) => i.type === "mobile"), [identities]);

  useEffect(() => {
    setAudits(loadAudits());
  }, []);

  useEffect(() => {
    setShowFindings(true);
  }, [connectedAccounts]);

  const now = () => new Date().toISOString();

  const handleRevoke = (id: string) => {
    const iso = now();
    setConnectedAccounts((prev) => {
      const next = prev.map((a) =>
        a.id === id ? { ...a, status: "revoked" as const, revokedAt: iso, lastUpdated: iso } : a
      );
      saveRcmAccounts(next);
      return next;
    });
    setConsentActionToast("revoked");
  };

  const handleInitiateRegrant = (id: string) => {
    const iso = now();
    setConnectedAccounts((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, status: "pending" as const, lastUpdated: iso } : a));
      saveRcmAccounts(next);
      return next;
    });
    setConsentActionToast("movedToPending");
  };

  const handleFinalApprove = (id: string) => {
    const iso = now();
    const req = pendingRequests.find((r) => r.id === id);
    if (req) {
      const newAccount: ConnectedAccount = {
        id: `new-${Date.now()}`,
        companyName: req.companyName,
        status: "active",
        lastUpdated: iso,
        accessTo: req.accessTo,
        dataScope: req.dataScope ?? req.accessTo,
        isBreached: false,
      };
      setConnectedAccounts((prev) => { const next = [newAccount, ...prev]; saveRcmAccounts(next); return next; });
      setPendingRequests((prev) => prev.filter((r) => r.id !== id));
      setConsentToastVisible(true);
      setTimeout(() => setConsentToastVisible(false), 3500);
    } else {
      setConnectedAccounts((prev) => {
        const next = prev.map((a) => (a.id === id ? { ...a, status: "active" as const, revokedAt: undefined, lastUpdated: iso } : a));
        saveRcmAccounts(next);
        return next;
      });
      setConsentActionToast("registered");
    }
  };

  const handleDeny = (id: string) => {
    const iso = now();
    const req = pendingRequests.find((r) => r.id === id);
    if (req) {
      const deniedAccount: ConnectedAccount = {
        id: `denied-${Date.now()}`,
        companyName: req.companyName,
        status: "denied",
        lastUpdated: iso,
        accessTo: req.accessTo,
        dataScope: req.dataScope ?? req.accessTo,
        isBreached: false,
      };
      setConnectedAccounts((prev) => { const next = [deniedAccount, ...prev]; saveRcmAccounts(next); return next; });
      setPendingRequests((prev) => prev.filter((r) => r.id !== id));
    } else {
      setConnectedAccounts((prev) => {
        const next = prev.map((a) => (a.id === id ? { ...a, status: "denied" as const, lastUpdated: iso } : a));
        saveRcmAccounts(next);
        return next;
      });
    }
  };

  const handleMoveToPending = (id: string) => {
    const iso = now();
    setConnectedAccounts((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, status: "pending" as const, lastUpdated: iso } : a));
      saveRcmAccounts(next);
      return next;
    });
    setConsentActionToast("movedToPending");
  };

  const handleForceErasure = (id: string) => {
    setSelectedErasureId(id);
    setShowErasureModal(true);
  };

  const executeErasure = () => {
    const id = selectedErasureId;
    if (!id) return;
    const acc = connectedAccounts.find((a) => a.id === id);
    const companyName = acc?.companyName ?? acc?.name ?? "the data fiduciary";
    setShowErasureModal(false);
    setSelectedErasureId(null);
    setErasureToast("Sending...");
    setTimeout(() => {
      const iso = now();
      setConnectedAccounts((prev) => {
        const next = prev.map((a) =>
          a.id === id ? { ...a, erasureRequested: true, erasureDate: iso, lastUpdated: iso } : a
        );
        saveRcmAccounts(next);
        return next;
      });
      setErasureToast(`Legal Notice of Erasure sent to ${companyName}. 72-hour compliance window started.`);
      setTimeout(() => setErasureToast(null), 4000);
    }, 1500);
  };

  const handleApprovePending = (request: PendingConsentRequest) => {
    handleFinalApprove(request.id);
  };

  const handleDenyPending = (id: string) => {
    handleDeny(id);
  };

  const runAudit = async (primaryOnly?: boolean) => {
    if (isScanning) return;
    const requiredCredits = primaryOnly ? 0 : scanCreditCost;
    const effectiveAlternateCount = primaryOnly ? 0 : selectedAlternateCount;
    if (effectiveAlternateCount > 0 && standardCredits < requiredCredits) {
      setAuditError(null);
      setShowCreditModal(true);
      return;
    }
    if (effectiveAlternateCount > 0) {
      setStandardCredits((prev) => {
        const next = Math.max(0, prev - requiredCredits);
        saveStandardCredits(next);
        return next;
      });
    }
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
          email: (selectedEmailForScan ?? primaryEmail).trim() || "",
          mobile: (selectedMobileForScan ?? primaryMobile).trim().replace(/\D/g, ""),
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
      const scannedEmails = (selectedEmailForScan ?? primaryEmail).trim() ? [(selectedEmailForScan ?? primaryEmail).trim()] : [];
      const mobileForScan = (selectedMobileForScan ?? primaryMobile).trim().replace(/\D/g, "");
      const scannedMobiles = mobileForScan.length >= 4 ? [`+91 ****${mobileForScan.slice(-2)}`] : [];
      const scannedIds = aadhaarForAudit ? [`Aadhaar ****${aadhaarForAudit.slice(-4)}`] : [];
      const scannedIdentifiers = [
        ...scannedEmails.map((e) => (e.includes("@") ? e : `+91 ${e}`)),
        ...scannedMobiles,
        ...(deepIdentityScan && scannedIds.length ? scannedIds : []),
      ].filter(Boolean);
      const category: ReportCategory = deepIdentityScan && aadhaarForAudit ? "Govt IDs" : "Primary Email";
      const compromisedVectors: string[] = deepIdentityScan && aadhaarForAudit ? ["Govt IDs"] : [category];
      const entry: AuditEntry = {
        email: primaryEmail.trim() || "Anonymous",
        mobile: primaryMobile.trim() || undefined,
        score: combinedScore,
        dateTime: new Date().toISOString(),
        verified: hasVerifiedMobile || hasVerifiedEmail,
        scanType: deepIdentityScan ? "Identity Audit" : "Standard",
        threatCount: threatSummary.length,
        threatSummary: threatSummary.length > 0 ? threatSummary : undefined,
        scannedIdentifiers: scannedIdentifiers.length > 0 ? scannedIdentifiers : [primaryEmail.trim() || "—", primaryMobile.trim() ? `+91 ****${primaryMobile.trim().slice(-4)}` : ""].filter(Boolean),
        category,
        threatsFound: threatSummary.length,
        compromisedVectors,
        breachedDataPoints: threatSummary.length > 0 ? [...compromisedVectors] : [],
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
      `🚨 I just audited my digital footprint with SAAKSHI. My Privacy Health Score is ${masterPrivacyScore}/100. 🔓 ${breachCount} of my accounts are compromised on the Dark Web. Check your Data Risk for free here: ${appUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const handleDeletionRequest = (companyName: string, specificIdentifier: string) => {
    const { subject, body } = generateErasureNotice(
      companyName,
      { name: profile.name || name, dob: profile.dob },
      specificIdentifier
    );
    const recipientEmail = `privacy@${companyName.toLowerCase().replace(/\s+/g, "")}.com`;
    // TODO: Replace mailto with AWS SES backend for production
    window.location.href = `mailto:${recipientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const key = `${companyName}::${specificIdentifier}`;
    setDeletionPendingKeys((prev) => new Set(prev).add(key));
  };

  const copyDeletionNotice = async (id: string, ctx?: { companyName: string; specificIdentifier: string } | null) => {
    try {
      const text = ctx
        ? generateErasureNotice(ctx.companyName, { name: profile.name || name, dob: profile.dob }, ctx.specificIdentifier).body
        : getDeletionNoticeBody(primaryEmail.trim(), profile.name || name);
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  const handleCopyAndCloseModal = async () => {
    if (draftNoticeOpenForId) {
      await copyDeletionNotice(draftNoticeOpenForId, draftNoticeContext);
      setDraftNoticeOpenForId(null);
      setDraftNoticeContext(null);
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
          if (pendingAddConsumesCredits) {
            setStandardCredits((prev) => {
              const next = Math.max(0, prev - ADD_COST);
              saveStandardCredits(next);
              return next;
            });
            setPendingAddConsumesCredits(false);
          }
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

  useEffect(() => {
    if (!dobActivatedToast) return;
    const t = setTimeout(() => setDobActivatedToast(false), 3000);
    return () => clearTimeout(t);
  }, [dobActivatedToast]);

  useEffect(() => {
    if (!identityAddedToast) return;
    const t = setTimeout(() => setIdentityAddedToast(false), 3000);
    return () => clearTimeout(t);
  }, [identityAddedToast]);

  useEffect(() => {
    if (!takedownToast || takedownToast === "Sending...") return;
    const t = setTimeout(() => setTakedownToast(null), 4000);
    return () => clearTimeout(t);
  }, [takedownToast]);

  useEffect(() => {
    if (consentActionToast == null) return;
    const t = setTimeout(() => setConsentActionToast(null), 3000);
    return () => clearTimeout(t);
  }, [consentActionToast]);

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

  const handleDownloadPDF = () => {
    if (exportLoading) return;
    setExportLoading("pdf");
    setTimeout(() => {
      setExportLoading(null);
      setExportToast("Official PDF Report downloaded securely.");
    }, 1500);
  };

  const handleDownloadExcel = () => {
    if (exportLoading) return;
    setExportLoading("excel");
    setTimeout(() => {
      setExportLoading(null);
      setExportToast(activeReportFilter !== "All" ? "Filtered CSV Manifest exported successfully." : "CSV Data Manifest exported successfully.");
    }, 1000);
  };

  const handleEmailReport = () => {
    if (exportLoading) return;
    setExportLoading("email");
    const emailForReport = primaryEmailForExport || profile.primaryEmail || "[your email]";
    setTimeout(() => {
      setExportLoading(null);
      setExportToast(`Report encrypted and emailed to ${emailForReport}.`);
    }, 2000);
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
    const normalizedValue = addIdentityType === "email" ? v.toLowerCase() : v.replace(/\D/g, "");
    if (GLOBAL_VERIFIED_IDS.some((id) => (addIdentityType === "email" ? id.toLowerCase() : id.replace(/\D/g, "")) === normalizedValue)) {
      setSecurityBreachToast(true);
      setTimeout(() => setSecurityBreachToast(false), 4000);
      return;
    }
    const alreadyHasType = addIdentityType === "email" ? hasPrimaryEmail : hasPrimaryMobile;
    if (alreadyHasType && !isPremium) {
      setAddIdentityModalOpen(false);
      setAddIdentityValue("");
      setUpgradeTarget("premium");
      setShowUpgradeModal(true);
      return;
    }
    if (alreadyHasType && isPremium && standardCredits < ADD_COST) {
      setAddIdentityModalOpen(false);
      setAddIdentityValue("");
      setShowBuyCreditsModal(true);
      return;
    }
    const id = `${addIdentityType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const customLabel = addIdentityCustomLabel.trim() || getNextLabel(addIdentityType, identities);
    setIdentities((prev) => {
      const newItem: IdentityItem = { id, type: addIdentityType, value: addIdentityType === "email" ? v : v.replace(/\D/g, ""), verified: false, label: customLabel };
      const next = [...prev, newItem];
      saveIdentities(next);
      return next;
    });
    setPendingVerifyIdentityId(id);
    setVerificationTarget(addIdentityType);
    if (alreadyHasType && isPremium && standardCredits >= ADD_COST) {
      setAddIdentityOtpInput("");
      setAddIdentityStep("otp");
    } else {
      setPendingAddConsumesCredits(true);
      setAddIdentityModalOpen(false);
      setAddIdentityValue("");
      setAddIdentityCustomLabel("");
      setOtpModalOpen(true);
    }
  };

  const handleAddIdentityOtpVerify = () => {
    const digits = addIdentityOtpInput.replace(/\D/g, "").slice(0, 6);
    if (digits.length < 6) return;
    const pendingId = pendingVerifyIdentityId;
    if (!pendingId) return;
    setStandardCredits((prev) => {
      const next = Math.max(0, prev - ADD_COST);
      saveStandardCredits(next);
      return next;
    });
    setIdentities((prev) => {
      const next = prev.map((i) => (i.id === pendingId ? { ...i, verified: true } : i));
      saveIdentities(next);
      return next;
    });
    setAddIdentityModalOpen(false);
    setAddIdentityStep("form");
    setAddIdentityOtpInput("");
    setAddIdentityValue("");
    setAddIdentityCustomLabel("");
    setPendingVerifyIdentityId(null);
    setIdentityAddedToast(true);
  };

  const handleAddAlternateClick = (type: "email" | "mobile") => {
    if (standardCredits >= ADD_COST) {
      setAddIdentityType(type);
      setAddIdentityValue("");
      setAddIdentityCustomLabel("");
      setAddIdentityStep("form");
      setAddIdentityModalOpen(true);
    } else {
      setShowBuyCreditsModal(true);
    }
  };

  const handleAddClick = (type: "email" | "mobile") => {
    if (standardCredits >= ADD_COST) {
      setAddIdentityType(type);
      setAddIdentityValue("");
      setAddIdentityCustomLabel("");
      setAddIdentityStep("form");
      setAddIdentityModalOpen(true);
    } else {
      setShowBuyCreditsModal(true);
    }
  };

  const removeIdentity = (id: string) => {
    setIdentities((prev) => {
      const next = prev.filter((i) => i.id !== id);
      saveIdentities(next);
      return next;
    });
  };

  const startVerification = (item: IdentityItem) => {
    setPendingVerifyIdentityId(item.id);
    setVerificationTarget(item.type);
    setOtpModalOpen(true);
  };

  const handleRequestVerifyGovtId = (kind: GovtIdKind) => {
    if (subscriptionTier === "premium" && verifiedGovtIdsCount >= 3) {
      setShowVaultLimitModal(true);
      return;
    }
    setGovtIdForVerify(kind);
    setShowDigiLockerModal(true);
  };

  const handleGovtIdVerify = (method: "digilocker" | "otp") => {
    if (!govtIdForVerify) return;
    const entry = govtIds[govtIdForVerify];
    const val = (entry?.value ?? "").replace(/\D/g, "").trim();
    // Anti-fraud enforcer: One ID, One Account — block if this identity is already linked to another SAAKSHI account (strict check before any success payload).
    if (GLOBAL_VERIFIED_IDS.some((id) => id.replace(/\D/g, "") === val)) {
      setSecurityBreachToast(true);
      setTimeout(() => setSecurityBreachToast(false), 4000);
      setShowDigiLockerModal(false);
      setGovtIdForVerify(null);
      return;
    }
    setGovtIds((prev) => {
      const next = { ...prev, [govtIdForVerify]: { ...prev[govtIdForVerify], verified: true, verifiedVia: "DigiLocker" } };
      saveGovtIds(next);
      return next;
    });
    setShowDigiLockerModal(false);
    setGovtIdForVerify(null);
  };

  if (!isLoggedIn) {
    return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  }

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
          {/* Tab navigation */}
          <div className="flex border-b" style={{ borderColor: "rgba(75, 0, 130, 0.35)" }}>
            {(["audit", "vault", "consents", "reports", "profile"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className="flex-1 py-3.5 text-[10px] sm:text-xs font-medium transition-colors relative min-w-0"
                style={{
                  color: activeTab === tab ? SILVER : "rgba(192,192,192,0.5)",
                }}
              >
                {tab === "reports" ? (
                  <span className="inline-flex items-center justify-center gap-1">
                    <svg className="w-3.5 h-3.5 shrink-0 opacity-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    Reports
                  </span>
                ) : tab === "audit" ? "Audit" : tab === "vault" ? "Vault" : tab === "consents" ? "Consents" : "Profile"}
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
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-6"
                >
                  {/* Master Identity Header — Row 1: Name + Verified Human; Row 2: DOB + Tier */}
                  <div className="flex flex-col items-center justify-center gap-2 text-center">
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      <h2 className="text-xl font-bold tracking-tight" style={{ color: SILVER }}>{(profile.name || name) || "Identity"}</h2>
                      {(profile.name || name) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 shrink-0" aria-label="Verified Human">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                          Verified Human
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-center">
                      <span className="text-xs text-gray-400">DOB: {profile.dob || "—"}</span>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border shrink-0 ${subscriptionTier === "premiumPlus" ? "bg-amber-500/20 text-amber-200 border-amber-500/30" : subscriptionTier === "standard" ? "bg-[#4B0082]/30 text-purple-200 border-[#4B0082]/50" : "bg-slate-600/30 text-slate-300 border-slate-500/30"}`}>
                        {subscriptionTier === "premiumPlus" ? "Premium Plus" : subscriptionTier === "standard" ? "Standard" : "Basic"}
                      </span>
                      <button type="button" onClick={() => setShowSubscriptionPlanModal(true)} className="text-[10px] font-medium underline opacity-80 hover:opacity-100 shrink-0" style={{ color: SILVER }}>Plans</button>
                    </div>
                  </div>

                  {/* Dynamic Multi-Factor Privacy Score — Master dial + Breakdown */}
                  {hasMounted ? (
                    <>
                      <div className="flex justify-center min-h-[200px] items-center">
                        {deepIdentityScan && isScanning ? (
                          <RadarSweep />
                        ) : (
                          <PrivacyGauge score={masterPrivacyScore} isScanning={isScanning} />
                        )}
                      </div>
                      {isScanning && !deepIdentityScan && (
                        <p className="text-sm font-medium flex items-center justify-center gap-2" style={{ color: SILVER }}>
                          <span className="w-2 h-2 rounded-full bg-[#4B0082] animate-ping" />
                          Connecting to Secure Servers...
                        </p>
                      )}
                      {/* Unified Footprint cards — Email, Mobile, Govt ID (single row with status badges) */}
                      <motion.div
                        className="grid grid-cols-1 sm:grid-cols-3 gap-5 mt-6"
                        initial="hidden"
                        animate="visible"
                        variants={{ visible: { transition: { staggerChildren: 0.08 } }, hidden: {} }}
                      >
                        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }} className="rounded-xl px-4 py-3 border" style={{ background: "rgba(15, 10, 24, 0.85)", borderColor: "rgba(75, 0, 130, 0.35)" }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: SILVER }}>Email Footprint</p>
                          <p className="text-lg font-bold tabular-nums mb-1.5" style={{ color: emailScore >= 80 ? "#22c55e" : emailScore >= 50 ? "#eab308" : "#ef4444" }}>{emailScore}/100</p>
                          <div className="h-1.5 rounded-full overflow-hidden bg-white/10 mb-3">
                            <motion.div className="h-full rounded-full" style={{ background: emailScore >= 80 ? "#22c55e" : emailScore >= 50 ? "#eab308" : "#ef4444" }} initial={{ width: 0 }} animate={{ width: `${emailScore}%` }} transition={{ type: "spring", damping: 20, stiffness: 120 }} />
                          </div>
                          <div className="mt-2"><span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full uppercase tracking-wider">Verified & Safe</span></div>
                        </motion.div>
                        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }} className="rounded-xl px-4 py-3 border" style={{ background: "rgba(15, 10, 24, 0.85)", borderColor: "rgba(75, 0, 130, 0.35)" }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: SILVER }}>Mobile Footprint</p>
                          <p className="text-lg font-bold tabular-nums mb-1.5" style={{ color: mobileScore >= 80 ? "#22c55e" : mobileScore >= 50 ? "#eab308" : "#ef4444" }}>{mobileScore}/100</p>
                          <div className="h-1.5 rounded-full overflow-hidden bg-white/10 mb-3">
                            <motion.div className="h-full rounded-full" style={{ background: mobileScore >= 80 ? "#22c55e" : mobileScore >= 50 ? "#eab308" : "#ef4444" }} initial={{ width: 0 }} animate={{ width: `${mobileScore}%` }} transition={{ type: "spring", damping: 20, stiffness: 120 }} />
                          </div>
                          <div className="mt-2"><span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full uppercase tracking-wider">Verified & Safe</span></div>
                        </motion.div>
                        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }} className={`rounded-xl px-4 py-3 border relative ${!hasScannedVault ? "backdrop-blur-sm" : ""}`} style={{ background: "rgba(15, 10, 24, 0.85)", borderColor: "rgba(75, 0, 130, 0.35)" }}>
                          {!hasScannedVault && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-black/50 z-10 gap-2">
                              <svg className="w-6 h-6 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                              <button type="button" onClick={() => { setUpgradeTarget("premium"); setShowSubscriptionPlanModal(true); }} className="bg-yellow-500/20 text-yellow-400 text-xs px-3 py-1 border border-yellow-500/50 rounded-full uppercase tracking-wider font-semibold hover:bg-yellow-500/30 transition">
                                Unlock Premium
                              </button>
                            </div>
                          )}
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: SILVER }}>Govt ID Vault</p>
                          <p className="text-lg font-bold tabular-nums mb-1.5" style={{ color: vaultScore >= 80 ? "#22c55e" : vaultScore >= 50 ? "#eab308" : "#ef4444" }}>{vaultScore}/100</p>
                          <div className="h-1.5 rounded-full overflow-hidden bg-white/10">
                            <motion.div className="h-full rounded-full" style={{ background: vaultScore >= 80 ? "#22c55e" : vaultScore >= 50 ? "#eab308" : "#ef4444" }} initial={{ width: 0 }} animate={{ width: `${vaultScore}%` }} transition={{ type: "spring", damping: 20, stiffness: 120 }} />
                          </div>
                          {hasScannedVault && (
                            <div className="flex justify-center mt-3">
                              <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full uppercase tracking-wider font-semibold">Verified & Safe</span>
                            </div>
                          )}
                        </motion.div>
                      </motion.div>
                    </>
                  ) : (
                    <div className="h-48 animate-pulse rounded-xl bg-gray-800" />
                  )}

                  {/* Audit Now — run scan from Audit tab */}
                  <div className="rounded-xl px-4 py-4" style={{ background: "rgba(15, 10, 24, 0.5)", border: "1px solid rgba(75, 0, 130, 0.3)" }}>
                    <p className="text-[10px] font-medium uppercase tracking-wider mb-3 opacity-80" style={{ color: SILVER }}>View perimeter in Vault · Run scan</p>
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

                  {/* Recent Scans — sneak peek: latest 2–3 entries */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: SILVER }}>Recent Scans</h3>
                    {audits.length === 0 ? (
                      <div className="rounded-xl border py-6 px-4 text-center text-sm" style={{ background: "rgba(15, 10, 24, 0.9)", borderColor: "rgba(75, 0, 130, 0.35)", color: "rgba(192,192,192,0.7)" }}>
                        No audits yet. Run an audit above.
                      </div>
                    ) : (
                      <>
                        <div className="rounded-xl overflow-hidden border" style={{ background: "rgba(15, 10, 24, 0.9)", borderColor: "rgba(75, 0, 130, 0.35)" }}>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr className="border-b" style={{ borderColor: "rgba(75, 0, 130, 0.4)", background: "rgba(75, 0, 130, 0.12)" }}>
                                  <th className="py-2 px-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: SILVER }}>Date</th>
                                  <th className="py-2 px-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: SILVER }}>Score</th>
                                  <th className="py-2 px-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: SILVER }}>Details</th>
                                </tr>
                              </thead>
                              <tbody>
                                {audits.slice(0, 3).map((entry, i) => (
                                  <tr key={`${entry.dateTime}-${i}`} className="border-b last:border-b-0" style={{ borderColor: "rgba(75, 0, 130, 0.2)", background: i % 2 === 1 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                                    <td className="py-2 px-2 font-medium tabular-nums text-xs" style={{ color: SILVER }}>{new Date(entry.dateTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                                    <td className="py-2 px-2 tabular-nums font-semibold" style={{ color: SILVER }}>{entry.score}</td>
                                    <td className="py-2 px-2">
                                      <button type="button" onClick={() => setReportModalEntry(entry)} className="text-[10px] font-semibold underline decoration-[#4B0082] hover:decoration-[#6a0dad] transition" style={{ color: "rgba(192,192,192,0.95)" }}>View Report</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab("reports")}
                          className="w-full py-3 rounded-xl font-semibold text-sm border-2 border-dashed transition hover:bg-white/5 flex items-center justify-center gap-2"
                          style={{ borderColor: "rgba(75, 0, 130, 0.5)", color: ROYAL_PURPLE }}
                        >
                          View Full Audit History
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </button>
                      </>
                    )}
                  </div>

                </motion.div>
              )}

              {activeTab === "vault" && (
                <motion.div
                  key="vault"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-5"
                  style={{ background: "rgba(10, 8, 18, 0.4)", borderRadius: 16, border: "1px solid rgba(100, 110, 130, 0.2)" }}
                >
                  {hasMounted ? (
                    <>
                  {/* Read-only Identity Perimeter — Communications */}
                  <div className="rounded-xl overflow-hidden border" style={{ background: "linear-gradient(180deg, rgba(30, 32, 38, 0.95) 0%, rgba(18, 20, 26, 0.98) 100%)", borderColor: "rgba(100, 110, 130, 0.25)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}>
                    <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(100, 110, 130, 0.2)" }}>
                      <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(192,192,192,0.9)" }}>Communications</h3>
                      <p className="text-[10px] mt-0.5 opacity-80" style={{ color: SILVER }}>Verified identity perimeter · read-only</p>
                    </div>
                    <div className="p-4 space-y-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(192,192,192,0.65)" }}>Primary</p>
                        <div className="flex flex-wrap gap-2">
                          {primaryEmail && (
                            <span className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-lg border text-xs font-medium" style={{ borderColor: "rgba(100, 110, 130, 0.4)", background: "rgba(255,255,255,0.03)", color: SILVER }}>
                              <svg className="w-3.5 h-3.5 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                              {maskEmail(primaryEmail)}
                            </span>
                          )}
                          {primaryMobile && (
                            <span className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-lg border text-xs font-medium" style={{ borderColor: "rgba(100, 110, 130, 0.4)", background: "rgba(255,255,255,0.03)", color: SILVER }}>
                              <svg className="w-3.5 h-3.5 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                              {maskMobile(primaryMobile)}
                            </span>
                          )}
                          {(!primaryEmail && !primaryMobile) && <span className="text-xs opacity-60" style={{ color: SILVER }}>Add in Profile</span>}
                        </div>
                      </div>
                      {alternateIdentities.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(192,192,192,0.65)" }}>Alternates</p>
                          <div className="flex flex-wrap gap-2">
                            {alternateIdentities.map((item) => (
                              <span key={item.id} className="inline-flex items-center gap-1.5 pl-2 pr-2 py-1.5 rounded-lg border text-xs font-medium" style={{ borderColor: "rgba(100, 110, 130, 0.4)", background: "rgba(255,255,255,0.03)", color: SILVER }}>
                                {item.type === "email" ? <svg className="w-3.5 h-3.5 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> : <svg className="w-3.5 h-3.5 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
                                {item.type === "email" ? maskEmail(item.value) : maskMobile(item.value)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Read-only Govt ID Steel Vault */}
                  <div className="rounded-xl overflow-hidden border" style={{ background: "linear-gradient(180deg, rgba(28, 30, 36, 0.98) 0%, rgba(14, 16, 22, 0.99) 100%)", borderColor: "rgba(100, 110, 130, 0.3)", boxShadow: "0 0 0 1px rgba(0,0,0,0.3) inset, 0 4px 24px rgba(0,0,0,0.25)" }}>
                    <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "rgba(100, 110, 130, 0.25)" }}>
                      <svg className="w-4 h-4 shrink-0 opacity-80" style={{ color: "#94a3b8" }} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                      <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(192,192,192,0.9)" }}>Government IDs</h3>
                    </div>
                    <div className="p-4 space-y-2">
                      {ALL_GOVT_ID_KINDS.map((kind) => {
                        const entry = govtIds[kind];
                        const label = govtIdLabel(kind);
                        return (
                          <div key={kind} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 border" style={{ background: "rgba(0,0,0,0.2)", borderColor: "rgba(100, 110, 130, 0.2)" }}>
                            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>{label}</span>
                            <span className="text-[10px] tabular-nums" style={{ color: "rgba(192,192,192,0.8)" }}>{kind === "aadhaar" && entry?.value ? maskAadhaarDisplay(entry.value) : maskLast4(entry?.value ?? "")}</span>
                            {entry?.verified ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/30">Verified</span>
                            ) : (
                              <span className="text-[10px] font-medium" style={{ color: "rgba(148, 163, 184, 0.8)" }}>Unverified</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                    </>
                  ) : (
                    <div className="h-48 animate-pulse rounded-xl bg-gray-800" />
                  )}
                </motion.div>
              )}

              {activeTab === "consents" && (
                <motion.div
                  key="consents"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-5"
                  style={{ background: "rgba(20, 12, 32, 0.35)", borderRadius: 16, border: "1px solid rgba(75, 0, 130, 0.35)" }}
                >
                  {hasMounted ? (
                    <>
                  {/* 4-Pillar Consent Ledger — scrollable on mobile + Glossary trigger */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 flex rounded-2xl p-1 overflow-x-auto overflow-y-hidden scrollbar-thin" style={{ background: "rgba(10, 8, 18, 0.85)", border: "1px solid rgba(75, 0, 130, 0.25)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 8px rgba(0,0,0,0.2)" }}>
                      <div className="flex min-w-0 gap-0.5 shrink-0">
                      {(["pending", "active", "revoked", "denied"] as const).map((pillar) => {
                        const count = pillar === "pending" ? consentPendingCount : pillar === "active" ? consentActiveCount : pillar === "revoked" ? consentRevokedCount : consentDeniedCount;
                        const isActive = activeConsentView === pillar;
                        const styles = {
                          pending: isActive ? { background: "linear-gradient(135deg, #d4af37 0%, #b8860b 55%)", color: "#0f0a18" } : { color: SILVER, background: "transparent" },
                          active: isActive ? { background: "linear-gradient(135deg, #22c55e 0%, #16a34a 55%)", color: "#fff" } : { color: SILVER, background: "transparent" },
                          revoked: isActive ? { background: "rgba(100, 116, 139, 0.5)", color: SILVER } : { color: SILVER, background: "transparent" },
                          denied: isActive ? { background: "rgba(185, 28, 28, 0.5)", color: "#fecaca" } : { color: SILVER, background: "transparent" },
                        };
                        const badgeClass = {
                          pending: "bg-yellow-500/20 text-yellow-400",
                          active: "bg-green-500/20 text-green-400",
                          revoked: "bg-gray-500/20 text-gray-400",
                          denied: "bg-red-500/20 text-red-400",
                        }[pillar];
                        return (
                          <button
                            key={pillar}
                            type="button"
                            onClick={() => setActiveConsentView(pillar)}
                            className={`shrink-0 py-2.5 px-3 text-[10px] sm:text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5 ${isActive ? "shadow-md" : "opacity-85 hover:opacity-100"}`}
                            style={styles[pillar]}
                          >
                            <span>{pillar.charAt(0).toUpperCase() + pillar.slice(1)}</span>
                            <span className={`min-w-[20px] h-5 px-2 rounded-full flex items-center justify-center text-xs font-semibold tabular-nums ${badgeClass}`}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowGlossary(true)}
                      className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center border transition hover:bg-white/10"
                      style={{ borderColor: "rgba(75, 0, 130, 0.4)", color: SILVER }}
                      aria-label="Privacy glossary"
                      title="Understanding consent & erasure terms"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </button>
                  </div>

                  <AnimatePresence>
                    {erasureToast && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className={`rounded-xl px-4 py-3 flex items-center gap-2 border text-sm font-medium ${erasureToast === "Sending..." ? "border-amber-500/40 bg-amber-950/40 text-amber-200" : "bg-emerald-950/40 border-emerald-500/40 text-emerald-200"}`}
                      >
                        {erasureToast === "Sending..." ? (
                          <span className="w-5 h-5 rounded-full border-2 border-t-transparent border-current animate-spin shrink-0" aria-hidden />
                        ) : (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                            <svg className="h-3.5 w-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                          </span>
                        )}
                        {erasureToast}
                      </motion.div>
                    )}
                    {consentToastVisible && !consentActionToast && (
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
                    {consentActionToast === "revoked" && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="rounded-xl px-4 py-3 flex items-center gap-2 border border-amber-500/40 bg-amber-950/40 text-amber-200 text-sm font-medium"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                          <svg className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        </span>
                        Consent Legally Revoked
                      </motion.div>
                    )}
                    {consentActionToast === "regranted" && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="rounded-xl px-4 py-3 flex items-center gap-2 border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-sm font-medium"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                          <svg className="h-3.5 w-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                        </span>
                        Consent Re-Granted Successfully
                      </motion.div>
                    )}
                    {consentActionToast === "registered" && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="rounded-xl px-4 py-3 flex items-center gap-2 border border-emerald-500/40 bg-emerald-950/40 text-emerald-200 text-sm font-medium"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                          <svg className="h-3.5 w-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                        </span>
                        Consent Legally Registered with SAAKSHI
                      </motion.div>
                    )}
                    {consentActionToast === "movedToPending" && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="rounded-xl px-4 py-3 flex items-center gap-2 border border-amber-500/40 bg-amber-950/40 text-amber-200 text-sm font-medium"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                          <svg className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                        </span>
                        Moved to Pending. Please review and sign.
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {activeConsentView === "pending" && (
                    <>
                  {/* Pending — Awaiting action (Yellow/Amber accents) */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-widest opacity-95 pt-1" style={{ color: SILVER }}>Awaiting your action</h3>
                    <p className="text-[10px] font-medium opacity-85 -mt-2" style={{ color: SILVER }}>Approve & Sign or Deny Request</p>
                    <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1 -mr-1">
                      {pendingRequests.map((req) => (
                        <motion.div
                          key={req.id}
                          layout
                          className="rounded-xl px-4 py-3 space-y-2 border"
                          style={{ background: "rgba(30, 20, 0, 0.4)", borderColor: "rgba(212, 175, 55, 0.4)", boxShadow: "0 0 0 1px rgba(212,175,55,0.1) inset" }}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <p className="text-sm font-bold truncate" style={{ color: "#fcd34d" }}>{req.companyName}</p>
                            <span className="text-[10px] font-normal shrink-0 opacity-75" style={{ color: "rgba(192,192,192,0.7)" }}>{formatConsentTimestamp(req.lastUpdated ?? new Date().toISOString())}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(req.dataScope ?? req.accessTo ?? []).map((label) => (
                              <span key={label} className={VAULT_IDENTIFIERS.includes(label as (typeof VAULT_IDENTIFIERS)[number]) ? "inline-flex items-center text-[10px] md:text-xs px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/50 text-purple-300 font-medium tracking-wide" : "inline-flex items-center text-[10px] md:text-xs px-2 py-0.5 rounded bg-transparent border border-gray-500 border-dashed text-gray-400 font-medium tracking-wide"}>{label}</span>
                            ))}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => handleFinalApprove(req.id)} className="flex-1 py-2 rounded-xl text-xs font-semibold text-[#0f0a18] transition hover:opacity-95" style={{ background: "linear-gradient(135deg, #22c55e 0%, #16a34a 55%)" }}>Approve & Sign</button>
                            <button type="button" onClick={() => handleDeny(req.id)} className="flex-1 py-2 rounded-xl text-xs font-semibold border-2 border-red-500/50 text-red-300 bg-transparent hover:bg-red-500/10 transition">Deny Request</button>
                          </div>
                        </motion.div>
                      ))}
                      {connectedAccounts.filter((a) => a.status === "pending").map((acc) => (
                        <motion.div
                          key={acc.id}
                          layout
                          className="rounded-xl px-4 py-3 space-y-2 border"
                          style={{ background: "rgba(30, 20, 0, 0.4)", borderColor: "rgba(212, 175, 55, 0.4)", boxShadow: "0 0 0 1px rgba(212,175,55,0.1) inset" }}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <p className="text-sm font-bold truncate" style={{ color: "#fcd34d" }}>{acc.companyName ?? acc.name}</p>
                            <span className="text-[10px] font-normal shrink-0 opacity-75" style={{ color: "rgba(192,192,192,0.7)" }}>{formatConsentTimestamp(acc.lastUpdated)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(acc.dataScope ?? acc.accessTo ?? []).map((label) => (
                              <span key={label} className={VAULT_IDENTIFIERS.includes(label as (typeof VAULT_IDENTIFIERS)[number]) ? "inline-flex items-center text-[10px] md:text-xs px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/50 text-purple-300 font-medium tracking-wide" : "inline-flex items-center text-[10px] md:text-xs px-2 py-0.5 rounded bg-transparent border border-gray-500 border-dashed text-gray-400 font-medium tracking-wide"}>{label}</span>
                            ))}
                          </div>
                          {acc.revokedAt && <p className="text-[10px] opacity-80" style={{ color: SILVER }}>Previously revoked · Re-grant in review</p>}
                          <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => handleFinalApprove(acc.id)} className="flex-1 py-2 rounded-xl text-xs font-semibold text-[#0f0a18] transition hover:opacity-95" style={{ background: "linear-gradient(135deg, #22c55e 0%, #16a34a 55%)" }}>Approve & Sign</button>
                            <button type="button" onClick={() => handleDeny(acc.id)} className="flex-1 py-2 rounded-xl text-xs font-semibold border-2 border-red-500/50 text-red-300 bg-transparent hover:bg-red-500/10 transition">Deny Request</button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    {pendingRequests.length === 0 && connectedAccounts.filter((a) => a.status === "pending").length === 0 && (
                      <div className="rounded-xl border py-8 px-4 text-center text-sm" style={{ background: "rgba(15, 10, 24, 0.6)", borderColor: "rgba(212,175,55,0.25)", color: "rgba(192,192,192,0.7)" }}>No pending items. Incoming requests or re-grants will appear here.</div>
                    )}
                  </div>
                    </>
                  )}

                  {activeConsentView === "active" && (
                    <>
                  {/* Active — Flowing (Green accents) */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-widest opacity-95 pt-1" style={{ color: SILVER }}>Currently active</h3>
                    <p className="text-[10px] font-medium opacity-85 -mt-2" style={{ color: SILVER }}>Revoke access to stop data sharing (no email sent)</p>
                    <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1 -mr-1">
                      {connectedAccounts.filter((a) => a.status === "active").map((acc) => (
                        <motion.div
                          key={acc.id}
                          layout
                          className="rounded-xl px-4 py-3 border space-y-2"
                          style={{ background: "rgba(0, 25, 15, 0.35)", borderColor: "rgba(34, 197, 94, 0.35)", boxShadow: "0 0 0 1px rgba(34,197,94,0.08) inset" }}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <p className="text-sm font-bold truncate text-emerald-100/90">{acc.companyName ?? acc.name}</p>
                            <span className="text-[10px] font-normal shrink-0 opacity-75" style={{ color: "rgba(192,192,192,0.65)" }} title="Consent granted">{formatConsentTimestamp(acc.lastUpdated)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(acc.dataScope ?? acc.accessTo ?? []).map((label) => (
                              <span key={label} className={VAULT_IDENTIFIERS.includes(label as (typeof VAULT_IDENTIFIERS)[number]) ? "inline-flex items-center text-[10px] md:text-xs px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/50 text-purple-300 font-medium tracking-wide" : "inline-flex items-center text-[10px] md:text-xs px-2 py-0.5 rounded bg-transparent border border-gray-500 border-dashed text-gray-400 font-medium tracking-wide"}>{label}</span>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {acc.isBreached && <span className="shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Breached</span>}
                              <span className="shrink-0 text-[10px] font-medium text-emerald-400/90">Active</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {canTakeAction ? (
                                <button type="button" onClick={() => handleRevoke(acc.id)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-red-500/50 bg-red-500/20 text-red-300 hover:bg-red-500/30 transition">Revoke Access</button>
                              ) : (
                                <button type="button" onClick={() => { setUpgradeTarget("standard"); setShowUpgradeModal(true); }} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-500/40 bg-slate-500/10 text-slate-400">Upgrade to take action</button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    {connectedAccounts.filter((a) => a.status === "active").length === 0 && (
                      <div className="rounded-xl border py-8 px-4 text-center text-sm" style={{ background: "rgba(15, 10, 24, 0.6)", borderColor: "rgba(34,197,94,0.2)", color: "rgba(192,192,192,0.7)" }}>No active consents.</div>
                    )}
                  </div>
                    </>
                  )}

                  {activeConsentView === "revoked" && (
                    <>
                  {/* Revoked — Stopped (Grey/Dimmed) */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-widest opacity-95 pt-1" style={{ color: SILVER }}>Revoked consents</h3>
                    <p className="text-[10px] font-medium opacity-85 -mt-2" style={{ color: SILVER }}>Re-grant to move back to Pending for signing</p>
                    <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1 -mr-1">
                      {connectedAccounts.filter((a) => a.status === "revoked").map((acc) => (
                        <motion.div
                          key={acc.id}
                          layout
                          className="rounded-xl px-4 py-3 opacity-75 border border-slate-600/40 space-y-2"
                          style={{ background: "rgba(30, 30, 35, 0.6)", filter: "saturate(0.7)" }}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <p className="text-sm font-bold truncate text-gray-300">{acc.companyName ?? acc.name}</p>
                            <span className="text-[10px] font-normal shrink-0 opacity-75" style={{ color: "rgba(192,192,192,0.6)" }} title="Revoked">{formatConsentTimestamp(acc.revokedAt ?? acc.lastUpdated)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(acc.dataScope ?? acc.accessTo ?? []).map((label) => (
                              <span key={label} className={VAULT_IDENTIFIERS.includes(label as (typeof VAULT_IDENTIFIERS)[number]) ? "inline-flex items-center text-[10px] md:text-xs px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/50 text-purple-300 font-medium tracking-wide" : "inline-flex items-center text-[10px] md:text-xs px-2 py-0.5 rounded bg-transparent border border-gray-500 border-dashed text-gray-400 font-medium tracking-wide"}>{label}</span>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {acc.isBreached && <span className="shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400/80">Breached</span>}
                              <span className="shrink-0 text-[9px] font-medium px-2 py-0.5 rounded border border-gray-500/40 text-gray-400 bg-gray-800/40">Revoked</span>
                              {acc.erasureRequested && (
                                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                  ⏳ Erasure Pending - 72h Countdown
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleInitiateRegrant(acc.id)}
                                disabled={!!acc.erasureRequested}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-emerald-500/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition disabled:opacity-50 disabled:pointer-events-none"
                              >
                                Re-Grant Consent
                              </button>
                              {!acc.erasureRequested && (
                                <button
                                  type="button"
                                  onClick={() => handleForceErasure(acc.id)}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-red-500/50 bg-transparent text-red-400 hover:bg-red-500/10 transition"
                                >
                                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  Request Erasure
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    {connectedAccounts.filter((a) => a.status === "revoked").length === 0 && (
                      <div className="rounded-xl border py-8 px-4 text-center text-sm" style={{ background: "rgba(15, 10, 24, 0.6)", borderColor: "rgba(100,116,139,0.3)", color: "rgba(192,192,192,0.7)" }}>No revoked consents.</div>
                    )}
                  </div>
                    </>
                  )}

                  {activeConsentView === "denied" && (
                    <>
                  {/* Denied — Blocked (Red borders) */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-widest opacity-95 pt-1" style={{ color: SILVER }}>Denied / blocked</h3>
                    <p className="text-[10px] font-medium opacity-85 -mt-2" style={{ color: SILVER }}>Legally blocked by you. Optionally move back to Pending to review again.</p>
                    <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1 -mr-1">
                      {connectedAccounts.filter((a) => a.status === "denied").map((acc) => (
                        <motion.div
                          key={acc.id}
                          layout
                          className="rounded-xl px-4 py-3 border border-red-500/40 space-y-2"
                          style={{ background: "rgba(30, 10, 10, 0.4)", boxShadow: "0 0 0 1px rgba(185,28,28,0.15) inset" }}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <p className="text-sm font-bold truncate text-red-200/90">{acc.companyName ?? acc.name}</p>
                            <span className="text-[10px] font-normal shrink-0 opacity-75" style={{ color: "rgba(192,192,192,0.6)" }} title="Blocked">{formatConsentTimestamp(acc.lastUpdated)}</span>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(acc.dataScope ?? acc.accessTo ?? []).map((label) => (
                              <span key={label} className={VAULT_IDENTIFIERS.includes(label as (typeof VAULT_IDENTIFIERS)[number]) ? "inline-flex items-center text-[10px] md:text-xs px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/50 text-purple-300 font-medium tracking-wide" : "inline-flex items-center text-[10px] md:text-xs px-2 py-0.5 rounded bg-transparent border border-gray-500 border-dashed text-gray-400 font-medium tracking-wide"}>{label}</span>
                            ))}
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="shrink-0 text-[9px] font-semibold px-2 py-0.5 rounded border border-red-500/40 text-red-300/90 bg-red-950/30">Legally Blocked by User</span>
                            <button type="button" onClick={() => handleMoveToPending(acc.id)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[rgba(192,192,192,0.3)] text-gray-400 hover:bg-white/5 transition">Move to Pending</button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    {connectedAccounts.filter((a) => a.status === "denied").length === 0 && (
                      <div className="rounded-xl border py-8 px-4 text-center text-sm" style={{ background: "rgba(15, 10, 24, 0.6)", borderColor: "rgba(185,28,28,0.25)", color: "rgba(192,192,192,0.7)" }}>No denied consents.</div>
                    )}
                  </div>
                    </>
                  )}
                    </>
                  ) : (
                    <div className="h-48 animate-pulse rounded-xl bg-gray-800" />
                  )}
                </motion.div>
              )}

              {activeTab === "reports" && (
                <motion.div
                  key="reports"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-5"
                  style={{ background: "rgba(15, 10, 24, 0.4)", borderRadius: 16, border: "1px solid rgba(75, 0, 130, 0.3)" }}
                >
                  {hasMounted ? (
                    <>
                  {/* Reports header + Export Action Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: SILVER }}>Compliance &amp; Security Reports</h2>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        onClick={handleDownloadPDF}
                        disabled={!!exportLoading}
                        title="Download full report as PDF document"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/20 font-medium text-xs transition hover:bg-white/10 disabled:opacity-60 disabled:pointer-events-none"
                        style={{ color: SILVER }}
                      >
                        {exportLoading === "pdf" ? (
                          <span className="w-4 h-4 rounded-full border-2 border-t-transparent border-current animate-spin" aria-hidden />
                        ) : (
                          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        )}
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadExcel}
                        disabled={!!exportLoading}
                        title="Export data as CSV spreadsheet"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/20 font-medium text-xs transition hover:bg-white/10 disabled:opacity-60 disabled:pointer-events-none"
                        style={{ color: SILVER }}
                      >
                        {exportLoading === "excel" ? (
                          <span className="w-4 h-4 rounded-full border-2 border-t-transparent border-current animate-spin" aria-hidden />
                        ) : (
                          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        )}
                        Excel (CSV)
                      </button>
                      <button
                        type="button"
                        onClick={handleEmailReport}
                        disabled={!!exportLoading}
                        title="Send encrypted report to your email"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/20 font-medium text-xs transition hover:bg-white/10 disabled:opacity-60 disabled:pointer-events-none"
                        style={{ color: SILVER }}
                      >
                        {exportLoading === "email" ? (
                          <span className="w-4 h-4 rounded-full border-2 border-t-transparent border-current animate-spin" aria-hidden />
                        ) : (
                          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        )}
                        Email Report
                      </button>
                    </div>
                  </div>
                  {exportToast && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs font-medium py-2 px-3 rounded-lg border text-emerald-300 bg-emerald-500/10 border-emerald-500/30">
                      {exportToast}
                    </motion.p>
                  )}
                  {takedownToast && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`text-xs font-medium py-2 px-3 rounded-lg border ${takedownToast === "Sending..." ? "text-amber-300 bg-amber-500/10 border-amber-500/30" : "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"}`}>
                      {takedownToast === "Sending..." ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent border-current animate-spin shrink-0" aria-hidden />
                          {takedownToast}
                        </span>
                      ) : (
                        takedownToast
                      )}
                    </motion.p>
                  )}

                  {/* Filter bar — horizontal scrollable pills */}
                  <div className="flex overflow-x-auto gap-2 pb-1 -mx-0.5 scrollbar-thin" style={{ scrollbarWidth: "thin" }}>
                    <button
                      type="button"
                      onClick={() => setActiveReportFilter("All")}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${activeReportFilter === "All" ? "text-[#0f0a18]" : ""}`}
                      style={{ background: activeReportFilter === "All" ? "linear-gradient(135deg, #d4af37 0%, #b8860b 55%)" : "rgba(75, 0, 130, 0.25)", color: activeReportFilter === "All" ? undefined : SILVER }}
                    >
                      All
                    </button>
                    {REPORT_FILTERS.map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setActiveReportFilter(filter)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${activeReportFilter === filter ? "text-white" : ""}`}
                        style={{ background: activeReportFilter === filter ? ROYAL_PURPLE : "rgba(75, 0, 130, 0.2)", color: activeReportFilter === filter ? undefined : "rgba(192,192,192,0.9)" }}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>

                  {/* Report cards or dynamic empty state */}
                  <div className="space-y-3">
                    {filteredReports.length === 0 ? (
                      (() => {
                        const isAlternate = activeReportFilter === "Alternate Emails" || activeReportFilter === "Alternate Mobiles";
                        const isGovtIds = activeReportFilter === "Govt IDs";
                        const isPrimaryEmail = activeReportFilter === "Primary Email";
                        const isPrimaryMobile = activeReportFilter === "Primary Mobile";
                        const isAll = activeReportFilter === "All";
                        if (isAlternate) {
                          return (
                            <div className="rounded-xl border py-10 px-4 text-center space-y-4" style={{ background: "rgba(15, 10, 24, 0.9)", borderColor: "rgba(75, 0, 130, 0.35)", color: "rgba(192,192,192,0.85)" }}>
                              <div className="flex justify-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full border" style={{ borderColor: "rgba(212, 175, 55, 0.4)", background: "rgba(212, 175, 55, 0.1)" }}>
                                  <svg className="w-6 h-6" style={{ color: "#d4af37" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                </span>
                              </div>
                              <p className="text-sm font-medium">No scan reports available for this category yet.</p>
                              <p className="text-xs opacity-90">Run an Audit to generate a report.</p>
                              <button
                                type="button"
                                onClick={() => setShowBuyCreditsModal(true)}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition hover:bg-white/5"
                                style={{ borderColor: "rgba(212, 175, 55, 0.5)", color: "#d4af37" }}
                              >
                                Buy Credits to Add &amp; Scan Alternates
                              </button>
                            </div>
                          );
                        }
                        if (isGovtIds) {
                          return (
                            <div className="rounded-xl border py-10 px-4 text-center space-y-4" style={{ background: "rgba(15, 10, 24, 0.9)", borderColor: "rgba(75, 0, 130, 0.35)", color: "rgba(192,192,192,0.85)" }}>
                              <div className="flex justify-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full border" style={{ borderColor: "rgba(75, 0, 130, 0.5)", background: "rgba(75, 0, 130, 0.15)" }}>
                                  <svg className="w-6 h-6" style={{ color: ROYAL_PURPLE }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                </span>
                              </div>
                              <p className="text-sm font-medium">No scan reports available for Govt IDs.</p>
                              <p className="text-xs opacity-90">Upgrade your vault to secure your Aadhaar, PAN, and other official documents.</p>
                              <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
                                <button
                                  type="button"
                                  onClick={() => { setUpgradeTarget("premium"); setShowSubscriptionPlanModal(true); }}
                                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-95"
                                  style={{ background: "linear-gradient(135deg, #4B0082 0%, #6a0dad 100%)", color: "#fff", boxShadow: "0 0 0 1px rgba(75,0,130,0.4)" }}
                                >
                                  Upgrade to Premium (3 Govt IDs)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setUpgradeTarget("premium"); setShowSubscriptionPlanModal(true); }}
                                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-95"
                                  style={{ background: "linear-gradient(135deg, #d4af37 0%, #b8860b 100%)", color: "#0f0a18", boxShadow: "0 0 0 1px rgba(212,175,55,0.4)" }}
                                >
                                  Upgrade to Premium Plus (All 5 Govt IDs)
                                </button>
                              </div>
                            </div>
                          );
                        }
                        if (isPrimaryEmail) {
                          return (
                            <div className="rounded-xl border py-10 px-4 text-center space-y-4" style={{ background: "rgba(15, 10, 24, 0.9)", borderColor: "rgba(34, 197, 94, 0.35)", color: "rgba(192,192,192,0.85)" }}>
                              <div className="flex justify-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/20">
                                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-emerald-100">Zero threats detected for your Primary Email.</p>
                              <p className="text-xs opacity-90">Your perimeter is secure. Run an audit to generate a fresh report.</p>
                              <button
                                type="button"
                                onClick={() => setActiveTab("audit")}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-95"
                                style={{ background: ROYAL_PURPLE, color: "#fff" }}
                              >
                                Go to Audit Dashboard
                              </button>
                            </div>
                          );
                        }
                        if (isPrimaryMobile) {
                          return (
                            <div className="rounded-xl border py-10 px-4 text-center space-y-4" style={{ background: "rgba(15, 10, 24, 0.9)", borderColor: "rgba(34, 197, 94, 0.35)", color: "rgba(192,192,192,0.85)" }}>
                              <div className="flex justify-center">
                                <span className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/20">
                                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                </span>
                              </div>
                              <p className="text-sm font-semibold text-emerald-100">Zero threats detected for your Primary Mobile.</p>
                              <p className="text-xs opacity-90">Your perimeter is secure. Run an audit to generate a fresh report.</p>
                              <button
                                type="button"
                                onClick={() => setActiveTab("audit")}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-95"
                                style={{ background: ROYAL_PURPLE, color: "#fff" }}
                              >
                                Go to Audit Dashboard
                              </button>
                            </div>
                          );
                        }
                        if (isAll) {
                          return (
                            <div className="rounded-xl border py-10 px-4 text-center space-y-4" style={{ background: "rgba(15, 10, 24, 0.9)", borderColor: "rgba(75, 0, 130, 0.35)", color: "rgba(192,192,192,0.85)" }}>
                              <p className="text-sm font-medium">No reports available yet.</p>
                              <p className="text-xs opacity-90">Run your first Identity Audit to establish your privacy baseline.</p>
                              <button
                                type="button"
                                onClick={() => setActiveTab("audit")}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-95"
                                style={{ background: ROYAL_PURPLE, color: "#fff" }}
                              >
                                Go to Audit Dashboard
                              </button>
                            </div>
                          );
                        }
                        return (
                          <div className="rounded-xl border py-10 px-4 text-center" style={{ background: "rgba(15, 10, 24, 0.9)", borderColor: "rgba(75, 0, 130, 0.35)", color: "rgba(192,192,192,0.8)" }}>
                            <p className="text-sm font-medium">No scan reports for this filter.</p>
                            <button type="button" onClick={() => setActiveTab("audit")} className="mt-2 text-xs font-semibold underline" style={{ color: ROYAL_PURPLE }}>Go to Audit</button>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="max-h-[340px] overflow-y-auto space-y-2 pr-0.5">
                        {filteredReports.map((entry, i) => (
                          <motion.div
                            key={entry.id ?? `${entry.dateTime}-${i}`}
                            layout
                            className="rounded-xl border px-4 py-3 space-y-2"
                            style={{ background: "rgba(15, 10, 24, 0.85)", borderColor: "rgba(75, 0, 130, 0.35)" }}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <span className="text-[10px] font-medium tabular-nums opacity-90" style={{ color: "rgba(192,192,192,0.85)" }}>
                                {new Date(entry.dateTime).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                              <button type="button" onClick={() => setReportModalEntry(entry)} className="text-[10px] font-semibold underline opacity-80 hover:opacity-100 transition" style={{ color: ROYAL_PURPLE }}>View full</button>
                            </div>
                            <ul className="text-xs space-y-0.5" style={{ color: SILVER }}>
                              {(entry.scannedIdentifiers ?? [entry.email, entry.mobile].filter(Boolean)).map((id, j) => (
                                <li key={j} className="flex items-center gap-1.5">
                                  <span className="opacity-60">•</span>
                                  {id || "—"}
                                </li>
                              ))}
                            </ul>
                            <div className="flex items-center justify-between gap-2 pt-1 border-t border-[rgba(75,0,130,0.2)]">
                              <span className="text-xs font-semibold" style={{ color: SILVER }}>Privacy Score: <span className="tabular-nums">{entry.score}</span>/100</span>
                              <span className={`text-xs font-semibold tabular-nums ${(entry.threatsFound ?? entry.threatCount ?? 0) > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                {(entry.threatsFound ?? entry.threatCount ?? 0) > 0 ? `${entry.threatsFound ?? entry.threatCount} threat(s)` : "0 threats"}
                              </span>
                            </div>
                            {(entry.threatsFound ?? entry.threatCount ?? 0) > 0 ? (
                              <button
                                type="button"
                                onClick={() => setShowTakedownModal(true)}
                                className="w-full mt-2 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 border border-red-500/60 bg-red-500/20 text-red-300 hover:bg-red-500/30 transition"
                              >
                                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                                Execute Breach Takedown
                              </button>
                            ) : (
                              <div className="mt-2 py-2 px-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center gap-1.5">
                                <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                <span className="text-xs font-semibold text-emerald-400">Zero Threats Detected - Perimeter Secure</span>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Placeholder: Privacy Score Trend Graph (to be added later) */}
                  <div className="rounded-xl border border-dashed py-8 px-4 text-center" style={{ borderColor: "rgba(75, 0, 130, 0.4)", background: "rgba(75, 0, 130, 0.06)" }}>
                    <p className="text-xs font-medium uppercase tracking-wider opacity-70" style={{ color: SILVER }}>Privacy Score Trend Graph</p>
                    <p className="text-[10px] mt-1 opacity-60" style={{ color: SILVER }}>Coming soon</p>
                  </div>
                    </>
                  ) : (
                    <div className="h-48 animate-pulse rounded-xl bg-gray-800" />
                  )}
                </motion.div>
              )}

              {activeTab === "profile" && (
                <motion.div
                  key="profile"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-4"
                >
                  {/* Profile hero: Master Identity Header — Row 1: Name + Verified Human; Row 2: DOB + tier + locked toggle */}
                  <div className="flex flex-col items-center gap-3 pb-4 border-b" style={{ borderColor: "rgba(192,192,192,0.2)" }}>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center border-2 shrink-0" style={{ borderColor: "rgba(75, 0, 130, 0.5)", background: "rgba(75, 0, 130, 0.2)" }}>
                      <span className="text-xl font-bold" style={{ color: SILVER }}>{(profile.name || name || "?").charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 w-full text-center">
                      <div className="flex items-center gap-2 justify-center flex-wrap">
                        {profileNameEditing ? (
                          <>
                            <input
                              type="text"
                              value={profileNameEditValue}
                              onChange={(e) => setProfileNameEditValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { const v = profileNameEditValue.trim(); if (v) { setName(v); setProfile((p) => { const next = { ...p, name: v }; saveProfile(next); return next; }); } setProfileNameEditing(false); } if (e.key === "Escape") setProfileNameEditing(false); }}
                              className="h-9 px-3 rounded-lg bg-white/10 border text-sm focus:outline-none focus:ring-2 focus:ring-[#4B0082] max-w-[180px]"
                              style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}
                              autoFocus
                            />
                            <button type="button" onClick={() => { const v = profileNameEditValue.trim(); if (v) { setName(v); setProfile((p) => { const next = { ...p, name: v }; saveProfile(next); return next; }); } setProfileNameEditing(false); }} className="p-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/20 text-emerald-300" aria-label="Save name"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button>
                          </>
                        ) : (
                          <>
                            <h2 className="text-xl font-bold tracking-tight" style={{ color: SILVER }}>{profile.name || name || "—"}</h2>
                            <button type="button" onClick={() => { setProfileNameEditValue(profile.name || name || ""); setProfileNameEditing(true); }} className="p-1.5 rounded-lg border border-[rgba(192,192,192,0.3)] hover:bg-white/10 transition" aria-label="Edit name"><svg className="w-4 h-4" style={{ color: SILVER }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                          </>
                        )}
                        {(profile.name || name) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 shrink-0">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            Verified Human
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-center">
                        {/* Condition A (editing): date input + Save + Cancel */}
                        {isEditingDob && (
                          <div className="flex items-center gap-2 flex-wrap justify-center w-full">
                            <input
                              type="date"
                              value={tempDob}
                              onChange={(e) => setTempDob(e.target.value)}
                              max={new Date().toISOString().slice(0, 10)}
                              className="h-9 px-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#4B0082] focus:ring-offset-0"
                              style={{ background: "rgba(0,0,0,0.4)", borderColor: "rgba(75, 0, 130, 0.4)", color: SILVER }}
                              aria-label="Date of birth"
                            />
                            <button
                              type="button"
                              disabled={!tempDob.trim()}
                              onClick={() => {
                                const v = tempDob.trim();
                                if (!v) return;
                                const d = new Date(v);
                                const formatted = isNaN(d.getTime()) ? v : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                                setProfile((p) => { const next = { ...p, dob: formatted }; saveProfile(next); return next; });
                                setIsEditingDob(false);
                                setTempDob("");
                              }}
                              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white disabled:opacity-50 disabled:pointer-events-none transition"
                              style={{ background: ROYAL_PURPLE }}
                            >
                              Save
                            </button>
                            <button type="button" onClick={() => { setIsEditingDob(false); setTempDob(""); }} className="px-3 py-1.5 rounded-xl text-xs font-medium border hover:bg-white/5 transition" style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}>Cancel</button>
                          </div>
                        )}
                        {/* Condition B (saved): DOB text + Edit pencil + activation toggle */}
                        {profile.dob && !isEditingDob && (
                          <>
                            <span className="text-xs text-gray-400">DOB: {profile.dob}</span>
                            <button type="button" onClick={() => { setTempDob(dobToInputValue(profile.dob)); setIsEditingDob(true); }} className="p-1.5 rounded-lg border border-[rgba(192,192,192,0.3)] hover:bg-white/10 transition" aria-label="Edit date of birth" title="Edit DOB">
                              <svg className="w-3.5 h-3.5" style={{ color: SILVER }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={profile.isDobActivated === true}
                                onClick={() => {
                                  if (profile.isDobActivated === true) {
                                    return;
                                  }
                                  if (standardCredits >= 1) {
                                    setStandardCredits((p) => { const next = Math.max(0, p - 1); saveStandardCredits(next); return next; });
                                    setProfile((p) => { const next = { ...p, isDobActivated: true }; saveProfile(next); return next; });
                                    setDobActivatedToast(true);
                                  } else {
                                    setShowBuyCreditsModal(true);
                                  }
                                }}
                                className="relative h-6 w-11 rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-[#4B0082] focus:ring-offset-0 shrink-0"
                                style={{
                                  background: profile.isDobActivated === true ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)" : "rgba(15, 10, 24, 0.6)",
                                  borderColor: profile.isDobActivated === true ? "rgba(34, 197, 94, 0.5)" : "rgba(212, 175, 55, 0.35)",
                                  boxShadow: profile.isDobActivated === true ? "0 0 0 1px rgba(34,197,94,0.2) inset" : "0 0 0 1px rgba(212,175,55,0.15) inset",
                                }}
                              >
                                <motion.span
                                  className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm"
                                  animate={{ left: profile.isDobActivated === true ? 22 : 4 }}
                                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                />
                              </button>
                              <span className="text-[9px] font-medium" style={{ color: SILVER }}>
                                {profile.isDobActivated === true ? "Verified & Active" : "Activate Verification (Consumes 1 Credit)"}
                              </span>
                            </div>
                          </>
                        )}
                        {/* Empty state: Add Date of Birth button */}
                        {!profile.dob && !isEditingDob && (
                          <button type="button" onClick={() => { setIsEditingDob(true); setTempDob(""); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed text-xs font-medium transition hover:bg-white/10" style={{ borderColor: "rgba(75, 0, 130, 0.5)", color: ROYAL_PURPLE }}>
                            Add Date of Birth
                          </button>
                        )}
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0 ${subscriptionTier === "free" ? "bg-slate-600/40 text-slate-300" : subscriptionTier === "standard" ? "bg-[#4B0082]/40 text-purple-200" : subscriptionTier === "premiumPlus" ? "bg-amber-500/30 text-amber-200" : "bg-amber-500/20 text-amber-200"}`}>
                          {subscriptionTier === "free" ? "Free" : subscriptionTier === "standard" ? "Standard" : subscriptionTier === "premiumPlus" ? "Premium Plus" : "Premium"}
                        </span>
                        <button type="button" onClick={() => setShowSubscriptionPlanModal(true)} className="text-[10px] font-medium underline opacity-80 hover:opacity-100" style={{ color: SILVER }}>Plans</button>
                      </div>
                    </div>
                    <AnimatePresence>
                      {dobActivatedToast && (
                        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-xl px-3 py-2 flex items-center gap-2 border text-xs font-medium" style={{ background: "rgba(34, 197, 94, 0.15)", borderColor: "rgba(34, 197, 94, 0.4)", color: "#86efac" }}>
                          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                          DOB Activated for Data Sharing
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="rounded-2xl overflow-hidden border" style={{ background: "linear-gradient(145deg, rgba(75, 0, 130, 0.15) 0%, rgba(15, 10, 24, 0.95) 50%)", borderColor: "rgba(192, 192, 192, 0.25)", boxShadow: "0 0 0 1px rgba(75, 0, 130, 0.2) inset" }}>
                    <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(192,192,192,0.15)" }}>
                      <h3 className="text-sm font-semibold uppercase tracking-widest" style={{ color: SILVER }}>Basic Info</h3>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="rounded-xl px-4 py-3 border" style={{ borderColor: "rgba(192,192,192,0.2)", background: "rgba(0,0,0,0.2)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80 mb-1" style={{ color: SILVER }}>Primary Email</p>
                        <p className="text-sm font-medium flex items-center gap-2" style={{ color: SILVER }}>
                          {profile.primaryEmail || primaryEmail || email || "—"}
                          {emailVerified && <span className="text-emerald-400" aria-label="Verified"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg></span>}
                        </p>
                      </div>
                      <div className="rounded-xl px-4 py-3 border" style={{ borderColor: "rgba(192,192,192,0.2)", background: "rgba(0,0,0,0.2)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80 mb-1" style={{ color: SILVER }}>Primary Mobile</p>
                        <p className="text-sm font-medium flex items-center gap-2" style={{ color: SILVER }}>
                          {profile.mobile || primaryMobile || mobile || "—"}
                          {mobileVerified && <span className="text-emerald-400" aria-label="Verified"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg></span>}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "rgba(192,192,192,0.25)", background: "rgba(15, 10, 24, 0.8)" }}>
                    <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(192,192,192,0.15)" }}>
                      <h3 className="text-sm font-semibold uppercase tracking-widest" style={{ color: SILVER }}>Identity Verification Hub</h3>
                      <p className="text-[10px] opacity-80 mt-0.5" style={{ color: SILVER }}>Add and verify email &amp; mobile here. Used for audits.</p>
                    </div>
                    <div className="p-4 space-y-2">
                      {hasMounted && identitiesWithLabels.length > 0 ? identitiesWithLabels.map((item) => (
                        <div key={item.id} className="rounded-xl px-4 py-2.5 border flex items-center justify-between gap-2" style={{ borderColor: "rgba(192,192,192,0.2)", background: "rgba(0,0,0,0.15)" }}>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            {item.type === "email" ? <svg className="w-4 h-4 shrink-0" style={{ color: SILVER }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> : <svg className="w-4 h-4 shrink-0" style={{ color: SILVER }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
                            <span className="text-xs font-medium truncate" style={{ color: SILVER }}>{item.type === "email" ? maskEmail(item.value) : maskMobile(item.value)}</span>
                            {item.verified ? <span className="text-emerald-400 shrink-0" title="Verified"><svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg></span> : <button type="button" onClick={() => startVerification(item)} className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition shrink-0">Verify</button>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase" style={{ background: item.label === "Primary" ? "rgba(192,192,192,0.2)" : "rgba(100,116,139,0.3)", color: SILVER }}>{item.label ?? "—"}</span>
                            <button type="button" onClick={() => removeIdentity(item.id)} className="p-1 rounded hover:bg-white/10 opacity-70" aria-label="Remove"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                          </div>
                        </div>
                      )) : <p className="text-xs opacity-70 py-2" style={{ color: SILVER }}>No identities. Add one below.</p>}
                      <div className="flex gap-2 items-center flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleAddClick("email")}
                          className="cursor-pointer relative z-50 p-2 hover:bg-white/10 rounded-full transition-all inline-flex items-center justify-center gap-2 min-w-[44px] min-h-[44px]"
                          style={{ color: SILVER }}
                          aria-label={standardCredits >= ADD_COST ? "Add alternate email" : "Buy credits to add alternate"}
                        >
                          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          <span className="text-xs font-medium">{standardCredits >= ADD_COST ? "+ Add Alternate Identity" : "Buy Credits to Add Alternate"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddClick("mobile")}
                          className="cursor-pointer relative z-50 p-2 hover:bg-white/10 rounded-full transition-all inline-flex items-center justify-center gap-2 min-w-[44px] min-h-[44px]"
                          style={{ color: SILVER }}
                          aria-label={standardCredits >= ADD_COST ? "Add alternate mobile" : "Buy credits to add alternate"}
                        >
                          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          <span className="text-xs font-medium">{standardCredits >= ADD_COST ? "+ Add Alternate Identity" : "Buy Credits to Add Alternate"}</span>
                        </button>
                      </div>
                      <p className="text-[9px] opacity-70" style={{ color: SILVER }}>50 credits to add; OTP required. Low balance opens Buy Credits.</p>
                      <AnimatePresence>
                        {identityAddedToast && (
                          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 rounded-xl px-3 py-2 flex items-center gap-2 border text-xs font-medium" style={{ background: "rgba(34, 197, 94, 0.15)", borderColor: "rgba(34, 197, 94, 0.4)", color: "#86efac" }}>
                            <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            Identity Verified &amp; Added to Perimeter.
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Govt. IDs — vertical stack in Profile (data entry here) */}
                  <div className="rounded-2xl overflow-hidden border relative" style={{ borderColor: "rgba(212,175,55,0.35)", background: "rgba(15, 10, 24, 0.85)" }}>
                    <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: "rgba(212,175,55,0.3)" }}>
                      <svg className="w-4 h-4 shrink-0" style={{ color: "#d4af37" }} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                      <h3 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "#d4af37" }}>Govt. IDs</h3>
                    </div>
                    {!isPremium ? (
                      <div className="p-6 flex flex-col items-center justify-center gap-3" style={{ minHeight: 120 }}>
                        <svg className="w-10 h-10" style={{ color: "#d4af37" }} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                        <p className="text-xs font-medium text-center" style={{ color: SILVER }}>Upgrade to Premium to manage Govt. IDs</p>
                        <button type="button" onClick={() => { setUpgradeTarget("premium"); setShowUpgradeModal(true); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "linear-gradient(135deg, #d4af37 0%, #b8860b 100%)", color: "#0f0a18" }}>Upgrade</button>
                      </div>
                    ) : (
                      <div className="p-4 space-y-3">
                        {ALL_GOVT_ID_KINDS.map((kind) => {
                          const entry = govtIds[kind];
                          const status = entry?.scanStatus ?? "Pending";
                          const isBreach = status !== "No Leaks" && status !== "Pending" && status.length > 0;
                          const isAadhaarVerified = kind === "aadhaar" && entry?.verified;
                          const label = govtIdLabel(kind);
                          const placeholder = kind === "aadhaar" ? "Aadhaar number" : kind === "pan" ? "PAN" : kind === "voterId" ? "Voter ID" : kind === "dl" ? "DL number" : "Passport number";
                          const isSlotLocked = subscriptionTier === "premium" && verifiedGovtIdsCount >= 3 && !entry?.verified;
                          return (
                            <div key={kind} className="w-full rounded-xl overflow-hidden border relative" style={{ background: "linear-gradient(180deg, rgba(45, 50, 58, 0.9) 0%, rgba(18, 20, 26, 0.98) 100%)", border: `1px solid ${isAadhaarVerified ? "rgba(34, 197, 94, 0.5)" : isBreach ? "rgba(239, 68, 68, 0.5)" : "rgba(148, 163, 184, 0.25)"}`, boxShadow: isAadhaarVerified ? "0 0 12px rgba(34, 197, 94, 0.15), inset 0 1px 0 rgba(255,255,255,0.06)" : "inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 12px rgba(0,0,0,0.35)" }}>
                              {isBreach && !isAadhaarVerified && <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/20 border border-red-500/40"><svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92z" clipRule="evenodd" /></svg><span className="text-[9px] font-bold uppercase text-red-400">Critical Alert</span></div>}
                              <div className="px-4 py-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>{label}</span>
                                  <span className="text-[10px] font-medium tabular-nums" style={{ color: "#94a3b8" }}>{kind === "aadhaar" && entry?.value ? maskAadhaarDisplay(entry.value) : maskLast4(entry?.value ?? "")}</span>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  {entry?.verified ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/40">
                                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                                      Verified via DigiLocker
                                    </span>
                                  ) : isSlotLocked ? (
                                    <button type="button" onClick={() => setShowVaultLimitModal(true)} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition" title="Upgrade to Premium Plus to verify">
                                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                                      Unlock
                                    </button>
                                  ) : (entry?.value ?? "").trim() ? (
                                    <button type="button" onClick={() => handleRequestVerifyGovtId(kind)} className="text-[10px] font-semibold px-2 py-1 rounded border border-amber-500/50 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition">Verify</button>
                                  ) : (
                                    <span className="text-[10px] font-medium text-slate-400">Not verified</span>
                                  )}
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${status === "No Leaks" ? "bg-emerald-500/20 text-emerald-400" : isBreach ? "bg-red-500/20 text-red-400" : "bg-slate-500/20 text-slate-400"}`}>Audit Status: {status === "Not scanned" ? "Pending" : (status || "Pending")}</span>
                                </div>
                                <input type="text" placeholder={placeholder} value={entry?.value ?? ""} onChange={(e) => { const val = e.target.value; setGovtIds((prev) => { const next = { ...prev, [kind]: { ...prev[kind], value: val } }; saveGovtIds(next); if (kind === "aadhaar") setAadhaarPan(val); return next; }); }} className="w-full h-9 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-[#64748b]" style={{ background: "rgba(15, 17, 22, 0.9)", borderColor: "rgba(148, 163, 184, 0.3)", color: "#e2e8f0" }} />
                              </div>
                            </div>
                          );
                        })}
                        {subscriptionTier === "premium" && verifiedGovtIdsCount >= 3 && (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-center justify-between gap-2">
                            <span className="text-[10px] font-medium" style={{ color: SILVER }}>Verify more than 3 IDs</span>
                            <button type="button" onClick={() => { setShowVaultLimitModal(false); setShowSubscriptionPlanModal(true); }} className="text-[10px] font-semibold text-amber-300 hover:text-amber-200">Upgrade to Premium Plus</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "rgba(192,192,192,0.25)", background: "rgba(15, 10, 24, 0.8)" }}>
                    <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(192,192,192,0.15)" }}><h3 className="text-sm font-semibold uppercase tracking-widest" style={{ color: SILVER }}>Credit Balance</h3></div>
                    <div className="p-4">
                      <p className="text-2xl font-bold tabular-nums" style={{ color: subscriptionTier === "free" ? "rgba(192,192,192,0.5)" : ROYAL_PURPLE }}>{hasMounted ? standardCredits : "—"}</p>
                      <p className="text-[10px] opacity-80 mt-0.5" style={{ color: SILVER }}>50 to add identity · 5 per alternate scan</p>
                    </div>
                  </div>

                  <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "rgba(192,192,192,0.25)", background: "rgba(15, 10, 24, 0.8)" }}>
                    <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(192,192,192,0.15)" }}><h3 className="text-sm font-semibold uppercase tracking-widest" style={{ color: SILVER }}>Privacy Score Over Time</h3></div>
                    <div className="p-4">
                      {audits.length > 0 ? (
                        <div className="h-36 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={[...audits.slice(0, 10)].reverse().map((a, i) => ({ index: i + 1, score: a.score, date: new Date(a.dateTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                              <defs><linearGradient id="profileScoreGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ROYAL_PURPLE} stopOpacity={0.4} /><stop offset="100%" stopColor={ROYAL_PURPLE} stopOpacity={0} /></linearGradient></defs>
                              <XAxis dataKey="date" tick={{ fontSize: 9, fill: SILVER }} stroke="rgba(192,192,192,0.3)" />
                              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: SILVER }} stroke="rgba(192,192,192,0.3)" width={28} />
                              <Tooltip contentStyle={{ background: "rgba(15, 10, 24, 0.98)", border: "1px solid rgba(75, 0, 130, 0.5)", borderRadius: 8, color: SILVER, fontSize: 11 }} formatter={(value: number | undefined) => [value ?? 0, "Score"]} />
                              <Area type="monotone" dataKey="score" stroke={ROYAL_PURPLE} strokeWidth={2} fill="url(#profileScoreGradient)" dot={{ fill: ROYAL_PURPLE, r: 3 }} activeDot={{ r: 5 }} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      ) : <p className="text-xs opacity-70 py-4 text-center" style={{ color: SILVER }}>Run an audit to see your score trend</p>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs" style={{ color: SILVER }}>
                    <span>Account</span>
                    <button
                      type="button"
                      onClick={() => setProfile((p) => {
                        const next = { ...p, isRegistered: !p.isRegistered, primaryEmail: p.primaryEmail || email.trim() || p.primaryEmail, name: (p.name || name.trim()) ? (p.name || name) : p.name };
                        saveProfile(next);
                        return next;
                      })}
                      className={`px-2 py-1 rounded font-medium transition ${profile.isRegistered ? "bg-[#4B0082]/30 text-purple-200 border border-[#4B0082]/50" : "border border-[rgba(192,192,192,0.3)] opacity-70 hover:opacity-100"}`}
                    >
                      {profile.isRegistered ? "Registered" : "Not registered (tap to set demo)"}
                    </button>
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
                <h3 className="text-sm font-semibold" style={{ color: SILVER }}>Threat Dossier</h3>
                <button
                  type="button"
                  onClick={() => setReportModalEntry(null)}
                  className="p-1 rounded hover:bg-white/10 transition"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" style={{ color: SILVER }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1 min-h-0 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "rgba(192,192,192,0.9)" }}>
                  <span><span className="font-semibold">Date:</span> {new Date(reportModalEntry.dateTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  <span>·</span>
                  <span><span className="font-semibold">Score:</span> {reportModalEntry.score}/100</span>
                  <span>·</span>
                  <span><span className="font-semibold">Perimeter:</span> {maskEmail(reportModalEntry.email)}{reportModalEntry.mobile ? ` · ${maskMobile(reportModalEntry.mobile)}` : ""}</span>
                </div>
                {reportModalEntry.foundThreats && reportModalEntry.foundThreats.length > 0 ? (
                  <div className="space-y-4 mt-4">
                    {reportModalEntry.foundThreats.map((threat, idx) => (
                      <div key={idx} className="p-4 bg-white/5 border border-white/10 rounded-lg">
                        <h4 className="font-bold text-white mb-3">{threat.source}</h4>
                        <div className="flex flex-wrap gap-2">
                          {(threat.compromisedData ?? []).map((item, i) => {
                            const isCriticalIdentity = item === "Primary Email" || item === "Primary Mobile Number";
                            return (
                              <span
                                key={i}
                                className={`inline-flex items-center text-[10px] md:text-xs px-2 py-1 rounded font-medium ${
                                  isCriticalIdentity
                                    ? "bg-red-500/25 border border-red-500 text-red-300"
                                    : "bg-transparent border border-dashed border-gray-500 text-gray-400"
                                }`}
                              >
                                {item}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border py-6 px-4 text-center" style={{ borderColor: "rgba(34, 197, 94, 0.35)", background: "rgba(34, 197, 94, 0.08)" }}>
                    <p className="text-sm font-medium text-emerald-200">No threats found for this scan.</p>
                    <p className="text-xs text-emerald-300/80 mt-1">Your perimeter is secure.</p>
                  </div>
                )}
              </div>
              {reportModalEntry.foundThreats && reportModalEntry.foundThreats.length > 0 && (
                <div className="p-4 pt-0 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setReportModalEntry(null);
                      setTakedownToast("Sending...");
                      setEmailScore((prev) => Math.min(100, prev + 10));
                      setTimeout(() => setTakedownToast("Legal Takedown Notices dispatched to breached entities."), 2000);
                    }}
                    className="w-full py-3 rounded-xl font-semibold text-sm transition hover:opacity-95 text-white bg-red-600 hover:bg-red-500 border border-red-500/50 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    Execute Breach Takedown
                  </button>
                </div>
              )}
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

      {/* Buy Credits Modal — when adding alternate with 0 credits */}
      <AnimatePresence>
        {showBuyCreditsModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowBuyCreditsModal(false)} style={{ background: "rgba(0,0,0,0.7)" }}>
            <motion.div className="rounded-2xl border shadow-xl max-w-sm w-full overflow-hidden" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} onClick={(e) => e.stopPropagation()} style={{ background: "linear-gradient(180deg, rgba(30, 20, 45, 0.98) 0%, rgba(15, 10, 24, 0.98) 100%)", borderColor: "rgba(75, 0, 130, 0.5)" }}>
              <div className="px-4 py-4 border-b flex items-center justify-between" style={{ borderColor: "rgba(75, 0, 130, 0.3)" }}>
                <h3 className="text-sm font-semibold" style={{ color: ROYAL_PURPLE }}>Buy Credits</h3>
                <button type="button" onClick={() => setShowBuyCreditsModal(false)} className="p-1 rounded hover:bg-white/10 transition" aria-label="Close"><svg className="w-5 h-5" style={{ color: SILVER }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-xs opacity-90" style={{ color: SILVER }}>Adding an alternate email or mobile costs 50 Credits. You need {ADD_COST} credits and OTP verification.</p>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => { setShowBuyCreditsModal(false); setStandardCredits((p) => { const next = p + 50; saveStandardCredits(next); return next; }); setAddIdentityModalOpen(true); setAddIdentityValue(""); setAddIdentityType("email"); }} className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-90" style={{ background: ROYAL_PURPLE, color: "#fff" }}>+ 50 Credits</button>
                  <button type="button" onClick={() => setShowBuyCreditsModal(false)} className="flex-1 py-2.5 rounded-xl font-medium text-sm border transition hover:bg-white/5" style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}>Cancel</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Insufficient Credits Interceptor Modal — Audit Tab */}
      <AnimatePresence>
        {showCreditModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setShowCreditModal(false)}
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
          >
            <motion.div
              className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border-t sm:border shadow-xl overflow-hidden"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "linear-gradient(180deg, rgba(30, 20, 45, 0.98) 0%, rgba(15, 10, 24, 0.98) 100%)",
                borderColor: "rgba(212, 175, 55, 0.4)",
                boxShadow: "0 0 0 1px rgba(212,175,55,0.15), 0 25px 50px -12px rgba(0,0,0,0.5)",
              }}
            >
              <div className="p-6 pb-8 sm:pb-6 space-y-4">
                <div className="flex justify-center">
                  <motion.span
                    className="flex items-center justify-center w-14 h-14 rounded-full border-2"
                    style={{ borderColor: "rgba(212,175,55,0.5)", background: "rgba(212,175,55,0.12)", boxShadow: "0 0 24px rgba(212,175,55,0.25)" }}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.05, type: "spring", stiffness: 400, damping: 25 }}
                  >
                    <svg className="w-7 h-7" style={{ color: "#d4af37" }} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path fillRule="evenodd" d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm-1.06 8.94l-2.47-2.47 1.06-1.06 1.41 1.41 3.54-3.54 1.06 1.06-4.6 4.6z" clipRule="evenodd" />
                    </svg>
                  </motion.span>
                </div>
                <h3 className="text-center text-base font-bold uppercase tracking-wider" style={{ color: "#d4af37" }}>Action Requires Standard Credits</h3>
                <p className="text-center text-sm leading-relaxed" style={{ color: SILVER }}>
                  You are about to run an Identity Audit on <strong>{selectedAlternateCount}</strong> alternate identifier{selectedAlternateCount !== 1 ? "s" : ""}, which requires <strong>{scanCreditCost}</strong> credits. Your current balance is <strong>{standardCredits}</strong> credits.
                </p>
                <div className="flex flex-col gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowCreditModal(false); setShowSubscriptionPlanModal(true); }}
                    className="w-full py-3 rounded-xl font-semibold text-sm transition hover:opacity-95 active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg, #d4af37 0%, #b8860b 100%)", color: "#0f0a18", boxShadow: "0 0 0 1px rgba(212,175,55,0.3)" }}
                  >
                    Top Up Credits
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCreditModal(false); setSelectedIdentityIdsForScan(new Set()); runAudit(true); }}
                    className="w-full py-3 rounded-xl font-medium text-sm border transition hover:bg-white/5"
                    style={{ borderColor: "rgba(192,192,192,0.4)", color: SILVER }}
                  >
                    Scan Primary Identities Only (Free)
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Choose Your Protection — Subscription Plan modal */}
      <AnimatePresence>
        {showSubscriptionPlanModal && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSubscriptionPlanModal(false)} style={{ background: "rgba(0,0,0,0.8)" }}>
            <motion.div className="rounded-2xl border shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} onClick={(e) => e.stopPropagation()} style={{ background: "linear-gradient(180deg, rgba(30, 20, 45, 0.98) 0%, rgba(15, 10, 24, 0.98) 100%)", borderColor: "rgba(75, 0, 130, 0.5)" }}>
              <div className="px-4 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "rgba(75, 0, 130, 0.3)" }}>
                <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: SILVER }}>Choose Your Protection</h3>
                <button type="button" onClick={() => setShowSubscriptionPlanModal(false)} className="p-1 rounded hover:bg-white/10 transition" aria-label="Close"><svg className="w-5 h-5" style={{ color: SILVER }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <div className="p-4 overflow-y-auto space-y-3 flex-1">
                {SUBSCRIPTION_PLANS.map((plan) => (
                  <div key={plan.id} className={`rounded-xl border p-3 ${plan.accent === "slate" ? "border-slate-500/30 bg-slate-500/5" : plan.accent === "amber" ? "border-amber-500/30 bg-amber-500/5" : "border-[#4B0082]/50 bg-[#4B0082]/10"}`}>
                    <h4 className={`text-sm font-bold uppercase tracking-wider ${plan.accent === "slate" ? "text-slate-300" : plan.accent === "amber" ? "text-amber-200" : "text-purple-200"}`}>{plan.name}</h4>
                    <p className="text-[10px] font-semibold uppercase mt-1 opacity-90" style={{ color: SILVER }}>Identity scope: {plan.scope}</p>
                    <ul className="mt-2 space-y-1">
                      {plan.features.map((f, i) => (
                        <li key={i} className="text-xs flex items-center gap-1.5" style={{ color: "rgba(192,192,192,0.9)" }}><span className="text-emerald-400">✓</span>{f}</li>
                      ))}
                    </ul>
                    <button type="button" onClick={() => { setSubscriptionTier(plan.id === "free" ? "free" : plan.id as "standard" | "premium" | "premiumPlus"); setShowSubscriptionPlanModal(false); }} className="mt-2 w-full py-1.5 rounded-lg text-[10px] font-semibold border transition hover:opacity-90" style={{ borderColor: plan.accent === "slate" ? "rgba(100,116,139,0.5)" : plan.accent === "amber" ? "rgba(212,175,55,0.6)" : "rgba(75,0,130,0.6)", color: SILVER }}>Select</button>
                  </div>
                ))}
                <div className="rounded-xl border-2 border-[#4B0082]/50 bg-[#4B0082]/15 p-4 mt-4">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-purple-200">Buy Credits</h4>
                  <p className="text-xs mt-2 font-medium" style={{ color: SILVER }}>50 Credits to Add an Identity. 5 Credits to Scan an Identity.</p>
                  <p className="text-[10px] mt-1 opacity-80" style={{ color: SILVER }}>Primary Email &amp; Mobile are always free to scan.</p>
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={() => { setShowSubscriptionPlanModal(false); setStandardCredits((p) => { const next = p + 50; saveStandardCredits(next); return next; }); }} className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition" style={{ background: ROYAL_PURPLE, color: "#fff" }}>+ 50 Credits</button>
                    <button type="button" onClick={() => { setShowSubscriptionPlanModal(false); setStandardCredits((p) => { const next = p + 100; saveStandardCredits(next); return next; }); }} className="flex-1 py-2.5 rounded-lg text-xs font-semibold border transition hover:bg-white/5" style={{ borderColor: "rgba(75,0,130,0.6)", color: SILVER }}>+ 100 Credits</button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upgrade Modal — Standard or Premium */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setShowUpgradeModal(false); setUpgradeTarget(null); }}
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
                background: "linear-gradient(180deg, rgba(30, 20, 45, 0.98) 0%, rgba(15, 10, 24, 0.98) 100%)",
                borderColor: upgradeTarget === "premium" ? "rgba(212, 175, 55, 0.5)" : "rgba(192,192,192,0.4)",
                boxShadow: upgradeTarget === "premium" ? "0 0 0 1px rgba(212,175,55,0.2), 0 25px 50px -12px rgba(0,0,0,0.5)" : "0 25px 50px -12px rgba(0,0,0,0.5)",
              }}
            >
              <div className="px-4 py-4 border-b flex items-center justify-between" style={{ borderColor: upgradeTarget === "premium" ? "rgba(212,175,55,0.3)" : "rgba(192,192,192,0.2)" }}>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: upgradeTarget === "premium" ? "rgba(212,175,55,0.2)" : "rgba(192,192,192,0.15)" }}>
                    <svg className="w-4 h-4" style={{ color: upgradeTarget === "premium" ? "#d4af37" : SILVER }} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                  </span>
                  <h3 className="text-sm font-semibold" style={{ color: upgradeTarget === "premium" ? "#d4af37" : SILVER }}>{upgradeTarget === "premium" ? "Expand Your Protection Perimeter" : "Upgrade to Standard"}</h3>
                </div>
                <button type="button" onClick={() => { setShowUpgradeModal(false); setUpgradeTarget(null); }} className="p-1 rounded hover:bg-white/10 transition" aria-label="Close">
                  <svg className="w-5 h-5" style={{ color: SILVER }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-4 space-y-3">
                {upgradeTarget === "standard" ? (
                  <>
                    <p className="text-xs opacity-90" style={{ color: SILVER }}>
                      Unlock <strong style={{ color: SILVER }}>Request Erasure</strong> and <strong style={{ color: SILVER }}>Consent Toggle</strong> to take action on your findings and manage connected accounts.
                    </p>
                    <div className="flex gap-2 pt-2">
                      <button type="button" onClick={() => { setShowUpgradeModal(false); setSubscriptionTier("standard"); setStandardCredits(3); saveStandardCredits(3); setUpgradeTarget(null); }} className="flex-1 py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-90" style={{ background: ROYAL_PURPLE, color: "#fff" }}>Upgrade to Standard</button>
                      <button type="button" onClick={() => { setShowUpgradeModal(false); setUpgradeTarget(null); }} className="flex-1 py-2.5 rounded-xl font-medium text-sm border transition hover:bg-white/5" style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}>Maybe Later</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs opacity-90 whitespace-pre-line" style={{ color: SILVER }}>
                      Your baseline account secures 1 Primary Email and 1 Primary Mobile.{"\n\n"}
                      • Need to add business numbers? Purchase Standard Credits (50 Credits per new identity).{"\n"}
                      • Need Govt ID protection? Upgrade to Premium to unlock 3 Govt IDs (Aadhaar, PAN, Voter ID), or Premium Plus for your complete 5-ID Master Vault.
                    </p>
                    <div className="flex flex-col gap-2 pt-2">
                      <button type="button" onClick={() => { setShowUpgradeModal(false); setUpgradeTarget(null); setShowBuyCreditsModal(true); }} className="w-full py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-90" style={{ background: ROYAL_PURPLE, color: "#fff" }}>Buy Standard Credits</button>
                      <button type="button" onClick={() => { setShowUpgradeModal(false); setUpgradeTarget(null); setShowSubscriptionPlanModal(true); }} className="w-full py-2.5 rounded-xl font-semibold text-sm transition hover:opacity-90" style={{ background: "linear-gradient(135deg, #d4af37 0%, #b8860b 100%)", color: "#0f0a18" }}>View Premium Plans</button>
                      <button type="button" onClick={() => { setShowUpgradeModal(false); setUpgradeTarget(null); }} className="w-full py-2.5 rounded-xl font-medium text-sm border transition hover:bg-white/5" style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}>Maybe Later</button>
                    </div>
                  </>
                )}
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
              onClick={() => { setDraftNoticeOpenForId(null); setDraftNoticeContext(null); }}
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
                    {draftNoticeContext
                      ? generateErasureNotice(draftNoticeContext.companyName, { name: profile.name || name, dob: profile.dob }, draftNoticeContext.specificIdentifier).body
                      : getDeletionNoticeBody(primaryEmail.trim(), profile.name || name)}
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
                    onClick={() => { setDraftNoticeOpenForId(null); setDraftNoticeContext(null); }}
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
              onClick={() => { if (!otpVerifying && !otpSuccess) { setOtpModalOpen(false); setOtpInput(""); setOtpVerifying(false); setOtpSuccess(false); setVerificationTarget(null); setPendingVerifyIdentityId(null); setPendingAddConsumesCredits(false); } }}
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
                      onClick={() => { setOtpModalOpen(false); setOtpInput(""); setOtpVerifying(false); setOtpSuccess(false); setVerificationTarget(null); setPendingVerifyIdentityId(null); setPendingAddConsumesCredits(false); }}
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

      {/* Add Identity Modal (showAddModal) */}
      <AnimatePresence>
        {addIdentityModalOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-[100] bg-black/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setAddIdentityModalOpen(false); setAddIdentityValue(""); setAddIdentityCustomLabel(""); setAddIdentityStep("form"); setAddIdentityOtpInput(""); }}
              aria-hidden
            />
            <motion.div
              className="fixed inset-0 z-[100] flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-full max-w-sm rounded-2xl overflow-hidden"
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
                {addIdentityStep === "form" ? (
                  <>
                    <div className="px-6 pt-6 pb-4">
                      <h3 className="text-lg font-semibold mb-2" style={{ color: ROYAL_PURPLE }}>
                        Add Identity
                      </h3>
                      <p className="text-xs mb-4 opacity-90" style={{ color: SILVER }}>
                        Add an email or mobile number. You will verify it with OTP.
                      </p>
                      <input
                        type="text"
                        placeholder="Custom Label (e.g., Business, Personal)"
                        value={addIdentityCustomLabel}
                        onChange={(e) => setAddIdentityCustomLabel(e.target.value)}
                        className="w-full py-3 px-4 rounded-xl bg-black/30 border focus:outline-none focus:ring-2 focus:ring-[#4B0082] text-sm mb-3"
                        style={{ borderColor: "rgba(75, 0, 130, 0.4)", color: SILVER }}
                      />
                      <div className="flex gap-2 mb-3">
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
                        className="flex-1 py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                        style={{ background: ROYAL_PURPLE }}
                      >
                        Send OTP (Consumes 50 Credits)
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAddIdentityModalOpen(false); setAddIdentityValue(""); setAddIdentityCustomLabel(""); setAddIdentityStep("form"); setAddIdentityOtpInput(""); }}
                        className="px-4 py-3.5 rounded-xl font-medium border transition hover:bg-white/5"
                        style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="px-6 pt-6 pb-4">
                      <h3 className="text-lg font-semibold mb-2" style={{ color: ROYAL_PURPLE }}>
                        Verify with OTP
                      </h3>
                      <p className="text-xs mb-4 opacity-90" style={{ color: SILVER }}>
                        Enter the 6-digit code sent to your {addIdentityType === "email" ? "email" : "mobile"}.
                      </p>
                      <div className="flex justify-center gap-2 mb-4">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                          <input
                            key={i}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={addIdentityOtpInput[i] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, "").slice(0, 1);
                              setAddIdentityOtpInput((prev) => (prev.slice(0, i) + v + prev.slice(i + 1)).replace(/\D/g, "").slice(0, 6));
                              if (v && i < 5) (e.target.nextElementSibling as HTMLInputElement)?.focus();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Backspace" && !addIdentityOtpInput[i] && i > 0) ((e.target as HTMLInputElement).previousElementSibling as HTMLInputElement)?.focus();
                              if (e.key === "Enter" && addIdentityOtpInput.replace(/\D/g, "").length === 6) handleAddIdentityOtpVerify();
                            }}
                            className="w-10 h-12 rounded-xl text-center text-lg font-mono bg-black/30 border focus:outline-none focus:ring-2 focus:ring-[#4B0082]"
                            style={{ borderColor: "rgba(75, 0, 130, 0.4)", color: SILVER }}
                            aria-label={`Digit ${i + 1}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="px-6 pb-6 pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={handleAddIdentityOtpVerify}
                        disabled={addIdentityOtpInput.replace(/\D/g, "").length < 6}
                        className="flex-1 py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
                        style={{ background: ROYAL_PURPLE }}
                      >
                        Verify & Add
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAddIdentityStep("form"); setAddIdentityOtpInput(""); }}
                        className="px-4 py-3.5 rounded-xl font-medium border transition hover:bg-white/5"
                        style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}
                      >
                        Back
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Secure Verification Modal — Govt ID DigiLocker */}
      <AnimatePresence>
        {showDigiLockerModal && govtIdForVerify && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowDigiLockerModal(false); setGovtIdForVerify(null); }} aria-hidden />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div
                className="pointer-events-auto w-full max-w-sm rounded-2xl overflow-hidden"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                style={{ background: "rgba(15, 10, 24, 0.98)", border: "1px solid rgba(212, 175, 55, 0.4)", boxShadow: "0 0 0 1px rgba(212,175,55,0.15), 0 25px 50px -12px rgba(0,0,0,0.5)" }}
              >
                <div className="px-6 pt-6 pb-4">
                  <h3 className="text-lg font-semibold mb-2" style={{ color: "#d4af37" }}>Secure Verification</h3>
                  <p className="text-xs mb-4 opacity-90" style={{ color: SILVER }}>Verify your Govt. ID using one of these secure methods.</p>
                  <div className="space-y-2">
                    <button type="button" onClick={() => handleGovtIdVerify("digilocker")} className="w-full py-3 px-4 rounded-xl font-medium text-sm border transition hover:bg-white/5 flex items-center gap-2" style={{ borderColor: "rgba(212, 175, 55, 0.5)", color: SILVER }}>
                      <svg className="w-5 h-5" style={{ color: "#d4af37" }} fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" /></svg>
                      Fetch via DigiLocker
                    </button>
                    <button type="button" onClick={() => handleGovtIdVerify("otp")} className="w-full py-3 px-4 rounded-xl font-medium text-sm border transition hover:bg-white/5 flex items-center gap-2" style={{ borderColor: "rgba(212, 175, 55, 0.5)", color: SILVER }}>
                      <svg className="w-5 h-5" style={{ color: "#d4af37" }} fill="currentColor" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" /></svg>
                      Aadhaar-Linked OTP
                    </button>
                  </div>
                </div>
                <div className="px-6 pb-6">
                  <button type="button" onClick={() => { setShowDigiLockerModal(false); setGovtIdForVerify(null); }} className="w-full py-2 rounded-xl font-medium text-sm border transition hover:bg-white/5" style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}>Cancel</button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Vault Limit Reached — Premium 3-out-of-5 slot limit */}
      <AnimatePresence>
        {showVaultLimitModal && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowVaultLimitModal(false)} aria-hidden />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div
                className="pointer-events-auto w-full max-w-sm rounded-2xl overflow-hidden"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                style={{ background: "rgba(15, 10, 24, 0.98)", border: "1px solid rgba(212, 175, 55, 0.4)", boxShadow: "0 0 0 1px rgba(212,175,55,0.15), 0 25px 50px -12px rgba(0,0,0,0.5)" }}
              >
                <div className="px-6 pt-6 pb-4">
                  <h3 className="text-lg font-semibold mb-3" style={{ color: "#d4af37" }}>Premium Slot Limit Reached</h3>
                  <p className="text-sm leading-relaxed mb-2" style={{ color: SILVER }}>
                    Your Premium plan includes active monitoring for 3 Government IDs. You have already secured {verifiedGovtIdLabels.length ? verifiedGovtIdLabels.join(", ") : "your 3 slots"}.
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: SILVER }}>
                    To secure this 4th ID, upgrade your vault.
                  </p>
                </div>
                <div className="px-6 pb-6 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowVaultLimitModal(false); setShowSubscriptionPlanModal(true); }}
                    className="w-full py-3 rounded-xl font-semibold text-sm transition hover:opacity-95"
                    style={{ background: "linear-gradient(135deg, #d4af37 0%, #b8860b 100%)", color: "#0f0a18" }}
                  >
                    Upgrade to Premium Plus
                  </button>
                  <button type="button" onClick={() => setShowVaultLimitModal(false)} className="w-full py-2.5 rounded-xl font-medium text-sm border transition hover:bg-white/5" style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}>Cancel</button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Section 12 Request Erasure — modal gatekeeper */}
      <AnimatePresence>
        {showErasureModal && selectedErasureId && (() => {
          const acc = connectedAccounts.find((a) => a.id === selectedErasureId);
          const companyName = acc?.companyName ?? acc?.name ?? "the data fiduciary";
          return (
            <>
              <motion.div className="fixed inset-0 z-50 bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowErasureModal(false); setSelectedErasureId(null); }} aria-hidden />
              <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div
                  className="w-full max-w-sm rounded-2xl overflow-hidden"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ background: "rgba(15, 10, 24, 0.98)", border: "1px solid rgba(185, 28, 28, 0.5)", boxShadow: "0 0 0 1px rgba(185,28,28,0.2), 0 25px 50px -12px rgba(0,0,0,0.5)" }}
                >
                  <div className="px-6 pt-6 pb-4">
                    <h3 className="text-lg font-semibold mb-3 text-red-200">Execute Section 12 Erasure Notice</h3>
                    <p className="text-sm leading-relaxed" style={{ color: SILVER }}>
                      You are about to send a legally binding demand to <strong className="text-gray-200">{companyName}</strong> to permanently delete all historical data, profiles, and backups associated with your identity. They are legally required to comply within 72 hours.
                    </p>
                  </div>
                  <div className="px-6 pb-6 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={executeErasure}
                      className="w-full py-3 rounded-xl font-semibold text-sm transition hover:opacity-95 text-white bg-red-600 hover:bg-red-500 border border-red-500/50"
                    >
                      Send Legal Notice
                    </button>
                    <button type="button" onClick={() => { setShowErasureModal(false); setSelectedErasureId(null); }} className="w-full py-2.5 rounded-xl font-medium text-sm border transition hover:bg-white/5" style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}>Cancel</button>
                  </div>
                </motion.div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* Privacy Glossary — DPDP terminology guide */}
      <AnimatePresence>
        {showGlossary && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowGlossary(false)} aria-hidden />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div
                className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col max-h-[85vh]"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                style={{ background: "rgba(15, 10, 24, 0.98)", border: "1px solid rgba(75, 0, 130, 0.5)", boxShadow: "0 0 0 1px rgba(192,192,192,0.08), 0 25px 50px -12px rgba(0,0,0,0.5)" }}
              >
                <div className="px-6 pt-6 pb-3 shrink-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: "rgba(212, 175, 55, 0.4)", background: "rgba(212, 175, 55, 0.12)" }}>
                      <svg className="w-5 h-5" style={{ color: "#d4af37" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                    </span>
                    <div>
                      <h3 className="text-lg font-bold" style={{ color: "#d4af37" }}>SAAKSHI Privacy Glossary</h3>
                      <p className="text-xs font-medium opacity-90" style={{ color: "rgba(192,192,192,0.85)" }}>Your rights under the DPDP Act 2023 — plain English.</p>
                    </div>
                  </div>
                </div>
                <div className="px-6 pb-4 overflow-y-auto flex-1 min-h-0 scrollbar-thin space-y-5" style={{ maxHeight: "50vh" }}>
                  <section>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#d4af37" }}>The Consent Ledger (4 Pillars)</p>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold mb-0.5 text-white">Pending</p>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(192,192,192,0.85)" }}>A waiting room for inbound company requests or your drafted Re-grants. Nothing flows until you sign the Secure Handshake.</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-0.5 text-white">Active</p>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(192,192,192,0.85)" }}>Companies currently authorized to access your data.</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-0.5 text-white">Revoked (Section 6)</p>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(192,192,192,0.85)" }}>You have flipped the digital switch to turn off the data tap. The company can no longer collect new data via SAAKSHI&apos;s API firewall.</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-0.5 text-white">Denied</p>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(192,192,192,0.85)" }}>You explicitly blocked a request. The company is legally barred from asking again for 6 months.</p>
                      </div>
                    </div>
                  </section>
                  <section className="pt-2 border-t" style={{ borderColor: "rgba(75, 0, 130, 0.35)" }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "rgba(167, 139, 250, 0.95)" }}>Legal Actions</p>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold mb-0.5 text-white">Revoke Access</p>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(192,192,192,0.85)" }}>Stops future tracking instantly. (System action, no email sent.)</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-0.5 text-white">Request Erasure (Section 12)</p>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(192,192,192,0.85)" }}>A legally binding demand sent to a company&apos;s Data Protection Officer forcing them to delete your historical data and backups within 72 hours. (Legal action, email sent.)</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-0.5 text-white">Execute Breach Takedown</p>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(192,192,192,0.85)" }}>An automated Section 12 notice sent directly from your Reports tab to entities caught holding your data in unauthorized leaks.</p>
                      </div>
                    </div>
                  </section>
                  <section className="pt-2 border-t" style={{ borderColor: "rgba(75, 0, 130, 0.35)" }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#d4af37" }}>Data Scope Badges</p>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold mb-0.5 text-white">Vault Data (solid badges)</p>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(192,192,192,0.85)" }}>Your core identity keys (Email, Mobile, Govt IDs) verified and securely stored inside SAAKSHI&apos;s encrypted vault.</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-0.5 text-white">App Permissions (dashed badges)</p>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(192,192,192,0.85)" }}>External data points (like Location or Heart Rate) that SAAKSHI legally governs, but the actual data lives on the company&apos;s servers.</p>
                      </div>
                    </div>
                  </section>
                  <section className="pt-2 border-t" style={{ borderColor: "rgba(75, 0, 130, 0.35)" }}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "rgba(167, 139, 250, 0.95)" }}>The SAAKSHI Economy</p>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold mb-0.5 text-white">Identity Audit</p>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(192,192,192,0.85)" }}>A targeted scan on your identifiers to generate a threat report and calculate your Multi-Factor Privacy Score.</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-0.5 text-white">Standard Credits</p>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(192,192,192,0.85)" }}>Pay-as-you-go credits used to add and audit alternate communication channels (like business emails).</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-0.5 text-white">Premium Tiers</p>
                        <p className="text-xs leading-relaxed" style={{ color: "rgba(192,192,192,0.85)" }}>Subscription plans that unlock SAAKSHI&apos;s ultimate protection for official Government IDs (Aadhaar, PAN, Passport).</p>
                      </div>
                    </div>
                  </section>
                </div>
                <div className="px-6 pb-6 pt-2 shrink-0">
                  <button type="button" onClick={() => setShowGlossary(false)} className="w-full py-3 rounded-xl font-semibold text-sm transition hover:opacity-95" style={{ background: ROYAL_PURPLE, color: "#fff" }}>Got it</button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Breach Takedown Notice modal — from Reports tab */}
      <AnimatePresence>
        {showTakedownModal && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTakedownModal(false)} aria-hidden />
            <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div
                className="w-full max-w-sm rounded-2xl overflow-hidden"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                style={{ background: "rgba(15, 10, 24, 0.98)", border: "1px solid rgba(185, 28, 28, 0.5)", boxShadow: "0 0 0 1px rgba(185,28,28,0.2), 0 25px 50px -12px rgba(0,0,0,0.5)" }}
              >
                <div className="px-6 pt-6 pb-4">
                  <h3 className="text-lg font-semibold mb-3 text-red-200">Issue Legal Takedown Notice</h3>
                  <p className="text-sm leading-relaxed" style={{ color: SILVER }}>
                    SAAKSHI has detected your data in unauthorized databases. Sending this notice will legally compel the breached entities to purge your records under Section 12 of the DPDP Act.
                  </p>
                </div>
                <div className="px-6 pb-6 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTakedownModal(false);
                      setTakedownToast("Sending...");
                      setEmailScore((prev) => Math.min(100, prev + 10));
                      setTimeout(() => {
                        setTakedownToast("Legal Takedown Notices dispatched to breached entities.");
                      }, 2000);
                    }}
                    className="w-full py-3 rounded-xl font-semibold text-sm transition hover:opacity-95 text-white bg-red-600 hover:bg-red-500 border border-red-500/50"
                  >
                    Send Takedown Notice
                  </button>
                  <button type="button" onClick={() => setShowTakedownModal(false)} className="w-full py-2.5 rounded-xl font-medium text-sm border transition hover:bg-white/5" style={{ borderColor: "rgba(192,192,192,0.3)", color: SILVER }}>Cancel</button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Security Breach Toast — duplicate identity */}
      <AnimatePresence>
        {securityBreachToast && (
          <motion.div
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[60] px-4 py-3 rounded-xl border flex items-center gap-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{ background: "rgba(30, 10, 10, 0.98)", borderColor: "rgba(239, 68, 68, 0.5)", boxShadow: "0 0 0 1px rgba(239,68,68,0.2)" }}
          >
            <svg className="w-5 h-5 text-red-400 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92z" clipRule="evenodd" /></svg>
            <p className="text-sm font-medium text-red-200">Security Breach: This Identity is already linked to another SAAKSHI account.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
