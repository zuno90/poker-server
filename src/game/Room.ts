import { Client, Room } from "colyseus";
import { RoomState } from "./schema/room.schema";
import { Player } from "./schema/player.schema";
import {
  ROOM_CHAT,
  ROOM_DISPOSE,
  START_GAME,
  FINISH_GAME,
  FOLD,
  CALL,
  CHECK,
  RAISE,
  ALLIN,
  RESET_GAME,
} from "./constants/room.constant";
import { deal } from "./modules/handleCard";
import { pickWinner } from "./modules/handleRank";
import { updateChip } from "../services/game.service";

const Hand = require("pokersolver").Hand;

export default class GameRoom extends Room<RoomState> {
  readonly maxClients = 5;
  private initBetChip: number = 100;

  onAuth(_: Client, player: Player) {
    player.connected = true;
    player.isWinner = false;
    return player;
  }

  onCreate(options: any) {
    try {
      // CREATE AN INITIAL ROOM STATE
      this.setState(new RoomState());

      // CHANGE ROOM STATE WHEN ALL USERS GET READY
      this.handleRoomState();

      // HANDLE ALL ACTION FROM PLAYER
      this.onMessage("*", (client: Client, type, data: any) => {
        // handle room_chat
        if (type === ROOM_CHAT) return this.handleChat(client, data);
        // handle game action
        if (type === CALL || type === CHECK || type === RAISE || type === ALLIN)
          return this.handleBet(client, data);
        // handle fold option
        if (type === FOLD) return this.handleFOLD(client);
      });
    } catch (e) {
      console.error(e);
    }
  }

  onJoin(client: Client, options: any, player: Player) {
    // SET INITIAL PLAYER STATE
    this.state.players.set(client.sessionId, new Player(player)); // set player moi lan join
  }

  async onLeave(client: Client, consented: boolean) {
    // update chips before leaving room
    if (!this.state.players.has(client.sessionId)) return false;
    const leavingPlayer = <Player>this.state.players.get(client.sessionId);
    await updateChip(leavingPlayer.id, leavingPlayer.chips);
    // flag client as inactive for other users
    console.log(client.sessionId + " leave room...");

    leavingPlayer.connected = false;
    try {
      if (consented) throw new Error("consented leave");

      // allow disconnected client to reconnect into this room until 20 seconds
      await this.allowReconnection(client, 20);

      // client returned! let's re-activate it.
      leavingPlayer.connected = true;
    } catch (error) {
      // 20 seconds expired. let's remove the client.
      this.state.players.delete(client.sessionId);
    }
  }

  async onDispose() {
    console.log("room", this.roomId, "disposing...");
    this.broadcast(ROOM_DISPOSE, "room bi dispose");
  }

  private handleRoomState() {
    // START GAME
    this.onMessage(START_GAME, (_, data) => {
      // if (this.clients.length < 1) return false;
      const { onHandCards, banker5Cards } = deal(this.state.players.size);
      this.state.onReady = true; // change room state -> TRUE
      this.state.highestBet = 0; // highestBet = 0 at initial game
      this.state.banker5Cards = banker5Cards; // change cards of banker -> [...]

      let arrWinner: Array<any> = [];
      let arrCardRanks: Array<any> = [];

      this.state.players.forEach((playerMap: Player, sessionId: string) => {
        // init state of player
        playerMap.isWinner = false;
        playerMap.betChips = this.initBetChip;
        playerMap.chips -= this.initBetChip;

        // pick winner
        playerMap.cards = onHandCards[playerMap.turn - 1];
        arrWinner.push({
          sessionId,
          sevenCards: [...playerMap.cards.values()].concat([
            ...banker5Cards.values(),
          ]),
        });

        const playerCardRanks = pickWinner(arrWinner);
        // detail card rank each player
        playerCardRanks.forEach((v, _) => {
          if (v.sessionId === sessionId) playerMap.cardRank = v.name; // v.descr
        });
        arrCardRanks = playerCardRanks;
      });

      // pick winner and set isWinner -> true
      const winner = Hand.winners(arrCardRanks)[0];
      // get winner session
      const winPlayer = <Player>this.state.players.get(winner.sessionId);
      if (!winPlayer) return false;
      winPlayer.isWinner = true;
    });

    // FINISH GAME
    this.onMessage(FINISH_GAME, (_, data) => {
      this.broadcast(FINISH_GAME, "finish lai game ne.....");
      if (this.clients.length < 1) return false;
      this.state.players.forEach(async (player: Player, _) => {
        await updateChip(player.id, player.chips);
      });
    });

    // RESET GAME
    this.onMessage(RESET_GAME, (_, data) => {
      if (this.clients.length < 1) return false;
      // CREATE AN INITIAL ROOM STATE AGAIN
      this.setState(new RoomState());

      this.broadcast(RESET_GAME, "reset game, log thử state xem ");
    });
  }

  // handle chat
  private handleChat(client: Client, data: any) {
    this.broadcast(ROOM_CHAT, data);
  }

  // handle action - FOLD
  private handleFOLD(client: Client) {
    if (!this.state.onReady) return false;
    const player = <Player>this.state.players.get(client.sessionId);
    if (!player || player.isFold) return false;
    player.isFold = true;

    const totalPlayers = new Map<string, Player>(
      JSON.parse(JSON.stringify(Array.from(this.state.players)))
    );

    if (player.isWinner) {
      totalPlayers.delete(client.sessionId);

      console.log("số player còn lại:::::", totalPlayers.size);
      // check if only 1 player
      if (totalPlayers.size === 1) {
        for (let winner of totalPlayers.values()) {
          console.log("winner cuối cùng:::::", winner);
          winner.isWinner = true;
          return this.broadcast(
            "CONGRATULATION",
            `ĐCM chúc mừng anh zai có id:::${winner.id} đã dành chiến thắng!`
          );
        }
      }

      // pick new winner in remaining players
      let arrWinner: Array<any> = [];
      let arrCardRanks: Array<any> = [];
      totalPlayers.forEach((remainingPlayer: Player, sessionId: string) => {
        arrWinner.push({
          sessionId,
          sevenCards: [...remainingPlayer.cards.values()].concat([
            ...this.state.banker5Cards,
          ]),
        });
        arrCardRanks = pickWinner(arrWinner);
      });

      // pick winner and set isWinner -> true
      const winner = Hand.winners(arrCardRanks)[0];
      // get winner session
      const winPlayer = <Player>this.state.players.get(winner.sessionId);
      if (!winPlayer) return false;
      winPlayer.isWinner = true;
      player.isWinner = false;
    }
  }

  // handle action without FOLD
  private handleBet(client: Client, data: any) {
    const { chips } = data;
    if (!chips) return false;
    if (!this.state.onReady) return false;
    const player = <Player>this.state.players.get(client.sessionId);
    if (!player) return false;
    player.betChips = chips;
    player.chips -= chips;
    this.state.highestBet <= chips
      ? (this.state.highestBet = chips)
      : this.state.highestBet;
  }
}
