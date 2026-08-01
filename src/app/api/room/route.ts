import { hostOnlyError, isHostRequest } from "@/lib/auth";
import {
  endReviewPhase,
  getRoomState,
  lockQuestion,
  nextSlide,
  prevSlide,
  reloadDeck,
  resetGame,
  revealAnswer,
  scoreOpenEndedPlayer,
  startReviewPhase,
  toggleOfflineMode,
  toggleQuestionLock,
  unlockQuestion,
} from "@/lib/store";
import { sanitizeRoomForPlayer } from "@/lib/visibility";
import { NextResponse } from "next/server";

function roomResponse(req: Request) {
  const room = getRoomState();
  return NextResponse.json(
    isHostRequest(req) ? room : sanitizeRoomForPlayer(room)
  );
}

export async function GET(req: Request) {
  return roomResponse(req);
}

export async function POST(req: Request) {
  // Every action below changes the live game — host only.
  if (!isHostRequest(req)) {
    return NextResponse.json(hostOnlyError(), { status: 401 });
  }

  const body = await req.json();
  const { action, slideId, playerId, points, enabled } = body;

  if (action === "next") {
    nextSlide();
  } else if (action === "prev") {
    prevSlide();
  } else if (action === "lock") {
    lockQuestion();
  } else if (action === "unlock") {
    unlockQuestion();
  } else if (action === "toggle_lock") {
    toggleQuestionLock();
  } else if (action === "start_review") {
    startReviewPhase();
  } else if (action === "end_review") {
    endReviewPhase();
  } else if (action === "reveal") {
    revealAnswer();
  } else if (action === "reload_deck") {
    reloadDeck();
  } else if (action === "toggle_offline") {
    toggleOfflineMode(enabled);
  } else if (
    (action === "score_open_ended" || action === "override_score") &&
    slideId !== undefined &&
    playerId &&
    points !== undefined
  ) {
    scoreOpenEndedPlayer(slideId, playerId, Number(points));
  } else if (action === "reset") {
    resetGame();
  }

  return roomResponse(req);
}
