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
