import { Deck } from "../schema/deck.schema";

// const cards = new Array(52);
// for (let i = 0; i < cards.length; i++) {
//   cards[i] = i % 52;
// }

export const createADeck = (ranks: Array<string>, suits: Array<string>) => {
  let fullDeck: Array<string> = [];
  for (let suitCounter = 0; suitCounter < 4; suitCounter++) {
    for (let rankCounter = 0; rankCounter < 13; rankCounter++) {
      fullDeck.push(ranks[rankCounter] + suits[suitCounter]);
    }
  }
  return fullDeck;
};

export const shuffle = (numberOfShuffle: number) => {
  const d = new Deck();
  const deck = d.createDeck();
  for (let i = 0; i < numberOfShuffle; i++) {
    let location1 = Math.floor(Math.random() * deck.length);
    let location2 = Math.floor(Math.random() * deck.length);
    let tmp = deck[location1];
    deck[location1] = deck[location2];
    deck[location2] = tmp;
  }
  return deck;
};

export const deal = (numberOfPlayer: number) => {
  const deck = shuffle(100);
  console.log("bộ bài full", deck);
  const remainingDeck: Array<string> = deck.splice(numberOfPlayer * 2);

  console.log("bộ bài sau khi cắt", deck);
  console.log("bộ bài còn lại", remainingDeck);

  for (let i = 0; i < numberOfPlayer; i++) {
    console.log(`thằng thứ ${i + 1}`, chiabai(deck, i, numberOfPlayer));
  }
  return {
    onHandCard: deck,
    remainingDeck,
  };
};

const chiabai = (
  deck: Array<string>,
  index: number,
  numberOfPlayer: number
) => {
  return deck
    .slice(index, index + 1)
    .concat(deck.slice(numberOfPlayer, numberOfPlayer + 1));
};
