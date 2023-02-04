import { Deck } from '../schemas/deck.schema';

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
  const deck = new Deck().createDeck();
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
  // console.log("bộ bài full sau khi sốc lọ 100 lần", deck);
  const remainingDeck: Array<string> = deck.splice(numberOfPlayer * 2);
  const banker5Cards: Array<string> = remainingDeck.slice(0, 5);

  let onHandCards: Array<Array<string>> = [];
  for (let i = 0; i < numberOfPlayer; i++) {
    // console.log(`thằng thứ ${i + 1}`, chiabai(deck, i, numberOfPlayer + i));
    onHandCards.push([...dealHelper(deck, i, numberOfPlayer + i)]);
  }
  return {
    onHandCards,
    banker5Cards,
  };
};

const dealHelper = (deck: Array<string>, index: number, numberOfPlayer: number) => {
  return deck.slice(index, index + 1).concat(deck.slice(numberOfPlayer, numberOfPlayer + 1));
};
