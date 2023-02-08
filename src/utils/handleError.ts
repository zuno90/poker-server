export const handleError = (message?: string) => {
  return {
    success: false,
    msg: message,
  };
};

// const remainingPlayers = new Map<string, Player>(
//   Array.from(this.state.players).filter(
//     ([sessionId, player]) => !player.isFold && [sessionId, player],
//   ),
// );
//
// if (player.isWinner) {
//   remainingPlayers.delete(client.sessionId);
//   // check if only 1 player
//   if (remainingPlayers.size === 1) {
//     for (let winner of remainingPlayers.values()) {
//       winner.isWinner = true;
//       return this.broadcast(
//         'CONGRATULATION',
//         `ĐCM chúc mừng anh zai có id:::${winner.id} đã dành chiến thắng!`,
//       );
//     }
//   }
//
//   // pick new winner in remaining players
//   let arrWinner: Array<any> = [];
//   let arrCardRanks: Array<any> = [];
//   remainingPlayers.forEach((remainingPlayer: Player, sessionId: string) => {
//     arrWinner.push({
//       sessionId,
//       sevenCards: [...remainingPlayer.cards.values()].concat([...this.state.banker5Cards]),
//     });
//     arrCardRanks = checkPlayerRank(arrWinner);
//   });
//
//   // pick winner and set isWinner -> true
//   const winner = Hand.winners(arrCardRanks)[0];
//   // get winner session
//   const winPlayer = <Player>this.state.players.get(winner.sessionId);
//   if (!winPlayer) throw new Error('Have no winner! Please re-check function winner picking!');
//   winPlayer.isWinner = true;
//   player.isWinner = false;
// }
