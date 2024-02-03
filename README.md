♠︎ ♣︎ ♦︎ ♥︎
# Round
- WELCOME
- PREFLOP
- FLOP
- TURN
- RIVER
- SHOWDOWN

# Action
1. Raise (remaining player turn = total remaining player - 1)
- If this player raised at first round -> current bet = his bet
- If this player raised after another raised player -> he will raise 2bet -> his bet = current bet x 2
2. Call (remaining player turn - 1)
- If this player raised then call at this round -> he will call = (current bet - his last raise)
- If this player call after raise -> he will call = current bet
- If this player call with 0 chip -> he will check
3. Check (remaining player turn - 1)
4. Allin (total remaining player - 1)
- If this player allin at first round -> he will bet = current bet = all his chips
- If this player allin then others:
+ Check if current bet > his chips -> 
5. Fold (total remaining player - 1)
- 

# Special case
1. Only 2 players
- If any player fold -> remaining player will win -> end game

raise allin allin
- raise 


ws: client
{sessionId, roomId}
room {roomName:"poker/blackjack"}

