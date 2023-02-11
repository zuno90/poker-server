import { ERole } from '../schemas/player.schema';

export const handleFirstSecond = (playerSize: number, playerData: any) => {
  // is HOST - first player
  if (!playerSize) {
    const hostPlayer = {
      id: playerData.id,
      username: playerData.username ?? playerData.email,
      chips: playerData.chips,
      isHost: true,
      seat: 1,
      turn: 0,
      role: ERole.Player,
    };
    return hostPlayer;
  }
  // is not HOST - player 2
  if (playerSize === 1) {
    const secondPlayer = {
      id: playerData.id,
      username: playerData.username ?? playerData.email,
      chips: playerData.chips,
      isHost: false,
      seat: 2,
      turn: 1,
      role: ERole.Player,
    };
    return secondPlayer;
  }
};

export const arrangeSeat = (seatArr: number[]) => {
  // sort array number 1-2-3-4-5
  const seatArrSort = [...seatArr].sort((a: number, b: number) => a - b);
  let s: number | any;
  for (let i = 0; i < seatArrSort.length; i++) {
    const y = seatArrSort[i + 1] - seatArrSort[i];
    if (y === 1) s = seatArrSort[i + 1];
    if (y > 1) {
      s = seatArrSort[i];
      break;
    }
  }
  return s + 1;
};

export const arrangeTurn = (seat: number, seatArr: number[]) => {
  const seatArrSort = [...seatArr].sort((a: number, b: number) => a - b);
  for (let i = 0; i < seatArrSort.length; i++) {
    if (seat === seatArrSort[i]) return i;
  }
};
