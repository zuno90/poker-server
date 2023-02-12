export const arrangeSeat = (seatArr: number[]) => {
  // if only host (case is not BOT here)
  if (seatArr.length === 1) return 2;

  // if had BOT here
  // const seatArrSort = [...seatArr].sort((a: number, b: number) => a - b);
  const seatArrSort = sortedArr(seatArr);
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
  // const seatArrSort = [...seatArr].sort((a: number, b: number) => a - b);
  const seatArrSort = sortedArr(seatArr);
  for (let i = 0; i < seatArrSort.length; i++) {
    if (seat === seatArrSort[i]) return i;
  }
};

export const sortedArr = (arr: number[]) => [...arr].sort((a: number, b: number) => a - b);
