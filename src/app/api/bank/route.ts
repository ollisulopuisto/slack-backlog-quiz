import { hostOnlyError, isHostRequest } from "@/lib/auth";
import fs from "fs";
import { NextResponse } from "next/server";
import path from "path";

const BANK_FILE_PATH = path.join(
  process.cwd(),
  "src",
  "lib",
  "question_bank.json"
);
const ROOT_BANK_FILE_PATH = path.join(process.cwd(), "question_bank.json");

export async function GET(req: Request) {
  // The bank is the unused-question pool, answers and all — host only.
  if (!isHostRequest(req)) {
    return NextResponse.json(hostOnlyError(), { status: 401 });
  }
  try {
    if (fs.existsSync(BANK_FILE_PATH)) {
      const data = fs.readFileSync(BANK_FILE_PATH, "utf-8");
      return NextResponse.json(JSON.parse(data));
    }
  } catch (e) {
    console.error(e);
  }
  return NextResponse.json([]);
}

export async function POST(req: Request) {
  if (!isHostRequest(req)) {
    return NextResponse.json(hostOnlyError(), { status: 401 });
  }
  try {
    const incoming = await req.json();
    if (!Array.isArray(incoming)) {
      return NextResponse.json({ error: "Odotettiin listaa" }, { status: 400 });
    }

    // Merge rather than replace. The editor sends back the whole bank as its
    // browser last saw it, so a tab opened before the generator ran would
    // otherwise delete every question added since -- which is exactly how 20
    // image questions disappeared. The only thing the editor really changes is
    // which questions are picked, so take that and keep the rest.
    let existing: { id?: string | number }[] = [];
    if (fs.existsSync(BANK_FILE_PATH)) {
      existing = JSON.parse(fs.readFileSync(BANK_FILE_PATH, "utf-8"));
    }

    const selection = new Map<string, boolean>(
      incoming
        .filter((q) => q && q.id !== undefined)
        .map((q) => [String(q.id), Boolean(q.selected)])
    );
    const knownIds = new Set(existing.map((q) => String(q.id)));

    const merged = [
      ...existing.map((q) => {
        const picked = selection.get(String(q.id));
        return picked === undefined ? q : { ...q, selected: picked };
      }),
      // A question the server has never seen is one the host wrote here.
      ...incoming.filter(
        (q) => q && q.id !== undefined && !knownIds.has(String(q.id))
      ),
    ];

    const jsonContent = JSON.stringify(merged, null, 2);
    fs.writeFileSync(BANK_FILE_PATH, jsonContent, "utf-8");
    fs.writeFileSync(ROOT_BANK_FILE_PATH, jsonContent, "utf-8");

    return NextResponse.json({ success: true, count: merged.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Pankin tallennus epäonnistui!" },
      { status: 500 }
    );
  }
}
