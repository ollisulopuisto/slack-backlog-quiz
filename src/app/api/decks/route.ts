import { hostOnlyError, isHostRequest } from "@/lib/auth";
import {
  createDeck,
  deleteDeck,
  duplicateDeck,
  loadDeck,
  renameDeck,
} from "@/lib/deckStore";
import { getRoomState, listAvailableDecks, switchDeck } from "@/lib/store";
import { NextResponse } from "next/server";

/**
 * Deck management. Host only: the list carries question counts, and switching
 * decks changes what is on the projector.
 */

function state() {
  return NextResponse.json({
    decks: listAvailableDecks(),
    activeDeckId: getRoomState().activeDeckId ?? null,
  });
}

export async function GET(req: Request) {
  if (!isHostRequest(req)) {
    return NextResponse.json(hostOnlyError(), { status: 401 });
  }
  return state();
}

export async function POST(req: Request) {
  if (!isHostRequest(req)) {
    return NextResponse.json(hostOnlyError(), { status: 401 });
  }

  try {
    const { action, deckId, name } = await req.json();

    if (action === "activate") {
      if (!switchDeck(String(deckId))) {
        return NextResponse.json({ error: "Pakkaa ei löytynyt" }, { status: 404 });
      }
    } else if (action === "create") {
      createDeck(String(name ?? "Uusi pakka"));
    } else if (action === "duplicate") {
      if (!duplicateDeck(String(deckId), name)) {
        return NextResponse.json({ error: "Pakkaa ei löytynyt" }, { status: 404 });
      }
    } else if (action === "rename") {
      if (!renameDeck(String(deckId), String(name ?? ""))) {
        return NextResponse.json({ error: "Pakkaa ei löytynyt" }, { status: 404 });
      }
    } else if (action === "delete") {
      if (getRoomState().activeDeckId === deckId) {
        return NextResponse.json(
          { error: "Aktiivista pakkaa ei voi poistaa. Vaihda ensin toiseen." },
          { status: 409 }
        );
      }
      if (!deleteDeck(String(deckId))) {
        return NextResponse.json(
          { error: "Poisto ei onnistunut. Viimeistä pakkaa ei voi poistaa." },
          { status: 409 }
        );
      }
    } else {
      return NextResponse.json({ error: "Tuntematon toiminto" }, { status: 400 });
    }

    return state();
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Pakkatoiminto epäonnistui" }, { status: 500 });
  }
}
