import type { Seat } from "@tribunal/bot/room/layout";
import { SEATS } from "@tribunal/bot/room/layout";

const allSeats: Seat[] = [SEATS.judge, ...SEATS.accused, SEATS.prosecutor, SEATS.defense, SEATS.witness, ...SEATS.jury, ...SEATS.benches];

/** Seat by its ID, as sent by the server */
export const seatById = new Map(allSeats.map((seat) => [seat.id, seat]));

export const isBenchSeat = (seatId: string | null) => seatId?.startsWith("bench-") === true;

/** The clerk sits behind his desk, next to the judge, facing the room */
export const CLERK_SEAT: Seat = {
  id: "clerk",
  position: {
    x: -6.5,
    z: 0.6,
  },
  rotation: 0,
};

/** Height of the floor under a seat: the witness sits on the raised floor of the witness stand, the clerk's chair is raised behind his high desk (hidden by it) */
export const seatElevation = (seatId: string | null) => {
  if (seatId === SEATS.witness.id) return 0.2;
  if (seatId === CLERK_SEAT.id) return 0.25;

  return 0;
};
