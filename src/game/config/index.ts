export default class Config {
  private readonly noobBot = { minBet: 5000, maxBet: 10000 };
  private readonly normalBot = { minBet: 20000, maxBet: 50000 };
  private readonly proBot = { minBet: 50000, maxBet: 100000 };

  public pickBot(level: string) {
    if (level === 'noob') return this.noobBot;
    if (level === 'normal') return this.normalBot;
    if (level === 'pro') return this.proBot;
  }
}
