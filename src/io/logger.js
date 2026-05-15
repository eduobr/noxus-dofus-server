const chalk = require('chalk');
const Common = require("../common")

class Logger {

    static level = 1;

    static drawAscii() {
        var v = "ALPHA VERSION v" + Common.NOXUS_VERSION.major + "." + Common.NOXUS_VERSION.minor;
        console.log(chalk.cyan("    _   _                     "));
        console.log(chalk.cyan("   | \\ | |                    "));
        console.log(chalk.cyan("   |  \\| | _____  ___   _ ___ "));
        console.log(chalk.cyan("   | . ` |/ _ \\ \\/ / | | / __|") + chalk.yellow("    Emulator for Dofus 2.39"));
        console.log(chalk.cyan("   | |\\  | (_) >  <| |_| \\__ \\") + chalk.yellow("    By Yuki, Arkalius and Yamisaaf"));
        console.log(chalk.cyan("   \\_| \\_/\\___/_/\\_\\\\__,_|___/") + chalk.red("    " + v));
        console.log(chalk.yellow(" _________________________________________________________________ \n"));
    }

    static log(color, header, message) {
        const coloredHeader = chalk[color] ? chalk[color](header) : header;
        console.log("[" + coloredHeader + "]" + " : " + message);
    }

    static infos(message) {
        Logger.log("green", "INFOS", message);
    }

    static error(message) {
        Logger.log("red", "ERROR", message);
    }

    static debug(message) {
        Logger.log("magenta", "DEBUG", message);
    }

    static network(message) {
        if(Logger.level == 0) Logger.log("cyan", "NETWORK", message);
    }

    static warning(message) {
        Logger.log("yellow", "WARNING", message);
    }
}

module.exports = Logger
