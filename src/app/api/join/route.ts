import { getRoomState, joinPlayer, MAX_PLAYER_NAME_LENGTH } from "@/lib/store";
import { sanitizeRoomForPlayer } from "@/lib/visibility";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { name, token, force } = await req.json();
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Nimi on pakollinen!" }, { status: 400 });
    }
    if (name.trim().length > MAX_PLAYER_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Nimimerkki saa olla enintään ${MAX_PLAYER_NAME_LENGTH} merkkiä.` },
        { status: 400 }
      );
    }

    const result = joinPlayer(
      name,
      typeof token === "string" ? token : undefined,
      force === true
    );

    if (result.status === "name_taken") {
      // 409 rather than a silent merge: the caller has to confirm the takeover.
      return NextResponse.json(
        {
          error: "Nimimerkki on jo varattu toisella laitteella.",
          code: "name_taken",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      playerId: result.playerId,
      token: result.token,
      reconnected: result.status === "reconnected",
      room: sanitizeRoomForPlayer(getRoomState()),
    });
  } catch {
    return NextResponse.json({ error: "Virhe liittymisessä" }, { status: 500 });
  }
}
