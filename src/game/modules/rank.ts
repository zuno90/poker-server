const CARDORDER = "2345678910JQKA";
const scores = {
  sf: 9,
  foak: 8,
  fh: 7,
  f: 6,
  s: 5,
  toak: 4,
  tp: 3,
  p: 2,
  h: 1,
};
export const bestHands = (hands: any) => {
  if (hands.length < 2) return hands;
  let allHands = [];
  let winners: any = [];
  hands.forEach((h: any, i: any) => {
    let hand = h.split(" ").reduce((t: any, c: any) => {
      let suit = c.slice(-1);
      let value = c.slice(0, c.length - 1);
      t.push({ value, suit });
      return t;
    }, []);
    hand.original = h;
    let isFlush = hand.every((c: any, i: any, a: any) => c.suit === a[0].suit);

    hand.highs = hand
      .map((c: any) => c.value)
      .sort((a: any, b: any) => CARDORDER.indexOf(b) - CARDORDER.indexOf(a));
    hand.isStraight =
      CARDORDER.indexOf(hand.highs.slice().reverse().join("")) > -1;
    if (!hand.isStraight && hand.highs.indexOf("A") > -1) {
      hand.isStraight =
        CARDORDER.indexOf(hand.highs.slice(1).reverse().join("")) === 0;
      if (hand.isStraight)
        hand.highs = [...hand.highs.slice(1), ...hand.highs.shift()];
    }
    let combos = hand.highs.join("").match(/(.)\1+/g) || [];
    hand.quad = combos.reduce(
      (t: any, c: any) => (c.length === 4 ? (t = c[0]) : t),
      0
    ); // Store card value of quad
    hand.trio = combos.reduce(
      (t: any, c: any) => (c.length === 3 ? (t = c[0]) : t),
      0
    ); // Store card value of trio
    hand.pairs = combos
      .reduce((t: any, c: any) => {
        if (c.length === 2) t.push(c[0]);
        return t;
      }, [])
      .sort((a: any, b: any) => b - a); // Store card values of pairs in descending order
    if (hand.quad) {
      hand.highs = [
        ...new Array(4).fill(hand.quad),
        ...hand.highs
          .filter((a: any) => a != hand.quad)
          .sort((a: any, b: any) => b - a),
      ];
    } else if (hand.trio) {
      hand.highs = [
        ...new Array(3).fill(hand.trio),
        ...hand.highs
          .filter((a: any) => a != hand.trio)
          .sort((a: any, b: any) => b - a),
      ];
    }

    hand.score = scores.h;
    if (hand.pairs.length === 1) hand.score = scores.p;
    if (hand.pairs.length > 1) hand.score = scores.tp;
    if (hand.trio) hand.score = scores.toak;
    if (hand.isStraight) hand.score = scores.s;
    if (isFlush) hand.score = scores.f;
    if (hand.trio && hand.pairs.length === 1) hand.score = scores.fh;
    if (hand.quad) hand.score = scores.foak;
    if (isFlush && hand.isStraight) hand.score = scores.sf;
    allHands.push(hand);
    if (!winners.length || winners[0].score < hand.score) {
      winners.splice(0, 1, hand);
    } else if (winners[0].score === hand.score) {
      for (let i = 0; i < 5; i++) {
        let cBest = CARDORDER.indexOf(winners[0].highs[i]);
        let cHand = CARDORDER.indexOf(hand.highs[i]);
        if (cBest > cHand) {
          break;
        } else if (cHand > cBest) {
          winners = [hand];
          break;
        }
        if (i == 4) winners.push(hand);
      }
    }
  });
  return winners.map((a: any) => a.original);
};
