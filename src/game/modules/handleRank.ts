import { TAllinPlayer } from '../Room';

const Hand = require('pokersolver').Hand;

export const checkPlayerRank = (
  data: Array<{ sessionId: string; combinedCards: Array<string> }>,
) => {
  let wholeHand: Array<any> = [];

  for (let i = 0; i < data.length; i++) {
    const hands = Hand.solve(data[i].combinedCards);
    hands.sessionId = data[i].sessionId;
    wholeHand.push(hands);
  }
  return wholeHand;
};

export const calculateAllinPlayer = async (arrPlayers: TAllinPlayer[]) => {
  let total = 0;

  const x = arrPlayers.sort((pre, next) => pre.t - next.t);
  const y = x.find(player => player.w);

  console.log(x, 'sỏt trc');
  console.log(y, 'find sau');

  const winner = <TAllinPlayer>(
    arrPlayers.sort((pre, next) => pre.t - next.t).find(player => player.w)
  );

  console.log(winner, 'dfjhqeofj');

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
  return arrPlayers;
};
