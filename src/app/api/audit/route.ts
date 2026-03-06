import { NextRequest, NextResponse } from "next/server";

const LEAKCHECK_PUBLIC_API = "https://leakcheck.net/api/public";

type LeakCheckSource = { name?: string; date?: string };

type LeakCheckResponse = {
  success?: boolean;
  found?: number;
  sources?: LeakCheckSource[];
};

function scoreFromLeakCount(found: number): number {
  if (found === 0) return 98;
  if (found <= 3) return 65;
  return 25;
}

function sourcesToBreachTags(sources: LeakCheckSource[]): string[] {
  if (!Array.isArray(sources) || sources.length === 0) return [];
  return sources
    .map((s) => {
      const name = s?.name?.trim() || "Unknown breach";
      const date = s?.date?.trim();
      return date ? `${name} (${date})` : name;
    })
    .filter(Boolean)
    .slice(0, 20);
}

function simulateMobileThreats(mobile: string, deepScan: boolean): string[] {
  if (!mobile || mobile.length < 10) return [];
  if (!deepScan) return [];
  const seed = mobile.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  if (seed % 3 === 0) return ["Financial Spam List"];
  if (seed % 5 === 0) return ["Telemarketer Database", "Financial Spam List"];
  return [];
}

function simulateAadhaarThreats(aadhaarPan: string): string[] {
  if (!aadhaarPan || aadhaarPan.length < 4) return [];
  return [];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const mobile = typeof body?.mobile === "string" ? body.mobile.trim().replace(/\D/g, "") : "";
    const aadhaarPan = typeof body?.aadhaarPan === "string" ? body.aadhaarPan.trim() : "";
    const deepScan = Boolean(body?.deepIdentityScan);
    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const checkUrl = `${LEAKCHECK_PUBLIC_API}?check=${encodeURIComponent(email)}`;
    const res = await fetch(checkUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Leak check service unavailable. Please try again later." },
        { status: 502 }
      );
    }

    const data = (await res.json()) as LeakCheckResponse;
    const found = typeof data.found === "number" ? data.found : 0;
    const sources = data.sources ?? [];
    const emailBreachTags = sourcesToBreachTags(sources);
    const mobileThreats = simulateMobileThreats(mobile, deepScan);
    const aadhaarThreats = simulateAadhaarThreats(aadhaarPan);

    const emailPenalty = found === 0 ? 0 : found <= 3 ? 35 : 60;
    const mobilePenalty = mobileThreats.length * 25;
    const aadhaarPenalty = aadhaarThreats.length * 30;
    const score = Math.max(0, Math.min(100, 100 - emailPenalty - mobilePenalty - aadhaarPenalty));

    return NextResponse.json({
      score,
      breachTags: emailBreachTags,
      found,
      mobileThreats,
      aadhaarThreats,
    });
  } catch (e) {
    console.error("Audit API error:", e);
    return NextResponse.json(
      { error: "Audit failed. Please try again later." },
      { status: 500 }
    );
  }
}
