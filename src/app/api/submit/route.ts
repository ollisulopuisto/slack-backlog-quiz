import { getRoomState, submitAnswer } from "@/lib/store";
import { sanitizeRoomForPlayer } from "@/lib/visibility";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { playerId, slideId, answer } = await req.json();
    if (!playerId || slideId === undefined) {
      return NextResponse.json({ error: "Puuttuvat tiedot!" }, { status: 400 });
    }

    submitAnswer(playerId, slideId, answer);
    return NextResponse.json({
      success: true,
      room: sanitizeRoomForPlayer(getRoomState()),
    });
  } catch {
    return NextResponse.json(
      { error: "Virhe vastauksen tallennuksessa" },
      { status: 500 }
    );
  }
}
