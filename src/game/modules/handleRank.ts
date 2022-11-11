const Hand = require("pokersolver").Hand;

export const pickWinner = (
  data: Array<{ sessionId: string; sevenCards: Array<string> }>
) => {
  // change cards to global type
  // const standardCards = toGlobal(data);
  // console.log("card cua 2 ban", standardCards);
  // compare
  let wholeHand: Array<any> = [];
  for (let i = 0; i < data.length; i++) {
    const hands = Hand.solve(data[i].sevenCards);
    hands.sessionId = data[i].sessionId;
    wholeHand.push(hands);
  }
  return wholeHand;
};

// const toGlobal = (
//   data: Array<{ sessionId: string; sevenCards: Array<string> }>
// ) => {
//   let arr = [];
//   for (let i = 0; i < data.length; i++) {
//     if (data[i].sevenCards.indexOf("10♠"))
//       data[i].sevenCards.splice(data[i].sevenCards.indexOf("10♠"), 1, "T♠");
//     if (data[i].sevenCards.indexOf("10♣"))
//       data[i].sevenCards.splice(data[i].sevenCards.indexOf("10♣"), 1, "T♣");
//     if (data[i].sevenCards.indexOf("10♦"))
//       data[i].sevenCards.splice(data[i].sevenCards.indexOf("10♦"), 1, "T♦");
//     if (data[i].sevenCards.indexOf("10♥"))
//       data[i].sevenCards.splice(data[i].sevenCards.indexOf("10♥"), 1, "T♥");

//     arr.push({
//       sessionId: data[i].sessionId,
//       sevenCards: data[i].sevenCards,
//     });
//   }
//   return arr;
// };
