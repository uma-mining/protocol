const { Logger } = require("../financial-templates-lib/logger/Logger");

const { createFormatFunction, createEtherscanLinkMarkdown } = require("../common/FormattingUtils");

const { calculatePositionCRPercent } = require("./utils/PositionCRCalculator");

class BalanceMonitor {
  constructor(logger, tokenBalanceClient, account, botsToMonitor, walletsToMonitor) {
    this.logger = logger;
    this.account = account;

    // An array of bot objects to monitor. Each bot's `botName` `address`,
    // `CollateralThreshold` and`syntheticThreshold` must be given. Example:
    // [{ botName: "Liquidator Bot",
    //   address: '0x12345'
    //   collateralThreshold: x1,
    //   syntheticThreshold: x2,
    //   etherThreshold: x3 },
    // ...]
    this.botsToMonitor = botsToMonitor;

    // An array of wallets to Monitor. Each wallet's `walletName`, `address`, `crAlert`
    // must be given. Example:
    // [{ walletName: "Market Making bot",
    //    address: '0x12345',
    //    crAlert: 150},
    // ...];
    this.walletsToMonitor = walletsToMonitor;

    this.walletsAlerted = {};

    for (let bot of botsToMonitor) {
      this.walletsAlerted[bot.address] = {
        collateralThreshold: false,
        syntheticThreshold: false,
        etherThreshold: false
      };
    }

    for (let wallet of walletsToMonitor) {
      this.walletsAlerted[wallet.address] = { crAlert: false };
    }

    // Instance of the tokenBalanceClient to read account balances from last change update.
    this.client = tokenBalanceClient;
    this.web3 = this.client.web3;

    this.formatDecimalString = createFormatFunction(this.web3, 2);

    // TODO: replace this with a fetcher that pulls the actual collateral token symbol
    // need to decide where this logic goes.
    this.collateralCurrencySymbol = "DAI";
    this.syntheticCurrencySymbol = "UMATEST";
  }

  // Checks if an addresses balance is below a given threshold
  ltThreshold(balance, threshold) {
    // If the price has not resolved yet then return false
    if (balance == null) {
      return false;
    }
    return this.web3.utils.toBN(balance).lt(this.web3.utils.toBN(threshold));
  }

  // A notification should only be pushed if the bot's threshold balance is below the threshold and a notification
  // for for that given threshold has not already been sent out
  shouldPushNotification(bot, thresholdKey) {
    let shouldPushNotification = false;
    if (this.ltThreshold(this.client.getCollateralBalance(bot.address), bot[thresholdKey])) {
      if (!this.walletsAlerted[bot.address][thresholdKey]) shouldPushNotification = true;
      this.walletsAlerted[bot.address] = true;
    } else this.walletsAlerted[bot.address] = false;
    return shouldPushNotification;
  }

  // Queries disputable liquidations and disputes any that were incorrectly liquidated.
  checkBotBalances = async () => {
    this.logger.debug({
      at: "BalanceMonitor",
      message: "Checking for Balances"
    });

    for (let bot of this.botsToMonitor) {
      if (this.shouldPushNotification(bot, "collateralThreshold")) {
        this.logger.info({
          at: "BalanceMonitor",
          message: "Low collateral balance warning ⚠️",
          mrkdwn: this.createLowBalanceMrkdwn(
            bot,
            bot.collateralThreshold,
            this.client.getCollateralBalance(bot.address),
            this.collateralCurrencySymbol,
            "collateral"
          )
        });
      }
      if (this.shouldPushNotification(bot, "syntheticThreshold")) {
        this.logger.info({
          at: "BalanceMonitor",
          message: "Low synthetic balance warning ⚠️",
          mrkdwn: this.createLowBalanceMrkdwn(
            bot,
            bot.syntheticThreshold,
            this.client.getSyntheticBalance(bot.address),
            this.syntheticCurrencySymbol,
            "synthetic"
          )
        });
      }
      if (this.shouldPushNotification(bot, "etherThreshold")) {
        this.logger.info({
          at: "BalanceMonitor",
          message: "Low Ether balance warning ⚠️",
          mrkdwn: this.createLowBalanceMrkdwn(
            bot,
            bot.etherThreshold,
            this.client.getEtherBalance(bot.address),
            "ETH",
            "ether"
          )
        });
      }
    }
  };

  createLowBalanceMrkdwn = (bot, threshold, tokenBalance, tokenSymbol, tokenName) => {
    return (
      "*" +
      bot.name +
      "* (" +
      createEtherscanLinkMarkdown(this.web3, bot.address) +
      ") " +
      tokenName +
      " balance is less than " +
      this.formatDecimalString(threshold) +
      " " +
      tokenSymbol +
      ". Current balance is " +
      this.formatDecimalString(tokenBalance) +
      " " +
      tokenSymbol
    );
  };
}

module.exports = {
  BalanceMonitor
};
