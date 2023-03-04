export default class Config {
  private readonly noobBot = { minBet: 2000, maxBet: 5000 };
  private readonly normalBot = { minBet: 10000, maxBet: 30000 };
  private readonly proBot = { minBet: 20000, maxBet: 50000 };

  public pickBot(level: string) {
    if (level === 'noob') return this.noobBot;
    if (level === 'normal') return this.normalBot;
    if (level === 'pro') return this.proBot;

    // test
    if (level === 'test') return this.normalBot;
  }
}
