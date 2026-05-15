const Types = require("../../io/dofus/types")
const Messages = require("../../io/dofus/messages")
const CharacterManager = require("../../managers/character_manager")
const ChatRestrictionManager = require("../../managers/chat_restriction_manager")
const WorldManager = require("../../managers/world_manager")
const WorldServer = require("../../network/world")
const Logger = require("../../io/logger")
const ConfigManager = require("../../utils/configmanager")
// Lazy require para romper ciclo con DBManager
function getDBManager() { return require("../../database/dbmanager"); }
class AccountIgnored {

    constructor(raw) {
        this._id = raw._id;
        this.accountId = raw.accountId;
        this.ignoredAccountId = raw.ignoredAccountId;
    }
}
module.exports = AccountIgnored