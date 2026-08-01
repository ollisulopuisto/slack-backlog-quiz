import { getRoomState, placeBet } from "@/lib/store";
import { sanitizeRoomForPlayer } from "@/lib/visibility";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { playerId, marketId, pick } = await req.json();
    if (!playerId || !marketId || !pick) {
      return NextResponse.json({ error: "Puuttuvat tiedot!" }, { status: 400 });
    }

    const accepted = placeBet(playerId, marketId, pick);
    if (!accepted) {
      return NextResponse.json(
        {
          error:
            "Vetoa ei voitu kirjata. Markkina on suljettu tai valinta ei kelpaa.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      room: sanitizeRoomForPlayer(getRoomState()),
    });
  } catch {
    return NextResponse.json(
      { error: "Virhe vedon tallennuksessa" },
      { status: 500 }
    );
  }
}
