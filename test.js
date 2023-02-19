const calculateAllinPlayer = arrPlayers => {
  let total = 0;
  const winner = arrPlayers.sort((pre, next) => pre.t - next.t).find(player => player.w);
  const chipsWinner = winner.v;
  const idWinner = winner.t + 1;

  for (let i = 0; i < arrPlayers.length; i++) {
    if (arrPlayers[i].v - chipsWinner <= 0) {
      total += arrPlayers[i].v;
      arrPlayers[i].v = 0;
    } else {
      total += chipsWinner;
      arrPlayers[i].v -= chipsWinner;
    }
  }
  arrPlayers[idWinner - 1].v = total;
  return [...arrPlayers];
};

const arr = [
  { t: 0, v: 44100, w: false },
  { t: 1, v: 10000, w: true },
  { t: 2, v: 44100, w: false },
];
// console.log(calculateAllinPlayer(arr));

const getNonDupItem = arr => {
  return arr.filter(num => arr.indexOf(num) === arr.lastIndexOf(num));
};
