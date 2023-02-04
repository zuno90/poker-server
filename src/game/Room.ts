import { Client, Room } from 'colyseus';
import { RoomState } from './schemas/room.schema';
import { Player } from './schemas/player.schema';
import {
  ALLIN,
  CALL,
  CHECK,
  FINISH_GAME,
  FOLD,
  INCREASE_TURN,
  PRE_FINISH_GAME,
  RAISE,
  RESERVE_SEAT,
  RESET_GAME,
  ROOM_CHAT,
  ROOM_DISPOSE,
  START_GAME,
} from './constants/room.constant';
import { deal } from './modules/handleCard';
import { pickWinner } from './modules/handleRank';
import { updateChip } from '../services/game.service';

const Hand = require('pokersolver').Hand; // func handle winner

type TAllinState = {
  total: number;
  minAllin: number;
};

type TRoomChat = {
  username: string;
  avatar: string;
  message: string;
};

export default class GameRoom extends Room<RoomState> {
  readonly maxClients = 5;
  private initBetChip: number = 100;
  private allinArr: number[] = [];
  private allinState: TAllinState;

  onAuth(_: Client, player: Player) {
    // check auth
    return player;
  }

  onCreate(options: any) {
    try {
      // CREATE AN INITIAL ROOM STATE
      this.setState(new RoomState());

      // CHANGE ROOM STATE WHEN ALL USERS GET READY
      this.handleRoomState();

      // HANDLE FOLD ACTION
      this.handleFOLD();

      // HANDLE ALL ACTION FROM PLAYER
      this.handleBet(CALL);
      this.handleBet(CHECK);
      this.handleBet(RAISE);
      this.handleBet(ALLIN);

      // HANDLE CHAT ROOM
      this.handleChat();

      // HANDLE WAVE GAME
      this.handleIncrTurn();
    } catch (e) {
      console.error(e);
    }
  }

  onJoin(client: Client, options: any, player: Player) {
    // SET INITIAL PLAYER STATE
    this.state.players.set(client.sessionId, new Player(player)); // set player every joining
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
    console.log('client ' + client.sessionId + ' has just left');

    if (!this.state.players.has(client.sessionId))
      throw new Error('Have no any player including sessionId!');
    const leavingPlayer = <Player>this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    if (leavingPlayer.isHost) {
      let seatArr: number[] = [];
      this.state.players.forEach((playerMap: Player, _: string) => {
        seatArr.push(playerMap.seat);
        const newHost = Math.min(...seatArr);
        if (newHost === playerMap.seat) playerMap.isHost = true;
      });
    }
  }

  async onDispose() {
    console.log('room', this.roomId, 'disposing...');
    this.broadcast(ROOM_DISPOSE, 'room bi dispose');
  }

