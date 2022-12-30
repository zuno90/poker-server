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
  ALLIN_DONE,
  RESET_GAME,
} from "./constants/room.constant";
import { deal } from "./modules/handleCard";
import { pickWinner } from "./modules/handleRank";
import { updateChip } from "../services/game.service";

const Hand = require("pokersolver").Hand; // func handle winner

type TAllinState = {
  total: number;
  minAllin: number;
};

export default class GameRoom extends Room<RoomState> {
  readonly maxClients = 5;
  private initBetChip: number = 100;
  private allinArr: number[] = [];
  private allinState: TAllinState;

  onAuth(_: Client, player: Player) {
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
        // handle CHAT ROOM
        if (type === ROOM_CHAT) return this.handleChat(client, data);
        // handle game action CALL | RAISE | CHECK
        if (type === CALL || type === CHECK || type === RAISE)
          return this.handleBet(client, data);
        // handle ALL IN
        if (type === ALLIN) return this.handleALLIN(client, data);
        // handle ALL IN DONE
        if (type === ALLIN_DONE) return this.handleALLIN_DONE();
        // handle FOLD option
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
    // if (!this.state.players.has(client.sessionId))
    //   throw new Error("Have no any sessionId!");
    // const leavingPlayer = <Player>this.state.players.get(client.sessionId);
    // await updateChip(leavingPlayer.id, leavingPlayer.chips);
    // // flag client as inactive for other users
    // console.log(client.sessionId + " leave room...");

    // leavingPlayer.connected = false;
    // try {
    //   if (consented) throw new Error("consented leave");

    //   // allow disconnected client to reconnect into this room until 20 seconds
    //   await this.allowReconnection(client, 20);

    //   // client returned! let's re-activate it.
    //   leavingPlayer.connected = true;
    // } catch (error) {
    //   // 20 seconds expired. let's remove the client.
    //   this.state.players.delete(client.sessionId);
    // }
    console.log("client " + client.sessionId + " has just left");
  }

  async onDispose() {
    console.log("room", this.roomId, "disposing...");
    this.broadcast(ROOM_DISPOSE, "room bi dispose");
  }

  private handleRoomState() {
    // START GAME
    this.onMessage(START_GAME, (_, data) => {
      const { onHandCards, banker5Cards } = deal(this.state.players.size);
      this.state.onReady = true; // change room state -> TRUE
      this.state.totalBet = this.state.players.size * this.initBetChip;
      this.state.banker5Cards = banker5Cards; // change cards of banker -> [...]

      let arrWinner: Array<any> = [];
      let arrCardRanks: Array<any> = [];

      this.state.players.forEach((playerMap: Player, sessionId: string) => {
        // init state of player
        // playerMap.isWinner = false;
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
      if (!winPlayer) throw new Error("Have no any winner! Please check");
      winPlayer.isWinner = true;
    });

    // FINISH GAME
    this.onMessage(FINISH_GAME, (_, __) => {
      this.state.players.forEach(async (player: Player, _) => {
        if (player.isWinner)
          player.chips =
            player.chips +
            this.state.totalBet -
            this.allinState.minAllin * this.allinState.total;
        player.role === "Player" && (await updateChip(player.id, player.chips));
      });
      this.broadcast(
        FINISH_GAME,
        "Finish, updated owned chips of user into database!!!!!"
      );
    });

    // RESET GAME
    this.onMessage(RESET_GAME, (_, __) => {
      if (this.clients.length < 1)
        throw new Error("Have cheat! Player number is < 1");
      // CREATE AN INITIAL ROOM STATE AGAIN
      this.state.onReady = false;
      this.state.highestBet = 0;
      this.state.totalBet = 0;
      this.state.banker5Cards = [];

      // CREATE AN INITIAL PLAYER STATE AFTER A GAME
      this.state.players.forEach((playerMap: Player, sessionId: string) => {
        this.state.players.set(
          sessionId,
          new Player({
            id: playerMap.id,
            isHost: playerMap.isHost,
            chips: playerMap.chips,
            turn: playerMap.turn,
            role: playerMap.role,
            betChips: 0,
            cards: [],
          })
        );
      });

      this.broadcast(RESET_GAME, "reset game, log thử state xem");
    });
  }

  // handle chat
  private handleChat(client: Client, data: any) {
    this.broadcast(ROOM_CHAT, data);
  }

  // handle action - ALLIN
  private handleALLIN(client: Client, data: any) {
    if (!this.state.onReady) throw new Error("Game is not ready!");
    const { chips } = data;
    const player = <Player>this.state.players.get(client.sessionId);
    if (!player) throw new Error("Can not find any sessionId!");
    this.allinArr.push(chips);
  }

  // handle action - ALLIN_DONE
  private handleALLIN_DONE() {
    if (!this.state.onReady) throw new Error("Game is not ready!");
    if (!this.allinArr.length) throw new Error("Opps! No one call ALL IN!");
    this.allinState = {
      total: this.allinArr.length,
      minAllin: Math.min(...this.allinArr),
    };
  }

  // handle action - FOLD
  private handleFOLD(client: Client) {
    if (!this.state.onReady) throw new Error("Game is not ready!");
    const player = <Player>this.state.players.get(client.sessionId);
    if (!player || player.isFold)
      throw new Error("Can not find any sessionId or any FOLDED player!");
    player.isFold = true;

    const remainingPlayers = new Map<string, Player>(
      Array.from(this.state.players).filter(
        ([sessionId, player]) => !player.isFold && [sessionId, player]
      )
    );

    if (player.isWinner) {
      remainingPlayers.delete(client.sessionId);
      console.log("số player còn lại:::::", remainingPlayers.size);
      // check if only 1 player
      if (remainingPlayers.size === 1) {
        for (let winner of remainingPlayers.values()) {
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
      remainingPlayers.forEach((remainingPlayer: Player, sessionId: string) => {
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
      if (!winPlayer)
        throw new Error(
          "Have no winner! Please re-check function winner picking!"
        );
      winPlayer.isWinner = true;
      player.isWinner = false;
    }
  }

  // handle action without FOLD
  private handleBet(client: Client, data: any) {
    if (!this.state.onReady) throw new Error("Game is not ready!");
    const { chips } = data;
    const player = <Player>this.state.players.get(client.sessionId);
    if (!player) throw new Error("Can not find any sessionId!");
    player.betChips += chips;
    player.chips -= chips;
    this.state.totalBet += chips;
    this.state.highestBet <= chips
      ? (this.state.highestBet = chips)
      : this.state.highestBet;
  }
}
