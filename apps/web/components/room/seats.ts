import type { Seat } from "@tribunal/bot/room/layout";
import { SEATS } from "@tribunal/bot/room/layout";

const allSeats: Seat[] = [SEATS.judge, SEATS.accused, SEATS.prosecutor, SEATS.defense, SEATS.witness, ...SEATS.jury, ...SEATS.benches];

/** Seat by its ID, as sent by the server */
export const seatById = new Map(allSeats.map((seat) => [seat.id, seat]));

export const isBenchSeat = (seatId: string | null) => seatId?.startsWith("bench-") === true;