  // ROOM STATE
  private handleRoomState() {
    // RESERVE SEAT - JUST CALL ONCE AT STARTING GAME
    this.onMessage(RESERVE_SEAT, (client: Client, { seat }: { seat: number }) => {
      const player = <Player>this.state.players.get(client.sessionId);
      player.turn = seat;
      player.seat = seat;
    });

    // START GAME
    this.onMessage(START_GAME, (_, __) => {
      const { onHandCards, banker5Cards } = deal(this.state.players.size);
      this.state.onReady = true; // change room state -> TRUE
      this.state.totalBet = this.state.players.size * this.initBetChip;
      this.state.banker5Cards = banker5Cards; // change cards of banker -> [...]

      let arrWinner: Array<any> = [];
      let arrCardRanks: Array<any> = [];

      // handle arranging turn for player
      let seatArr: number[] = [];
      this.state.players.forEach((playerMap: Player, sessionId: string) => {
        seatArr.push(playerMap.seat); // push turn array

        // handle player turn
        playerMap.turn = this.arrangeTurn(playerMap.turn, seatArr) as number;

        // init state of player
        playerMap.betChips = this.initBetChip;
        playerMap.chips -= this.initBetChip;

        // handle player cards
        playerMap.cards = onHandCards[playerMap.turn];

        // pick winner
        arrWinner.push({
          sessionId,
          sevenCards: [...playerMap.cards.values()].concat([...banker5Cards.values()]),
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
      if (!winPlayer) throw new Error('Have no any winner! Please check');
      winPlayer.isWinner = true;

      this.broadcast(START_GAME, { seat: seatArr[Math.floor(Math.random() * seatArr.length)] }); // handle current P
    });

    // PRE_FINISH_GAME - finalize player chip
    this.onMessage(PRE_FINISH_GAME, (_, data: any) => {
      const { state } = data;
      if (!state) {
        this.state.players.forEach((player: Player, _) => {
          if (player.isWinner) player.chips += this.state.totalBet;
        });
      }
    });

    // FINISH GAME
    this.onMessage(FINISH_GAME, (_, __) => {
      this.state.players.forEach(async (player: Player, _) => {
        // if (player.isWinner)
        //   player.chips =
        //     player.chips + this.state.totalBet - this.allinState.minAllin * this.allinState.total;
        if (player.isWinner) player.chips += this.state.totalBet;
        player.role === 'Player' && (await updateChip(player.id, player.chips));
      });
      this.broadcast(FINISH_GAME, 'Finish, updated owned chips of user into database!!!!!');
    });

    // RESET GAME
    this.onMessage(RESET_GAME, (_, __) => {
      if (this.clients.length < 1) throw new Error('Have cheat! Player number is < 1');
      // CREATE AN INITIAL ROOM STATE AGAIN
      this.state.onReady = false;
      this.state.totalBet = 0;
      this.state.banker5Cards = [];

      // CREATE AN INITIAL PLAYER STATE AFTER A GAME
      this.state.players.forEach((playerMap: Player, sessionId: string) => {
        const newPlayer = {
          id: playerMap.id,
          username: playerMap.username,
          isHost: playerMap.isHost,
          chips: playerMap.chips,
          betChips: 0,
          turn: playerMap.seat,
          seat: playerMap.seat,
          cards: [],
          role: playerMap.role,
        };
        this.state.players.set(sessionId, new Player(newPlayer));
      });

      this.broadcast(RESET_GAME, 'reset game, log thử state xem');
    });
  }

  // handle chat
  private handleChat() {
    this.onMessage(ROOM_CHAT, (client: Client, data: TRoomChat) => {
      this.broadcast(ROOM_CHAT, data);
    });
  }

  // handle action - ALLIN
  private handleALLIN(client: Client, data: any) {
    if (!this.state.onReady) throw new Error('Game is not ready!');
    const { chips } = data;
    const player = <Player>this.state.players.get(client.sessionId);
    if (!player) throw new Error('Can not find any sessionId!');
    this.allinArr.push(chips);
    player.betChips += chips;
    player.chips -= chips;
    this.state.totalBet += chips;
  }

  // handle action - ALLIN_DONE
  private handleALLIN_DONE() {
    if (!this.state.onReady) throw new Error('Game is not ready!');
    if (!this.allinArr.length) throw new Error('Opps! No one call ALL IN!');
    this.allinState = {
      total: this.allinArr.length,
      minAllin: Math.min(...this.allinArr),
    };
  }

  // handle action - FOLD
  private handleFOLD() {
    this.onMessage(FOLD, (client: Client, data: any) => {
      if (!this.state.onReady) throw new Error('Game is not ready!');
      const player = <Player>this.state.players.get(client.sessionId);
      const { turnRemaining } = data;
      this.state.turnRemaining = turnRemaining;
      if (!player || player.isFold)
        throw new Error('Can not find any sessionId or any FOLDED player!');
      player.isFold = true;

      const remainingPlayers = new Map<string, Player>(
        Array.from(this.state.players).filter(
          ([sessionId, player]) => !player.isFold && [sessionId, player],
        ),
      );

      if (player.isWinner) {
        remainingPlayers.delete(client.sessionId);
        // check if only 1 player
        if (remainingPlayers.size === 1) {
          for (let winner of remainingPlayers.values()) {
            winner.isWinner = true;
            return this.broadcast(
              'CONGRATULATION',
              `ĐCM chúc mừng anh zai có id:::${winner.id} đã dành chiến thắng!`,
            );
          }
        }

        // pick new winner in remaining players
        let arrWinner: Array<any> = [];
        let arrCardRanks: Array<any> = [];
        remainingPlayers.forEach((remainingPlayer: Player, sessionId: string) => {
          arrWinner.push({
            sessionId,
            sevenCards: [...remainingPlayer.cards.values()].concat([...this.state.banker5Cards]),
          });
          arrCardRanks = pickWinner(arrWinner);
        });

        // pick winner and set isWinner -> true
        const winner = Hand.winners(arrCardRanks)[0];
        // get winner session
        const winPlayer = <Player>this.state.players.get(winner.sessionId);
        if (!winPlayer) throw new Error('Have no winner! Please re-check function winner picking!');
        winPlayer.isWinner = true;
        player.isWinner = false;
      }
    });
  }

  // handle action without FOLD
  private handleBet(action: string) {
    this.onMessage(action, (client: Client, data: any) => {
      if (!this.state.onReady) throw new Error('Game is not ready!');
      const { chips, turnRemaining } = data;
      const player = <Player>this.state.players.get(client.sessionId);
      if (!player) throw new Error('Can not find any sessionId!');
      player.betChips += chips;
      player.chips -= chips;
      this.state.totalBet += chips;
      this.state.turnRemaining = turnRemaining;
    });
  }

  // incr turn
  private handleIncrTurn() {
    this.onMessage(INCREASE_TURN, (client: Client, { waveGame }: { waveGame: number }) => {
      this.state.waveGame = waveGame;
    });
  }

  // helper re-arrange turn after finishing a round
  private arrangeTurn(turn: number, seatArr: number[]) {
    for (let i = 0; i < seatArr.length; i++) {
      if (turn === seatArr[i]) return i;
    }
  }
}
