import { hostOnlyError, isHostRequest } from "@/lib/auth";
import { getRoomState, replaceSlides } from "@/lib/store";
import { SlideData } from "@/lib/types";
import { sanitizeSlidesForPlayer } from "@/lib/visibility";
import fs from "fs";
import { NextResponse } from "next/server";
import path from "path";

const QUIZ_FILE_PATH = path.join(process.cwd(), "src", "lib", "quiz_data.json");
const ROOT_QUIZ_FILE_PATH = path.join(process.cwd(), "quiz_data.json");

export async function GET(req: Request) {
  const room = getRoomState();
  // The editor needs the answers; anyone else gets the same redacted deck
  // /api/room hands out.
  return NextResponse.json(
    isHostRequest(req) ? room.slides : sanitizeSlidesForPlayer(room)
  );
}

export async function POST(req: Request) {
  if (!isHostRequest(req)) {
    return NextResponse.json(hostOnlyError(), { status: 401 });
  }

  try {
    const newSlides: SlideData[] = await req.json();

    if (!Array.isArray(newSlides)) {
      return NextResponse.json(
        { error: "Virheellinen dataformaatti!" },
        { status: 400 }
      );
    }

    // Slide ids key player answers and per-slide scores. Duplicates would make
    // two questions share one answer, so reject the save instead of corrupting
    // a game already in progress.
    const ids = newSlides.map((s) => s.id);
    const duplicateIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (duplicateIds.length > 0) {
      return NextResponse.json(
        {
          error: `Diojen tunnisteet eivät ole uniikkeja: ${duplicateIds.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Save to files
    const jsonContent = JSON.stringify(newSlides, null, 2);
    fs.writeFileSync(QUIZ_FILE_PATH, jsonContent, "utf-8");
    fs.writeFileSync(ROOT_QUIZ_FILE_PATH, jsonContent, "utf-8");

    // Update live room state (clamps currentSlideIndex if the deck shrank)
    replaceSlides(newSlides);

    return NextResponse.json({ success: true, count: newSlides.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Tallennus epäonnistui!" },
      { status: 500 }
    );
  }
}
