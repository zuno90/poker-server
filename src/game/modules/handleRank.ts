import _ from 'lodash';
import { TAllinPlayer } from '../NoobRoom';

const Hand = require('pokersolver').Hand;

export const checkPlayerRank = (
  data: Array<{ sessionId: string; combinedCards: Array<string> }>,
) => {
  const wholeHand: Array<any> = [];

  for (let i = 0; i < data.length; i++) {
    const hands = Hand.solve(data[i].combinedCards);
    hands.sessionId = data[i].sessionId;
    wholeHand.push(hands);
  }
  return wholeHand;
};

export const checkDraw = (allHands: any[], winHand: any) => {
  const winnArr = [];
  for (let c of winHand.cards) winnArr.push(c.value);

  let a = [];
  let allHandCards = [];
  for (let i = 0; i < allHands.length; i++) {
    a.push([]);
    allHandCards.push(allHands[i].cards);
  }
  let numberOfWinner = 0;
  for (let j = 0; j < allHandCards.length; j++) {
    a[j] = allHandCards[j].map((card: any) => card.value);
    if (a[j].toString() === winHand.cards.map((card: any) => card.value).toString()) {
      a = a[j];
      numberOfWinner++;
    }
  }

  const drawSessions: any[] = [];
  if (numberOfWinner > 1) {
    console.log(allHands, 777);
    for (let i = 0; i < allHands.length; i++) {
      const a = [];
      for (let c of allHands[i].cards) a.push(c.value);
      if (a.toString() === winnArr.toString()) drawSessions.push(allHands[i].sessionId);
    }
  }
  return drawSessions;
};

export const pokerSolverHand = (data: any) => {
  const wholeHandCards: Array<any> = [];
  for (let i = 0; i < data.length; i++) {
    const hands = Hand.solve(data[i].combinedCards);
    hands.sessionId = data[i].sessionId;
    wholeHandCards.push(hands);
  }
  return wholeHandCards;
};

export const calculateAllinPlayer = (arrPlayers: TAllinPlayer[]) => {
  let total = 0;
  const winner = <TAllinPlayer>(
    arrPlayers.sort((pre, next) => pre.t - next.t).find(player => player.w)
  );
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

export const calculateDraw = (arr: TAllinPlayer[]) => {
  const drawArr = _.filter(arr, 'w');
  const loseArr = _.differenceWith(arr, drawArr, _.isEqual);

  const maxValue = _.maxBy(drawArr, 'v');
  const l = _.filter(loseArr, ({ v }) => v < maxValue!.v);
  let loseValue = 0;
  for (const ml of l) loseValue += ml.v;
  loseValue += maxValue!.v * (loseArr.length - l.length);

  const doneDraw = _.map(drawArr, item => ({
    ...item,
    v: item.v + loseValue / drawArr.length,
  }));
  const doneLost = _.map(loseArr, item => ({
    ...item,
    v: item.v >= maxValue!.v ? item.v - maxValue!.v : 0,
  }));
  console.log([...doneDraw, ...doneLost]);
  return [...doneDraw, ...doneLost];
};
